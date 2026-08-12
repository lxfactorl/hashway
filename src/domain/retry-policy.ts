// src/domain/retry-policy.ts
import type { ErrorKind } from "@domain/error-taxonomy";

export type RetryableOp = "selectFiles" | "validateToken" | "addMagnet";

export function classifyHttp(status: number, errorCodes: number[] | undefined): ErrorKind {
  void errorCodes;
  if (status === 401) return "provider_auth";
  if (status === 429 || status === 503) return "provider_transient";
  if (status >= 500) return "provider_transient";
  if (status >= 400) return "provider_permanent";
  return "internal";
}

export function canRetry(op: RetryableOp, kind: ErrorKind): boolean {
  if (op === "addMagnet") return false; // never retry addMagnet
  return kind === "provider_transient";
}

export function backoffMs(attempt: number, retryAfterMs: number | undefined): number {
  const exp = Math.min(1000 * 2 ** attempt, 8000);
  return Math.min(retryAfterMs ?? exp, 30000);
}
