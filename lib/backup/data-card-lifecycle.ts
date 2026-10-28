export const DATA_CARD_CLOSE_GRACE_MS = 60_000;
export const DATA_CARD_SESSION_TTL_MS = 90_000;

export type DataCardSessionState = { lastSeenAt: Date; closedAt: Date | null; closeVerified?: boolean };

export function dataCardBackupEligibility(input: { savedAt: Date; sessions: DataCardSessionState[]; now?: Date; closeGraceMs?: number; sessionTtlMs?: number }) {
  const now = input.now ?? new Date(); const grace = input.closeGraceMs ?? DATA_CARD_CLOSE_GRACE_MS; const ttl = input.sessionTtlMs ?? DATA_CARD_SESSION_TTL_MS;
  const active = input.sessions.some((session) => !session.closedAt && now.getTime() - session.lastSeenAt.getTime() < ttl);
  const unverified = input.sessions.some((session) => session.closeVerified === false);
  const lastClose = input.sessions.reduce((latest, session) => {
    // A disappeared browser session is not considered closed at its last
    // heartbeat. It closes only when the server-side lease safely expires.
    const candidate = session.closedAt ?? new Date(session.lastSeenAt.getTime() + ttl);
    return candidate > latest ? candidate : latest;
  }, input.savedAt);
  const eligibleAt = new Date(Math.max(input.savedAt.getTime() + grace, lastClose.getTime() + grace));
  return { active, unverified, eligibleAt, eligible: !active && !unverified && now >= eligibleAt };
}

