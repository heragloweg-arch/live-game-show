import { Component, Suspense, lazy, useState, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import type { SpaceLoungeAction, SpaceLoungeParticipant } from '../../types/space-lounge';
import { clampParticipantPercent } from './spaceSceneMath';

interface SpaceSceneProps {
  participants: SpaceLoungeParticipant[];
  emptyLabel?: string;
  sponsorLabel?: string;
}

interface ThreeSceneProps {
  participants: SpaceLoungeParticipant[];
  sponsorLabel?: string;
  onFallback: () => void;
}

const ThreeSpaceScene = lazy(() => import('./ThreeSpaceScene'));

const actionLabels: Record<SpaceLoungeAction, string> = {
  DANCE: 'رقص',
  FLIP: 'شقلبة',
  RUN: 'جري',
  CHAOS: 'فوضى',
  ZERO_GRAVITY: 'انعدام الجاذبية',
};

function Astronaut({ appearance, color }: { appearance: SpaceLoungeParticipant['appearance']; color: string }) {
  return (
    <svg className="space-fallback-astronaut" viewBox="0 0 72 104" aria-hidden="true" focusable="false">
      <ellipse cx="36" cy="98" rx="23" ry="5" fill="rgba(2,8,20,.48)" />
      <rect x="12" y="44" width="48" height="42" rx="18" fill={color} stroke="#f4f7f6" strokeWidth="2" />
      <rect x="17" y="17" width="38" height="38" rx="17" fill="#edf6f7" stroke={appearance === 'feminine' ? '#ed9dc6' : '#78ddd4'} strokeWidth="3" />
      <ellipse cx="36" cy="36" rx="13" ry="12" fill="#173246" stroke="#76e5dc" strokeOpacity=".62" strokeWidth="2" />
      <path d="M27 40c5 4 13 4 18 0" fill="none" stroke="#d8f7f1" strokeWidth="2" strokeLinecap="round" />
      <rect x="24" y="57" width="24" height="17" rx="5" fill="#14293c" stroke="rgba(255,255,255,.55)" />
      <circle cx="36" cy="65" r="3" fill="#ffd06b" />
      <path d="M14 54 5 68l7 4 9-11m37-7 9 14-7 4-9-11" fill="none" stroke="#edf6f7" strokeWidth="7" strokeLinecap="round" />
      <path d="m27 82-3 11m21-11 3 11" stroke="#edf6f7" strokeWidth="8" strokeLinecap="round" />
      <path d="m22 94-5 1m34-1 5 1" stroke="#ffd06b" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function FallbackCharacter({ participant }: { participant: SpaceLoungeParticipant }) {
  const action = participant.action && (!participant.actionUntil || participant.actionUntil > Date.now());
  const style: CSSProperties = {
    left: `${clampParticipantPercent(participant.x)}%`,
    top: `${clampParticipantPercent(participant.y)}%`,
  };
  const actionClass = action ? `space-action-${participant.action!.toLowerCase().replaceAll('_', '-')}` : '';
  const suitColor = participant.appearance === 'feminine' ? '#9776d7' : '#46b9b2';

  return (
    <div
      className={`space-fallback-character ${participant.isExiting ? 'space-fallback-character-exiting' : ''}`}
      style={style}
      role="img"
      aria-label={`شخصية ${participant.displayName}${action ? `، ${actionLabels[participant.action!]}` : ''}`}
      data-participant={participant.participantId}
    >
      <span className={`space-fallback-figure ${actionClass}`}>
        <Astronaut appearance={participant.appearance} color={suitColor} />
      </span>
      <span className="space-character-name" title={participant.displayName}>{participant.displayName.slice(0, 32)}</span>
    </div>
  );
}

export function SpaceSceneFallback({ participants, emptyLabel, sponsorLabel }: SpaceSceneProps) {
  return (
    <section className="space-scene space-scene-fallback" aria-label="معاينة احتياطية لساحة استراحة الفضاء">
      <div className="space-fallback-stars" aria-hidden="true" />
      <div className="space-fallback-orbit" aria-hidden="true" />
      <div className="space-fallback-horizon" aria-hidden="true" />
      <header className="space-fallback-hud">
        <span><i /> مشهد احتياطي</span>
        <strong>{sponsorLabel || 'استراحة الفضاء'}</strong>
        <small>{participants.length} مشارك</small>
      </header>
      <div className="space-fallback-portal entry" aria-hidden="true"><span /><b>بوابة الدخول</b></div>
      <div className="space-fallback-portal exit" aria-hidden="true"><span /><b>باب الخروج</b></div>
      <div className="space-fallback-floor" aria-hidden="true"><i /><i /><i /></div>
      <div className="space-fallback-seats" aria-hidden="true"><i /><i /><i /></div>
      {participants.map((participant) => <FallbackCharacter key={participant.participantId} participant={participant} />)}
      {participants.length === 0 ? <p className="space-scene-empty">{emptyLabel || 'تستعد الساحة لاستقبال روّادها'}</p> : null}
    </section>
  );
}

class SpaceSceneErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The fallback is intentionally isolated to the lounge scene.
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ThreeSceneSlot({ participants, sponsorLabel, onFallback }: ThreeSceneProps) {
  return (
    <Suspense fallback={<SpaceSceneFallback participants={participants} sponsorLabel={sponsorLabel} />}>
      <ThreeSpaceScene participants={participants} sponsorLabel={sponsorLabel} onFallback={onFallback} />
    </Suspense>
  );
}

export function SpaceScene({ participants, emptyLabel, sponsorLabel }: SpaceSceneProps) {
  const [failed, setFailed] = useState(false);
  const fallback = <SpaceSceneFallback participants={participants} emptyLabel={emptyLabel} sponsorLabel={sponsorLabel} />;

  if (failed) return fallback;

  return (
    <SpaceSceneErrorBoundary fallback={fallback}>
      <ThreeSceneSlot participants={participants} sponsorLabel={sponsorLabel} onFallback={() => setFailed(true)} />
    </SpaceSceneErrorBoundary>
  );
}
