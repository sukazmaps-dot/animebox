import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { adminClient, ApiError, readJsonBody, response } from '@/lib/community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = new Set(['rights_holder', 'authorized_agent', 'other']);

function cleanText(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanMultiline(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, max);
}

function parseUrls(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n/)
      : [];

  const urls = [...new Set(
    values
      .map((item) => cleanText(item, 700))
      .filter(Boolean)
      .slice(0, 10),
  )];

  if (!urls.length) throw new ApiError(400, 'Укажи хотя бы один URL AnimeBox.');

  for (const value of urls) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ApiError(400, 'Один из URL указан некорректно.');
    }

    const hostname = url.hostname.toLowerCase();
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      (hostname !== 'youranimebox.com' && hostname !== 'www.youranimebox.com')
    ) {
      throw new ApiError(400, 'Укажи точный URL на youranimebox.com.');
    }
  }

  return urls;
}

function caseNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return 'AB-CR-' + date + '-' + suffix;
}

export async function POST(request: Request) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'copyright_report_ip',
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (limited) return limited;

  try {
    const body = await readJsonBody(request, { maxBytes: 24_000 });

    if (cleanText(body.website, 120)) {
      return response({ ok: true, caseNumber: 'received' }, 202);
    }

    const claimantName = cleanText(body.claimantName, 140);
    const claimantCompany = cleanText(body.claimantCompany, 180);
    const claimantEmail = cleanText(body.claimantEmail, 254).toLowerCase();
    const claimantRole = cleanText(body.claimantRole, 40);
    const workTitle = cleanText(body.workTitle, 240);
    const rightsDescription = cleanMultiline(body.rightsDescription, 5_000);
    const authorityStatement = cleanMultiline(body.authorityStatement, 3_000);
    const signature = cleanText(body.signature, 180);
    const urls = parseUrls(body.urls);

    if (claimantName.length < 2) throw new ApiError(400, 'Укажи имя заявителя.');
    if (!EMAIL.test(claimantEmail)) throw new ApiError(400, 'Укажи корректный email.');
    if (!ALLOWED_ROLES.has(claimantRole)) throw new ApiError(400, 'Укажи роль заявителя.');
    if (workTitle.length < 2) throw new ApiError(400, 'Укажи произведение.');
    if (rightsDescription.length < 30) {
      throw new ApiError(400, 'Опиши, какие права затрагивает указанный материал.');
    }
    if (authorityStatement.length < 20) {
      throw new ApiError(400, 'Опиши основание, по которому ты направляешь обращение.');
    }
    if (signature.length < 2) throw new ApiError(400, 'Укажи имя в поле подписи.');
    if (body.goodFaith !== true) {
      throw new ApiError(400, 'Подтверди добросовестность и точность обращения.');
    }

    const admin = adminClient();
    const number = caseNumber();
    const inserted = await admin
      .from('copyright_cases')
      .insert({
        case_number: number,
        claimant_name: claimantName,
        claimant_company: claimantCompany || null,
        claimant_email: claimantEmail,
        claimant_role: claimantRole,
        work_title: workTitle,
        rights_description: rightsDescription,
        authority_statement: authorityStatement,
        signature,
        status: 'received',
      })
      .select('id')
      .single();

    if (inserted.error) throw inserted.error;

    const urlRows = urls.map((url) => ({
      case_id: inserted.data.id,
      url,
    }));
    const urlInsert = await admin.from('copyright_case_urls').insert(urlRows);
    if (urlInsert.error) throw urlInsert.error;

    const actionInsert = await admin.from('copyright_actions').insert({
      case_id: inserted.data.id,
      action: 'case_received',
      actor_role: 'system',
      details: {
        source: 'public_form',
        url_count: urls.length,
      },
    });
    if (actionInsert.error) throw actionInsert.error;

    return response({ ok: true, caseNumber: number }, 201);
  } catch (error) {
    if (error instanceof ApiError) {
      return response({ ok: false, error: error.message }, error.status);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error('[Copyright report]', error);
    const migrationMissing = /copyright_(cases|case_urls|actions)|schema cache|relation/i.test(message);

    return response(
      {
        ok: false,
        error: migrationMissing
          ? 'Система обращений обновляется. Напиши на copyright@youranimebox.com.'
          : 'Не удалось зарегистрировать обращение. Напиши на copyright@youranimebox.com.',
      },
      503,
    );
  }
}
