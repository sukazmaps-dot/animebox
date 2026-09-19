import { getChatAuthors } from '@/lib/chat-server';
import { response } from '@/lib/community-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get('ids') ?? '';
    const ids = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))].slice(0, 40);

    if (!ids.length || ids.some((id) => !UUID.test(id))) {
      return response({ error: 'Некорректный список пользователей.' }, 400);
    }

    const authors = await getChatAuthors(ids);
    return response({ authors: ids.map((id) => authors.get(id)).filter(Boolean) });
  } catch (error) {
    console.error('[Chat authors]', error);
    return response({ error: 'Не удалось загрузить профили чата.' }, 503);
  }
}
