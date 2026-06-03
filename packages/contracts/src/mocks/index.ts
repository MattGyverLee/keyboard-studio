// see spec.md section 12 — mocks barrel

// mockVirtualFS is intentionally NOT re-exported — it is an internal
// helper used by the service mocks above. Consumers should construct
// VirtualFS state via ScaffolderService, not directly.
export { mockBaseBrowser } from "./mockBaseBrowser";
export { mockPatternLibrary } from "./mockPatternLibrary";
export { mockValidator } from "./mockValidator";
export { mockCompiler } from "./mockCompiler";
export { mockScaffolder } from "./mockScaffolder";
export { mockLintEngine } from "./mockLintEngine";
export { mockOutputService } from "./mockOutputService";
