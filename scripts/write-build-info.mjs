import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function firstValue(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const root = resolve(new URL('..', import.meta.url).pathname);
const dist = resolve(root, 'dist');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const commit = firstValue(
  process.env.GIT_COMMIT_SHA,
  process.env.COMMIT_SHA,
  process.env.SOURCE_VERSION,
  process.env.RAILWAY_GIT_COMMIT_SHA,
  gitCommit(),
);

if (!/^[0-9a-f]{7,40}$/i.test(commit)) {
  throw new Error('Build fingerprint is missing. Set GIT_COMMIT_SHA or build from a Git checkout.');
}

const info = {
  app: 'qaddaha',
  version: packageJson.version,
  commit,
  builtAt: new Date().toISOString(),
};

await writeFile(resolve(dist, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`, 'utf8');
const indexPath = resolve(dist, 'index.html');
const index = await readFile(indexPath, 'utf8');
const marker = `<meta name="qaddaha-build" content="${commit}">`;
const nextIndex = index.includes('name="qaddaha-build"')
  ? index.replace(/<meta name="qaddaha-build" content="[^"]*"\s*\/?\s*>/, marker)
  : index.replace('</head>', `  ${marker}\n</head>`);
await writeFile(indexPath, nextIndex, 'utf8');
console.log(`[qaddaha] build fingerprint: ${commit} (${packageJson.version})`);
