import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];

const navbar = read('components/Navbar.tsx');
const authButton = read('components/AuthUserButton.tsx');
const presence = read('components/social/SocialPresenceHeartbeat.tsx');
const notifications = read('components/SocialNotificationBadge.tsx');
const membership = read('components/SidebarMembership.tsx');
const analytics = read('components/analytics/ProductAnalyticsTracker.tsx');

const rootRuntimeFiles = [
  'components/Navbar.tsx',
  'components/AuthUserButton.tsx',
  'components/MobileAccountNav.tsx',
  'components/AuthStateProvider.tsx',
  'components/AuthModalProvider.tsx',
  'components/TelegramMiniAppBridge.tsx',
  'components/TelegramSubscriptionGate.tsx',
  'components/UserPreferencesBridge.tsx',
  'components/OfflineCacheBridge.tsx',
  'components/DeferredAppEnhancements.tsx',
  'components/analytics/ProductAnalyticsTracker.tsx',
  'components/analytics/DeferredYandexMetrika.tsx',
  'components/social/SocialPresenceHeartbeat.tsx',
  'components/SocialNotificationBadge.tsx',
  'components/SidebarMembership.tsx',
];

const rootListenerCount = rootRuntimeFiles.reduce((total, file) => {
  const source = read(file);
  return total + (source.match(/addEventListener\(/g) ?? []).length;
}, 0);

if (rootListenerCount > 35) {
  failures.push(
    `root runtime listener budget regressed: ${rootListenerCount} > 35`,
  );
}

for (const [label, source, needle] of [
  ['mobile-only scroll runtime', navbar, "window.matchMedia('(max-width: 760px)')"],
  ['mobile scroll listener attach gate', navbar, 'attachRuntimeListeners'],
  ['mobile scroll listener detach gate', navbar, 'detachRuntimeListeners'],
  ['RAF scroll scheduling', navbar, 'window.requestAnimationFrame(update)'],
  ['menu listener open gate', authButton, 'if (!open) return;'],
  ['presence timer stop', presence, 'stopTimer'],
  ['presence hidden-tab guard', presence, "document.visibilityState === 'visible'"],
  ['presence offline pause', presence, "window.addEventListener('offline', onOffline)"],
  ['notification polling stop', notifications, 'stopPolling'],
  ['notification hidden-tab guard', notifications, "document.visibilityState !== 'visible'"],
  ['membership hidden-tab guard', membership, "document.visibilityState !== 'visible'"],
  ['secondary analytics idle scheduling', analytics, 'scheduleSecondaryAnalytics'],
  ['secondary analytics visibility guard', analytics, "document.visibilityState !== 'visible'"],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (navbar.includes('document.querySelector(')) {
  failures.push(
    'Navbar hot scroll runtime must not query the document on every frame.',
  );
}

const authButtonEffect =
  authButton.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[open\]\);/)?.[0] ?? '';

if (
  !authButtonEffect.includes('if (!open) return;') ||
  !authButtonEffect.includes("document.addEventListener('mousedown'") ||
  !authButtonEffect.includes("window.addEventListener('keydown'")
) {
  failures.push(
    'Auth account listeners must exist only while the dropdown is open.',
  );
}

for (const [label, source] of [
  ['presence', presence],
  ['social notifications', notifications],
]) {
  if (!source.includes('clearInterval')) {
    failures.push(`${label} polling has no explicit timer shutdown`);
  }

  if (!source.includes('visibilitychange')) {
    failures.push(`${label} polling is not visibility-aware`);
  }
}

if (
  analytics.indexOf("trackProductClientEvent('page_view'") >
  analytics.indexOf('scheduleSecondaryAnalytics')
) {
  failures.push(
    'page_view must remain immediate; only secondary analytics should be deferred.',
  );
}

if (failures.length) {
  console.error('[AnimeBox Runtime Effects] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `[AnimeBox Runtime Effects] root runtime holds at ${rootListenerCount} listener sites with visibility-aware polling.`,
);
