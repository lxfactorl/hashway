import { describe, expect, it, vi } from "vitest";
import { createFirefoxContextMenu } from "@adapters/firefox/context-menu";

describe("Firefox context menu", () => {
  it("removes a stale item before registering it again", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue("hashway-send");
    vi.stubGlobal("browser", {
      contextMenus: { remove, create, onClicked: { addListener: vi.fn() } },
    });

    await createFirefoxContextMenu().register("Send to Real-Debrid");

    expect(remove).toHaveBeenCalledWith("hashway-send");
    expect(create).toHaveBeenCalledWith({
      id: "hashway-send",
      title: "Send to Real-Debrid",
      contexts: ["link"],
    });
    vi.unstubAllGlobals();
  });

  it("serializes repeated registrations", async () => {
    let releaseFirstRemove!: () => void;
    const firstRemove = new Promise<void>((resolve) => {
      releaseFirstRemove = resolve;
    });
    const remove = vi
      .fn()
      .mockImplementationOnce(() => firstRemove)
      .mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue("hashway-send");
    vi.stubGlobal("browser", {
      contextMenus: { remove, create, onClicked: { addListener: vi.fn() } },
    });
    const contextMenu = createFirefoxContextMenu();

    const first = contextMenu.register("First");
    const second = contextMenu.register("Second");

    await Promise.resolve();
    await Promise.resolve();
    expect(remove).toHaveBeenCalledOnce();
    releaseFirstRemove();
    await Promise.all([first, second]);

    expect(remove).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, {
      id: "hashway-send",
      title: "First",
      contexts: ["link"],
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      id: "hashway-send",
      title: "Second",
      contexts: ["link"],
    });
    vi.unstubAllGlobals();
  });
});
