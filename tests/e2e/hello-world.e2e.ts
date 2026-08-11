import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Builder } from "selenium-webdriver";
import { Options as FirefoxOptions } from "selenium-webdriver/firefox.js";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const distDir = resolve(process.cwd(), "dist");
const manifestPath = join(distDir, "manifest.json");

describe("hello-world E2E", () => {
  let tempProfile: string;

  beforeAll(() => {
    tempProfile = mkdtempSync(join(tmpdir(), "hashway-e2e-"));
  });

  afterAll(() => {
    rmSync(tempProfile, { recursive: true, force: true });
  });

  it("dist/manifest.json is Firefox MV2 with browser_action and options_ui", () => {
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      manifest_version?: number;
      browser_action?: unknown;
      options_ui?: unknown;
      browser_specific_settings?: { gecko?: { id?: string } };
    };
    expect(manifest.manifest_version).toBe(2);
    expect(manifest.browser_action).toBeDefined();
    expect(manifest.options_ui).toBeDefined();
    expect(manifest.browser_specific_settings?.gecko?.id).toBe("hashway@hashway.local");
  });

  it("loads the built extension in headless Firefox without console errors", async () => {
    const options = new FirefoxOptions();
    options.addArguments("--headless");
    options.setProfile(tempProfile);
    options.setPreference("extensions.autoDisableScopes", 0);
    options.addExtensions(distDir);
    const driver = await new Builder().forBrowser("firefox").setFirefoxOptions(options).build();
    try {
      await driver.get("about:blank");
      const logs = await driver
        .manage()
        .logs()
        .get("browser")
        .catch(() => []);
      const errors = logs.filter((l) => l.level.name === "SEVERE");
      expect(errors).toHaveLength(0);
    } finally {
      await driver.quit();
    }
  }, 60000);
});
