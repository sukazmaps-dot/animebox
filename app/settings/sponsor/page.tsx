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
        <span>SPONSOR BENEFITS V3</span>
        <h1>Оформление спонсора</h1>
        <p>
          Выбирай открытые рамки, стиль ника и тему профиля. Чем выше уровень — тем больше вариантов.
        </p>
      </div>
      <SponsorBenefitsSettings />
    </main>
  );
}
