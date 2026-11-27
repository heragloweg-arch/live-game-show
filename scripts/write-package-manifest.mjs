import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const buildInfoPath = resolve(root, 'dist/build-info.json');
const packagePath = resolve(root, 'package.json');
const manifestPath = resolve(root, 'PACKAGE_MANIFEST.json');

const buildInfo = JSON.parse(await readFile(buildInfoPath, 'utf8'));
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
const commit = String(buildInfo.commit ?? '');
if (!/^[0-9a-f]{7,40}$/i.test(commit)) {
  throw new Error('Cannot generate package manifest without a valid build commit.');
}

const manifest = {
  product: 'Qaddaha',
  repository: 'https://github.com/heragloweg-arch/live-game-show.git',
  branch: 'main',
  commit,
  version: packageJson.version,
  generatedAt: buildInfo.builtAt,
  buildInfo: {
    path: 'dist/build-info.json',
    gitCommit: buildInfo.gitCommit,
    contentFingerprint: buildInfo.contentFingerprint,
    ...(buildInfo.deploymentFingerprint ? { deploymentFingerprint: buildInfo.deploymentFingerprint } : {}),
  },
  sourceOfTruth: 'repository source + dist/build-info.json',
  releaseDecision: 'NO-GO until external E2E, signed AAB/Google Play Billing, AdMob SSV, LiveKit, and production key-rotation evidence are closed',
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`[qaddaha] package manifest generated for ${commit}`);
