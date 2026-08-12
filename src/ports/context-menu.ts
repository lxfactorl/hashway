// src/ports/context-menu.ts
export interface LinkClickIntent {
  readonly linkUrl: string;
  readonly pageUrl: string;
  readonly tabTitle: string;
  readonly tabId: number;
}
export interface ContextMenuPort {
  register(title: string): Promise<void>;
  onClick(listener: (intent: LinkClickIntent) => void): void;
}
