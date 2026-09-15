import { userClient, response, failure } from '@/lib/community-server';
export async function GET() {
  try {
    const { client } = await userClient();
    const { data, error } = await client.rpc('my_community_profile');
    if (error) throw error;
    return response(data);
  } catch (error) { return failure(error); }
}
