// src/application/export-diagnostics.ts
export function exportDiagnosticsUseCase(deps: { exportFn: () => Promise<void> }): Promise<void> {
  return deps.exportFn();
}
