// tests/e2e/send-to-rd.e2e.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Builder } from "selenium-webdriver";
import type { WebDriver } from "selenium-webdriver";
import { Options as FirefoxOptions, ServiceBuilder } from "selenium-webdriver/firefox.js";
import { Zip } from "selenium-webdriver/io/zip.js";
import { download as downloadGeckodriver } from "geckodriver";
import {
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createFakeRd, type FakeRd } from "./fake-rd.js";
import { createFakeTracker, type FakeTracker } from "./fake-tracker.js";

const EXTENSION_ID = "hashway@hashway.local";
// Fixed UUID via the `extensions.webextensions.uuids` profile pref so the test
// knows the moz-extension:// base URL without scraping about:debugging.
const EXTENSION_UUID = "e2e00000-0000-4000-8000-000000000000";
const OPTIONS_URL = `moz-extension://${EXTENSION_UUID}/options.html`;

const DIST_DIR = resolve(process.cwd(), "dist");
const FIXTURE_TORRENT = resolve(process.cwd(), "tests/fixtures/torrents/single-file-v1.torrent");
const PROFILE_DIR = resolve(process.cwd(), "hashway-e2e.tmp-firefox-profile");
const SCREENSHOTS_DIR = resolve(process.cwd(), "screenshots");
const DIAGNOSTICS_DIR = resolve(process.cwd(), "diagnostics-exports");
const GECKODRIVER_LOG = resolve(process.cwd(), "geckodriver.log");

interface TestMessageResponse {
  readonly ok: boolean;
  readonly outcome?: unknown;
  readonly error?: string;
}

async function sendTestMessage(
  driver: WebDriver,
  message: Record<string, unknown>,
): Promise<TestMessageResponse> {
  const script = `
    const msg = arguments[0];
    const done = arguments[arguments.length - 1];
    try {
      browser.runtime.sendMessage(msg).then(
        (response) => done(response),
        (error) => done({ ok: false, error: String(error) })
      );
    } catch (e) {
      done({ ok: false, error: String(e) });
    }
  `;
  const result = await driver.executeAsyncScript<unknown>(script, message);
  return result as TestMessageResponse;
}

async function waitForRuntime(driver: WebDriver): Promise<void> {
  await driver.wait(
    async () => {
      const ready = await driver.executeScript<boolean>(
        "return typeof browser !== 'undefined' && typeof browser.runtime !== 'undefined';",
      );
      return ready;
    },
    30000,
    "extension options page did not expose browser.runtime",
  );
}

async function getBadgeText(driver: WebDriver): Promise<string> {
  const script = `
    const done = arguments[arguments.length - 1];
    browser.browserAction.getBadgeText({}).then(done, done);
  `;
  const value = await driver.executeAsyncScript<unknown>(script);
  return typeof value === "string" ? value : "";
}

async function captureScreenshot(driver: WebDriver | undefined): Promise<void> {
  if (driver === undefined) return;
  try {
    const png = await driver.takeScreenshot();
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    writeFileSync(join(SCREENSHOTS_DIR, "send-to-rd-failure.png"), png, "base64");
  } catch {
    // best-effort diagnostics capture must never mask the original failure
  }
}

async function captureDiagnostics(driver: WebDriver | undefined): Promise<void> {
  if (driver === undefined) return;
  try {
    const script = `
      const done = arguments[arguments.length - 1];
      browser.storage.local.get("hashway.v1.diagnostics").then(
        (data) => done(data["hashway.v1.diagnostics"] ?? []),
        () => done([])
      );
    `;
    const events = await driver.executeAsyncScript<unknown>(script);
    mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
    writeFileSync(
      join(DIAGNOSTICS_DIR, "hashway-diagnostics.json"),
      `${JSON.stringify(events, null, 2)}\n`,
    );
  } catch {
    // best-effort diagnostics capture must never mask the original failure
  }
}

