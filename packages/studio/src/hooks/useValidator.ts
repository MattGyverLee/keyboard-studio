import { useState, useEffect } from "react";
import type { LintFinding } from "@keyboard-studio/contracts";
import { runAllChecks } from "@keyboard-studio/engine";

export interface ValidatorResult {
  findings: LintFinding[];
  running: boolean;
}

export function useValidator(kmnSource: string | null): ValidatorResult {
  const [findings, setFindings] = useState<LintFinding[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (kmnSource === null) {
      setFindings([]);
      return;
    }
    setRunning(true);
    const id = setTimeout(() => {
      try {
        setFindings(runAllChecks(kmnSource));
      } catch {
        setFindings([]);
      } finally {
        setRunning(false);
      }
    }, 0);
    return () => clearTimeout(id);
  }, [kmnSource]);

  return { findings, running };
}
