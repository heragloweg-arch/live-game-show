#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const input = resolve(process.argv[2] || 'content/question-bank/source/bank.zip');
const outputDir = resolve(process.argv[3] || 'content/question-bank');
if (!existsSync(input)) throw new Error(`Question bank not found: ${input}`);
mkdirSync(outputDir, { recursive: true });

function readSources() {
  if (input.endsWith('.zip')) {
    const listing = execFileSync('unzip', ['-Z1', input], { encoding: 'utf8' });
    return listing.split('\n').filter((x) => /^questions\/.*\.json$/.test(x)).map((name) => ({
      name: basename(name),
      text: execFileSync('unzip', ['-p', input, name], { encoding: 'utf8' }),
    }));
  }
  throw new Error('Only .zip input is supported; keep the source bank immutable.');
}

const normalize = (value) => String(value ?? '')
  .normalize('NFKC').trim().toLocaleLowerCase('ar')
  .replace(/[ًٌٍَُِّْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي')
  .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/[\s\u200c]+/g, ' ');
const sql = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const difficulty = (value) => ({ 'سهل': 'easy', 'متوسط': 'normal', 'صعب': 'hard', easy: 'easy', normal: 'normal', hard: 'hard' }[String(value)] || 'normal');
const subtype = (category) => {
  const c = String(category || '');
  if (/دين|قرآن|سيرة|صحابة|أنبياء/.test(c)) return 'religion';
  if (/جغرافيا/.test(c)) return 'geography';
  if (/تاريخ/.test(c)) return 'history';
  if (/علوم/.test(c)) return 'science';
  if (/رياضة/.test(c)) return 'sports';
  if (/سينما|فيلم/.test(c)) return 'movies';
  if (/طبخ|أكل/.test(c)) return 'cooking';
  if (/فن/.test(c)) return 'art';
  if (/سرعة/.test(c)) return 'general';
  return 'general';
};
const typeFor = (row) => String(row.category || '').includes('سرعة') ? 'speed' : 'knowledge';
const stableId = (key) => crypto.createHash('md5').update(`qaddaha-bank:${key}`).digest('hex');

const sources = readSources();
const wordingAuditPath = resolve(outputDir, 'wording-reviewed-queue.json');
const reviewedPrompts = existsSync(wordingAuditPath)
  ? new Map(JSON.parse(readFileSync(wordingAuditPath, 'utf8')).items.map((x) => [x.sourceKey, x.reviewedPrompt]))
  : new Map();
const all = [];
const seen = new Map();
const stats = { files: sources.length, total: 0, eligible: 0, needs_review: 0, rejected: 0, duplicate: 0, byFile: {}, byCategory: {} };
for (const source of sources) {
  let parsed;
  try { parsed = JSON.parse(source.text); } catch { parsed = []; }
  const rows = Array.isArray(parsed) ? parsed : [];
  stats.byFile[source.name] = { total: rows.length, eligible: 0, needs_review: 0, rejected: 0 };
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index] || {};
    stats.total++;
    const question = String(row.question || '').trim();
    const key = normalize(question);
    const options = Array.isArray(row.options) ? row.options.map((x) => String(x ?? '').trim()) : [];
    const correctIndex = Number.isInteger(row.correctIndex) ? row.correctIndex : null;
    const reasons = [];
    if (!question || question.length < 8) reasons.push('question_missing_or_too_short');
    if (seen.has(key) && key) reasons.push(`duplicate_prompt:${seen.get(key)}`);
    if (options.length === 0 || correctIndex === null) reasons.push('missing_closed_answer');
    if (options.length !== 4 && options.length > 0) reasons.push('options_count_not_four');
    if (options.some((x) => !x)) reasons.push('empty_option');
    const optionKeys = options.map(normalize);
    if (new Set(optionKeys).size !== optionKeys.length) reasons.push('duplicate_options');
    if (correctIndex !== null && (correctIndex < 0 || correctIndex >= options.length)) reasons.push('correct_index_out_of_range');
    const hasClosedAnswer = options.length === 4 && correctIndex !== null && reasons.every((r) => ![
      'missing_closed_answer', 'options_count_not_four', 'empty_option', 'duplicate_options', 'correct_index_out_of_range'
    ].includes(r));
    const status = hasClosedAnswer && reasons.length === 0 ? 'needs_review_structurally_eligible' : 'needs_review';
    const item = {
      source: source.name,
      sourceIndex: index,
      sourceKey: `${source.name}:${index}`,
      id: stableId(`${source.name}:${index}`),
      category: String(row.category || 'معلومات عامة'),
      type: typeFor(row),
      subtype: subtype(row.category),
      difficulty: difficulty(row.difficulty),
      prompt: reviewedPrompts.get(`${source.name}:${index}`) || question,
      options,
      correctIndex,
      explanation: String(row.explanation || '').trim(),
      qaStatus: status,
      active: false,
      reasons,
    };
    all.push(item);
    stats.byCategory[item.category] = (stats.byCategory[item.category] || 0) + 1;
    if (seen.has(key) && key) stats.duplicate++;
    else if (hasClosedAnswer && reasons.length === 0) { stats.eligible++; stats.byFile[source.name].eligible++; }
    else if (reasons.length) { stats.needs_review++; stats.byFile[source.name].needs_review++; }
    if (reasons.some((r) => /missing|out_of_range|empty|duplicate_options|options_count/.test(r))) { stats.rejected++; stats.byFile[source.name].rejected++; }
    if (key && !seen.has(key)) seen.set(key, `${source.name}:${index}`);
  }
}

