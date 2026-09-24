import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];
const editor = read('components/profile/ProfileWidgetEditor.tsx');
const perf = read('app/patch16-6-1-mobile-performance.css');

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
