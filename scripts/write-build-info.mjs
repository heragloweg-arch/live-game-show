import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function firstValue(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function deploymentFingerprint() {
  const deployment = firstValue(process.env.RAILWAY_DEPLOYMENT_ID, process.env.RAILWAY_SNAPSHOT_ID);
  return deployment ? createHash('sha256').update(`qaddaha:railway:${deployment}`).digest('hex').slice(0, 40) : '';
}

const root = resolve(new URL('..', import.meta.url).pathname);
const dist = resolve(root, 'dist');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const gitOrBuildCommit = firstValue(
  process.env.GIT_COMMIT_SHA,
  process.env.COMMIT_SHA,
  process.env.SOURCE_VERSION,
  process.env.RAILWAY_GIT_COMMIT_SHA,
  gitCommit(),
);
const commit = gitOrBuildCommit || deploymentFingerprint();
const fingerprintSource = gitOrBuildCommit ? 'git-commit' : (commit ? 'railway-deployment' : 'unavailable');

if (!/^[0-9a-f]{7,40}$/i.test(commit)) {
  throw new Error('Build fingerprint is missing. Set GIT_COMMIT_SHA, RAILWAY_GIT_COMMIT_SHA, or provide a Railway deployment context.');
}

const info = {
  app: 'qaddaha',
  version: packageJson.version,
  commit,
  fingerprintSource,
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
