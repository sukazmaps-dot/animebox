import { adminClient, response, failure, ApiError } from '@/lib/community-server';
import { requireAdmin } from '@/lib/admin-server';
export async function GET(request: Request) {
 try {
  await requireAdmin(['owner','admin']);
  const page=Number(new URL(request.url).searchParams.get('page')??1);
  if(!Number.isInteger(page)||page<1||page>10000) throw new ApiError(400,'Некорректная страница.');
  const admin=adminClient();
  const [metrics,payments,sponsors]=await Promise.all([
   admin.from('sponsor_metrics_v2').select('*').single(),
   admin.from('star_payments').select('id,user_id,amount,created_at',{count:'exact'}).order('created_at',{ascending:false}).order('id',{ascending:false}).range((page-1)*25,page*25-1),
   admin.from('sponsor_directory_v2').select('*',{count:'exact'}).order('total_stars',{ascending:false}).order('account_key').range((page-1)*25,page*25-1)
  ]);
  for(const r of [metrics,payments,sponsors]) if(r.error) throw r.error;
  const ids=[...new Set([...(payments.data??[]),...(sponsors.data??[])].map(x=>x.user_id).filter(Boolean))];
  const profiles=ids.length?await admin.from('profiles').select('id,username').in('id',ids):{data:[],error:null};
  if(profiles.error) throw profiles.error;
  return response({metrics:metrics.data,payments:payments.data,sponsors:sponsors.data,profiles:profiles.data,page,hasMore:page*25<Math.max(payments.count??0,sponsors.count??0)});
 } catch(error) { return failure(error); }
}
