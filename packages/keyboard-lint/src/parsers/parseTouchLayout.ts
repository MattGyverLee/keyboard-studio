// Parses a .keyman-touch-layout JSON file from a VirtualFS entry into a TouchLayoutIR.
// The .keyman-touch-layout format is a JSON object whose top-level keys are platform
// names ("phone", "tablet", "desktop"). Each platform has a `layer` array; each layer
// has an `id` and a `row` array; each row has a `key` array.
//
// This parser is intentionally lenient: unknown fields are ignored, missing optional
// fields default safely. It does NOT validate the layout for correctness — that is the
// job of the checks.

import type { VirtualFS } from "@keyboard-studio/contracts";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";

/** Raw shape of a single key object inside .keyman-touch-layout JSON. */
interface RawKey {
  id?: string;
  text?: string;
  hint?: string;
  output?: string;
  nextlayer?: string;
  sk?: RawKey[];
  flick?: Record<string, RawKey>;
  multitap?: RawKey[];
  // The wire format encodes sp and width as JSON strings (e.g. "sp": "1"); the IR
  // normalizes them to numbers. Accept string | number to handle both.
  sp?: string | number;
  width?: string | number;
}

interface RawRow {
  key?: RawKey[];
}

interface RawLayer {
  id?: string;
  row?: RawRow[];
}

interface RawPlatform {
  font?: string;
  layer?: RawLayer[];
}

type RawTouchLayout = Record<string, RawPlatform>;

/**
 * Returns the virtual-FS path for a keyboard's .keyman-touch-layout file.
 * Used in both parseTouchLayout() and lintContext.ts so the string is not
 * duplicated across call sites.
 */
export function touchLayoutPath(keyboardId: string): string {
  return `source/${keyboardId}.keyman-touch-layout`;
}

function parseKey(raw: RawKey, nextId: () => string): TouchKeyIR {
  const key: TouchKeyIR = {
    nodeId: nextId(),
    id: raw.id ?? "",
  };
  if (raw.text !== undefined) key.text = raw.text;
  if (raw.hint !== undefined) key.hint = raw.hint;
  if (raw.output !== undefined) key.output = raw.output;
  if (raw.nextlayer !== undefined) key.nextlayer = raw.nextlayer;

  // Coerce sp/width from the wire format (string or number) to number for the IR.
  if (raw.sp !== undefined) {
    const n = parseInt(String(raw.sp), 10);
    if (!isNaN(n)) key.sp = n;
  }
  if (raw.width !== undefined) {
    const n = parseFloat(String(raw.width));
    if (!isNaN(n)) key.width = n;
  }

  if (Array.isArray(raw.sk)) {
    key.sk = raw.sk.map((k) => parseKey(k, nextId));
  }
  if (Array.isArray(raw.multitap)) {
    key.multitap = raw.multitap.map((k) => parseKey(k, nextId));
  }
  if (raw.flick && typeof raw.flick === "object") {
    const flick: TouchKeyIR["flick"] = {};
    for (const [dir, fk] of Object.entries(raw.flick)) {
      const d = dir as "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
      flick[d] = parseKey(fk, nextId);
    }
    key.flick = flick;
  }
  return key;
}

const KNOWN_PLATFORMS = new Set(["phone", "tablet", "desktop"]);

/**
 * Parse the .keyman-touch-layout file at `source/<keyboardId>.keyman-touch-layout`
 * from the given VirtualFS. Returns `undefined` if the file is absent or unparseable.
 *
 * nodeIds are assigned from a per-call counter so output is deterministic for a given
 * input regardless of call order.
 */
export function parseTouchLayout(
  fs: VirtualFS,
  keyboardId: string
): TouchLayoutIR | undefined {
  const path = touchLayoutPath(keyboardId);
  const entry = fs.get(path);
  if (!entry) return undefined;

  let raw: RawTouchLayout;
  try {
    const text = typeof entry.content === "string"
      ? entry.content
      : new TextDecoder().decode(entry.content);
    raw = JSON.parse(text) as RawTouchLayout;
  } catch {
    return undefined;
  }

  // Per-call counter: deterministic nodeIds for a given input regardless of prior calls.
  let counter = 0;
  const nextId = () => `key-${++counter}`;

  const platforms: TouchLayoutIR["platforms"] = [];

  for (const [platformName, platformData] of Object.entries(raw)) {
    if (!KNOWN_PLATFORMS.has(platformName)) continue;
    const id = platformName as "phone" | "tablet" | "desktop";

    const layers: TouchLayoutIR["platforms"][number]["layers"] = [];
    for (const rawLayer of platformData.layer ?? []) {
      const layerId = rawLayer.id ?? "";
      const rows: Array<{ keys: TouchKeyIR[] }> = [];
      for (const rawRow of rawLayer.row ?? []) {
        const keys = (rawRow.key ?? []).map((k) => parseKey(k, nextId));
        rows.push({ keys });
      }
      layers.push({ id: layerId, rows });
    }

    const platform: TouchLayoutIR["platforms"][number] = { id, layers };
    if (platformData.font !== undefined) platform.font = platformData.font;
    platforms.push(platform);
  }

  return { platforms, nodeIds: [] };
}
