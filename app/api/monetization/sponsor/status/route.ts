import { adminClient, failure, response, ApiError } from '@/lib/community-server';
import { resolveSponsorTier } from '@/lib/sponsor';
// Public cosmetics only. Financial amounts and payment history stay private.
export async function GET(request:Request) {
 try {
  const raw=new URL(request.url).searchParams.get('ids')??'';
  const ids=[...new Set(raw.split(',').filter(Boolean))];
  if(!ids.length||ids.length>50||ids.some(id=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new ApiError(400,'Нужно от 1 до 50 UUID.');
  const {data,error}=await adminClient().from('sponsor_directory_v2').select('user_id,total_stars').in('user_id',ids);
  if(error) throw error;
  const totals=new Map((data??[]).map(x=>[x.user_id,Number(x.total_stars)]));
  return response({statuses:Object.fromEntries(ids.map(id=>[id,{tier:resolveSponsorTier(totals.get(id)??0)}]))});
 } catch(error) {return failure(error);}
}
