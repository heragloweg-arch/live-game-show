#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/approve-content-batch.mjs <approval-manifest.json>');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const manifest = JSON.parse(readFileSync(file, 'utf8'));
if (!['staging', 'internal', 'soft_launch', 'production'].includes(manifest.cohort)) throw new Error('Invalid cohort');
if (!Array.isArray(manifest.items) || manifest.items.length === 0) throw new Error('Manifest has no items');
if (manifest.cohort === 'production') throw new Error('Direct production approval is forbidden; use internal then soft_launch');
const client = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
let approved = 0;
for (const item of manifest.items) {
  if (!item.challengeId || !item.reviewerId) throw new Error('Each item needs challengeId and reviewerId');
  if (!item.factualReviewed || !item.wordingReviewed) throw new Error(`Review flags incomplete: ${item.challengeId}`);
  if (item.subtype === 'religion' && !item.religiousReviewed) throw new Error(`Religious review missing: ${item.challengeId}`);
  const { data, error } = await client.rpc('approve_challenge_content', {
    p_challenge_id: item.challengeId,
    p_reviewer_id: item.reviewerId,
    p_cohort: manifest.cohort,
    p_factual_reviewed: item.factualReviewed,
    p_wording_reviewed: item.wordingReviewed,
    p_religious_reviewed: Boolean(item.religiousReviewed),
    p_reviewer_note: item.reviewerNote || manifest.note || null,
  });
  if (error) throw new Error(`${item.challengeId}: ${error.message}`);
  if (data !== true) throw new Error(`${item.challengeId}: approval RPC returned false`);
  approved++;
  console.log(`approved ${approved}/${manifest.items.length}: ${item.challengeId}`);
}
console.log(`Approval batch complete: ${approved} items in cohort=${manifest.cohort}`);
