// Tests for parallel-store deadkey rule slot expansion in irToCarveNodes.ts (issue #530).
//
// Coverage:
//   1. toRailNodes / groupToGlyphs expands one glyph per char output-store item;
//      gid === "<outputStoreNodeId>#<i>"; non-char slots (nul/beep) produce no glyph.
//   2. A simple `+ [K_A] > 'x'` rule still produces exactly one glyph with
//      gid === rule.nodeId (no `#`).
//   3. glyphsTriState: deleting one of N parallel-store glyphs yields 'partial'.

import { describe, it, expect } from 'vitest';
import type { IRRule, IRGroup, IRStore, KeyboardIR, StoreItem } from '@keyboard-studio/contracts';
import { groupToGlyphs, toRailNodes, glyphsTriState } from './irToCarveNodes.ts';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeOutputStore(nodeId: string, name: string, items: StoreItem[]): IRStore {
  return { nodeId, name, items, isSystem: false };
}

function makeInputStore(nodeId: string, name: string, chars: string[]): IRStore {
  return {
    nodeId,
    name,
    items: chars.map((c) => ({ kind: 'char' as const, value: c })),
    isSystem: false,
  };
}

function makeParallelRule(
  nodeId: string,
  dkId: number,
  inputStoreName: string,
  outputStoreName: string,
): IRRule {
  return {
    nodeId,
    context: [
      { kind: 'deadkey', id: dkId },
      { kind: 'any', storeRef: inputStoreName },
    ],
    output: [{ kind: 'index', storeRef: outputStoreName, offset: 2 }],
  };
}

function makeSimpleRule(nodeId: string, vkey: string, char: string): IRRule {
  return {
    nodeId,
    context: [{ kind: 'vkey', name: vkey, modifiers: [] }],
    output: [{ kind: 'char', value: char }],
  };
}

function makeGroup(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function makeIR(groups: IRGroup[], stores: IRStore[]): KeyboardIR {
  return {
    origin: 'imported',
    header: {
      keyboardId: 'test',
      name: 'Test',
      bcp47: [],
      copyright: '',
      version: '1.0',
      targets: [],
      storeDirectives: [],
    },
    stores,
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

// Build a parallel-store IR with:
//   output store dktX: [char 'À', char 'ε', raw(nul), raw(beep)]   (4 items; 2 char, 2 non-char)
//   input store dkfX: [char 'a', char 'b', char 'c', char 'd']
//   parallel rule: dk(003b) any(dkfX) > index(dktX, 2)
//   simple rule: + [K_A] > 'x'
function makeTestIR() {
  const outputStoreNodeId = 'store#dkt';
  const inputStoreNodeId = 'store#dkf';

  const outputItems: StoreItem[] = [
    { kind: 'char', value: 'À' },       // index 0 → gid store#dkt#0
    { kind: 'char', value: 'ε' },       // index 1 → gid store#dkt#1
    { kind: 'raw', text: 'nul' },        // index 2 → NO glyph
    { kind: 'raw', text: 'beep' },       // index 3 → NO glyph
  ];

  const outputStore = makeOutputStore(outputStoreNodeId, 'dktX', outputItems);
  const inputStore = makeInputStore(inputStoreNodeId, 'dkfX', ['a', 'b', 'c', 'd']);

  const parallelRule = makeParallelRule('rule#dk', 0x003b, 'dkfX', 'dktX');
  const simpleRule = makeSimpleRule('rule#simple', 'K_A', 'x');

  const group = makeGroup('group#main', 'main', [parallelRule, simpleRule]);
  return makeIR([group], [outputStore, inputStore]);
}

// ---------------------------------------------------------------------------
// 1. Parallel-store expansion: gid format and non-char filtering
// ---------------------------------------------------------------------------

describe('irToCarveNodes — parallel-store rule expansion', () => {
  it('groupToGlyphs produces one glyph per char output-store item with gid=<storeNodeId>#<i>', () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    // Pass only the parallel rule's group (exclude simple rule for isolation)
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };

    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);

    // Only the 2 char items produce glyphs (nul and beep are skipped)
    expect(glyphs).toHaveLength(2);

    // gid format must be "<outputStoreNodeId>#<itemsIndex>"
    expect(glyphs[0]!.gid).toBe('store#dkt#0');
    expect(glyphs[0]!.ch).toBe('À');

    expect(glyphs[1]!.gid).toBe('store#dkt#1');
    expect(glyphs[1]!.ch).toBe('ε');
  });

  it('nul/beep slots produce no glyph', () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };

    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);

    // Items at index 2 (nul) and 3 (beep) must not appear
    const gids = glyphs.map((g) => g.gid);
    expect(gids).not.toContain('store#dkt#2');
    expect(gids).not.toContain('store#dkt#3');
  });

  it('keys array includes the deadkey marker and the matched input char', () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };

    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);

    // keys[0] = deadkey marker; keys[1] = input char at same index
    expect(glyphs[0]!.keys).toEqual(['‹dk›', 'a']);
    expect(glyphs[1]!.keys).toEqual(['‹dk›', 'b']);
  });
});

