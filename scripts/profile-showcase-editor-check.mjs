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

for (const [label, needle] of [
  ['React portal import', "import { createPortal } from 'react-dom';"],
  ['editor portal mount', 'createPortal('],
  ['document body portal target', 'document.body'],
  ['mobile nav modal lock', 'data-mobile-nav-lock="true"'],
  ['Escape close support', "event.key === 'Escape'"],
  ['background scroll lock', "document.body.style.overflow = 'hidden'"],
]) {
  if (!editor.includes(needle)) {
    failures.push(`ProfileWidgetEditor: missing ${label}.`);
  }
}

for (const [label, source, needle] of [
  ['unified editor tab label', editorShell, 'Профиль и оформление'],
  ['legacy appearance URL folds into profile', editPage, "params.tab === 'style' || params.tab === 'premium' ? 'style' : 'profile'"],
  ['separate appearance tab removed', editorShell, "switchTab('appearance')"],
  ['single profile editor entry remains', profilePage, 'Редактировать профиль'],
  ['duplicate style editor card removed', profilePage, 'profile-v2__bottom-card--premium'],
  ['mobile mini-profile auto height', miniProfileCss, 'height: auto !important'],
  ['mobile mini-profile body shrink', miniProfileCss, 'flex: 0 1 auto'],
]) {
  const present = source.includes(needle);

  if (
    label === 'separate appearance tab removed' ||
    label === 'duplicate style editor card removed'
  ) {
    if (present) failures.push(`${label}: legacy separate entry still exists.`);
  } else if (!present) {
    failures.push(`${label}: missing expected contract.`);
  }
}

if (!perf.includes('.profile-widgets-shell')) {
  failures.push('Expected profile shell containment is missing; portal regression guard no longer matches the performance contract.');
}

if (editor.includes('{open && (\n        <div')) {
  failures.push('ProfileWidgetEditor: editor overlay is rendered inline instead of through the document-body portal.');
}

if (failures.length) {
  console.error('[AnimeBox Profile Showcase Editor] Check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: profile showcase editor escapes paint containment through a document-body portal');
