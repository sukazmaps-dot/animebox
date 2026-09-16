import Icon from '@/components/Icon';
import { TELEGRAM_MINI_APP_URL } from '@/lib/telegram-links';

export default function TelegramPromoCard() {
  return (
    <section className="flex min-w-0 flex-col items-center rounded-2xl border border-violet-400/20 bg-gradient-to-br from-slate-900 to-slate-950 p-5 text-center sm:p-6">
      <div className="mx-auto mb-4 w-full max-w-[180px] shrink-0">
        <img src="/brand/telegram-cta.png" alt="" className="block h-auto w-full object-contain" />
      </div>
      <div className="w-full min-w-0">
        <p className="text-xs font-bold tracking-wider text-violet-400">ANIMEBOX × TELEGRAM</p>
        <h2 className="mt-2 text-base font-bold leading-snug text-white">Новые серии — прямо в Telegram</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">Следи за любимыми тайтлами и получай уведомления без лишнего шума.</p>
        <a href={TELEGRAM_MINI_APP_URL} target="_blank" rel="noreferrer"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-3 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-400">
          <Icon name="telegram" className="h-4 w-4 shrink-0" />
          <span>Открыть Mini App</span>
        </a>
      </div>
    </section>
  );
}
