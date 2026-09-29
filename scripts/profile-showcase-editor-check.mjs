import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];
const editor = read('components/profile/ProfileWidgetEditor.tsx');
const perf = read('app/patch16-6-1-mobile-performance.css');
const editorShell = read('components/profile/ProfileEditorClient.tsx');
const editPage = read('app/profile/edit/page.tsx');
const profilePage = read('app/profile/page.tsx');
const miniProfileCss = read('components/profile/ProfilePreview.module.css');
const widgetsRoute = read('app/api/community/profile-widgets/route.ts');
const gate = read('components/TelegramSubscriptionGate.tsx');
const studioCss = read('app/patch16-6-5-profile-studio.css');
const directEditor = read('components/profile/ProfileDirectEditSurface.tsx');

for (const [label, needle] of [
  ['React portal import', "import { createPortal } from 'react-dom';"],
  ['editor portal mount', 'createPortal('],
  ['document body portal target', 'document.body'],
  ['mobile nav modal lock', "data-mobile-nav-lock={embedded ? undefined : 'true'}"],
  ['Escape close support', "event.key === 'Escape'"],
  ['background scroll lock', "document.body.style.overflow = 'hidden'"],
]) {
  if (!editor.includes(needle)) {
    failures.push(`ProfileWidgetEditor: missing ${label}.`);
  }
}

for (const [label, source, needle] of [
  ['Profile Studio profile tab', editorShell, "switchTab('profile')"],
  ['Profile Studio direct edit surface', editorShell, '<ProfileDirectEditSurface'],
  ['Profile Studio rewards tab', editorShell, "switchTab('rewards')"],
  ['legacy appearance URL alias remains supported', editPage, "params.tab === 'appearance' || params.tab === 'media'"],
  ['direct edit frame inventory', directEditor, 'КОЛЛЕКЦИЯ РАМОК'],
  ['direct edit avatar control', directEditor, 'Изменить аватар'],
  ['direct edit banner control', directEditor, 'Изменить баннер'],
  ['single profile editor entry remains', profilePage, 'Редактировать профиль'],
  ['mobile mini-profile auto height', miniProfileCss, 'height: auto !important'],
  ['mobile mini-profile body shrink', miniProfileCss, 'flex: 0 1 auto'],
  ['showcase tab in unified editor', editorShell, "activeTab === 'showcase'"],
  ['embedded showcase editor', editorShell, '<ProfileWidgetEditor'],
  ['showcase GET endpoint', widgetsRoute, 'export async function GET()'],
  ['embedded editor contract', editor, 'embedded?: boolean'],
  ['embedded editor CSS', studioCss, '.profile-widgets-editor--embedded'],
  ['showcase global savebar hidden', studioCss, ".profile-editor-v13[data-editor-tab='showcase'] .profile-editor-v18__savebar"],
  ['embedded showcase actions sticky', studioCss, 'position: sticky !important'],
  ['embedded showcase safe-area footer', studioCss, 'bottom: max(12px, env(safe-area-inset-bottom)) !important'],
  ['showcase desktop footer spacing', studioCss, 'padding-bottom: 24px'],
  ['gate direct brand asset', gate, 'src="/brand/brand-mark.webp"'],
  ['gate inline SVG fallback', gate, 'telegram-subscription-gate__logo-fallback'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing expected contract.`);
  }
}

if (!editorShell.includes("type EditorTab = 'profile' | 'showcase' | 'rewards' | 'style'")) {
  failures.push('Profile Studio Direct Edit tab contract regressed.');
}

if (editorShell.includes("switchTab('appearance')")) {
  failures.push('Standalone appearance tab returned; Profile + Appearance must remain unified.');
}

if (
  !editPage.includes("params.tab === 'appearance' || params.tab === 'media'") ||
  !editPage.includes("? 'profile'")
) {
  failures.push('Legacy appearance/media URLs must resolve into the unified profile editor.');
}

if (profilePage.includes('profile-v2__bottom-card--premium')) {
  failures.push('Profile page: duplicate standalone style-editor entry returned.');
}

if (!perf.includes('.profile-widgets-shell')) {
  failures.push('Expected profile shell containment is missing; portal regression guard no longer matches the performance contract.');
}

if (editor.includes('{open && (\n        <div')) {
  failures.push('ProfileWidgetEditor: editor overlay is rendered inline instead of through the document-body portal.');
}

if (studioCss.includes('.profile-widgets-editor--embedded .profile-widgets-editor__actions {\n  position: static !important;')) {
  failures.push('Embedded showcase save action regressed to static positioning and can fall behind the global savebar.');
}

if (!studioCss.includes(".profile-editor-v13[data-editor-tab='showcase'] .profile-editor-v18__savebar {\n  display: none !important;")) {
  failures.push('Showcase tab must own exactly one visible save surface.');
}

if (failures.length) {
  console.error('[AnimeBox Profile Showcase Editor] Check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (gate.includes("from 'next/image'")) {
  failures.push('Telegram subscription gate: Next Image dependency returned for the pre-access logo.');
}

if (gate.includes('src="/brand/favicon.png"')) {
  failures.push('Telegram subscription gate: fragile favicon source returned.');
}

console.log('PASS: Profile Studio Direct Edit, showcase, legacy appearance aliases, mobile mini-profile, editor portal and Telegram gate logo resilience');
