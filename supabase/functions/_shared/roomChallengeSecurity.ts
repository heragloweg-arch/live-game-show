export interface RoomAnswerContext {
  roomId: string;
  roundId: string;
  userId: string;
}

export interface StoredRoomAnswer extends RoomAnswerContext {
  outcome: string;
  points: number;
  bonus: number;
}

export interface AcceptedAnswerRow {
  accepted_answer?: string | null;
}

export function isRoomMember(
  userId: string,
  hostId: string,
  participantUserId: string | null | undefined,
): boolean {
  return userId === hostId || userId === participantUserId;
}

export function answerContextMatches(
  stored: RoomAnswerContext,
  requested: RoomAnswerContext,
): boolean {
  return (
    stored.roomId === requested.roomId &&
    stored.roundId === requested.roundId &&
    stored.userId === requested.userId
  );
}

export function acceptedAnswersAfterReveal(
  roundStatus: string,
  rows: AcceptedAnswerRow[],
): string[] {
  if (roundStatus !== 'revealed') return [];

  const unique = new Set<string>();
  for (const row of rows) {
    const answer = row.accepted_answer?.trim();
    if (answer) unique.add(answer);
  }
  return [...unique];
}
