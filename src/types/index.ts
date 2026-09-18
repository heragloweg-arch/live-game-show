/**
 * Shared domain types for قدها — قدها
 * Server-authoritative models. Client never decides winner / score / correct answer.
 */

export type MatchMode = 'solo' | '1v1' | 'room' | 'host';

export type MatchStatus =
  | 'IDLE'
  | 'MATCHMAKING'
  | 'MATCH_FOUND'
  | 'VS'
  | 'ROUND_STARTING'
  | 'ROUND_ACTIVE'
  | 'ANSWER_SUBMITTED'
  | 'ROUND_RESULT'
  | 'NEXT_ROUND'
  | 'MATCH_FINISHED'
  | 'FINAL_RESULT'
  | 'CONNECTION_LOST'
  | 'RECONNECTING'
  | 'MATCH_TERMINATED';

export type ChallengeType = 'speed' | 'words' | 'knowledge' | 'mystery';

export type ChallengeSubtype =
  | 'letters'
  | 'movies'
  | 'countries'
  | 'people'
  | 'emoji'
  | 'autobus'
  | 'complete_sentence'
  | 'proverb'
  | 'wisdom'
  | 'related_words'
  | 'general'
  | 'geography'
  | 'history'
  | 'religion'
  | 'science'
  | 'sports'
  | 'art'
  | 'cooking';

export type Difficulty = 'easy' | 'normal' | 'hard';

export type AnswerOutcome = 'correct' | 'wrong' | 'timeout' | 'invalid';

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  xpToNextLevel: number;
  wins: number;
  losses: number;
  totalMatches: number;
  coins: number;
  onboardingDone?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Challenge {
  id: string;
  type: ChallengeType;
  subtype: ChallengeSubtype;
  prompt: string;
  difficulty: Difficulty;
  /** Client receives choices only for knowledge type. Correctness never sent. */
  choices?: { id: string; label: string }[];
  /** For speed/words: letter pool or hint structure. */
  letterPool?: string[];
  maxLength?: number;
  timeLimitMs: number;
  version: number;
}

export interface RoundState {
  roundId: string;
  matchId: string;
  roundNumber: number;
  challenge: Challenge;
  status: 'pending' | 'active' | 'finished';
  serverStartAt: string; // ISO
  serverEndAt: string;   // ISO
  sequence: number;
}

export interface AnswerSubmission {
  requestId: string; // idempotency key
  matchId: string;
  roundId: string;
  answer: string;
  clientTimestamp: string;
}

export interface AnswerResult {
  requestId: string;
  outcome: AnswerOutcome;
  points: number;
  bonus: number;
  serverValidatedAt: string;
  normalizedAnswer?: string;
}

export interface RoundResult {
  roundId: string;
  roundNumber: number;
  playerScore: number;
  opponentScore: number;
  playerOutcome: AnswerOutcome;
  opponentOutcome: AnswerOutcome;
  sequence: number;
}

export interface MatchParticipantView {
  userId?: string;
  username?: string;
  score?: number;
  side?: string;
  isAi?: boolean;
}

export interface MatchState {
  /** Some payloads use id; prefer matchId */
  id?: string;
  matchId: string;
  mode: MatchMode;
  status: MatchStatus;
  sequence: number;
  currentRound: number;
  totalRounds: number;
  player: {
    id: string;
    username: string;
    avatarUrl: string | null;
    score: number;
    side: 'player' | 'host' | 'team_a';
  };
  opponent?: {
    id: string;
    username: string;
    avatarUrl: string | null;
    score: number;
    side: 'opponent' | 'ai' | 'team_b';
    isAi: boolean;
  };
  /** Team modes */
  teamScoreA?: number;
  teamScoreB?: number;
  teamSize?: number;
  participants?: MatchParticipantView[];
  round: RoundState | null;
  lastAnswerResult: AnswerResult | null;
  lastRoundResult: RoundResult | null;
  winnerId: string | null;
  serverNow: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface MatchRewardsSummary {
  coinGain?: number;
  xpGain?: number;
  won?: boolean;
  draw?: boolean;
}

/** Delta payload from Smart Polling */
export interface MatchDelta {
  matchId: string;
  sequence: number;
  status?: MatchStatus;
  currentRound?: number;
  round?: Partial<RoundState> | null;
  playerScore?: number;
  opponentScore?: number;
  lastAnswerResult?: AnswerResult | null;
  lastRoundResult?: RoundResult | null;
  winnerId?: string | null;
  serverNow: string;
  deltaType: 'full' | 'partial';
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  level: number;
  wins: number;
  score: number;
}

export interface MatchHistoryItem {
  matchId: string;
  mode: MatchMode;
  result: 'win' | 'loss' | 'draw';
  playerScore: number;
  opponentScore: number;
  opponentName: string;
  playedAt: string;
}

export interface AppConfig {
  timers: {
    speedMs: number;
    wordsMs: number;
    knowledgeMs: number;
    mysteryMs: number;
  };
  scoring: {
    baseCorrect: number;
    speedBonusMax: number;
    difficultyMultiplier: Record<Difficulty, number>;
  };
  features: {
    hostEnabled: boolean;
    roomsEnabled: boolean;
    voiceEnabled: boolean;
    adsEnabled: boolean;
  };
  version: string;
}

export interface HostSession {
  roomId: string;
  hostId: string;
  title: string;
  status: 'waiting' | 'live' | 'ended';
  participantCount: number;
  maxParticipants: number;
  voiceToken?: string;
  createdAt: string;
}

export type ScreenId =
  | 'splash'
  | 'onboarding'
  | 'home'
  | 'play'
  | 'solo-difficulty'
  | 'matchmaking'
  | 'vs'
  | 'match'
  | 'round-result'
  | 'final-result'
  | 'host'
  | 'room'
  | 'profile'
  | 'leaderboard'
  | 'history'
  | 'error';
