function objectOrEmpty(value) {
  return value && typeof value === 'object' ? value : {};
}

function safeString(value, maxLength = 160) {
  if (typeof value === 'string') return value.slice(0, maxLength);
  if (typeof value === 'number' || typeof value === 'bigint') return String(value).slice(0, maxLength);
  return '';
}

function userFrom(data) {
  return objectOrEmpty(objectOrEmpty(data).user);
}

export function normalizeActor(data) {
  const user = userFrom(data);
  const userId = safeString(user.id ?? user.userId ?? user.uniqueId, 160);
  if (!userId) return null;
  const displayName = safeString(user.nickname ?? user.uniqueId ?? 'ضيف', 96).replace(/[\u0000-\u001f\u007f<>\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim() || 'ضيف';
  return { userId, displayName };
}

export function normalizeChatEvent(data) {
  const actor = normalizeActor(data);
  if (!actor) return null;
  const comment = safeString(objectOrEmpty(data).comment, 512).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!comment) return null;
  return { ...actor, comment };
}

export function normalizeMemberEvent(data) {
  return normalizeActor(data);
}

export function normalizeGiftEvent(data) {
  const actor = normalizeActor(data);
  if (!actor) return null;
  const gift = objectOrEmpty(data);
  const details = objectOrEmpty(gift.giftDetails);
  const giftId = safeString(gift.giftId, 80);
  if (!giftId) return null;
  const repeatCount = Math.max(1, Math.min(10000, Number(gift.repeatCount) || 1));
  const giftType = Number(details.giftType ?? gift.giftType) || 0;
  const common = objectOrEmpty(gift.common);
  const eventId = safeString(common.msgId ?? common.eventId ?? gift.msgId, 180);
  if (!eventId) return null;
  return {
    ...actor,
    giftId,
    repeatCount,
    giftType,
    repeatEnd: gift.repeatEnd === true,
    eventId,
  };
}
