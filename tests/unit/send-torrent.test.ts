// tests/unit/send-torrent.test.ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sendTorrent, type LinkKind } from "@application/send-torrent";
import { accepted, alreadyActive, failed, unknown, type Outcome } from "@domain/error-taxonomy";
import { BencodeError, parseTorrent, type ParsedTorrent } from "@domain/bencode";
import { computeV1InfoHash } from "@domain/infohash";
import { classifyLink } from "@adapters/firefox/active-tab";
import { createRealDebridClient } from "@adapters/real-debrid/client";
import type { ProviderPort } from "@ports/provider";
import type { NotificationsPort, Badge } from "@ports/notifications";
import type { MessagingPort, FetchTrackerResponse } from "@ports/messaging";
import type { LinkClickIntent } from "@ports/context-menu";

const fixtureBytes = new Uint8Array(
  readFileSync(resolve(process.cwd(), "tests/fixtures/torrents/single-file-v1.torrent")),
);
const fixtureArrayBuffer: ArrayBuffer = fixtureBytes.buffer.slice(
  fixtureBytes.byteOffset,
  fixtureBytes.byteOffset + fixtureBytes.byteLength,
);

const V1_HASH = "44020936b61b241a250af90aa0d1fac4567a3f25";
const MAGNET_XT = "0123456789abcdef0123456789abcdef01234567";
const BASIC_MAGNET = `magnet:?xt=urn:btih:${MAGNET_XT}&dn=Hello%20World`;

type ProviderSpy = ProviderPort & { addCalls: string[]; selectCalls: string[] };
type NotificationsSpy = NotificationsPort & {
  notifications: { title: string; message: string }[];
  badges: Badge[];
};

function intent(linkUrl: string): LinkClickIntent {
  return { linkUrl, pageUrl: "https://example.com/page", tabTitle: "Example", tabId: 7 };
}

function magnetIntent(): LinkClickIntent {
  return intent(BASIC_MAGNET);
}

function fakeProvider(handlers?: {
  addMagnet?: (magnet: string) => Promise<Outcome>;
  selectFiles?: (id: string) => Promise<Outcome>;
}): ProviderSpy {
  const spy = { addCalls: [] as string[], selectCalls: [] as string[] };
  return {
    ...spy,
    async addMagnet(req) {
      spy.addCalls.push(req.magnet);
      return handlers?.addMagnet
        ? handlers.addMagnet(req.magnet)
        : Promise.resolve(accepted({ id: "t1" }));
    },
    async selectFiles(req) {
      spy.selectCalls.push(req.id);
      return handlers?.selectFiles
        ? handlers.selectFiles(req.id)
        : Promise.resolve(accepted({ id: "" }));
    },
    validateToken: () =>
      Promise.reject(new Error("validateToken is not exercised in send-torrent tests")),
  };
}

function fakeNotifications(): NotificationsSpy {
  const spy = {
    notifications: [] as { title: string; message: string }[],
    badges: [] as Badge[],
  };
  return {
    ...spy,
    notify(title, message) {
      spy.notifications.push({ title, message });
      return Promise.resolve();
    },
    setBadge(badge) {
      spy.badges.push(badge);
      return Promise.resolve();
    },
  };
}

function fakeMessaging(
  response: FetchTrackerResponse | (() => FetchTrackerResponse | Promise<FetchTrackerResponse>),
): MessagingPort {
  return {
    async fetchTrackerBytes() {
      return typeof response === "function" ? response() : response;
    },
  };
}

function makeDeps(
  opts: {
    provider?: ProviderSpy;
    notifications?: NotificationsSpy;
    messaging?: MessagingPort;
    parser?: (bytes: Uint8Array) => ParsedTorrent;
    computeHash?: (infoBytes: Uint8Array) => Promise<string>;
    classify?: (linkUrl: string, pageUrl: string) => LinkKind;
  } = {},
) {
  const provider = opts.provider ?? fakeProvider();
  const notifications = opts.notifications ?? fakeNotifications();
  const messaging = opts.messaging ?? fakeMessaging({ ok: true, bytes: fixtureArrayBuffer });
  return {
    provider,
    notifications,
    deps: {
      provider,
      notifications,
      messaging,
      parser: opts.parser ?? parseTorrent,
      computeHash: opts.computeHash ?? computeV1InfoHash,
      classify: opts.classify ?? classifyLink,
    },
  };
}

