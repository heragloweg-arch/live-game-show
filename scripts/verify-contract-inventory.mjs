import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const sourceRoots = ['src', 'supabase/functions'];
const sourceExtensions = new Set(['.ts', '.tsx']);

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (sourceExtensions.has(path.slice(path.lastIndexOf('.')))) files.push(path);
  }
  return files;
}

function readSources() {
  return sourceRoots.flatMap((directory) => walk(directory)).map((path) => ({
    path,
    text: readFileSync(join(root, path), 'utf8'),
  }));
}

function collectNames(sources, patterns) {
  const names = new Map();
  for (const { path, text } of sources) {
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const name = match[1];
        if (!names.has(name)) names.set(name, new Set());
        names.get(name).add(path);
      }
    }
  }
  return names;
}

function migrationFunctions() {
  const migrationDir = join(root, 'supabase/migrations');
  const names = new Set();
  for (const entry of readdirSync(migrationDir)) {
    if (!entry.endsWith('.sql')) continue;
    const text = readFileSync(join(migrationDir, entry), 'utf8');
    for (const match of text.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([A-Za-z0-9_]+)/gi)) {
      names.add(match[1]);
    }
  }
  return names;
}

const sources = readSources();
const edgeDirectories = new Set(
  readdirSync(join(root, 'supabase/functions'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
    .map((entry) => entry.name),
);
const edgeCalls = collectNames(sources, [
  /\.invoke\(\s*['"]([^'"]+)['"]/g,
  /\binvoke(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]/g,
  /getFunctionsUrl\(\s*['"]([^'"]+)['"]\s*\)/g,
  /FUNCTIONS_URL\s*\+\s*['"]\/?([A-Za-z0-9_-]+)/g,
  /\$\{(?:FUNCTIONS_URL|BASE)\}\/([A-Za-z0-9_-]+)/g,
  /functions\/v1\/([A-Za-z0-9_-]+)/g,
]);
const rpcCalls = collectNames(sources, [/\.rpc\(\s*['"]([^'"]+)['"]/g]);
const definedRpc = migrationFunctions();
const missingEdge = [...edgeCalls.keys()].filter((name) => !edgeDirectories.has(name)).sort();
const missingRpc = [...rpcCalls.keys()].filter((name) => !definedRpc.has(name)).sort();
const report = {
  source: 'repository static contract inventory',
  edgeFunctions: [...edgeDirectories].sort(),
  edgeCalls: [...edgeCalls.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, files]) => ({ name, files: [...files].sort() })),
  rpcCalls: [...rpcCalls.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, files]) => ({ name, files: [...files].sort() })),
  missingEdgeFunctions: missingEdge,
  missingRpcDefinitions: missingRpc,
};

const outputPath = join(root, 'docs/CONTRACT_INVENTORY.json');
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

if (missingEdge.length || missingRpc.length) {
  console.error(`Contract inventory failed: ${missingEdge.length} missing Edge Functions, ${missingRpc.length} missing RPC definitions.`);
  if (missingEdge.length) console.error(`Missing Edge Functions: ${missingEdge.join(', ')}`);
  if (missingRpc.length) console.error(`Missing RPC definitions: ${missingRpc.join(', ')}`);
  process.exit(1);
}

console.log(`Contract inventory passed: ${edgeDirectories.size} Edge Function directories, ${rpcCalls.size} RPC calls, all locally defined.`);
console.log(`Wrote ${relative(root, outputPath)}.`);
