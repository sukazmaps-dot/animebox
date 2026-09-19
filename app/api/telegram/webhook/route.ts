import { NextRequest, NextResponse } from 'next/server';

import { escapeTelegramHtml } from '@/lib/notifications-server';
import { getUserSubscriptions } from '@/lib/telegram/bot-subscriptions';
import {
  answerSupportPreCheckout,
  parsePremiumPayload,
  parseSupportPayload,
} from '@/lib/telegram-stars';
import {
  recordPaymentSupportRequest,
  recordStarPayment,
} from '@/lib/monetization-server';
import { getPremiumPlan } from '@/lib/premium-catalog-server';
import { recordPremiumTelegramStarsPayment } from '@/lib/payments/providers/premium-telegram-stars';
import {
  activateOrRenewTelegramPremium,
  syncPremiumTelegramSubscriptionState,
} from '@/lib/premium-payment-server';
import { getSponsorStatus } from '@/lib/sponsor-server';
import { SPONSOR_META, type SponsorStatus } from '@/lib/sponsor';
import { trackMonetizationEvents } from '@/lib/monetization-events-server';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const SITE_URL = 'https://youranimebox.com';

/**
 * Постоянное меню снизу Telegram.
 * web_app открывает AnimeBox прямо внутри Telegram.
 */
const BOTTOM_MENU = {
  keyboard: [
    [
      {
        text: '🌐 Открыть AnimeBox',
        web_app: {
          url: SITE_URL,
        },
      },
    ],
    [
      {
        text: '📚 Мой трекер',
        web_app: {
          url: `${SITE_URL}/list`,
        },
      },
      {
        text: '🔍 Найти аниме',
        web_app: {
          url: `${SITE_URL}/search`,
        },
      },
    ],
    [
      {
        text: '📅 Расписание',
        web_app: {
          url: `${SITE_URL}/schedule`,
        },
      },
    ],
    [
      {
        text: '🔔 Уведомления',
      },
      {
        text: '💜 Поддержать',
        web_app: {
          url: `${SITE_URL}/support`,
        },
      },
    ],
    [
      {
        text: '❓ Помощь',
      },
    ],
  ],

  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'Выбери действие 👇',
};

/**
 * Отправка сообщения через Telegram Bot API.
 */
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
    const errorText = await response.text();

    throw new Error(
      `Telegram API error ${response.status}: ${errorText}`,
    );
  }
}

/**
 * Telegram webhook.
 */
