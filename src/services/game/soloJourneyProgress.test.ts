import { describe, expect, it } from 'vitest';
import { getSoloJourney } from './soloJourneyProgress';

describe('server-owned solo journey tree projection', () => {
  it('opens only the first leaf for a new player', () => {
    const journey = getSoloJourney();
    expect(journey.leaves[0]).toMatchObject({ branch: 1, leaf: 1, unlocked: true, completed: false });
    expect(journey.leaves[1].unlocked).toBe(false);
    expect(journey.leaves[8].unlocked).toBe(false);
  });

  it('opens exactly the next leaf after server completion and crosses branches', () => {
    const journey = getSoloJourney([
      { branch_number: 1, leaf_number: 1 },
      { branch_number: 1, leaf_number: 8 },
    ]);
    expect(journey.leaves.find((leaf) => leaf.branch === 1 && leaf.leaf === 2)?.unlocked).toBe(true);
    expect(journey.leaves.find((leaf) => leaf.branch === 2 && leaf.leaf === 1)?.unlocked).toBe(true);
    expect(getSoloJourney([{ branch_number: 1, leaf_number: 2 }]).leaves[0].completed).toBe(false);
  });
});
