'use client';

import { useEffect } from 'react';

export default function TelegramMiniAppBridge() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (!tg) {
      document.documentElement.dataset.telegram = 'false';
      return;
    }

    const isTelegram = Boolean(tg.initData);

    document.documentElement.dataset.telegram = isTelegram
      ? 'true'
      : 'false';

    if (!isTelegram) return;

    document.documentElement.classList.add('telegram-mini-app');

    tg.ready();
    tg.expand();

    console.log('AnimeBox Telegram Mini App:', {
      platform: tg.platform,
      version: tg.version,
      colorScheme: tg.colorScheme,
      hasInitData: Boolean(tg.initData),
    });

    return () => {
      document.documentElement.classList.remove('telegram-mini-app');
    };
  }, []);

  return null;
}