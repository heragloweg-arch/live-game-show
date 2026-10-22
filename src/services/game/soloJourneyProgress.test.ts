import { describe, expect, it, beforeEach } from 'vitest';
import { completeSoloLeaf, getSoloJourney } from './soloJourneyProgress';

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
};

describe('solo journey tree progress', () => {
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageMock });
  });

  it('opens only the first leaf for a new player', () => {
    const journey = getSoloJourney('user-1');
    expect(journey.leaves[0]).toMatchObject({ branch: 1, leaf: 1, unlocked: true, completed: false });
    expect(journey.leaves[1].unlocked).toBe(false);
    expect(journey.leaves[8].unlocked).toBe(false);
  });

  it('opens exactly the next leaf after completion and crosses branches', () => {
    completeSoloLeaf('user-1', 1, 1);
    completeSoloLeaf('user-1', 1, 8);
    const journey = getSoloJourney('user-1');
    expect(journey.leaves.find((leaf) => leaf.branch === 1 && leaf.leaf === 2)?.unlocked).toBe(true);
    expect(journey.leaves.find((leaf) => leaf.branch === 2 && leaf.leaf === 1)?.unlocked).toBe(true);
    completeSoloLeaf('user-1', 1, 2);
    expect(getSoloJourney('user-1').leaves.find((leaf) => leaf.branch === 1 && leaf.leaf === 3)?.unlocked).toBe(true);
  });
});