function expectNotified(notifications: NotificationsSpy, message: string): void {
  expect(notifications.notifications).toContainEqual({ title: "Hashway", message });
}

describe("sendTorrent link classification", () => {
  it("magnet link: addMagnet accepted then selectFiles accepted -> accepted + Added notification", async () => {
    const { provider, notifications, deps } = makeDeps();
    const out = await sendTorrent(deps, magnetIntent(), Date.now() + 30000);
    expect(out).toEqual(accepted({ id: "" }));
    expect(provider.addCalls).toEqual([BASIC_MAGNET]);
    expect(provider.selectCalls).toEqual(["t1"]);
    expectNotified(notifications, "Added: Hello World");
    expect(notifications.badges).toContain("OK");
  });

  it("drops tr/xs/x.pe/unknown params from the magnet passed to addMagnet", async () => {
    const { provider, deps } = makeDeps();
    const url =
      `magnet:?xt=urn:btih:${MAGNET_XT}&dn=Hello` +
      "&tr=https://tracker.example.com/announce?key=SECRET&xs=ignored&x.pe=ignored";
    const out = await sendTorrent(deps, intent(url), Date.now() + 30000);
    expect(out).toEqual(accepted({ id: "" }));
    expect(provider.addCalls).toEqual([`magnet:?xt=urn:btih:${MAGNET_XT}&dn=Hello`]);
    const sent = provider.addCalls[0];
    if (sent === undefined) throw new Error("expected a magnet");
    expect(sent).not.toMatch(/tr=|xs=|x\.pe=|SECRET/);
  });

  it("https .torrent: fetch -> parse -> hash -> addMagnet -> selectFiles -> accepted", async () => {
    const { provider, notifications, deps } = makeDeps();
    const out = await sendTorrent(
      deps,
      intent("https://example.com/demo.torrent"),
      Date.now() + 30000,
    );
    expect(out).toEqual(accepted({ id: "" }));
    expect(provider.addCalls).toEqual([`magnet:?xt=urn:btih:${V1_HASH}&dn=demo.txt`]);
    expect(provider.selectCalls).toEqual(["t1"]);
    expectNotified(notifications, "Added: demo.txt");
  });

  it("http (non-https) link -> HTTPS-only failure, no addMagnet", async () => {
    const { provider, notifications, deps } = makeDeps();
    const out = await sendTorrent(
      deps,
      intent("http://example.com/file.torrent"),
      Date.now() + 30000,
    );
    expect(out).toEqual(failed("user_input", "HTTPS only — tracker page must be secure"));
    expectNotified(notifications, "HTTPS only — tracker page must be secure");
    expect(notifications.badges).toContain("ERR");
    expect(provider.addCalls).toHaveLength(0);
  });

  it("unsupported scheme (non-https/non-magnet) -> Cross-origin link not supported failure", async () => {
    const { notifications, deps } = makeDeps();
    const out = await sendTorrent(
      deps,
      intent("ftp://example.com/file.torrent"),
      Date.now() + 30000,
    );
    expect(out).toEqual(failed("user_input", "Cross-origin link not supported"));
    expectNotified(notifications, "Cross-origin link not supported");
  });

  it("cross-origin https link -> Cross-origin link not supported, no tracker fetch", async () => {
    const { provider, notifications, deps } = makeDeps();
    const out = await sendTorrent(
      deps,
      intent("https://cdn.other.com/x.torrent"),
      Date.now() + 30000,
    );
    expect(out).toEqual(failed("user_input", "Cross-origin link not supported"));
    expectNotified(notifications, "Cross-origin link not supported");
    expect(provider.addCalls).toHaveLength(0);
  });

  it("malformed magnet -> classified unsupported -> Cross-origin link not supported", async () => {
    const { notifications, deps } = makeDeps();
    const out = await sendTorrent(deps, intent("magnet:?xt=urn:btih:abc"), Date.now() + 30000);
    expect(out).toEqual(failed("user_input", "Cross-origin link not supported"));
    expectNotified(notifications, "Cross-origin link not supported");
  });
});

