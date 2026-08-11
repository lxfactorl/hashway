// src/ports/provider.ts
import type { Outcome } from "@domain/error-taxonomy";
export interface AddMagnetRequest {
  readonly magnet: string;
}
export interface SelectFilesRequest {
  readonly id: string;
  readonly files: "all";
}
export interface ProviderPort {
  addMagnet(req: AddMagnetRequest, deadline: number): Promise<Outcome>; // never retried by caller
  selectFiles(req: SelectFilesRequest, deadline: number): Promise<Outcome>; // retried on transient
  validateToken(deadline: number): Promise<Outcome>; // GET /user
}
