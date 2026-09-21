import type { Metadata } from 'next';

import NotificationSettingsClient from '@/components/NotificationSettingsClient';
import SocialNotificationsClient from '@/components/SocialNotificationsClient';

export const metadata: Metadata = {
  title: 'Уведомления',
  description: 'Настройки Telegram-уведомлений AnimeBox о новых сериях.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotificationsPage() {
  return (
    <main className="notifications-page">
      <SocialNotificationsClient />
      <NotificationSettingsClient />
    </main>
  );
}
