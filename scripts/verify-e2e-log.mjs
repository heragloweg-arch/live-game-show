import { readFileSync } from 'node:fs';

const path = 'docs/E2E_EXECUTION_LOG_AR.md';
const text = readFileSync(path, 'utf8');
const rows = [...text.matchAll(/^\|\s*(\d+)\s*\|[^|]+\|\s*(PASS|FAIL|BLOCKED_EXTERNAL)\s*\|\s*([^|]*)\|/gm)];
if (rows.length !== 10) {
  throw new Error(`E2E log must contain exactly 10 scenario rows; found ${rows.length}`);
}
for (const [, number, result, evidence] of rows) {
  if (result === 'PASS' && (!evidence.trim() || evidence.trim() === '—' || evidence.trim() === '-')) {
    throw new Error(`Scenario ${number} cannot be PASS without field evidence.`);
  }
}
const blocked = rows.filter(([, , result]) => result === 'BLOCKED_EXTERNAL').length;
const failed = rows.filter(([, , result]) => result === 'FAIL').length;
if (failed > 0) throw new Error(`E2E log contains ${failed} failing scenario(s).`);
if (blocked > 0) {
  console.log(`E2E acceptance gate is honest: ${blocked}/10 scenarios remain BLOCKED_EXTERNAL; no false PASS recorded.`);
} else {
  console.log('E2E acceptance gate passed: all 10 scenarios have field results and evidence.');
}
