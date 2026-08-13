// src/ports/messaging.ts
export interface FetchTrackerRequest {
  readonly url: string;
  readonly deadline: number;
}
export type FetchTrackerResponse =
  | { readonly ok: true; readonly bytes: ArrayBuffer }
  | {
      readonly ok: false;
      readonly reason:
        "http_error" | "redirect" | "oversized" | "non_torrent" | "session_required" | "network";
      readonly status?: number;
    };
export interface MessagingPort {
  fetchTrackerBytes(tabId: number, url: string, deadline: number): Promise<FetchTrackerResponse>;
}