describe("send-to-rd E2E", () => {
  let rd: FakeRd;
  let rdPort: number;
  let tracker: FakeTracker;
  let trackerPort: number;
  let zipDir: string;
  let failed = false;

  beforeAll(async () => {
    rd = createFakeRd();
    ({ port: rdPort } = await rd.start());
    tracker = createFakeTracker();
    ({ port: trackerPort } = await tracker.start());
    zipDir = mkdtempSync(join(process.cwd(), "hashway-e2e-"));
  });

  afterAll(async () => {
    await tracker.stop();
    await rd.stop();
    rmSync(zipDir, { recursive: true, force: true });
    if (!failed) {
      rmSync(PROFILE_DIR, { recursive: true, force: true });
      rmSync(SCREENSHOTS_DIR, { recursive: true, force: true });
      rmSync(DIAGNOSTICS_DIR, { recursive: true, force: true });
      rmSync(GECKODRIVER_LOG, { force: true });
    }
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

  it(
    "sends a magnet intent through the test trigger and reaches the fake RD",
    { retry: 2, timeout: 240000 },
    async () => {
      rd.requests.length = 0;
      rmSync(PROFILE_DIR, { recursive: true, force: true });
      mkdirSync(PROFILE_DIR, { recursive: true });

      const geckodriverPath = await downloadGeckodriver();
      const service = new ServiceBuilder(geckodriverPath);
      service.addArguments("--log", "debug");
      const geckoLog = createWriteStream(GECKODRIVER_LOG);
      service.setStdio(["ignore", geckoLog, geckoLog]);

      const options = new FirefoxOptions();
      options.addArguments("--headless");
      options.setProfile(PROFILE_DIR);
      options.setPreference("extensions.autoDisableScopes", 0);
      options.setPreference(
        "extensions.webextensions.uuids",
        JSON.stringify({ [EXTENSION_ID]: EXTENSION_UUID }),
      );

      const zip = new Zip();
      await zip.addDir(DIST_DIR);
      const extensionPath = join(zipDir, "hashway.zip");
      writeFileSync(extensionPath, await zip.toBuffer("DEFLATE"));
      options.addExtensions(extensionPath);

      let driver: WebDriver | undefined;
      try {
        driver = await new Builder()
          .forBrowser("firefox")
          .setFirefoxService(service)
          .setFirefoxOptions(options)
          .build();

        // geckodriver rejects both top-level navigation and script-initiated
        // window.open to moz-extension:// URLs (UnsupportedOperationError /
        // "Access to moz-extension from script denied"). Instead, let Firefox
        // itself load the options page as the startup homepage: this is the
        // browser's own navigation, not WebDriver's, so the restriction does not
        // apply and the extension's UUID is pinned via extensions.webextensions.uuids.
        options.setPreference("browser.startup.page", 1);
        options.setPreference("browser.startup.homepage", OPTIONS_URL);
        await driver.wait(
          async () => (await driver.getCurrentUrl()).startsWith("moz-extension://"),
          30000,
          "Firefox did not open the options page as the startup homepage",
        );
        await waitForRuntime(driver);

        const setup = await sendTestMessage(driver, {
          type: "hashway:test:setup",
          token: "e2e-token",
          rdBaseUrl: `http://127.0.0.1:${String(rdPort)}/rest/1.0`,
        });
        expect(setup.ok).toBe(true);

        const result = await sendTestMessage(driver, {
          type: "hashway:test:send",
          intent: {
            linkUrl: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=E2E",
            pageUrl: "https://t.example.com/x",
            tabTitle: "E2E",
            tabId: 0,
          },
        });
        expect(result.ok).toBe(true);
        expect(result.outcome).toMatchObject({ kind: "accepted" });

        const badgeText = await driver.wait(
          async () => getBadgeText(driver as WebDriver),
          15000,
          "browser action badge did not become the OK checkmark",
        );
        expect(badgeText).toBe("\u2713");

        const calls = rd.requests.map((r) => `${r.method} ${r.url.split("?")[0] ?? ""}`);
        expect(calls).toContain("POST /rest/1.0/torrents/addMagnet");
        expect(calls).toContain("POST /rest/1.0/torrents/selectFiles/t1");

        const logs = await driver
          .manage()
          .logs()
          .get("browser")
          .catch(() => []);
        const severe = logs.filter((l) => l.level.name === "SEVERE");
        expect(severe).toHaveLength(0);
      } catch (err) {
        failed = true;
        await captureScreenshot(driver);
        await captureDiagnostics(driver);
        throw err;
      } finally {
        await driver?.quit();
        geckoLog.end();
      }
    },
  );
});
