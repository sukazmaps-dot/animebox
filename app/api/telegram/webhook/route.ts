import { NextRequest, NextResponse } from 'next/server';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const SITE_URL = 'https://youranimebox.com';

const MAIN_MENU = {
  inline_keyboard: [
    [
      {
        text: '🌐 Открыть AnimeBox',
        url: SITE_URL,
      },
    ],
    [
      {
        text: '📚 Мой трекер',
        url: `${SITE_URL}/list`,
      },
      {
        text: '🔍 Найти аниме',
        url: `${SITE_URL}/search`,
      },
    ],
    [
      {
        text: '📅 Расписание',
        url: `${SITE_URL}/schedule`,
      },
    ],
  ],
};



async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
) {
  if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing');
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Telegram error: ${response.status} ${await response.text()}`,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Проверяем, что запрос реально пришёл от нашего webhook
    if (WEBHOOK_SECRET) {
      const secret = request.headers.get(
        'x-telegram-bot-api-secret-token',
      );

      if (secret !== WEBHOOK_SECRET) {
        return NextResponse.json(
          { ok: false, error: 'unauthorized' },
          { status: 401 },
        );
      }
    }

    const update = await request.json();

    const message = update?.message;
    const chatId = message?.chat?.id;
    const text =
      typeof message?.text === 'string'
        ? message.text.trim()
        : '';

    if (!chatId || !text) {
      return NextResponse.json({ ok: true });
    }

    // Убираем @BotUsername из команд группового чата
    const command = text
      .split(/\s+/)[0]
      .split('@')[0]
      .toLowerCase();

    switch (command) {
      case '/help':
  await sendMessage(
    chatId,
    [
      '💜 <b>AnimeBox Bot</b>',
      '',
      'Доступные команды:',
      '/start — главное меню',
      '/open — открыть AnimeBox',
      '/tracker — открыть трекер',
      '/notifications — уведомления',
      '/help — помощь',
    ].join('\n'),
    MAIN_MENU,
  );
  break;

      case '/open':
        await sendMessage(
          chatId,
          '🌐 <b>AnimeBox</b>\n\nСмотри и отслеживай свои аниме.',
          {
            inline_keyboard: [
              [
                {
                  text: 'Открыть AnimeBox',
                  url: SITE_URL,
                },
              ],
            ],
          },
        );
        break;

      case '/tracker':
        await sendMessage(
          chatId,
          '📚 <b>Твой трекер AnimeBox</b>\n\nПродолжай просмотр с того места, где остановился.',
          {
            inline_keyboard: [
              [
                {
                  text: '📚 Открыть трекер',
                  url: `${SITE_URL}/list`,
                },
              ],
            ],
          },
        );
        break;

      case '/notifications':
        await sendMessage(
          chatId,
          [
            '🔔 <b>Уведомления AnimeBox</b>',
            '',
            'Я сообщу тебе о выходе новых серий отслеживаемых аниме.',
          ].join('\n'),
          {
            inline_keyboard: [
              [
                {
                  text: '⚙️ Открыть AnimeBox',
                  url: SITE_URL,
                },
              ],
            ],
          },
        );
        break;

      case '/help':
        await sendMessage(
          chatId,
          [
            '💜 <b>AnimeBox Bot</b>',
            '',
            'Доступные команды:',
            '/start — запустить бота',
            '/open — открыть AnimeBox',
            '/tracker — открыть трекер',
            '/notifications — уведомления',
            '/help — помощь',
          ].join('\n'),
        );
        break;

      default:
        // На обычные сообщения бот может просто не реагировать
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);

    return NextResponse.json(
      { ok: false },
      { status: 500 },
    );
  }
}