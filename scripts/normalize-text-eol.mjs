import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.css', '.json', '.sql', '.yml', '.yaml',
  '.md', '.html', '.svg', '.toml', '.txt',
]);

const TEXT_BASENAMES = new Set([
  '.gitignore',
  '.gitattributes',
  '.npmrc',
]);

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: root,
}).toString('utf8').split('\0').filter(Boolean);

let normalized = 0;
let inspected = 0;

for (const relativePath of tracked) {
  const extension = path.extname(relativePath).toLowerCase();
  const basename = path.basename(relativePath);

  if (!TEXT_EXTENSIONS.has(extension) && !TEXT_BASENAMES.has(basename)) {
    continue;
  }

  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) continue;

  const bytes = fs.readFileSync(absolutePath);
  if (bytes.includes(0)) continue;

  const source = bytes.toString('utf8');
  inspected += 1;

  if (!source.includes('\r')) continue;

  const normalizedSource = source.replace(/\r\n?/g, '\n');
  fs.writeFileSync(absolutePath, normalizedSource, 'utf8');
  normalized += 1;
}

console.log(
  `[AnimeBox EOL] inspected ${inspected} tracked text files; normalized ${normalized} file(s) to LF.`,
);
