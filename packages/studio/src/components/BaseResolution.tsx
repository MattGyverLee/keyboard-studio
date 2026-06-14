// Base-resolution step of the hybrid flow (spec §8 "Base resolution"). Given the
// (language, script) target from identity-lite, lists the available bases via
// BaseBrowserService, ranks them with suggestBases() (language > script >
// US-QWERTY fallback), and lets the author accept a suggestion or pick any base.
// The chosen base then back-fills the prefill confirmations. refs #369.

import { useEffect, useMemo, useState } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { getBaseBrowserService } from "../lib/services.ts";
import {
  suggestBases,
  type SuggestReason,
  type SuggestTarget,
} from "../lib/suggestBase.ts";
import { BaseKeyboardPicker } from "./BaseKeyboardPicker.tsx";

const REASON_LABEL: Record<SuggestReason, string> = {
  "language-match": "Already supports your language",
  "script-match": "Matches your script",
  "us-qwerty-fallback": "Start blank (US QWERTY)",
};

const REASON_COLOR: Record<SuggestReason, string> = {
  "language-match": "#2ea043",
  "script-match": "#6ea8fe",
  "us-qwerty-fallback": "#8b949e",
};

export interface BaseResolutionProps {
  /** The chosen (language, script) target from identity-lite. */
  target: SuggestTarget;
  onResolved: (base: BaseKeyboard) => void;
  onBack?: () => void;
}

export function BaseResolution({
  target,
  onResolved,
  onBack,
}: BaseResolutionProps) {
  const [bases, setBases] = useState<BaseKeyboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<BaseKeyboard | null>(null);
  const [kpsProbe, setKpsProbe] = useState<string>("checking…");

  useEffect(() => {
    // Probe: fetch sil_cameroon_qwerty.kps directly via the dev proxy to
    // check whether the file exists and what Language elements it contains.
    const KPS_PATH = "/local-kbd-proxy/release/sil/sil_cameroon_qwerty/source/sil_cameroon_qwerty.kps";
    fetch(KPS_PATH)
      .then(async (r) => {
        if (!r.ok) { setKpsProbe(`HTTP ${r.status} — file not found at ${KPS_PATH}`); return; }
        const text = await r.text();
        const matches = [...text.matchAll(/Language[^>]+ID="([^"]+)"/g)].map((m) => m[1] ?? "?");
        setKpsProbe(
          matches.length === 0
            ? `file found (${text.length} bytes) but NO Language ID elements matched`
            : `file found — first 5 IDs: ${matches.slice(0, 5).join(", ")} (${matches.length} total)`,
        );
      })
      .catch((e: unknown) => setKpsProbe(`fetch error: ${String(e)}`));
  }, []);

  useEffect(() => {
    let live = true;
    getBaseBrowserService()
      .listAll()
      .then(
        (kbs) => {
          if (!live) return;
          setBases(kbs);
          setLoading(false);
        },
        (err) => {
          if (!live) return;
          console.error("[BaseResolution] listAll() failed:", err);
          setError("Could not load base keyboards.");
          setLoading(false);
        },
      );
    return () => {
      live = false;
    };
  }, []);

  // Build the phonebook from the loaded bases' .languages arrays so the caller
  // need not thread a separate map. Each base's languages field (populated from
  // its .kps <Languages> block) is used as-is; bases without languages degrade
  // to script-match ranking via the empty-array default in suggestBases().
  const languagesById = useMemo(
    () =>
      Object.fromEntries(
        bases.map((b) => [b.id, b.languages ?? []] as const),
      ),
    [bases],
  );

  const suggestions = useMemo(
    () => suggestBases(bases, target, { languagesById }),
    [bases, target, languagesById],
  );

  // Debug: visible on-screen so mobile users can diagnose without a console.
  const debugInfo = useMemo(() => {
    const targetLang = target.bcp47?.split("-")[0] ?? "(none)";
    const withLangs = bases.filter((b) => (b.languages ?? []).length > 0);
    const langMatches = bases.filter((b) =>
      (languagesById[b.id] ?? []).some(
        (t) => t.split("-")[0] === targetLang,
      ),
    );
    const sample = withLangs[0];
    const camQwerty = bases.find((b) => b.id === "sil_cameroon_qwerty");
    return {
      bcp47: target.bcp47 ?? "(not set)",
      script: target.script,
      totalBases: bases.length,
      withLanguagesCount: withLangs.length,
      sampleId: sample?.id ?? "(none)",
      sampleLanguages: (sample?.languages ?? []).slice(0, 5),
      langMatchCount: langMatches.length,
      langMatchIds: langMatches.slice(0, 5).map((b) => b.id),
      sil_cameroon_qwerty_langs: (camQwerty?.languages ?? []).slice(0, 10),
    };
  }, [bases, target, languagesById]);

  const heading: React.CSSProperties = {
    margin: "0 0 8px 0",
    fontSize: "1.1rem",
    color: "#6ea8fe",
    fontWeight: 600,
  };
  const subtle: React.CSSProperties = { margin: "0 0 20px 0", fontSize: 13, color: "#8b949e" };

  if (loading) return <div style={{ color: "#8b949e" }}>Loading base keyboards…</div>;
  if (error !== null) return <div style={{ color: "#f85149" }}>{error}</div>;

  return (
    <div style={{ color: "#e6edf3", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={heading}>Choose a starting keyboard</h2>
      <p style={subtle}>
        Based on your language and chosen script, here are the closest starting
        points. Pick one, or choose another below.
      </p>

      {/* Temporary debug panel — remove once language-match is confirmed working */}
      <details style={{ marginBottom: 12, fontSize: 11, color: "#8b949e", border: "1px solid #30363d", borderRadius: 6, padding: "6px 10px" }}>
        <summary style={{ cursor: "pointer" }}>Debug info</summary>
        <pre style={{ margin: "6px 0 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{JSON.stringify(debugInfo, null, 2)}</pre>
        <p style={{ margin: "6px 0 0 0" }}>kps probe: {kpsProbe}</p>
      </details>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {suggestions.map(({ base, reason }) => (
          <button
            key={base.id}
            type="button"
            onClick={() => onResolved(base)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 8,
              color: "#e6edf3",
              fontSize: 14,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
            }}
          >
            <span>
              <strong>{base.displayName}</strong>{" "}
              <span style={{ color: "#8b949e", fontSize: 12 }}>({base.id})</span>
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: REASON_COLOR[reason],
                whiteSpace: "nowrap",
              }}
            >
              {REASON_LABEL[reason]}
            </span>
          </button>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #21262d", paddingTop: 16 }}>
        <p style={{ ...subtle, marginBottom: 8 }}>Or pick any base keyboard:</p>
        <BaseKeyboardPicker value={picked} onChange={setPicked} />
        <button
          type="button"
          disabled={picked === null}
          onClick={() => picked !== null && onResolved(picked)}
          style={{
            marginTop: 10,
            padding: "8px 18px",
            background: picked === null ? "transparent" : "#1f6feb",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: picked === null ? "#484f58" : "#fff",
            fontSize: 13,
            cursor: picked === null ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          Use this keyboard
        </button>
      </div>

      {onBack !== undefined && (
        <button
          type="button"
          onClick={onBack}
          style={{
            marginTop: 20,
            padding: "6px 14px",
            background: "transparent",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: "#8b949e",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ← Back
        </button>
      )}
    </div>
  );
}
