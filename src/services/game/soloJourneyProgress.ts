export const BRANCH_COUNT = 6;
export const LEAVES_PER_BRANCH = 8;

export interface SoloProgressRow {
  branch_number: number;
  leaf_number: number;
  completed_at?: string;
}

function key(branch: number, leaf: number) {
  return `${branch}-${leaf}`;
}

/**
 * Presentation-only projection of server-owned progress.
 * It deliberately has no device-storage fallback: unlock authority stays in match.
 */
export function getSoloJourney(progress: SoloProgressRow[] = []) {
  const completed = new Set(
    progress.map((row) => key(row.branch_number, row.leaf_number)),
  );
  const leaves = Array.from({ length: BRANCH_COUNT * LEAVES_PER_BRANCH }, (_, index) => {
    const branch = Math.floor(index / LEAVES_PER_BRANCH) + 1;
    const leaf = (index % LEAVES_PER_BRANCH) + 1;
    const id = key(branch, leaf);
    const previousIndex = index - 1;
    const unlocked = index === 0
      || completed.has(key(
        Math.floor(previousIndex / LEAVES_PER_BRANCH) + 1,
        (previousIndex % LEAVES_PER_BRANCH) + 1,
      ));
    return { branch, leaf, id, completed: completed.has(id), unlocked };
  });
  return { completed, leaves };
}
