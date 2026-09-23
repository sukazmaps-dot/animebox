import { ApiError, adminClient, failure, readBody, response } from '@/lib/community-server';
import { requireAdmin, requireAdminMutation, writeAdminAudit } from '@/lib/admin-server';
import { recordPaymentTransaction } from '@/lib/payments/service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    await requireAdmin(['owner', 'admin']);
    const admin = adminClient();

    const { data: claims, error } = await admin
      .from('boosty_claim_requests')
      .select('id,user_id,boosty_name,amount,currency,note,status,transaction_id,created_at,resolved_at,resolved_by,admin_note')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const userIds = [...new Set((claims ?? []).map((item) => item.user_id).filter(Boolean))];
    const profiles = userIds.length
      ? await admin.from('profiles').select('id,username').in('id', userIds)
      : { data: [], error: null };
    if (profiles.error) throw profiles.error;

    return response({
      configured: Boolean(process.env.NEXT_PUBLIC_BOOSTY_URL?.trim()),
      supportUrl: process.env.NEXT_PUBLIC_BOOSTY_URL?.trim() || null,
      claims: claims ?? [],
      profiles: profiles.data ?? [],
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await requireAdminMutation(request, ['owner', 'admin']);
    const body = await readBody(request);
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const claimId = typeof body.claimId === 'string' ? body.claimId.trim() : '';
    const adminNote = typeof body.adminNote === 'string' ? body.adminNote.trim().slice(0, 1000) : '';

    if (!UUID_RE.test(claimId)) throw new ApiError(400, 'Некорректная заявка.');
    if (!['approve', 'reject'].includes(action)) throw new ApiError(400, 'Неизвестное действие.');

    const admin = adminClient();
    const { data: claim, error } = await admin
      .from('boosty_claim_requests')
      .select('id,user_id,boosty_name,amount,currency,note,status,transaction_id,created_at')
      .eq('id', claimId)
      .single();
    if (error) throw error;

    if (action === 'reject') {
      if (claim.status !== 'pending') throw new ApiError(409, 'Заявка уже обработана.');
      const now = new Date().toISOString();
      const { error: rejectError } = await admin
        .from('boosty_claim_requests')
        .update({
          status: 'rejected',
          resolved_at: now,
          resolved_by: user.id,
          admin_note: adminNote || 'Платёж не подтверждён.',
        })
        .eq('id', claim.id)
        .eq('status', 'pending');
      if (rejectError) throw rejectError;

      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'payments.boosty_reject',
        targetType: 'boosty_claim',
        targetId: claim.id,
        details: { amount: claim.amount, currency: claim.currency, boosty_name: claim.boosty_name },
      });
      return response({ ok: true });
    }

    if (claim.status === 'approved' && claim.transaction_id) {
      return response({ ok: true, transactionId: claim.transaction_id, alreadyApproved: true });
    }
    if (claim.status !== 'pending') throw new ApiError(409, 'Заявка уже обработана.');

    const transaction = await recordPaymentTransaction({
      userId: claim.user_id,
      provider: 'boosty',
      productCode: 'donation_once',
      externalId: `manual:${claim.id}`,
      externalUserId: claim.boosty_name,
      status: 'paid',
      amount: Number(claim.amount),
      currency: claim.currency,
      providerStatus: 'manual_verified',
      providerCreatedAt: claim.created_at,
      paidAt: claim.created_at,
      metadata: {
        boosty_name: claim.boosty_name,
        note: claim.note,
        verification: 'manual_admin',
        claim_id: claim.id,
      },
      eventType: 'payment.paid',
      eventDetails: { source: 'boosty_manual_verification', claim_id: claim.id },
    });

    const now = new Date().toISOString();
    const { error: approveError } = await admin
      .from('boosty_claim_requests')
      .update({
        status: 'approved',
        transaction_id: transaction.id,
        resolved_at: now,
        resolved_by: user.id,
        admin_note: adminNote || null,
      })
      .eq('id', claim.id)
      .eq('status', 'pending');
    if (approveError) throw approveError;

    await writeAdminAudit({
      actorId: user.id,
      actorRole: role,
      action: 'payments.boosty_approve',
      targetType: 'boosty_claim',
      targetId: claim.id,
      details: {
        transaction_id: transaction.id,
        amount: Number(claim.amount),
        currency: claim.currency,
        boosty_name: claim.boosty_name,
      },
    });

    return response({ ok: true, transactionId: transaction.id });
  } catch (error) {
    return failure(error);
  }
}