const migration = [];
migration.push('-- Qaddaha question bank import: inactive review queue only.');
migration.push('-- No row from this bank is production-approved by this migration. Human QA must promote qa_status and active.');
migration.push('BEGIN;');
for (const item of all.filter((x) => x.qaStatus === 'needs_review_structurally_eligible')) {
  const challengeId = `${item.id.slice(0, 8)}-${item.id.slice(8, 12)}-${item.id.slice(12, 16)}-${item.id.slice(16, 20)}-${item.id.slice(20)}`;
  migration.push(`INSERT INTO public.challenges (id,type,subtype,prompt,difficulty,time_limit_ms,version,active,qa_status,weight) SELECT '${challengeId}'::uuid,${sql(item.type)}::challenge_type,${sql(item.subtype)}::challenge_subtype,${sql(item.prompt)},${sql(item.difficulty)}::difficulty_level,15000,41,false,'needs_review',1 WHERE NOT EXISTS (SELECT 1 FROM public.challenges WHERE id='${challengeId}'::uuid OR prompt=${sql(item.prompt)});`);
  item.options.forEach((label, i) => {
    migration.push(`INSERT INTO public.challenge_choices (challenge_id,choice_id,label,is_correct) SELECT '${challengeId}'::uuid,${sql(`bank_${i}`)},${sql(label)},${i === item.correctIndex} WHERE EXISTS (SELECT 1 FROM public.challenges WHERE id='${challengeId}'::uuid) AND NOT EXISTS (SELECT 1 FROM public.challenge_choices WHERE challenge_id='${challengeId}'::uuid AND choice_id=${sql(`bank_${i}`)});`);
  });
}
migration.push('COMMIT;');

writeFileSync(resolve(outputDir, 'review-queue.json'), JSON.stringify(all, null, 2));
writeFileSync(resolve(outputDir, 'import-report.json'), JSON.stringify(stats, null, 2));
writeFileSync(resolve(outputDir, '20260928000041_question_bank_review_queue.sql'), migration.join('\n') + '\n');
console.log(JSON.stringify({ input, outputDir, stats, migrationRows: all.filter((x) => x.qaStatus === 'needs_review_structurally_eligible').length }, null, 2));
