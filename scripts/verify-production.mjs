import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const dist = new URL('../dist/', import.meta.url);
if (!existsSync(dist)) {
  console.error('dist/ is missing; run npm run build first');
  process.exit(1);
}

const buildInfoPath = join(dist.pathname, 'build-info.json');
const indexPath = join(dist.pathname, 'index.html');
const manifestPath = join(root, 'PACKAGE_MANIFEST.json');
if (!existsSync(buildInfoPath) || !existsSync(indexPath) || !existsSync(manifestPath)) {
  console.error('Production lock failed: build-info.json, index.html, or PACKAGE_MANIFEST.json is missing.');
  process.exit(1);
}

let buildInfo;
let manifest;
try {
  buildInfo = JSON.parse(readFileSync(buildInfoPath, 'utf8'));
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch {
  console.error('Production lock failed: build-info.json or PACKAGE_MANIFEST.json is invalid.');
  process.exit(1);
}
if (!/^[0-9a-f]{7,40}$/i.test(String(buildInfo.commit ?? ''))) {
  console.error('Production lock failed: build fingerprint is missing or invalid.');
  process.exit(1);
}
if (String(manifest.commit ?? '') !== String(buildInfo.commit ?? '') || String(manifest.buildInfo?.gitCommit ?? '') !== String(buildInfo.gitCommit ?? '')) {
  console.error('Production lock failed: PACKAGE_MANIFEST.json commit does not match dist/build-info.json.');
  process.exit(1);
}
const index = readFileSync(indexPath, 'utf8');
if (!index.includes(`name="qaddaha-build" content="${buildInfo.commit}"`)) {
  console.error('Production lock failed: index.html fingerprint does not match build-info.json.');
  process.exit(1);
}

const files = readdirSync(dist, { recursive: true })
  .filter((file) => String(file).endsWith('.js'))
  .map((file) => join(dist.pathname, String(file)));
const forbidden = ['solo-demo', 'VITE_ENABLE_LOCAL_DEMO=true', 'preview-placeholder.supabase.co', 'preview-anon-key', 'service_role'];
const leaks = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const token of forbidden) if (text.includes(token)) leaks.push(`${file}: ${token}`);
}
const sourceRoot = new URL('../src/', import.meta.url);
const sourceFiles = readdirSync(sourceRoot, { recursive: true })
  .filter((file) => /\.(ts|tsx)$/.test(String(file)))
  .map((file) => join(sourceRoot.pathname, String(file)));
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const token of ['useSoloMatch', 'matchEngine', 'challengeBank', 'aiOpponent', 'solo-demo', 'VITE_ENABLE_LOCAL_DEMO', 'preview-placeholder.supabase.co', 'preview-anon-key', 'service_role']) {
    if (text.includes(token)) leaks.push(`${file}: ${token}`);
  }
}
if (leaks.length) {
  console.error('Production lock failed. Demo markers or secrets found:\n' + leaks.join('\n'));
  process.exit(1);
}
console.log(`Production lock passed: ${files.length} JavaScript assets scanned; manifest ${manifest.commit} matches build.`);
