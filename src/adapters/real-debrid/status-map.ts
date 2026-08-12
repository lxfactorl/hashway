// src/adapters/real-debrid/status-map.ts
import { accepted, alreadyActive, failed, type Outcome } from "@domain/error-taxonomy";

function authFor(code: number | undefined): Outcome | null {
  if (code === 8) return failed("provider_auth", "Invalid Real-Debrid token");
  return null;
}

export function mapAddMagnetResult(status: number, errorCode: number | undefined): Outcome {
  if (errorCode === 33) return alreadyActive("Already active in Real-Debrid");
  const auth = authFor(errorCode);
  if (auth) return auth;
  if (status === 201) return accepted({ id: "" });
  if (status === 401) return failed("provider_auth", "Invalid Real-Debrid token");
  if (status === 403) return failed("provider_permanent", "Forbidden (non-premium?)");
  if (status === 400) return failed("provider_permanent", "Bad request");
  if (status === 429 || errorCode === 34) return failed("provider_transient", "Rate limited");
  if (status === 503 || errorCode === 25) return failed("provider_transient", "RD unavailable");
  if (status >= 500) return failed("provider_transient", `RD error ${String(status)}`);
  if (status >= 400) return failed("provider_permanent", `RD error ${String(status)}`);
  return failed("internal", `Unexpected status ${String(status)}`);
}

export function mapSelectFilesResult(status: number, errorCode: number | undefined): Outcome {
  if (errorCode === 31) return accepted({ id: "" });
  if (status === 202 || status === 204) return accepted({ id: "" });
  const auth = authFor(errorCode);
  if (auth) return auth;
  if (status === 401) return failed("provider_auth", "Invalid Real-Debrid token");
  if (status === 403 || status === 400)
    return failed("provider_permanent", `RD error ${String(status)}`);
  if (status === 429 || errorCode === 34) return failed("provider_transient", "Rate limited");
  if (status === 503 || errorCode === 25) return failed("provider_transient", "RD unavailable");
  if (status >= 500) return failed("provider_transient", `RD error ${String(status)}`);
  if (status >= 400) return failed("provider_permanent", `RD error ${String(status)}`);
  return failed("internal", `Unexpected status ${String(status)}`);
}

export function mapValidateTokenResult(status: number): Outcome {
  if (status === 200) return accepted({ id: "" });
  if (status === 401) return failed("provider_auth", "Invalid Real-Debrid token");
  if (status >= 500) return failed("provider_transient", "RD unavailable");
  return failed("provider_permanent", `RD error ${String(status)}`);
}

export function isAmbiguousNetwork(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}
