// src/entrypoints/options/main.ts
import { clearCredentials, saveCredentials } from "@application/credentials";
import { testToken } from "@application/test-token";
import { createFirefoxDownloads } from "@adapters/firefox/downloads";
import { createFirefoxNotifications } from "@adapters/firefox/notifications";
import { createFirefoxStorage } from "@adapters/firefox/storage";
import { createRingBuffer } from "@adapters/diagnostics/ring-buffer";
import { exportDiagnostics } from "@adapters/diagnostics/export";
import { createRealDebridClient } from "@adapters/real-debrid/client";
import { createVersionedStorage } from "@adapters/storage/versioned-storage";
import type { Outcome } from "@domain/error-taxonomy";

const storage = createVersionedStorage(createFirefoxStorage());
const notifications = createFirefoxNotifications();
const provider = createRealDebridClient({
  fetchFn: globalThis.fetch.bind(globalThis),
  getToken: () => storage.getToken(),
});
const downloads = createFirefoxDownloads();
const ringBuffer = createRingBuffer(storage, 4 * 1024 * 1024);

const tokenInput = elementById("token") as HTMLInputElement;
const diagnosticsArea = elementById("diagnostics") as HTMLTextAreaElement;
const statusLine = elementById("status");
const form = elementById("options-form") as HTMLFormElement;
const saveButton = elementById("save") as HTMLButtonElement;
const clearButton = elementById("clear") as HTMLButtonElement;
const testButton = elementById("test") as HTMLButtonElement;
const downloadButton = elementById("download-diagnostics") as HTMLButtonElement;

function elementById(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`Missing options page element: #${id}`);
  }
  return el;
}

function setStatus(message: string): void {
  statusLine.textContent = message;
}

function outcomeMessage(outcome: Outcome, acceptedText: string): string {
  return outcome.kind === "accepted" ? acceptedText : outcome.message;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function load(): Promise<void> {
  try {
    const token = await storage.getToken();
    tokenInput.value = token ?? "";
    const events = await storage.getDiagnostics();
    diagnosticsArea.value = JSON.stringify(events, null, 2);
  } catch (e) {
    setStatus(errorMessage(e));
  }
}

async function handleSave(): Promise<void> {
  try {
    const out = await saveCredentials({ storage, notifications })(tokenInput.value);
    setStatus(outcomeMessage(out, "Token saved"));
    if (out.kind === "accepted") {
      tokenInput.value = "";
    }
  } catch (e) {
    setStatus(errorMessage(e));
  }
}

async function handleClear(): Promise<void> {
  try {
    const out = await clearCredentials({ storage, notifications })();
    setStatus(outcomeMessage(out, "Token cleared"));
  } catch (e) {
    setStatus(errorMessage(e));
  }
}

async function handleTest(): Promise<void> {
  try {
    const out = await testToken({ provider, notifications });
    setStatus(outcomeMessage(out, "Token OK"));
  } catch (e) {
    setStatus(errorMessage(e));
  }
}

async function handleDownload(): Promise<void> {
  try {
    await exportDiagnostics(downloads, ringBuffer);
    setStatus("Diagnostics downloaded");
  } catch (e) {
    setStatus(errorMessage(e));
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
});
saveButton.addEventListener("click", () => void handleSave());
clearButton.addEventListener("click", () => void handleClear());
testButton.addEventListener("click", () => void handleTest());
downloadButton.addEventListener("click", () => void handleDownload());

void load();
