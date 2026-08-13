import { describe, expect, it, vi } from "vitest";
import { registerExtensionLifecycle } from "@application/extension-lifecycle";

interface RuntimeEvent {
  addListener(listener: () => void): void;
}

describe("extension lifecycle", () => {
  it("initializes on load and on lifecycle events", () => {
    let installedListener: (() => void) | undefined;
    let startupListener: (() => void) | undefined;
    const runtime = {
      onInstalled: {
        addListener(listener: () => void) {
          installedListener = listener;
        },
      } satisfies RuntimeEvent,
      onStartup: {
        addListener(listener: () => void) {
          startupListener = listener;
        },
      } satisfies RuntimeEvent,
    };
    const initialize = vi.fn();

    registerExtensionLifecycle(runtime, initialize);
    expect(initialize).toHaveBeenCalledOnce();

    startupListener?.();
    installedListener?.();

    expect(initialize).toHaveBeenCalledTimes(3);
  });
});
