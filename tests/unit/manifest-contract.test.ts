import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(process.cwd(), "dist/manifest.json");

interface Manifest {
  manifest_version?: number;
  browser_action?: unknown;
  browser_specific_settings?: {
    gecko?: { id?: string };
  };
  permissions?: string[];
  host_permissions?: string[];
  options_ui?: unknown;
  background?: unknown;
  content_scripts?: Array<{ matches?: string[] }>;
  web_accessible_resources?: string[];
}

function readManifest(): Manifest {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
}

describe("manifest contract", () => {
  it("dist/manifest.json exists", () => {
    expect(existsSync(manifestPath)).toBe(true);
  });

  it("is Firefox MV2", () => {
    expect(readManifest().manifest_version).toBe(2);
  });

  it("has a browser_action entry", () => {
    expect(readManifest().browser_action).toBeDefined();
  });

  it("has the immutable gecko.id", () => {
    expect(readManifest().browser_specific_settings?.gecko?.id).toBe("hashway@hashway.local");
  });

  it("permissions match the approved allowlist exactly", () => {
    expect(readManifest().permissions).toEqual([
      "contextMenus",
      "notifications",
      "activeTab",
      "storage",
      "downloads",
      "https://api.real-debrid.com/*",
    ]);
  });

  it("does not contain forbidden permissions", () => {
    const forbidden = [
      "cookies",
      "webRequest",
      "webRequestBlocking",
      "debugger",
      "nativeMessaging",
      "tabs",
      "unlimitedStorage",
      "<all_urls>",
    ];
    const perms: string[] = readManifest().permissions ?? [];
    for (const f of forbidden) {
      expect(perms).not.toContain(f);
    }
  });

  it("host_permissions do not contain localhost or test origins", () => {
    const hostPerms: string[] = readManifest().host_permissions ?? [];
    for (const h of hostPerms) {
      expect(h).not.toMatch(/localhost/);
      expect(h).not.toMatch(/127\.0\.0\.1/);
      expect(h).not.toMatch(/\.test$/);
    }
  });

  it("options_ui is present", () => {
    expect(readManifest().options_ui).toBeDefined();
  });

  it("background is present", () => {
    expect(readManifest().background).toBeDefined();
  });

  it("content_scripts matches are HTTPS-only if any are present", () => {
    const scripts: Array<{ matches?: string[] }> = readManifest().content_scripts ?? [];
    for (const s of scripts) {
      for (const m of s.matches ?? []) {
        expect(m).toMatch(/^https:\/\//);
      }
    }
  });

  it("web_accessible_resources contains only options.html", () => {
    expect(readManifest().web_accessible_resources).toEqual(["options.html"]);
  });
});
