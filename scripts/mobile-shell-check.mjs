import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  const full = join(root, path);
  if (!existsSync(full)) {
    failures.push(`${path}: required file is missing.`);
    return '';
  }
  return readFileSync(full, 'utf8');
}

const layout = read('app/layout.tsx');
const navbar = read('components/Navbar.tsx');
const account = read('components/MobileAccountNav.tsx');
const promo = read('components/TelegramPromoCard.tsx');
const shell = read('app/patch14-2-mobile-shell.css');

const importNeedle = "import './patch14-2-mobile-shell.css';";
if (!layout.includes(importNeedle)) {
  failures.push('layout.tsx: Mobile Shell stylesheet is not imported.');
}

const lastCssImport = layout.lastIndexOf("import './");
const mobileShellImport = layout.indexOf(importNeedle);
if (mobileShellImport < 0 || mobileShellImport !== lastCssImport) {
  failures.push('layout.tsx: Mobile Shell must remain the last global CSS import.');
}

for (const [label, needle] of [
  ['scroll direction timestamp', 'directionSince'],
  ['downward hysteresis', 'state.travel >= 82'],
  ['upward hysteresis', 'state.travel >= 58'],
  ['toggle cooldown', 'now - state.lastToggleAt >= 520'],
  ['modal nav lock', '[data-mobile-nav-lock="true"]'],
]) {
  if (!navbar.includes(needle)) {
    failures.push(`Navbar: missing ${label}.`);
  }
}

for (const [label, needle] of [
  ['body portal', 'createPortal(accountSheet, document.body)'],
  ['sheet nav lock', 'data-mobile-nav-lock="true"'],
  ['modal semantics', 'aria-modal="true"'],
]) {
  if (!account.includes(needle)) {
    failures.push(`MobileAccountNav: missing ${label}.`);
  }
}

for (const [label, needle] of [
  ['static WebP direct loading', 'unoptimized'],
  ['secondary WebP fallback', '/backgrounds/telegram-promo.webp'],
  ['final art fallback', 'setArtHidden(true)'],
]) {
  if (!promo.includes(needle)) {
    failures.push(`TelegramPromoCard: missing ${label}.`);
  }
}

for (const [label, needle] of [
  ['safe bottom model', '--ab-shell-safe-bottom:'],
  ['docked bottom nav', 'border-radius: 0 !important'],
  ['active iris marker', '.mobile-nav__item.is-active::after'],
  ['stable hide transform', '.mobile-nav.is-hidden'],
  ['profile sheet overlay', 'z-index: 990 !important'],
  ['Telegram unified shell', 'html.telegram-mini-app .mobile-nav'],
  ['broken-art fallback styling', '.telegram-growth-card__art-fallback'],
]) {
  if (!shell.includes(needle)) {
    failures.push(`Mobile Shell CSS: missing ${label}.`);
  }
}

if (failures.length) {
  console.error('\n[AnimeBox Mobile Shell] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Mobile Shell] Static invariants passed.');
