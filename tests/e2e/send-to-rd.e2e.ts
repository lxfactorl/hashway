// tests/e2e/send-to-rd.e2e.ts
// Node-level integration E2E: drives the REAL sendTorrent use case and the REAL
// Real-Debrid HTTP client against a live HTTP fake RD (and a live fake tracker).
// No Firefox/Selenium is involved; the real context-menu click is a manual smoke
// step (see docs/testing.md) because geckodriver forbids navigation to
// moz-extension:// URLs, which made driving the extension's own pages unreliable
// in CI. Runs in CI on windows-latest (tests/e2e), same as hello-world.e2e.ts.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFakeRd, type FakeRd } from "./fake-rd.js";
import { createFakeTracker, type FakeTracker } from "./fake-tracker.js";
import { createRealDebridClient } from "@adapters/real-debrid/client";
import { classifyLink } from "@adapters/firefox/active-tab";
import { sendTorrent } from "@application/send-torrent";
import { parseTorrent } from "@domain/bencode";
import { computeV1InfoHash } from "@domain/infohash";
import type { NotificationsPort } from "@ports/notifications";
import type { MessagingPort, FetchTrackerResponse } from "@ports/messaging";
import type { LinkClickIntent } from "@ports/context-menu";

const FIXTURE_TORRENT = resolve(process.cwd(), "tests/fixtures/torrents/single-file-v1.torrent");
const MAGNET_V1 = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=E2E";

interface TestRecord {
  readonly notified: string[];
  readonly badges: string[];
}

function fakeNotifications(record: TestRecord): NotificationsPort {
  return {
    notify(_title, message) {
      record.notified.push(message);
      return Promise.resolve();
    },
    setBadge(badge) {
      record.badges.push(badge);
      return Promise.resolve();
    },
  };
}

function intent(linkUrl: string): LinkClickIntent {
  return { linkUrl, pageUrl: "https://t.example.com/x", tabTitle: "E2E", tabId: 0 };
}

function fakeProvider(rdPort: number) {
  return createRealDebridClient({
    fetchFn: globalThis.fetch.bind(globalThis),
    getToken: () => Promise.resolve("e2e-token"),
    baseUrl: `http://127.0.0.1:${String(rdPort)}/rest/1.0`,
  });
}

