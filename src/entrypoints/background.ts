export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.browserAction.setBadgeText({ text: "ON" });
    browser.browserAction.setBadgeBackgroundColor({ color: "#0a0" });
  });
});
