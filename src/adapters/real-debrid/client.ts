// src/adapters/real-debrid/client.ts
import { accepted, failed, unknown } from "@domain/error-taxonomy";
import type { ProviderPort } from "@ports/provider";
import {
  isAmbiguousNetwork,
  mapAddMagnetResult,
  mapSelectFilesResult,
  mapValidateTokenResult,
} from "@adapters/real-debrid/status-map";

export interface RdClientDeps {
  readonly fetchFn: typeof fetch;
  readonly getToken: () => Promise<string | undefined>;
  readonly baseUrl?: string;
}

const DEFAULT_BASE = "https://api.real-debrid.com/rest/1.0";
const RD_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const INVALID_ADD_ID_MESSAGE = "addMagnet response missing or invalid torrent id";
const INVALID_SELECT_ID_MESSAGE = "Invalid torrent id";

type RdResult =
  | { readonly kind: "ok"; readonly status: number; readonly body: unknown }
  | { readonly kind: "error"; readonly cause: unknown };

function parseErrorCode(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  if (!("error_code" in body)) return undefined;
  const code: unknown = body.error_code;
  return typeof code === "number" ? code : undefined;
}

function extractId(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  if (!("id" in body)) return "";
  const raw: unknown = body.id;
  if (raw === null) return "";
  if (typeof raw === "string" && RD_ID_PATTERN.test(raw)) return raw;
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0) return String(raw);
  return "";
}

function parseBody(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

async function doFetch(
  deps: RdClientDeps,
  method: string,
  path: string,
  body: URLSearchParams | undefined,
  token: string,
  deadline: number,
): Promise<RdResult> {
  const url = `${deps.baseUrl ?? DEFAULT_BASE}${path}`;
  const remaining = Math.max(0, deadline - Date.now());
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort();
  }, remaining || 1);
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}` },
    signal: ctrl.signal,
  };
  if (body) init.body = body;
  try {
    const res = await deps.fetchFn(url, init);
    const textBody = await res.text();
    return { kind: "ok", status: res.status, body: textBody ? parseBody(textBody) : undefined };
  } catch (cause) {
    return { kind: "error", cause };
  } finally {
    clearTimeout(timer);
  }
}

export function createRealDebridClient(deps: RdClientDeps): ProviderPort {
  return {
    async addMagnet(req, deadline) {
      const token = await deps.getToken();
      if (!token) return failed("configuration", "Real-Debrid token is not configured");
      const r = await doFetch(
        deps,
        "POST",
        "/torrents/addMagnet",
        new URLSearchParams({ magnet: req.magnet }),
        token,
        deadline,
      );
      if (r.kind === "error") {
        return isAmbiguousNetwork(r.cause)
          ? unknown("addMagnet network ambiguous — check your Real-Debrid account")
          : failed("provider_transient", "network error");
      }
      const outcome = mapAddMagnetResult(r.status, parseErrorCode(r.body));
      if (outcome.kind !== "accepted") return outcome;
      const id = extractId(r.body);
      return id ? accepted({ id }) : unknown(INVALID_ADD_ID_MESSAGE);
    },
    async selectFiles(req, deadline) {
      if (!RD_ID_PATTERN.test(req.id)) return failed("internal", INVALID_SELECT_ID_MESSAGE);
      const token = await deps.getToken();
      if (!token) return failed("configuration", "Real-Debrid token is not configured");
      const r = await doFetch(
        deps,
        "POST",
        `/torrents/selectFiles/${encodeURIComponent(req.id)}`,
        new URLSearchParams({ files: req.files }),
        token,
        deadline,
      );
      if (r.kind === "error") return failed("provider_transient", "network error");
      return mapSelectFilesResult(r.status, parseErrorCode(r.body));
    },
    async validateToken(deadline) {
      const token = await deps.getToken();
      if (!token) return failed("configuration", "Real-Debrid token is not configured");
      const r = await doFetch(deps, "GET", "/user", undefined, token, deadline);
      if (r.kind === "error") return failed("provider_transient", "network error");
      return mapValidateTokenResult(r.status);
    },
  };
}
