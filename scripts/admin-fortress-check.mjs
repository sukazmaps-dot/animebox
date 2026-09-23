import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const adminApiRoot = join(root, 'app', 'api', 'admin');
const failures = [];

function walk(dir) {
  if (!existsSync(dir)) return [];

  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stats = statSync(full);

    if (stats.isDirectory()) files.push(...walk(full));
    else if (name === 'route.ts') files.push(full);
  }
  return files;
}

const routes = walk(adminApiRoot);

if (!routes.length) {
  failures.push('No admin API routes were found.');
}

for (const file of routes) {
  const source = readFileSync(file, 'utf8');
  const name = relative(root, file).replaceAll('\\', '/');

  const hasAdminBoundary =
    source.includes('requireAdmin(') ||
    source.includes('requireAdminMutation(');

  if (!hasAdminBoundary) {
    failures.push(`${name}: admin route has no server-side admin guard.`);
  }

  const hasMutation =
    /export\s+async\s+function\s+(?:POST|PATCH|PUT|DELETE)\b/.test(source);

  if (hasMutation && !source.includes('requireAdminMutation(')) {
    failures.push(
      `${name}: state-changing admin route does not use requireAdminMutation().`,
    );
  }
}

const adminServerPath = join(root, 'lib', 'admin-server.ts');
if (!existsSync(adminServerPath)) {
  failures.push('lib/admin-server.ts is missing.');
} else {
  const source = readFileSync(adminServerPath, 'utf8');

  for (const [label, needle] of [
    ['central mutation limiter', 'admin_mutation_user'],
    ['global admin access limiter', 'admin_access_user'],
    ['role hierarchy guard', 'assertCanModerateTarget'],
    ['audit request correlation support', 'x-animebox-request-id'],
  ]) {
    if (!source.includes(needle)) {
      failures.push(`lib/admin-server.ts: missing ${label}.`);
    }
  }
}

const usersRoutePath = join(root, 'app', 'api', 'admin', 'users', 'route.ts');
if (existsSync(usersRoutePath)) {
  const source = readFileSync(usersRoutePath, 'utf8');

  if (!source.includes("role === 'moderator' ? null")) {
    failures.push(
      'app/api/admin/users/route.ts: moderator-sensitive-field redaction is missing.',
    );
  }
}

if (failures.length) {
  console.error('\n[AnimeBox Admin Fortress] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(
  `[AnimeBox Admin Fortress] ${routes.length} admin API routes passed static checks.`,
);
