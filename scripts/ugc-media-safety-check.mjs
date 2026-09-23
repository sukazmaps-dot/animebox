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

const inspector = read('lib/profile-media-inspect-server.ts');
const publisher = read('lib/profile-media-publish-server.ts');
const uploadUrl = read('app/api/profile/media/upload-url/route.ts');
const comments = read('app/api/comments/route.ts');

for (const [label, needle] of [
  ['JPEG byte parser', 'inspectJpeg'],
  ['PNG byte parser', 'inspectPng'],
  ['WebP byte parser', 'inspectWebp'],
  ['GIF byte parser', 'inspectGif'],
]) {
  if (!inspector.includes(needle)) {
    failures.push(`profile image inspector: missing ${label}.`);
  }
}

for (const [label, needle] of [
  ['byte-derived media inspection', 'inspectProfileImageBytes'],
  ['candidate ownership check', 'validateCandidateOwnership'],
  ['dimension/pixel guard', 'maxPixels'],
  ['MIME mismatch rejection', 'MIME загруженного файла'],
  ['extension mismatch rejection', 'Расширение изображения'],
  ['animation policy', 'Анимация разрешена только'],
]) {
  if (!publisher.includes(needle)) {
    failures.push(`profile media publisher: missing ${label}.`);
  }
}

if (!uploadUrl.includes("variant === 'static'") || !uploadUrl.includes("mimeType === 'image/webp'")) {
  failures.push('profile media signed upload route: static WebP gate is missing.');
}

if (!comments.includes('await readBody(request)')) {
  failures.push('comments API: bounded/same-origin JSON reader is missing.');
}

if (!comments.includes('payload.isSpoiler === true')) {
  failures.push('comments API: strict spoiler boolean parsing is missing.');
}

if (failures.length) {
  console.error('\n[AnimeBox UGC Safety] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox UGC Safety] Server-side UGC/media invariants passed.');
