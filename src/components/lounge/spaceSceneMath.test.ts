import { describe, expect, it } from 'vitest';
import { getSpaceAvatarPose, participantToWorldPosition, clampParticipantPercent } from './spaceSceneMath';

describe('space scene math', () => {
  it('bounds malformed participant percentages and maps them into the walkable 3D floor', () => {
    expect(clampParticipantPercent(Number.NaN)).toBe(50);
    expect(clampParticipantPercent(120)).toBe(88);
    expect(clampParticipantPercent(-10)).toBe(12);
    expect(participantToWorldPosition({ x: 50, y: 50 })).toEqual({ x: 0, z: 0 });
    expect(participantToWorldPosition({ x: 120, y: -10 })).toEqual({ x: 4.35, z: -6.3 });
  });

  it('returns deterministic finite poses for each supported action', () => {
    const actions = ['DANCE', 'FLIP', 'RUN', 'CHAOS', 'ZERO_GRAVITY'] as const;
    for (const action of actions) {
      const pose = getSpaceAvatarPose(action, 1.25, 2);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      expect(pose).toEqual(getSpaceAvatarPose(action, 1.25, 2));
    }
    expect(getSpaceAvatarPose('ZERO_GRAVITY', 1, 0).floatHeight).toBeGreaterThan(0);
    expect(getSpaceAvatarPose('FLIP', 1, 0).spin).toBeGreaterThan(0);
  });

  it('uses a gentle idle pose when no action is active', () => {
    const pose = getSpaceAvatarPose(undefined, 0.5);
    expect(pose.floatHeight).toBe(0);
    expect(Math.abs(pose.bodyRoll)).toBeLessThan(0.1);
  });
});
