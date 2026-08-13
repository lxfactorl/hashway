export interface RuntimeEvent {
  addListener(listener: () => void): void;
}

export interface RuntimeLifecycle {
  onInstalled: RuntimeEvent;
  onStartup: RuntimeEvent;
}

export function registerExtensionLifecycle(
  runtime: RuntimeLifecycle,
  initialize: () => void,
): void {
  runtime.onInstalled.addListener(initialize);
  runtime.onStartup.addListener(initialize);
  initialize();
}
