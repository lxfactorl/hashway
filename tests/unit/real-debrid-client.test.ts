// tests/unit/real-debrid-client.test.ts
import { describe, it, expect } from "vitest";
import { createRealDebridClient } from "@adapters/real-debrid/client";
import { failed, unknown } from "@domain/error-taxonomy";

function fakeFetch(map: Record<string, { status: number; body?: unknown }>): typeof fetch {
  return (url: string | URL | Request) => {
    const path = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const key = Object.keys(map).find((k) => path.includes(k));
    if (!key) throw new TypeError("no route");
    const entry = map[key];
    if (!entry) throw new TypeError("no route");
    return Promise.resolve(
      new Response(entry.body ? JSON.stringify(entry.body) : "", {
        status: entry.status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
}

describe("RealDebrid client", () => {
  it("addMagnet 201 -> accepted with id", async () => {
    const f = fakeFetch({ "/torrents/addMagnet": { status: 201, body: { id: "torrent-1" } } });
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out.kind).toBe("accepted");
    if (out.kind === "accepted") expect(out.id).toBe("torrent-1");
  });
  it("addMagnet 201 with numeric id -> accepted with string id", async () => {
    const f = fakeFetch({ "/torrents/addMagnet": { status: 201, body: { id: 123 } } });
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out.kind).toBe("accepted");
    if (out.kind === "accepted") expect(out.id).toBe("123");
  });
  it("addMagnet with an invalid id -> unknown outcome", async () => {
    const f = fakeFetch({ "/torrents/addMagnet": { status: 201, body: { id: "../user" } } });
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out).toEqual(unknown("addMagnet response missing or invalid torrent id"));
  });
  it("addMagnet 201 without id in body -> unknown outcome", async () => {
    const f = fakeFetch({ "/torrents/addMagnet": { status: 201, body: {} } });
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out).toEqual(unknown("addMagnet response missing or invalid torrent id"));
  });
  it("addMagnet 429 -> failed transient (no retry here)", async () => {
    const f = fakeFetch({ "/torrents/addMagnet": { status: 429 } });
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out.kind).toBe("failed");
  });
  it("addMagnet error_code 33 -> already_active", async () => {
    const f = fakeFetch({ "/torrents/addMagnet": { status: 200, body: { error_code: 33 } } });
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out.kind).toBe("already_active");
  });
  it("addMagnet non-numeric error_code -> mapped without code", async () => {
    const f = fakeFetch({ "/torrents/addMagnet": { status: 429, body: { error_code: "rate" } } });
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out.kind).toBe("failed");
  });
  it("addMagnet network throw -> unknown_outcome (NEVER retried)", async () => {
    const f: typeof fetch = () => {
      throw new TypeError("failed to fetch");
    };
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out.kind).toBe("unknown_outcome");
  });
  it("addMagnet non-ambiguous network throw -> provider_transient failed", async () => {
    const f: typeof fetch = () => {
      throw new Error("boom");
    };
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out.kind).toBe("failed");
    if (out.kind === "failed") {
      expect(out.error).toBe("provider_transient");
      expect(out.message).toBe("network error");
    }
  });
  it("addMagnet aborts once the deadline has passed", async () => {
    const f: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new TypeError("no signal"));
          return;
        }
        signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() - 5000);
    expect(out.kind).toBe("unknown_outcome");
  });
  it("addMagnet without an object body -> unknown outcome", async () => {
    const f = fakeFetch({ "/torrents/addMagnet": { status: 201, body: "just-a-string" } });
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out).toEqual(unknown("addMagnet response missing or invalid torrent id"));
  });
  it("addMagnet without a JSON body -> unknown outcome", async () => {
    const f: typeof fetch = () =>
      Promise.resolve(
        new Response("not-json {", {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out).toEqual(unknown("addMagnet response missing or invalid torrent id"));
  });
  it("addMagnet with a null body -> unknown outcome", async () => {
    const f: typeof fetch = () =>
      Promise.resolve(
        new Response("null", { status: 201, headers: { "Content-Type": "application/json" } }),
      );
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out).toEqual(unknown("addMagnet response missing or invalid torrent id"));
  });
  it("addMagnet with a null id -> unknown outcome", async () => {
    const f: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ id: null }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out).toEqual(unknown("addMagnet response missing or invalid torrent id"));
  });
  it("addMagnet missing token -> configuration failed", async () => {
    const c = createRealDebridClient({
      fetchFn: fakeFetch({}),
      getToken: () => Promise.resolve(undefined),
    });
    const out = await c.addMagnet({ magnet: "magnet:?xt=urn:btih:abc" }, Date.now() + 30000);
    expect(out.kind === "failed").toBe(true);
  });
  it("selectFiles 202 -> accepted", async () => {
    const f = fakeFetch({ "/torrents/selectFiles": { status: 202 } });
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.selectFiles({ id: "x", files: "all" }, Date.now() + 30000);
    expect(out.kind).toBe("accepted");
  });
  it("selectFiles rejects an invalid provider id before making a request", async () => {
    let requested = false;
    const f: typeof fetch = (url) => {
      void url;
      requested = true;
      return Promise.resolve(new Response("", { status: 202 }));
    };
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.selectFiles({ id: "id/with/slashes", files: "all" }, Date.now() + 30000);
    expect(out).toEqual(failed("internal", "Invalid torrent id"));
    expect(requested).toBe(false);
  });
  it("selectFiles network throw -> provider_transient failed", async () => {
    const f: typeof fetch = () => {
      throw new TypeError("failed to fetch");
    };
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.selectFiles({ id: "x", files: "all" }, Date.now() + 30000);
    expect(out.kind).toBe("failed");
    if (out.kind === "failed") {
      expect(out.error).toBe("provider_transient");
      expect(out.message).toBe("network error");
    }
  });
  it("selectFiles missing token -> configuration failed", async () => {
    const c = createRealDebridClient({
      fetchFn: fakeFetch({}),
      getToken: () => Promise.resolve(undefined),
    });
    const out = await c.selectFiles({ id: "x", files: "all" }, Date.now() + 30000);
    expect(out.kind === "failed").toBe(true);
  });
  it("validateToken 200 -> accepted", async () => {
    const f = fakeFetch({ "/user": { status: 200, body: {} } });
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.validateToken(Date.now() + 30000);
    expect(out.kind).toBe("accepted");
  });
  it("validateToken network throw -> provider_transient failed", async () => {
    const f: typeof fetch = () => {
      throw new TypeError("failed to fetch");
    };
    const c = createRealDebridClient({ fetchFn: f, getToken: () => Promise.resolve("tok") });
    const out = await c.validateToken(Date.now() + 30000);
    expect(out.kind).toBe("failed");
    if (out.kind === "failed") expect(out.error).toBe("provider_transient");
  });
  it("validateToken missing token -> configuration failed", async () => {
    const c = createRealDebridClient({
      fetchFn: fakeFetch({}),
      getToken: () => Promise.resolve(undefined),
    });
    const out = await c.validateToken(Date.now() + 30000);
    expect(out.kind === "failed").toBe(true);
  });
});
