import { Buffer } from "node:buffer";

const DEFAULT_EMAIL_TASK_DOMAIN = "inbox.knowledgevault.local";

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

export function getTaskInboxDomain(): string {
  const fromEnv = process.env.EMAIL_TASK_DOMAIN;
  if (!fromEnv || !fromEnv.trim()) {
    return DEFAULT_EMAIL_TASK_DOMAIN;
  }
  return normalizeDomain(fromEnv);
}

export function buildTaskInboxAddressForUser(userId: string): string {
  const encodedId = Buffer.from(userId, "utf8").toString("base64url");
  return `task+${encodedId}@${getTaskInboxDomain()}`;
}

export function resolveUserIdFromTaskInboxAddress(address: string): string | null {
  const trimmed = address.trim().toLowerCase();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0) return null;

  const localPart = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (domain !== getTaskInboxDomain()) return null;
  if (!localPart.startsWith("task+")) return null;

  const encodedId = localPart.slice(5);
  if (!encodedId) return null;
  try {
    return Buffer.from(encodedId, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