export async function POST(request: NextRequest) {
  try {
    /**
     * Если env случайно не настроены,
     * лучше сразу вернуть ошибку,
     * а не принимать webhook без защиты.
     */
    if (!BOT_TOKEN || !WEBHOOK_SECRET) {
      console.error(
        'Telegram webhook environment variables are missing',
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'server_not_configured',
        },
        {
          status: 500,
        },
      );
    }

    /**
     * Проверяем secret_token,
     * который Telegram отправляет вместе с webhook.
     */
    const telegramSecret = request.headers.get(
      'x-telegram-bot-api-secret-token',
    );

    if (telegramSecret !== WEBHOOK_SECRET) {
      return NextResponse.json(
        {
          ok: false,
          error: 'unauthorized',
        },
        {
          status: 401,
        },
      );
    }

    const update = await request.json();

    /**
     * =====================================================
     * Telegram Stars: recurring subscription state
     * =====================================================
     */
    const subscriptionUpdate = update?.subscription;

    if (subscriptionUpdate?.invoice_payload && subscriptionUpdate?.state) {
      const premiumPayload = parsePremiumPayload(
        subscriptionUpdate.invoice_payload,
      );

      if (
        premiumPayload?.plan === 'monthly' &&
        ['active', 'canceled', 'failed'].includes(subscriptionUpdate.state)
      ) {
        try {
          await syncPremiumTelegramSubscriptionState({
            userId: premiumPayload.animeboxUserId,
            state: subscriptionUpdate.state,
          });
        } catch (error) {
          console.error(
            '[AnimeBox Premium] subscription state sync failed:',
            error,
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    /**
     * =====================================================
     * Telegram Stars: pre-checkout
     * =====================================================
     */
    const preCheckoutQuery = update?.pre_checkout_query;

    if (preCheckoutQuery?.id) {
      const supportPayload = parseSupportPayload(
        preCheckoutQuery.invoice_payload,
      );
      const premiumPayload = parsePremiumPayload(
        preCheckoutQuery.invoice_payload,
      );
      const payerTelegramId = Number(
        preCheckoutQuery?.from?.id ?? 0,
      );
      const totalAmount = Number(
        preCheckoutQuery?.total_amount ?? 0,
      );
      const currency = preCheckoutQuery?.currency;

      let valid = false;
      let errorMessage =
        'Не удалось подтвердить платёж AnimeBox. Открой страницу оплаты заново.';

      if (supportPayload) {
        const payloadMatchesPayer =
          supportPayload.telegramId === 0 ||
          supportPayload.telegramId === payerTelegramId;

        valid = Boolean(
          currency === 'XTR' &&
            totalAmount === supportPayload.amount &&
            payloadMatchesPayer,
        );
      } else if (premiumPayload) {
        const plan = await getPremiumPlan(premiumPayload.plan);
        const payloadMatchesPayer =
          premiumPayload.telegramId === 0 ||
          premiumPayload.telegramId === payerTelegramId;

        valid = Boolean(
          plan?.active &&
            plan.telegramStarsAmount === premiumPayload.amount &&
            plan.durationDays === premiumPayload.durationDays &&
            currency === 'XTR' &&
            totalAmount === premiumPayload.amount &&
            payloadMatchesPayer,
        );

        if (!plan?.active) {
          errorMessage = 'Этот тариф AnimeBox Premium сейчас недоступен.';
        }
      }

      await answerSupportPreCheckout({
        botToken: BOT_TOKEN,
        queryId: String(preCheckoutQuery.id),
        ok: valid,
        errorMessage: valid ? undefined : errorMessage,
      });

      return NextResponse.json({
        ok: true,
      });
    }

    const message = update?.message;
    const chatId = Number(message?.chat?.id ?? 0);

    /**
     * =====================================================
     * Admin/setup helper: reveal the numeric group ID.
     * Useful once when configuring BOOSTY_PREMIUM_CHAT_ID.
     * =====================================================
     */
    const messageText = typeof message?.text === 'string' ? message.text.trim() : '';
    const chatType = typeof message?.chat?.type === 'string' ? message.chat.type : '';
    if (
      chatId &&
      (chatType === 'group' || chatType === 'supergroup') &&
      (messageText === '/animebox_chat_id' || messageText === '/animebox_chat_id@YourAnimeBoxBot')
    ) {
      await sendMessage(
        chatId,
        `AnimeBox chat ID: <code>${chatId}</code>\nДобавь его в Vercel как <code>BOOSTY_PREMIUM_CHAT_ID</code>.`,
      );
      return NextResponse.json({ ok: true });
    }

    /**
     * =====================================================
     * Telegram Stars: successful payment
     * =====================================================
     */
    const successfulPayment = message?.successful_payment;

    if (successfulPayment && chatId) {
      const premiumPayload = parsePremiumPayload(
        successfulPayment.invoice_payload,
      );
      const parsed = parseSupportPayload(
        successfulPayment.invoice_payload,
      );
      const payerTelegramId = Number(
        message?.from?.id ?? chatId,
      );

      if (
        premiumPayload &&
        successfulPayment.currency === 'XTR' &&
        Number(successfulPayment.total_amount) === premiumPayload.amount
      ) {
        try {
          const isRecurring = successfulPayment.is_recurring === true;
          const isFirstRecurring =
            successfulPayment.is_first_recurring === true;
          const subscriptionExpirationDate =
            Number.isSafeInteger(successfulPayment.subscription_expiration_date)
              ? Number(successfulPayment.subscription_expiration_date)
              : null;

          const transaction = await recordPremiumTelegramStarsPayment({
            userId: premiumPayload.animeboxUserId,
            telegramId: payerTelegramId,
            plan: premiumPayload.plan,
            amount: premiumPayload.amount,
            durationDays: premiumPayload.durationDays,
            telegramPaymentChargeId:
              successfulPayment.telegram_payment_charge_id,
            providerPaymentChargeId:
              successfulPayment.provider_payment_charge_id ?? null,
            isRecurring,
            isFirstRecurring,
            subscriptionExpirationDate,
          });

          const subscription = await activateOrRenewTelegramPremium({
            userId: premiumPayload.animeboxUserId,
            plan: premiumPayload.plan,
            durationDays: premiumPayload.durationDays,
            transactionId: transaction.id,
            telegramPaymentChargeId:
              successfulPayment.telegram_payment_charge_id,
            isRecurring,
            isFirstRecurring,
            subscriptionExpirationDate,
          });

          await trackMonetizationEvents([
            {
              eventName: 'premium_payment_success',
              userId: premiumPayload.animeboxUserId,
              source: 'telegram_stars',
              entityId: transaction.id,
              value: premiumPayload.amount,
              currency: 'XTR',
              dedupeKey: `premium_payment_success:${transaction.id}`,
              metadata: {
                plan: premiumPayload.plan,
                is_recurring: isRecurring,
                is_first_recurring: isFirstRecurring,
              },
            },
            ...(!isRecurring || isFirstRecurring
              ? [{
                  eventName: 'premium_activated' as const,
                  userId: premiumPayload.animeboxUserId,
                  source: 'telegram_stars',
                  entityId: subscription.id,
                  value: premiumPayload.amount,
                  currency: 'XTR',
                  dedupeKey: `premium_activated:${transaction.id}`,
                  metadata: { plan: premiumPayload.plan, transaction_id: transaction.id },
                }]
              : []),
          ]);

          const until = new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }).format(new Date(subscription.endsAt));

          await sendMessage(
            chatId,
            [
              isRecurring && !isFirstRecurring
                ? '✦ <b>AnimeBox Premium продлён!</b>'
                : '✦ <b>AnimeBox Premium активирован!</b>',
              '',
              `Тариф: <b>${premiumPayload.plan === 'yearly' ? '12 месяцев' : '1 месяц'}</b>`,
              `Оплачено: <b>⭐ ${premiumPayload.amount}</b>`,
              `Premium до: <b>${until}</b>`,
              '',
              premiumPayload.plan === 'monthly' && isRecurring
                ? 'Месячная подписка продлевается автоматически каждые 30 дней. Автопродление можно отключить на странице Premium.'
                : 'Без рекламы и Premium-возможности уже доступны в твоём AnimeBox аккаунте.',
            ].join('\n'),
            BOTTOM_MENU,
          );
        } catch (error) {
          console.error(
            '[AnimeBox Premium] failed to persist successful payment:',
            error,
          );
        }

        return NextResponse.json({ ok: true });
      }

      if (
        parsed &&
        successfulPayment.currency === 'XTR' &&
        Number(successfulPayment.total_amount) === parsed.amount
      ) {
        let sponsor: SponsorStatus | null = null;

        try {
          const recorded = await recordStarPayment({
            telegramId: payerTelegramId,
            chatId,
            amount: parsed.amount,
            invoicePayload: successfulPayment.invoice_payload,
            telegramPaymentChargeId:
              successfulPayment.telegram_payment_charge_id,
            providerPaymentChargeId:
              successfulPayment.provider_payment_charge_id ?? null,
          });

          if (recorded.userId) {
            sponsor = await getSponsorStatus(recorded.userId);
          }
        } catch (error) {
          // Payment is already completed in Telegram. Never turn a
          // successful charge into a failed webhook because storage is down.
          console.error(
            '[AnimeBox Stars] failed to persist successful payment:',
            error,
          );
        }

        const sponsorLine = sponsor
          ? `Твой статус: <b>✦ ${SPONSOR_META[sponsor.tier].label}</b>`
          : null;

        await sendMessage(
          chatId,
          [
            '💜 <b>Спасибо за поддержку AnimeBox!</b>',
            '',
            `Получено: <b>⭐ ${parsed.amount}</b>`,
            ...(sponsorLine ? ['', sponsorLine] : []),
            '',
            'Твоя поддержка помогает оплачивать инфраструктуру и развивать проект дальше.',
          ].join('\n'),
          BOTTOM_MENU,
        );
      }

      return NextResponse.json({
        ok: true,
      });
    }

    const text =
      typeof message?.text === 'string'
        ? message.text.trim()
        : '';

    /**
     * Telegram может присылать не только текстовые сообщения.
     * Просто подтверждаем такие updates.
     */
    if (!chatId || !text) {
      return NextResponse.json({
        ok: true,
      });
    }

    /**
     * Для команд:
     * /start
     * /start@YourAnimeBoxBot
     */
    const command = text
      .split(/\s+/)[0]
      .split('@')[0]
      .toLowerCase();

    const normalizedText = text.toLowerCase();

    /**
     * =====================================================
     * /start
     * =====================================================
     */
    if (command === '/start') {
      await sendMessage(
        chatId,
        [
          '👾 <b>Добро пожаловать в AnimeBox!</b>',
          '',
          'Смотри аниме, сохраняй прогресс и не пропускай новые серии.',
          '',
          '🔔 Я буду сообщать тебе о выходе новых эпизодов.',
          '',
          'Используй меню снизу 👇',
        ].join('\n'),
        BOTTOM_MENU,
      );

      return NextResponse.json({
        ok: true,
      });
    }

    /**
     * =====================================================
     * /open
     * =====================================================
     */
    if (command === '/open') {
      await sendMessage(
        chatId,
        [
          '🌐 <b>AnimeBox</b>',
          '',
          'Нажми кнопку «Открыть AnimeBox» в меню снизу 👇',
        ].join('\n'),
        BOTTOM_MENU,
      );

      return NextResponse.json({
        ok: true,
      });
    }

    /**
     * =====================================================
     * /tracker
     * =====================================================
     */
    if (command === '/tracker') {
      await sendMessage(
        chatId,
        [
          '📚 <b>Твой трекер AnimeBox</b>',
          '',
          'Продолжай просмотр с того места, где остановился.',
          '',
          'Нажми «Мой трекер» в меню снизу 👇',
        ].join('\n'),
        BOTTOM_MENU,
      );

      return NextResponse.json({
        ok: true,
      });
    }

    /**
     * =====================================================
     * Уведомления
     * =====================================================
     */
    if (
      command === '/notifications' ||
      normalizedText === '🔔 уведомления'
    ) {
      const telegramId = Number(message?.from?.id ?? chatId);
      const subscriptions =
        await getUserSubscriptions(telegramId);

      if (!subscriptions.accountLinked) {
        await sendMessage(
          chatId,
          [
            '🔔 <b>Уведомления AnimeBox</b>',
            '',
            'Твой Telegram пока не связан с аккаунтом AnimeBox.',
            '',
            'Открой Mini App через кнопку ниже — аккаунт привяжется автоматически.',
          ].join('\n'),
          BOTTOM_MENU,
        );

        return NextResponse.json({
          ok: true,
        });
      }

      const lines = [
        '🔔 <b>Твои активные уведомления</b>',
        '',
      ];

      lines.push(
        subscriptions.systemNotifications
          ? '✅ Telegram-уведомления AnimeBox включены'
          : '⏸ Telegram-уведомления AnimeBox выключены',
      );

      const visibleAnime = subscriptions.anime.slice(0, 20);

      if (visibleAnime.length > 0) {
        lines.push(
          '',
          subscriptions.systemNotifications
            ? '<b>Новые серии:</b>'
            : '<b>Сохранённые подписки:</b>',
        );

        for (const item of visibleAnime) {
          lines.push(
            `🎬 «<b>${escapeTelegramHtml(item.animeTitle)}</b>»`,
          );
        }

        if (subscriptions.anime.length > visibleAnime.length) {
          lines.push(
            `…и ещё ${subscriptions.anime.length - visibleAnime.length}`,
          );
        }

        lines.push(
          '',
          `Всего тайтлов: <b>${subscriptions.anime.length}</b>`,
        );

        if (!subscriptions.systemNotifications) {
          lines.push(
            '',
            'Подписки сохранены, но сообщения не будут приходить, пока Telegram-уведомления выключены.',
          );
        }
      } else {
        lines.push(
          '',
          'Подписок на новые серии пока нет.',
          '',
          'Открой страницу аниме и включи 🔔, чтобы получать новые серии.',
        );
      }

      await sendMessage(
        chatId,
        lines.join('\n'),
        BOTTOM_MENU,
      );

      return NextResponse.json({
        ok: true,
      });
    }

    /**
     * =====================================================
     * Payment support / terms
     * =====================================================
     */
    if (command === '/terms') {
      await sendMessage(
        chatId,
        [
          '📄 <b>Условия поддержки AnimeBox</b>',
          '',
          `${SITE_URL}/terms`,
        ].join('\n'),
        BOTTOM_MENU,
      );

      return NextResponse.json({
        ok: true,
      });
    }

    if (command === '/paysupport') {
      const issue = text
        .replace(/^\/paysupport(?:@\w+)?/i, '')
        .trim();

      if (!issue) {
        await sendMessage(
          chatId,
          [
            '💳 <b>Поддержка по платежам</b>',
            '',
            'Опиши проблему после команды:',
            '<code>/paysupport Платёж списался, но...</code>',
            '',
            'Заявка будет сохранена для разбора.',
          ].join('\n'),
          BOTTOM_MENU,
        );

        return NextResponse.json({
          ok: true,
        });
      }

      try {
        await recordPaymentSupportRequest({
          telegramId: Number(message?.from?.id ?? chatId),
          chatId,
          message: issue.slice(0, 1000),
        });

        await sendMessage(
          chatId,
          [
            '✅ <b>Заявка по платежу сохранена</b>',
            '',
            'Не удаляй чек Telegram до решения вопроса.',
          ].join('\n'),
          BOTTOM_MENU,
        );
      } catch (error) {
        console.error('[AnimeBox Stars] payment support request:', error);

        await sendMessage(
          chatId,
          'Не удалось сохранить заявку. Попробуй отправить /paysupport ещё раз позже.',
          BOTTOM_MENU,
        );
      }

      return NextResponse.json({
        ok: true,
      });
    }

    /**
     * =====================================================
     * Помощь
     * =====================================================
     */
    if (
      command === '/help' ||
      (normalizedText === '💜 помощь' || normalizedText === '❓ помощь')
    ) {
      await sendMessage(
        chatId,
        [
          '💜 <b>AnimeBox Bot</b>',
          '',
          'Через меня ты можешь:',
          '',
          '🌐 открыть AnimeBox',
          '📚 перейти в свой трекер',
          '🔍 найти аниме',
          '📅 посмотреть расписание',
          '🔔 получать уведомления о новых сериях',
          '',
          '<b>Команды:</b>',
          '/start — главное меню',
          '/open — открыть AnimeBox',
          '/tracker — мой трекер',
          '/notifications — уведомления',
          '/terms — условия поддержки',
          '/paysupport — помощь с платежом',
          '/help — помощь',
        ].join('\n'),
        BOTTOM_MENU,
      );

      return NextResponse.json({
        ok: true,
      });
    }

    /**
     * Обычные сообщения бот пока игнорирует.
     */
    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(
      'Telegram webhook error:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error: 'internal_error',
      },
      {
        status: 500,
      },
    );
  }
}