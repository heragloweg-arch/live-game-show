import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url);
if (!existsSync(dist)) {
  console.error('dist/ is missing; run npm run build first');
  process.exit(1);
}

const files = readdirSync(dist, { recursive: true })
  .filter((file) => String(file).endsWith('.js'))
  .map((file) => join(dist.pathname, String(file)));
const forbidden = ['solo-demo', 'VITE_ENABLE_LOCAL_DEMO=true', 'preview-placeholder.supabase.co', 'preview-anon-key'];
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
  for (const token of ['useSoloMatch', 'matchEngine', 'challengeBank', 'aiOpponent', 'solo-demo', 'VITE_ENABLE_LOCAL_DEMO', 'preview-placeholder.supabase.co', 'preview-anon-key']) {
    if (text.includes(token)) leaks.push(`${file}: ${token}`);
  }
}
if (leaks.length) {
  console.error('Production lock failed. Demo markers found:\n' + leaks.join('\n'));
  process.exit(1);
}
console.log(`Production lock passed: ${files.length} JavaScript assets scanned.`);
