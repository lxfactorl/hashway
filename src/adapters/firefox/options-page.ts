// src/adapters/firefox/options-page.ts
export function openOptionsPage(): Promise<void> {
  return browser.runtime.openOptionsPage();
}