// ---------------------------------------------------------------------------
// 2. Simple rule still produces one glyph with gid === rule.nodeId (no #)
// ---------------------------------------------------------------------------

describe('irToCarveNodes — simple rule gid contract', () => {
  it('simple vkey→char rule produces exactly one glyph with gid === rule.nodeId', () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const simpleOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#simple'),
    };

    const glyphs = groupToGlyphs(simpleOnlyGroup, ir);

    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.gid).toBe('rule#simple');
    expect(glyphs[0]!.ch).toBe('x');
    // gid must NOT contain `#` (it's a bare nodeId)
    expect(glyphs[0]!.gid).not.toMatch(/#\d+$/);
  });
});

// ---------------------------------------------------------------------------
// 3. glyphsTriState: partial when one of N parallel-store glyphs is deleted
// ---------------------------------------------------------------------------

describe('irToCarveNodes — glyphsTriState with parallel-store glyphs', () => {
  it("deleting one of two parallel-store glyphs yields 'partial'", () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };
    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);
    expect(glyphs).toHaveLength(2);

    // Delete only the first glyph
    const result = glyphsTriState(glyphs, (id) => id === 'store#dkt#0');
    expect(result).toBe('partial');
  });

  it("deleting all parallel-store glyphs yields 'off'", () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };
    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);

    const result = glyphsTriState(glyphs, () => true);
    expect(result).toBe('off');
  });

  it("deleting no glyphs yields 'on'", () => {
    const ir = makeTestIR();
    const group = ir.groups[0]!;
    const parallelOnlyGroup = {
      ...group,
      rules: group.rules.filter((r) => r.nodeId === 'rule#dk'),
    };
    const glyphs = groupToGlyphs(parallelOnlyGroup, ir);

    const result = glyphsTriState(glyphs, () => false);
    expect(result).toBe('on');
  });
});

// ---------------------------------------------------------------------------
// 4. toRailNodes — parallel-store group appears with per-slot glyphs
// ---------------------------------------------------------------------------

describe('irToCarveNodes — toRailNodes with parallel-store group', () => {
  it('the group node has glyphs with store#dkt#<i> gids (not bare rule.nodeId)', () => {
    const ir = makeTestIR();
    const nodes = toRailNodes(ir);

    const groupNode = nodes.find((n) => n.nodeId === 'group#main');
    expect(groupNode).toBeDefined();
    expect(groupNode!.glyphs).toBeDefined();

    const gids = groupNode!.glyphs!.map((g) => g.gid);

    // Parallel-store glyphs have #-indexed gids
    expect(gids).toContain('store#dkt#0');
    expect(gids).toContain('store#dkt#1');

    // Simple rule glyph has bare nodeId
    expect(gids).toContain('rule#simple');
  });
});