describe("sendTorrent https fetch failures", () => {
  it("session_required -> tracker_auth failure + notification, no addMagnet", async () => {
    const { provider, notifications, deps } = makeDeps({
      messaging: fakeMessaging({ ok: false, reason: "session_required" }),
    });
    const out = await sendTorrent(deps, intent("https://example.com/dl"), Date.now() + 30000);
    expect(out).toEqual(failed("tracker_auth", "Session required on tracker"));
    expectNotified(notifications, "Session required on tracker");
    expect(notifications.badges).toContain("ERR");
    expect(provider.addCalls).toHaveLength(0);
  });

  it("non_torrent -> provider_permanent Not a valid .torrent file", async () => {
    const { notifications, deps } = makeDeps({
      messaging: fakeMessaging({ ok: false, reason: "non_torrent" }),
    });
    const out = await sendTorrent(deps, intent("https://example.com/dl"), Date.now() + 30000);
    expect(out).toEqual(failed("provider_permanent", "Not a valid .torrent file"));
    expectNotified(notifications, "Not a valid .torrent file");
  });

  it("redirect -> provider_permanent Redirect not allowed", async () => {
    const { notifications, deps } = makeDeps({
      messaging: fakeMessaging({ ok: false, reason: "redirect" }),
    });
    const out = await sendTorrent(deps, intent("https://example.com/dl"), Date.now() + 30000);
    expect(out).toEqual(failed("provider_permanent", "Redirect not allowed"));
    expectNotified(notifications, "Redirect not allowed");
  });

  it("http_error -> provider_permanent Tracker error", async () => {
    const { notifications, deps } = makeDeps({
      messaging: fakeMessaging({ ok: false, reason: "http_error", status: 500 }),
    });
    const out = await sendTorrent(deps, intent("https://example.com/dl"), Date.now() + 30000);
    expect(out).toEqual(failed("provider_permanent", "Tracker error"));
    expectNotified(notifications, "Tracker error");
  });

  it("oversized -> provider_permanent Torrent file too large (max 25 MB)", async () => {
    const { notifications, deps } = makeDeps({
      messaging: fakeMessaging({ ok: false, reason: "oversized" }),
    });
    const out = await sendTorrent(deps, intent("https://example.com/dl"), Date.now() + 30000);
    expect(out).toEqual(failed("provider_permanent", "Torrent file too large (max 25 MB)"));
    expectNotified(notifications, "Torrent file too large (max 25 MB)");
  });

  it("network -> provider_transient Network error fetching torrent", async () => {
    const { notifications, deps } = makeDeps({
      messaging: fakeMessaging({ ok: false, reason: "network" }),
    });
    const out = await sendTorrent(deps, intent("https://example.com/dl"), Date.now() + 30000);
    expect(out).toEqual(failed("provider_transient", "Network error fetching torrent"));
    expectNotified(notifications, "Network error fetching torrent");
  });

  it("forwards the action deadline to the tracker fetch", async () => {
    const forwarded: number[] = [];
    const messaging: MessagingPort = {
      fetchTrackerBytes(_tabId, _url, deadline) {
        forwarded.push(deadline);
        return Promise.resolve({ ok: true, bytes: fixtureArrayBuffer });
      },
    };
    const { deps } = makeDeps({ messaging });
    const deadline = Date.now() + 30000;
    const out = await sendTorrent(deps, intent("https://example.com/x.torrent"), deadline);
    expect(out).toEqual(accepted({ id: "" }));
    expect(forwarded).toEqual([deadline]);
  });
});

