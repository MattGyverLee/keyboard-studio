import { describe, it, expect } from "vitest";
import { checkInventoryCoverage } from "./check-18-6-inventory-coverage.js";
import type { KeyboardIR, LinguistInventory, IRGroup, IRStore } from "@keyboard-studio/contracts";

const KMN_PATH = "source/test.kmn";

function makeScaffoldedIR(groups: IRGroup[], stores: IRStore[] = []): KeyboardIR {
  return {
    origin: "scaffolded",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "1.0",
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

function makeInventory(chars: string[]): LinguistInventory {
  return {
    language: "test",
    script: "Latin",
    alphabetCore: { lowercase: chars, uppercase: [] },
    mandatoryDiacriticsAndLigatures: [],
    languageSpecificPunctuation: [],
    numerals: [],
  };
}

describe("checkInventoryCoverage (18.6 KM_LINT_INVENTORY_UNCOVERED)", () => {
  it("passes when all inventory chars are covered by char output rules", () => {
    const ir = makeScaffoldedIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r1",
            context: [],
            output: [{ kind: "char", value: "a" }],
          },
          {
            nodeId: "r2",
            context: [],
            output: [{ kind: "char", value: "b" }],
          },
        ],
      },
    ]);
    const inv = makeInventory(["a", "b"]);
    expect(checkInventoryCoverage(ir, inv, KMN_PATH)).toEqual([]);
  });

  it("passes when all inventory chars are covered via outs() store expansion", () => {
    const ir = makeScaffoldedIR(
      [
        {
          nodeId: "g1",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [
            {
              nodeId: "r1",
              context: [],
              output: [{ kind: "outs", storeRef: "vowels" }],
            },
          ],
        },
      ],
      [
        {
          nodeId: "s1",
          name: "vowels",
          isSystem: false,
          items: [
            { kind: "char", value: "a" },
            { kind: "char", value: "e" },
          ],
        },
      ]
    );
    const inv = makeInventory(["a", "e"]);
    expect(checkInventoryCoverage(ir, inv, KMN_PATH)).toEqual([]);
  });

  it("returns [] for imported keyboards (scope guard)", () => {
    const ir = makeScaffoldedIR([]);
    ir.origin = "imported";
    const inv = makeInventory(["a"]);
    expect(checkInventoryCoverage(ir, inv, KMN_PATH)).toEqual([]);
  });

  it("returns [] when raw fragments are present (scope guard)", () => {
    const ir = makeScaffoldedIR([]);
    ir.raw = [
      { nodeId: "raw1", origin: "imported", sourceText: "c('a')", reason: "outs()" },
    ];
    const inv = makeInventory(["a"]);
    expect(checkInventoryCoverage(ir, inv, KMN_PATH)).toEqual([]);
  });

  it("warns for each inventory char not covered", () => {
    const ir = makeScaffoldedIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r1",
            context: [],
            output: [{ kind: "char", value: "a" }],
          },
        ],
      },
    ]);
    const inv = makeInventory(["a", "b", "c"]);
    const findings = checkInventoryCoverage(ir, inv, KMN_PATH);
    expect(findings).toHaveLength(2);
    const codes = findings.map((f) => f.code);
    expect(codes).toEqual(["KM_LINT_INVENTORY_UNCOVERED", "KM_LINT_INVENTORY_UNCOVERED"]);
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.layer).toBe("C");
  });

  it("includes the missing char in the message", () => {
    const ir = makeScaffoldedIR([]);
    const inv = makeInventory(["z"]);
    const findings = checkInventoryCoverage(ir, inv, KMN_PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("z");
  });

  it("hint mentions static analysis limitation", () => {
    const ir = makeScaffoldedIR([]);
    const inv = makeInventory(["z"]);
    const findings = checkInventoryCoverage(ir, inv, KMN_PATH);
    expect(findings[0]?.hint).toContain("static analysis");
  });

  it("sets location.file to the kmn path", () => {
    const ir = makeScaffoldedIR([]);
    const inv = makeInventory(["z"]);
    const findings = checkInventoryCoverage(ir, inv, KMN_PATH);
    expect(findings[0]?.location?.file).toBe(KMN_PATH);
  });
});
