import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const migrationDir = join(root, 'supabase/migrations');
const migrations = readdirSync(migrationDir).filter((x) => x.startsWith('20260928000043_'));
if (migrations.length !== 1 || migrations[0] !== '20260928000043_content_approval_gate.sql') {
  throw new Error(`Expected exactly one safe 043 migration, found: ${migrations.join(', ')}`);
}
const p41 = readFileSync(join(migrationDir, '20260928000041_question_bank_review_queue.sql'), 'utf8');
const p42 = readFileSync(join(migrationDir, '20260928000042_letter_bank_activation.sql'), 'utf8');
const p43 = readFileSync(join(migrationDir, migrations[0]), 'utf8');
const queue = JSON.parse(readFileSync(join(root, 'content/question-bank/wording-reviewed-queue.json'), 'utf8'));
const audited = queue.items.filter((x) => x.wordingAudit);

if (!p41.includes("false,'needs_review'")) throw new Error('041 must import inactive review rows');
if (!p42.includes('active = false') || !p42.includes("qa_status = 'needs_review'")) throw new Error('042 must keep imported rows inactive');
if (p42.includes("active = true,\n  qa_status = 'approved'") || p42.includes("active = true,\n    qa_status = 'approved'")) throw new Error('042 contains an activation path');
if (!p43.includes('challenge_content_approvals')) throw new Error('043 approval ledger missing');
if (!p43.includes('approve_challenge_content')) throw new Error('043 protected approval function missing');
if (!p43.includes('religious_review_required')) throw new Error('religious review gate missing');
if (!p43.includes('TO service_role')) throw new Error('approval function is not service-role-only');
if (!p43.includes('SET active = false') || !p43.includes('WHERE version = 41')) throw new Error('043 must enforce inactive version 41 invariant');
if (audited.length !== 968) throw new Error(`Expected 968 audited rows, got ${audited.length}`);
if (audited.some((x) => x.active !== false)) throw new Error('audited queue contains active content');
if (audited.some((x) => x.options?.length !== 4 || !Number.isInteger(x.correctIndex))) throw new Error('audited queue has invalid answer contract');
console.log(`Content release gate passed: ${audited.length} audited rows; no bulk activation; religion gate enforced; approval is service-role-only.`);