describe("sendTorrent parser errors", () => {
  it("parser not_torrent -> Not a valid .torrent file", async () => {
    const { notifications, deps } = makeDeps({
      parser: () => {
        throw new BencodeError("not_torrent", "not a torrent");
      },
    });
    const out = await sendTorrent(
      deps,
      intent("https://example.com/x.torrent"),
      Date.now() + 30000,
    );
    expect(out).toEqual(failed("provider_permanent", "Not a valid .torrent file"));
    expectNotified(notifications, "Not a valid .torrent file");
  });

  it("parser malformed -> Not a valid .torrent file", async () => {
    const { notifications, deps } = makeDeps({
      parser: () => {
        throw new BencodeError("malformed", "malformed");
      },
    });
    const out = await sendTorrent(
      deps,
      intent("https://example.com/x.torrent"),
      Date.now() + 30000,
    );
    expect(out).toEqual(failed("provider_permanent", "Not a valid .torrent file"));
    expectNotified(notifications, "Not a valid .torrent file");
  });

  it("parser oversized -> Torrent file too large", async () => {
    const { notifications, deps } = makeDeps({
      parser: () => {
        throw new BencodeError("oversized", "oversized");
      },
    });
    const out = await sendTorrent(
      deps,
      intent("https://example.com/x.torrent"),
      Date.now() + 30000,
    );
    expect(out).toEqual(failed("provider_permanent", "Torrent file too large"));
    expectNotified(notifications, "Torrent file too large");
  });

  it("parser v2_rejected -> BitTorrent v2 torrents are not supported", async () => {
    const { notifications, deps } = makeDeps({
      parser: () => {
        throw new BencodeError("v2_rejected", "v2");
      },
    });
    const out = await sendTorrent(
      deps,
      intent("https://example.com/x.torrent"),
      Date.now() + 30000,
    );
    expect(out).toEqual(failed("user_input", "BitTorrent v2 torrents are not supported"));
    expectNotified(notifications, "BitTorrent v2 torrents are not supported");
  });

  it("parser throwing a non-BencodeError propagates the error", async () => {
    const { deps } = makeDeps({
      parser: () => {
        throw new Error("boom");
      },
    });
    await expect(
      sendTorrent(deps, intent("https://example.com/x.torrent"), Date.now() + 30000),
    ).rejects.toThrow("boom");
  });
});

