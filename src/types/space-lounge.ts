export const SPACE_LOUNGE_ACTIONS = [
  'DANCE',
  'FLIP',
  'RUN',
  'CHAOS',
  'ZERO_GRAVITY',
] as const;

export type SpaceLoungeAction = (typeof SPACE_LOUNGE_ACTIONS)[number];
export type SpaceLoungeAppearance = 'masculine' | 'feminine';
export type SpaceLoungeConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface SpaceLoungeParticipant {
  participantId: string;
  displayName: string;
  x: number;
  y: number;
  appearance: SpaceLoungeAppearance;
  action?: SpaceLoungeAction;
  actionUntil?: number;
  supportCount?: number;
  isExiting?: boolean;
}

export interface SpaceLoungeGiftRule {
  giftId: string;
  action: SpaceLoungeAction;
  durationSeconds: number;
  target: 'sender' | 'group' | 'all';
}

export interface SpaceLoungeSnapshot {
  sessionId: string;
  title: string;
  status: 'waiting' | 'live' | 'ending' | 'ended';
  connection: SpaceLoungeConnectionState;
  startedAt: number | null;
  endsAt: number | null;
  joinKeyword: string;
  participants: SpaceLoungeParticipant[];
  topSupporters: Array<{ displayName: string; giftCount: number }>;
  sponsor: { name: string; message: string; nextMomentAt: number | null } | null;
}
