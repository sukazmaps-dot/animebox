import type { Metadata } from 'next';

import SponsorBenefitsSettings from '@/components/monetization/SponsorBenefitsSettings';

export const metadata: Metadata = {
  title: 'Настройки спонсора',
  description: 'Персонализация спонсорского оформления AnimeBox.',
  robots: { index: false, follow: false },
};

export default function SponsorSettingsPage() {
  return (
    <main className="sponsor-v3-settings-page">
      <div className="sponsor-v3-settings-head">
        <span>SPONSOR CUSTOMIZATION</span>
        <h1>Оформление и приватность</h1>
        <p>
          Настрой внешний вид спонсорского статуса и сам реши, что будет видно другим пользователям AnimeBox.
        </p>
      </div>
      <SponsorBenefitsSettings />
    </main>
  );
}
