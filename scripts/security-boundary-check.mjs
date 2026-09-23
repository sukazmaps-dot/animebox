import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ignoredDirs = new Set(['.git', '.next', 'node_modules', 'coverage', 'build', 'dist', 'out']);
const violations = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignoredDirs.has(name)) continue;
    const full = join(dir, name);
    const stats = statSync(full);

    if (stats.isDirectory()) {
      walk(full);
      continue;
    }

    if (codeExtensions.has(extname(name))) inspectSource(full);
  }
}

function inspectSource(file) {
  const source = readFileSync(file, 'utf8');
  const fileName = relative(root, file).replaceAll('\\', '/');
  const isClient = /(^|\n)\s*['"]use client['"];?/.test(source.slice(0, 2500));

  const envNames = [
    ...source.matchAll(/process\.env\.([A-Z0-9_]+)/g),
    ...source.matchAll(/process\.env\[['"]([A-Z0-9_]+)['"]\]/g),
  ].map((match) => match[1]);

  if (isClient) {
    for (const envName of envNames) {
      if (!envName.startsWith('NEXT_PUBLIC_')) {
        violations.push(`${fileName}: Client Component reads private env ${envName}.`);
      }
    }

    const forbiddenServerImport =
      /from\s+['"]@\/lib\/(?:env\/server|supabase\/admin|community-server|[^'"]+-server)['"]/;

    if (forbiddenServerImport.test(source)) {
      violations.push(`${fileName}: Client Component imports a server-only module.`);
    }
  }

  const dangerousPublicEnv =
    /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE_KEY|PASSWORD|WEBHOOK|TOKEN)[A-Z0-9_]*/g;

  for (const match of source.matchAll(dangerousPublicEnv)) {
    violations.push(`${fileName}: suspicious public secret name ${match[0]}.`);
  }

  if (fileName !== 'scripts/security-boundary-check.mjs') {
    const hardcodedSecretPatterns = [
      /sb_secret_[A-Za-z0-9_-]{20,}/,
      /ghp_[A-Za-z0-9]{30,}/,
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    ];

    if (hardcodedSecretPatterns.some((pattern) => pattern.test(source))) {
      violations.push(`${fileName}: possible hard-coded credential detected.`);
    }
  }
}

function inspectTrackedSensitiveFiles() {
  try {
    const output = execFileSync(
      'git',
      ['ls-files'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );

    for (const raw of output.split(/\r?\n/)) {
      const file = raw.trim();
      if (!file) continue;
      const base = file.split('/').pop() ?? file;
      const isEnv = /^\.env(?:\..+)?$/i.test(base) && !/\.example$/i.test(base);
      const isPrivateKey = /\.(?:pem|key|p12|pfx)$/i.test(base);

      if (isEnv || isPrivateKey) {
        violations.push(`${file}: sensitive file is tracked by Git.`);
      }
    }
  } catch {
    // Deployment sandboxes may omit .git metadata.
  }
}

walk(root);
inspectTrackedSensitiveFiles();

if (violations.length) {
  console.error('\n[AnimeBox Security] Boundary check failed:\n');
  for (const item of violations) console.error(` - ${item}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Security] Secret/client boundary check passed.');
