// How long saved reports are kept (docs/product.md). Every write that changes the owner, the share
// link or the versions sets expires_at from expiresAt().
export const ANONYMOUS_DAYS = 10;
export const ANONYMOUS_SHARED_DAYS = 30;
export const SIGNED_IN_DAYS = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionInput {
  userId: string | null;
  shareId: string | null;
  createdAt: Date;
  latestVersion: Date;
}

// Anonymous reports count from their creation, so creating a link never extends one past 30 days;
// signed-in reports count from their latest version, so a refresh or chat version restarts it.
export function expiresAt({ userId, shareId, createdAt, latestVersion }: RetentionInput): Date {
  if (userId) return new Date(latestVersion.getTime() + SIGNED_IN_DAYS * DAY_MS);
  const days = shareId ? ANONYMOUS_SHARED_DAYS : ANONYMOUS_DAYS;
  return new Date(createdAt.getTime() + days * DAY_MS);
}
