import { describe, expect, it } from 'vitest';
import {
  acceptedAnswersAfterReveal,
  answerContextMatches,
  isRoomMember,
} from '../../../supabase/functions/_shared/roomChallengeSecurity.ts';

describe('room challenge security contract', () => {
  it('allows only the room host or a registered participant', () => {
    expect(isRoomMember('host-1', 'host-1', null)).toBe(true);
    expect(isRoomMember('player-1', 'host-1', 'player-1')).toBe(true);
    expect(isRoomMember('outsider', 'host-1', 'player-1')).toBe(false);
  });

  it('replays an answer only for the same user, room, and round', () => {
    const requested = { roomId: 'room-a', roundId: 'round-1', userId: 'player-1' };
    expect(answerContextMatches(requested, requested)).toBe(true);
    expect(answerContextMatches(requested, { ...requested, userId: 'player-2' })).toBe(false);
    expect(answerContextMatches(requested, { ...requested, roomId: 'room-b' })).toBe(false);
    expect(answerContextMatches(requested, { ...requested, roundId: 'round-2' })).toBe(false);
  });

  it('keeps accepted answers hidden until the round has been revealed', () => {
    const rows = [
      { accepted_answer: ' القاهرة ' },
      { accepted_answer: 'القاهرة' },
      { accepted_answer: '' },
      { accepted_answer: null },
    ];
    expect(acceptedAnswersAfterReveal('active', rows)).toEqual([]);
    expect(acceptedAnswersAfterReveal('revealed', rows)).toEqual(['القاهرة']);
  });
});
