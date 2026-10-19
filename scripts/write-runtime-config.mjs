import { mkdir, writeFile } from 'node:fs/promises';

const output = new URL('../dist/env-config.js', import.meta.url);
const first = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
const config = {
  VITE_SUPABASE_URL: first(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_URL, process.env.PUBLIC_SUPABASE_URL),
  VITE_SUPABASE_ANON_KEY: first(process.env.VITE_SUPABASE_ANON_KEY, process.env.SUPABASE_ANON_KEY, process.env.SUPABASE_PUBLISHABLE_KEY, process.env.PUBLIC_SUPABASE_ANON_KEY),
};

await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await writeFile(
  output,
  `window.__QADDAHA_ENV__ = ${JSON.stringify(config)};\n`,
  'utf8',
);
console.log(`[qaddaha] runtime config written: ${config.VITE_SUPABASE_URL ? 'Supabase URL present' : 'Supabase URL missing'}, ${config.VITE_SUPABASE_ANON_KEY ? 'anon key present' : 'anon key missing'}`);
