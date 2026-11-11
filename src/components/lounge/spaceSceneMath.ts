import type { SpaceLoungeAction, SpaceLoungeParticipant } from '../../types/space-lounge';

export interface SpaceWorldPosition {
  x: number;
  z: number;
}

export interface SpaceAvatarPose {
  bounce: number;
  bodyRoll: number;
  armSwing: number;
  legSwing: number;
  floatHeight: number;
  spin: number;
  jitterX: number;
}

export function clampParticipantPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(88, Math.max(12, value));
}

export function participantToWorldPosition(participant: Pick<SpaceLoungeParticipant, 'x' | 'y'>): SpaceWorldPosition {
  const x = clampParticipantPercent(participant.x);
  const y = clampParticipantPercent(participant.y);
  return {
    x: ((x - 50) / 38) * 4.35,
    z: ((y - 50) / 38) * 6.3,
  };
}

export function getSpaceAvatarPose(
  action: SpaceLoungeAction | undefined,
  elapsedSeconds: number,
  seed = 0,
): SpaceAvatarPose {
  const t = Math.max(0, elapsedSeconds);
  const wave = Math.sin(t * 6.2 + seed);
  const gentle = Math.sin(t * 2.1 + seed * 0.3);

  switch (action) {
    case 'DANCE':
      return { bounce: Math.abs(wave) * 0.17, bodyRoll: wave * 0.22, armSwing: wave * 0.82, legSwing: wave * 0.42, floatHeight: 0, spin: 0, jitterX: 0 };
    case 'FLIP':
      return { bounce: Math.max(0, Math.sin(t * Math.PI * 1.2)) * 0.45, bodyRoll: 0, armSwing: 0.7, legSwing: 0.25, floatHeight: 0, spin: t * Math.PI * 2.2, jitterX: 0 };
    case 'RUN':
      return { bounce: Math.abs(wave) * 0.12, bodyRoll: 0.08, armSwing: wave * 0.9, legSwing: wave * 1.05, floatHeight: 0, spin: 0, jitterX: 0 };
    case 'CHAOS':
      return { bounce: Math.abs(wave) * 0.23, bodyRoll: wave * 0.48, armSwing: Math.cos(t * 9 + seed) * 1.15, legSwing: wave * 0.75, floatHeight: 0, spin: wave * 0.22, jitterX: Math.sin(t * 11 + seed) * 0.11 };
    case 'ZERO_GRAVITY':
      return { bounce: 0, bodyRoll: gentle * 0.12, armSwing: gentle * 0.34, legSwing: -gentle * 0.18, floatHeight: 0.38 + Math.sin(t * 1.5 + seed) * 0.25, spin: gentle * 0.12, jitterX: Math.sin(t * 1.3 + seed) * 0.1 };
    default:
      return { bounce: Math.abs(gentle) * 0.035, bodyRoll: gentle * 0.035, armSwing: gentle * 0.035, legSwing: 0, floatHeight: 0, spin: 0, jitterX: 0 };
  }
}
