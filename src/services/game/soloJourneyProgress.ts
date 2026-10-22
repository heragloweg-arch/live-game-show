const BRANCH_COUNT = 6;
const LEAVES_PER_BRANCH = 8;

type JourneyProgress = Record<string, true>;

function storageKey(userId: string) {
  return `qaddaha:solo-journey:${userId}`;
}

function read(userId: string): JourneyProgress {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed as JourneyProgress : {};
  } catch {
    return {};
  }
}

function key(branch: number, leaf: number) {
  return `${branch}-${leaf}`;
}

export function getSoloJourney(userId: string) {
  const completed = read(userId);
  const leaves = Array.from({ length: BRANCH_COUNT * LEAVES_PER_BRANCH }, (_, index) => {
    const branch = Math.floor(index / LEAVES_PER_BRANCH) + 1;
    const leaf = (index % LEAVES_PER_BRANCH) + 1;
    const id = key(branch, leaf);
    return { branch, leaf, id, completed: completed[id] === true, unlocked: index === 0 || completed[key(Math.floor((index - 1) / LEAVES_PER_BRANCH) + 1, ((index - 1) % LEAVES_PER_BRANCH) + 1)] === true };
  });
  return { completed, leaves };
}

export function completeSoloLeaf(userId: string, branch: number, leaf: number) {
  const completed = read(userId);
  completed[key(branch, leaf)] = true;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(completed));
  } catch {
    // Progress remains best-effort on devices that disable local storage.
  }
}
