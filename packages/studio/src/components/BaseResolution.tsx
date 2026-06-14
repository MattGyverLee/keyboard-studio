// Base-resolution step of the hybrid flow (spec §8 "Base resolution"). Given the
// (language, script) target from identity-lite, lists the available bases via
// BaseBrowserService, ranks them with suggestBases() (language > script >
// US-QWERTY fallback), and lets the author accept a suggestion or pick any base.
// The chosen base then back-fills the prefill confirmations. refs #369.
//
// Language data for dev-mode bases (served by the local Vite plugin) is sparse
// in the catalog response. This component therefore fetches each base's .kps
// file directly via the /local-kbd-proxy path and parses Language IDs client-
// side — the same approach that is guaranteed to work regardless of whether the
// Vite plugin's catalog cache was warm when the server started.

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
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

const KPS_LANG_RE = /Language[^>]+ID="([^"]+)"/g;

async function fetchKpsLanguages(base: BaseKeyboard): Promise<[string, string[]]> {
  const url = `/local-kbd-proxy/${base.path}/source/${base.id}.kps`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [base.id, []];
    const text = await res.text();
    const ids: string[] = [];
    const re = new RegExp(KPS_LANG_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[1] !== undefined && m[1].length > 0) ids.push(m[1]);
    }
    return [base.id, ids];
  } catch {
    return [base.id, []];
  }
}

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
  const [proxyLangs, setProxyLangs] = useState<Record<string, string[]>>({});

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

  // Fetch .kps language data via the dev proxy for bases that have no languages
  // populated by the catalog. In production the catalog already carries this data
  // (populated by the GitHub API path); fetches fail gracefully with empty arrays.
  useEffect(() => {
    if (bases.length === 0) return;
    let live = true;
    const needFetch = bases.filter((b) => (b.languages ?? []).length === 0);
    if (needFetch.length === 0) return;
    Promise.allSettled(needFetch.map(fetchKpsLanguages)).then((results) => {
      if (!live) return;
      const map: Record<string, string[]> = {};
      for (const r of results) {
        if (r.status === "fulfilled" && r.value[1].length > 0) {
          map[r.value[0]] = r.value[1];
        }
      }
      setProxyLangs(map);
    });
    return () => {
      live = false;
    };
  }, [bases]);

  const languagesById = useMemo(
    () => ({
      ...Object.fromEntries(bases.map((b) => [b.id, b.languages ?? []] as const)),
      ...proxyLangs,
    }),
    [bases, proxyLangs],
  );

  const suggestions = useMemo(
    () => suggestBases(bases, target, { languagesById }),
    [bases, target, languagesById],
  );

  const heading: CSSProperties = {
    margin: "0 0 8px 0",
    fontSize: "1.1rem",
    color: "#6ea8fe",
    fontWeight: 600,
  };
  const subtle: CSSProperties = { margin: "0 0 20px 0", fontSize: 13, color: "#8b949e" };

  if (loading) return <div style={{ color: "#8b949e" }}>Loading base keyboards…</div>;
  if (error !== null) return <div style={{ color: "#f85149" }}>{error}</div>;

  return (
    <div style={{ color: "#e6edf3", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={heading}>Choose a starting keyboard</h2>
      <p style={subtle}>
        Based on your language and chosen script, here are the closest starting
        points. Pick one, or choose another below.
      </p>

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
