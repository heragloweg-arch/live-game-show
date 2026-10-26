#!/usr/bin/env node

const tiers = ['easy', 'normal', 'hard'];

function planForStage(stageIndex) {
  const baseTier = stageIndex <= 16 ? 0 : stageIndex <= 40 ? 1 : 2;
  return [0, 1, 2, 3, 4].map((round) => tiers[Math.min(2, baseTier + Math.floor(round / 2))]);
}

const expected = new Map([
  [1, ['easy', 'easy', 'normal', 'normal', 'hard']],
  [16, ['easy', 'easy', 'normal', 'normal', 'hard']],
  [17, ['normal', 'normal', 'hard', 'hard', 'hard']],
  [40, ['normal', 'normal', 'hard', 'hard', 'hard']],
  [41, ['hard', 'hard', 'hard', 'hard', 'hard']],
  [48, ['hard', 'hard', 'hard', 'hard', 'hard']],
]);

for (const [stage, wanted] of expected) {
  const actual = planForStage(stage);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`Stage ${stage} mismatch: ${actual.join(',')} != ${wanted.join(',')}`);
  }
}

for (let stage = 1; stage <= 48; stage += 1) {
  const plan = planForStage(stage);
  if (plan.length !== 5 || plan.some((tier) => !tiers.includes(tier))) {
    throw new Error(`Invalid five-round plan at stage ${stage}`);
  }
  const indexes = plan.map((tier) => tiers.indexOf(tier));
  if (indexes.some((value, index) => index > 0 && value < indexes[index - 1])) {
    throw new Error(`Difficulty regressed at stage ${stage}`);
  }
}

console.log('Solo progression gate passed: 48 stages, five server-planned rounds, no difficulty regression.');
