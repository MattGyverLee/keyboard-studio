// see spec.md section 4 / section 8 step 11 — CompilerService mock

import type { CompilerService } from "../compiler";
import type { VirtualFS } from "../virtualFS";
import type { CompileResult } from "../compileResult";
import { mixedDiagnosticsResult } from "../fixtures/index";

/**
 * In-memory mock of {@link CompilerService}.
 * Returns fixture data without invoking the real implementation.
 * @see spec.md §4 / §8 step 11
 */
export const mockCompiler: CompilerService = {
  compile(_fs: VirtualFS, _keyboardId: string): Promise<CompileResult> {
    // Returns the mixed-diagnostics fixture regardless of input.
    // A real implementation would read _fs and invoke the WASM binary.
    return Promise.resolve({ ...mixedDiagnosticsResult });
  },
};
