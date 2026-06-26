// Developer "Flow Map" tab — a live, auto-generated map of the survey's
// questions, their branching, and the strategy decision tree.
//
// Three sections, all derived from source (no hand-maintained diagram):
//   • Survey flow   — one graph per phase, loaded through the same loaders the
//                     survey runner uses (parseFlow for identity_lite full YAML;
//                     loadModularFlow for the .modular.yaml thin descriptors that
//                     pull question definitions — including routing — from .ts modules).
//   • Script routing — §9 target-script → qwerty-qwertz / non-roman / azerty.
//   • Strategy tree  — §7.2 decision tree, from the engine's exported rule tables.
//
// Rebuilding the studio after editing a question module or a selector rule
// updates this map automatically.

import { useMemo, useState, type ReactNode } from "react";

// identity_lite is a full YAML flow — loaded with parseFlow.
import identityLiteRaw from "../../../../content/flows/identity_lite.yaml?raw";
// A/B/F are modular — thin YAML + .ts question modules via loadModularFlow.
import phaseAModularRaw from "../../../../content/flows/phase_a_identity.modular.yaml?raw";
import phaseBModularRaw from "../../../../content/flows/phase_b_characters.modular.yaml?raw";
import phaseFModularRaw from "../../../../content/flows/phase_f_helpdocs.modular.yaml?raw";

import { parseFlow } from "../survey/loadFlow.ts";
import { loadModularFlow } from "../survey/loadModularFlow.ts";
import type { FlowDef } from "../survey/types.ts";
import { buildFlowGraph } from "./buildFlowGraph.ts";
import { FlowGraphView } from "./FlowGraphView.tsx";
import { StrategyTreeView } from "./StrategyTreeView.tsx";
import { ScriptRoutingView } from "./ScriptRoutingView.tsx";
import { MONO, SANS } from "./tokens.ts";

type Section = "flow" | "routing" | "strategy";

const FLOW_SOURCES: ReadonlyArray<{ raw: string; loader: (r: string) => FlowDef; title: string }> = [
  { raw: identityLiteRaw,   loader: parseFlow,        title: "Identity-lite (Phase A head)" },
  { raw: phaseAModularRaw,  loader: loadModularFlow,  title: "Phase A — posture notice" },
  { raw: phaseBModularRaw,  loader: loadModularFlow,  title: "Phase B — character discovery" },
  { raw: phaseFModularRaw,  loader: loadModularFlow,  title: "Phase F — help docs" },
];

function safeBuild(raw: string, loader: (r: string) => FlowDef, title: string) {
  try {
    return { graph: buildFlowGraph(loader(raw), title), error: null as string | null };
  } catch (err) {
    return { graph: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function LegendItem({ swatch, border, dashed, label }: { swatch: string; border: string; dashed?: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#adbac7" }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          background: swatch,
          border: `1.5px ${dashed ? "dashed" : "solid"} ${border}`,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

function EdgeLegendItem({ color, dashed, label }: { color: string; dashed?: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#adbac7" }}>
      <svg width="26" height="10" style={{ flexShrink: 0 }}>
        <line x1="0" y1="5" x2="26" y2="5" stroke={color} strokeWidth="1.5" strokeDasharray={dashed ? "4 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}

function FlowLegend() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        padding: "10px 14px",
        background: "#0b0f14",
        border: "1px solid #21262d",
        borderRadius: 8,
        marginBottom: 16,
      }}
    >
      <LegendItem swatch="#11203a" border="#6ea8fe" label="entry" />
      <LegendItem swatch="#241c10" border="#d29922" label="gate (conditional next)" />
      <LegendItem swatch="#14181f" border="#6e7681" dashed label="engine-resolved (not shown)" />
      <LegendItem swatch="#0f2417" border="#3fb950" label="terminal" />
      <span style={{ width: 1, alignSelf: "stretch", background: "#21262d" }} />
      <EdgeLegendItem color="#d29922" label="conditional branch" />
      <EdgeLegendItem color="#6e7681" dashed label="default (else)" />
      <EdgeLegendItem color="#4d5b7c" label="linear next" />
    </div>
  );
}

function SectionTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 16px",
        fontSize: 13,
        fontFamily: SANS,
        cursor: "pointer",
        background: active ? "rgba(110,168,254,0.14)" : "transparent",
        color: active ? "#6ea8fe" : "#adbac7",
        border: "1px solid",
        borderColor: active ? "#1f6feb" : "#30363d",
        borderRadius: 6,
      }}
    >
      {children}
    </button>
  );
}

export function FlowMapView() {
  const [section, setSection] = useState<Section>("flow");
  const flows = useMemo(() => FLOW_SOURCES.map((f) => ({ ...safeBuild(f.raw, f.loader, f.title), title: f.title })), []);

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        overflowX: "auto",
        padding: 24,
        boxSizing: "border-box",
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: SANS,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 20, color: "#e6edf3" }}>Flow Map</h1>
        <span style={{ fontSize: 12.5, color: "#6e7681" }}>
          developer view · auto-generated from <code style={{ fontFamily: MONO }}>survey/questions/**/*.ts</code> +{" "}
          <code style={{ fontFamily: MONO }}>strategy-selector</code>
        </span>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#8b949e", maxWidth: 920 }}>
        A live map of the survey questions, where each branch goes, and the strategy decision tree. It rebuilds
        from source — change a flow's question order or a selector rule, rebuild, and this updates.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <SectionTab active={section === "flow"} onClick={() => setSection("flow")}>
          Survey flow
        </SectionTab>
        <SectionTab active={section === "routing"} onClick={() => setSection("routing")}>
          Script routing (§9)
        </SectionTab>
        <SectionTab active={section === "strategy"} onClick={() => setSection("strategy")}>
          Strategy tree (§7.2)
        </SectionTab>
      </div>

      {section === "flow" && (
        <>
          <FlowLegend />
          {flows.map(({ graph, error, title }) => (
            <section key={title} style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 15, color: "#6ea8fe" }}>{title}</h2>
                {graph !== null && (
                  <span style={{ fontSize: 11.5, color: "#6e7681", fontFamily: MONO }}>
                    {graph.flowId} · {graph.nodes.length} questions · {graph.edges.length} edges
                  </span>
                )}
              </div>
              {error !== null && (
                <div style={{ color: "#ff9492", fontFamily: MONO, fontSize: 12, padding: 12, border: "1px solid #763a3a", borderRadius: 6 }}>
                  Failed to parse: {error}
                </div>
              )}
              {graph !== null && graph.danglingTargets.length > 0 && (
                <div
                  style={{
                    color: "#e3b341",
                    fontFamily: MONO,
                    fontSize: 12,
                    padding: "8px 12px",
                    marginBottom: 8,
                    border: "1px solid #9e6a03",
                    borderRadius: 6,
                    background: "#241c10",
                  }}
                >
                  Dangling goto target(s): {graph.danglingTargets.join(", ")}
                </div>
              )}
              {graph !== null && <FlowGraphView graph={graph} />}
            </section>
          ))}
        </>
      )}

      {section === "routing" && <ScriptRoutingView identityLiteRaw={identityLiteRaw} />}

      {section === "strategy" && <StrategyTreeView />}
    </div>
  );
}