describe("sendTorrent provider orchestration", () => {
  it("201 without a torrent id -> unknown and no selectFiles request", async () => {
    const requests: string[] = [];
    const provider = createRealDebridClient({
      fetchFn: (url) => {
        requests.push(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
        return Promise.resolve(new Response("{}", { status: 201 }));
      },
      getToken: () => Promise.resolve("tok"),
    });
    const { notifications, deps } = makeDeps({ provider });

    const out = await sendTorrent(deps, magnetIntent(), Date.now() + 30000);

    expect(out).toEqual(unknown("addMagnet response missing or invalid torrent id"));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("/torrents/addMagnet");
    expectNotified(notifications, "Unknown outcome — check your Real-Debrid account");
  });

  it("addMagnet unknown_outcome -> unknown, NO selectFiles, single addMagnet call", async () => {
    const { provider, notifications, deps } = makeDeps({
      provider: fakeProvider({
        addMagnet: () => Promise.resolve(unknown("addMagnet timed out")),
      }),
    });
    const out = await sendTorrent(deps, magnetIntent(), Date.now() + 30000);
    expect(out).toEqual(unknown("addMagnet timed out"));
    expect(provider.addCalls).toHaveLength(1);
    expect(provider.selectCalls).toHaveLength(0);
    expectNotified(notifications, "Unknown outcome — check your Real-Debrid account");
    expect(notifications.badges).toContain("ERR");
  });

  it("addMagnet 401 -> provider_auth failure + notification, NO selectFiles", async () => {
    const { provider, notifications, deps } = makeDeps({
      provider: fakeProvider({
        addMagnet: () => Promise.resolve(failed("provider_auth", "Invalid Real-Debrid token")),
      }),
    });
    const out = await sendTorrent(deps, magnetIntent(), Date.now() + 30000);
    expect(out).toEqual(failed("provider_auth", "Invalid Real-Debrid token"));
    expectNotified(notifications, "Invalid Real-Debrid token");
    expect(notifications.badges).toContain("ERR");
    expect(provider.selectCalls).toHaveLength(0);
  });

  it("addMagnet already_active -> Already in Real-Debrid + OK badge, NO selectFiles", async () => {
    const { provider, notifications, deps } = makeDeps({
      provider: fakeProvider({
        addMagnet: () => Promise.resolve(alreadyActive("Already active in Real-Debrid")),
      }),
    });
    const out = await sendTorrent(deps, magnetIntent(), Date.now() + 30000);
    expect(out).toEqual(alreadyActive("Already active in Real-Debrid"));
    expect(provider.selectCalls).toHaveLength(0);
    expectNotified(notifications, "Already in Real-Debrid");
    expect(notifications.badges).toContain("OK");
  });

  it("selectFiles 503 transient -> retries once -> 202 accepted", async () => {
    let selectCalls = 0;
    const provider = fakeProvider({
      selectFiles: () => {
        selectCalls++;
        return Promise.resolve(
          selectCalls === 1 ? failed("provider_transient", "RD unavailable") : accepted({ id: "" }),
        );
      },
    });
    const { notifications, deps } = makeDeps({ provider });
    const out = await sendTorrent(deps, magnetIntent(), Date.now() + 30000);
    expect(out).toEqual(accepted({ id: "" }));
    expect(selectCalls).toBe(2);
    expectNotified(notifications, "Added: Hello World");
    expect(notifications.badges).toContain("OK");
  });

  it("selectFiles permanent failure -> notifies the provider message + ERR badge", async () => {
    const { notifications, deps } = makeDeps({
      provider: fakeProvider({
        selectFiles: () =>
          Promise.resolve(failed("provider_permanent", "Forbidden (non-premium?)")),
      }),
    });
    const out = await sendTorrent(deps, magnetIntent(), Date.now() + 30000);
    expect(out).toEqual(failed("provider_permanent", "Forbidden (non-premium?)"));
    expectNotified(notifications, "Forbidden (non-premium?)");
    expect(notifications.badges).toContain("ERR");
  });

  it("selectFiles unknown_outcome -> unknown outcome notification + ERR badge", async () => {
    const { notifications, deps } = makeDeps({
      provider: fakeProvider({
        selectFiles: () => Promise.resolve(unknown("selectFiles timed out")),
      }),
    });
    const out = await sendTorrent(deps, magnetIntent(), Date.now() + 30000);
    expect(out).toEqual(unknown("selectFiles timed out"));
    expectNotified(notifications, "Unknown outcome — check your Real-Debrid account");
    expect(notifications.badges).toContain("ERR");
  });

  it("selectFiles already_active -> Already in Real-Debrid + OK badge", async () => {
    const { notifications, deps } = makeDeps({
      provider: fakeProvider({
        selectFiles: () => Promise.resolve(alreadyActive("Already active in Real-Debrid")),
      }),
    });
    const out = await sendTorrent(deps, magnetIntent(), Date.now() + 30000);
    expect(out).toEqual(alreadyActive("Already active in Real-Debrid"));
    expectNotified(notifications, "Already in Real-Debrid");
    expect(notifications.badges).toContain("OK");
  });

  it("second concurrent action returns Busy and the first completes normally", async () => {
    const resolver: { release: (o: Outcome) => void } = { release: () => {} };
    const gate = new Promise<Outcome>((resolve) => {
      resolver.release = resolve;
    });
    const provider = fakeProvider({ addMagnet: () => gate });
    const { notifications, deps } = makeDeps({ provider });
    const p1 = sendTorrent(deps, magnetIntent(), Date.now() + 30000);
    const out2 = await sendTorrent(deps, magnetIntent(), Date.now() + 30000);
    expect(out2).toEqual(failed("user_input", "Busy"));
    resolver.release(accepted({ id: "t1" }));
    const out1 = await p1;
    expect(out1).toEqual(accepted({ id: "" }));
    expect(provider.selectCalls).toEqual(["t1"]);
    expectNotified(notifications, "Added: Hello World");
  });
});

describe("sendTorrent retry budget and deadline", () => {
  it("selectFiles transient exhausts the retry budget", async () => {
    vi.useFakeTimers();
    try {
      let selectCalls = 0;
      const provider = fakeProvider({
        selectFiles: () => {
          selectCalls++;
          return Promise.resolve(failed("provider_transient", "RD unavailable"));
        },
      });
      const { notifications, deps } = makeDeps({ provider });
      const deadline = Date.now() + 30000;
      const p = sendTorrent(deps, magnetIntent(), deadline);
      await vi.advanceTimersByTimeAsync(7000);
      const out = await p;
      expect(out).toEqual(failed("provider_transient", "retry budget exhausted"));
      expect(selectCalls).toBe(3);
      expectNotified(notifications, "retry budget exhausted");
      expect(notifications.badges).toContain("ERR");
    } finally {
      vi.useRealTimers();
    }
  });

  it("deadline exceeded before selectFiles -> internal deadline failure, no selectFiles call", async () => {
    const { provider, notifications, deps } = makeDeps();
    const out = await sendTorrent(deps, magnetIntent(), Date.now() - 1);
    expect(out).toEqual(failed("internal", "action deadline exceeded"));
    expect(provider.selectCalls).toHaveLength(0);
    expectNotified(notifications, "action deadline exceeded");
    expect(notifications.badges).toContain("ERR");
  });
});