describe("send-to-rd E2E (integration, no browser)", () => {
  let rd: FakeRd;
  let rdPort: number;
  let tracker: FakeTracker;
  let trackerPort: number;

  beforeAll(async () => {
    rd = createFakeRd();
    ({ port: rdPort } = await rd.start());
    tracker = createFakeTracker();
    ({ port: trackerPort } = await tracker.start());
  });

  afterAll(async () => {
    await tracker.stop();
    await rd.stop();
  });

  it("serves the committed torrent fixture and a session-required page", async () => {
    const expected = readFileSync(FIXTURE_TORRENT);
    const download = await fetch(`http://127.0.0.1:${String(trackerPort)}/torrents/download`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toContain("application/x-bittorrent");
    expect(Buffer.from(await download.arrayBuffer()).equals(expected)).toBe(true);

    const login = await fetch(`http://127.0.0.1:${String(trackerPort)}/torrents/login`);
    expect(login.status).toBe(200);
    expect((await login.text()).startsWith("<!doctype html>")).toBe(true);
  });

  it("adds a magnet to the fake RD with only xt+dn (no tracker params)", async () => {
    rd.requests.length = 0;
    const record: TestRecord = { notified: [], badges: [] };
    const provider = fakeProvider(rdPort);
    const messaging: MessagingPort = {
      fetchTrackerBytes: () =>
        Promise.resolve({ ok: false, reason: "network" } satisfies FetchTrackerResponse),
    };

    const out = await sendTorrent(
      {
        provider,
        notifications: fakeNotifications(record),
        messaging,
        parser: parseTorrent,
        computeHash: computeV1InfoHash,
        classify: classifyLink,
      },
      intent(`${MAGNET_V1}&tr=https://t.example.com/announce?key=SECRET`),
      Date.now() + 30000,
    );

    expect(out.kind).toBe("accepted");
    const calls = rd.requests.map((r) => `${r.method} ${r.url.split("?")[0] ?? ""}`);
    expect(calls).toContain("POST /rest/1.0/torrents/addMagnet");
    expect(calls).toContain("POST /rest/1.0/torrents/selectFiles/t1");
    // The magnet Real-Debrid received must be sanitized: only xt + dn.
    const add = rd.requests.find((r) => r.url.includes("/torrents/addMagnet"));
    expect(add).toBeDefined();
    const magnet = new URLSearchParams(add?.body ?? "").get("magnet") ?? "";
    expect(magnet).toContain("xt=urn:btih:0123456789abcdef0123456789abcdef01234567");
    expect(magnet).toContain("dn=E2E");
    expect(magnet).not.toMatch(/tr=|xs=|x\.pe=|SECRET/);
    // Success feedback: "Added: …" notification + OK badge.
    expect(record.notified.some((m) => m.startsWith("Added: E2E"))).toBe(true);
    expect(record.badges).toContain("OK");
  });

  it("downloads a .torrent through the messaging port, hashes it, and adds it", async () => {
    rd.requests.length = 0;
    const record: TestRecord = { notified: [], badges: [] };
    const provider = fakeProvider(rdPort);
    // The messaging port stands in for the content script: it performs a real
    // fetch against the fake tracker and returns the bytes.
    const messaging: MessagingPort = {
      async fetchTrackerBytes(): Promise<FetchTrackerResponse> {
        const res = await fetch(`http://127.0.0.1:${String(trackerPort)}/torrents/download`);
        if (!res.ok) return { ok: false, reason: "http_error", status: res.status };
        const bytes = await res.arrayBuffer();
        return { ok: true, bytes };
      },
    };

    const out = await sendTorrent(
      {
        provider,
        notifications: fakeNotifications(record),
        messaging,
        parser: parseTorrent,
        computeHash: computeV1InfoHash,
        classify: classifyLink,
      },
      intent(`https://t.example.com/torrents/download`),
      Date.now() + 30000,
    );

    expect(out.kind).toBe("accepted");
    const calls = rd.requests.map((r) => `${r.method} ${r.url.split("?")[0] ?? ""}`);
    expect(calls).toContain("POST /rest/1.0/torrents/addMagnet");
    expect(calls).toContain("POST /rest/1.0/torrents/selectFiles/t1");
    // The magnet must be built from the real v1 infohash of the fixture.
    const add = rd.requests.find((r) => r.url.includes("/torrents/addMagnet"));
    const magnet = new URLSearchParams(add?.body ?? "").get("magnet") ?? "";
    expect(magnet).toContain("44020936b61b241a250af90aa0d1fac4567a3f25");
    expect(record.badges).toContain("OK");
  });

  it("maps a session-required tracker page to tracker_auth", async () => {
    rd.requests.length = 0;
    const record: TestRecord = { notified: [], badges: [] };
    const provider = fakeProvider(rdPort);
    const messaging: MessagingPort = {
      fetchTrackerBytes: () =>
        Promise.resolve({ ok: false, reason: "session_required" } satisfies FetchTrackerResponse),
    };

    const out = await sendTorrent(
      {
        provider,
        notifications: fakeNotifications(record),
        messaging,
        parser: parseTorrent,
        computeHash: computeV1InfoHash,
        classify: classifyLink,
      },
      intent(`https://t.example.com/torrents/login`),
      Date.now() + 30000,
    );

    expect(out).toMatchObject({ kind: "failed", error: "tracker_auth" });
    expect(record.notified).toContain("Session required on tracker");
    expect(record.badges).toContain("ERR");
    expect(rd.requests).toHaveLength(0);
  });

  it("rejects a cross-origin HTTPS link", async () => {
    const record: TestRecord = { notified: [], badges: [] };
    const provider = fakeProvider(rdPort);
    const messaging: MessagingPort = {
      fetchTrackerBytes: () =>
        Promise.resolve({ ok: false, reason: "network" } satisfies FetchTrackerResponse),
    };

    const out = await sendTorrent(
      {
        provider,
        notifications: fakeNotifications(record),
        messaging,
        parser: parseTorrent,
        computeHash: computeV1InfoHash,
        classify: classifyLink,
      },
      intent(`https://cdn.other.com/x.torrent`),
      Date.now() + 30000,
    );

    expect(out.kind).toBe("failed");
    expect(record.notified).toContain("Cross-origin link not supported");
  });
});
