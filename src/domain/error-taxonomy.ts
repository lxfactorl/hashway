// src/domain/error-taxonomy.ts
export type ErrorKind =
  | "user_input"
  | "configuration"
  | "tracker_auth"
  | "provider_auth"
  | "provider_permanent"
  | "provider_transient"
  | "unknown_outcome"
  | "internal";

export type Outcome =
  | { readonly kind: "accepted"; readonly id: string }
  | { readonly kind: "already_active"; readonly message: string }
  | { readonly kind: "failed"; readonly error: ErrorKind; readonly message: string }
  | { readonly kind: "unknown_outcome"; readonly message: string };

export const accepted = (v: { readonly id: string }): Outcome => ({ kind: "accepted", id: v.id });
export const alreadyActive = (message: string): Outcome => ({ kind: "already_active", message });
export const failed = (error: ErrorKind, message: string): Outcome => ({
  kind: "failed",
  error,
  message,
});
export const unknown = (message: string): Outcome => ({ kind: "unknown_outcome", message });

export function isFinal(_o: Outcome): boolean {
  void _o;
  return true; // every Outcome variant is a terminal result for an action
}
