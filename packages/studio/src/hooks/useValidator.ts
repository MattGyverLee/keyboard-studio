import { useState, useEffect } from "react";
import type { LintFinding } from "@keyboard-studio/contracts";
import { validateWithOracle } from "@keyboard-studio/engine";
import { useDebounce, DEBOUNCE_MS } from "./useDebounce.ts";

export interface ValidatorResult {
  findings: LintFinding[];
  running: boolean;
}

// We call validateWithOracle (not the synchronous runAllChecks) so the SPA
// runs the WASM-only Layer-A checks AND surfaces KM_WARN_ORACLE_UNAVAILABLE
// when the oracle is down — otherwise WASM-down degradation is silent (#494).
// validateWithOracle runs the TS + WASM tasks concurrently within one cycle;
// the single 300 ms timer is supplied by useDebounce below — we add no second
// timer, per Decision D3 / spec §10.
export function useValidator(kmnSource: string | null): ValidatorResult {
  const [findings, setFindings] = useState<LintFinding[]>([]);
  const [running, setRunning] = useState(false);

  const debouncedSource = useDebounce(kmnSource, DEBOUNCE_MS);

  useEffect(() => {
    if (debouncedSource === null) {
      setFindings([]);
      setRunning(false);
      return;
    }
    // Stale-guard: a newer debounced source must win even if its async
    // validation resolves before an in-flight older one. Flip on cleanup.
    let cancelled = false;
    setRunning(true);
    validateWithOracle(debouncedSource)
      .then((next) => {
        if (cancelled) return;
        setFindings(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("[useValidator] validateWithOracle threw:", err);
        setFindings([]);
      })
      .finally(() => {
        if (cancelled) return;
        setRunning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSource]);

  return { findings, running };
}
