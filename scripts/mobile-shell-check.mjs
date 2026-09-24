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
const responsive = read('app/patch16-6-responsive-layout.css');

const importNeedle = "import './patch14-2-mobile-shell.css';";
if (!layout.includes(importNeedle)) {
  failures.push('layout.tsx: Mobile Shell stylesheet is not imported.');
}

const responsiveImportNeedle = "import './patch16-6-responsive-layout.css';";
if (!layout.includes(responsiveImportNeedle)) {
  failures.push('layout.tsx: Responsive Layout stylesheet is not imported.');
}

if (
  layout.indexOf(responsiveImportNeedle) <
  layout.indexOf("import './patch16-5-profile-widgets.css';")
) {
  failures.push('layout.tsx: Responsive Layout must remain the final responsive override layer.');
}

const mobileShellImport = layout.indexOf(importNeedle);
const antiAiImport = layout.indexOf("import './patch14-1-1-anti-ai-design.css';");
if (
  mobileShellImport < 0 ||
  antiAiImport < 0 ||
  mobileShellImport < antiAiImport
) {
  failures.push('layout.tsx: Mobile Shell must load after the shared anti-AI visual layer.');
}

for (const [label, needle] of [
  ['scroll direction timestamp', 'directionSince'],
  ['downward hysteresis', 'state.travel >= 82'],
  ['upward hysteresis', 'state.travel >= 58'],
  ['toggle cooldown', 'now - state.lastToggleAt >= 520'],
  ['modal nav lock', '[data-mobile-nav-lock="true"]'],
  ['compact landscape media query', "'(orientation: landscape) and (max-height: 600px) and (max-width: 1100px)'"],
  ['orientation resize reset', "window.addEventListener('resize', onViewportChange"],
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
  ['vector promo shell', 'telegram-growth-card--vector'],
  ['shared AnimeBox icon core', 'AnimeBoxIconCore'],
  ['Telegram vector icon', 'PaperPlaneTiltIcon'],
  ['reduced motion support', 'useReducedMotion'],
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


for (const [label, needle] of [
  ['compact landscape contract', '@media (orientation: landscape) and (max-height: 600px) and (max-width: 1100px)'],
  ['landscape mobile nav', '.mobile-nav {'],
  ['landscape sidebar suppression', '.sidebar {'],
  ['landscape home rails', '.home-page .anime-grid'],
  ['landscape anime detail grid', '.anime-detail-grid'],
  ['landscape player toolbar', '.animebox-player-toolbar'],
  ['landscape profile grid', '.profile-v2__stats'],
  ['tablet portrait contract', '@media (min-width: 769px) and (max-width: 1024px) and (orientation: portrait)'],
  ['tablet landscape contract', '@media (min-width: 1025px) and (max-width: 1366px) and (min-height: 601px)'],
]) {
  if (!responsive.includes(needle)) {
    failures.push(`Responsive Layout CSS: missing ${label}.`);
  }
}

if (failures.length) {
  console.error('\n[AnimeBox Mobile Shell] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Mobile Shell] Static invariants passed.');
