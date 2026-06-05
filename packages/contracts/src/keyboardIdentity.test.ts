// see spec.md §8 step 3 — type-coverage + factory tests for KeyboardIdentity.
// Shape-only under strict tsconfig (exactOptionalPropertyTypes), matching
// the pattern in provenance.test.ts.

import { describe, it, expect } from "vitest";
import type { KeyboardIdentity, ScriptFamily } from "./keyboardIdentity";
import { makeKeyboardIdentity } from "./keyboardIdentity";

// ---------------------------------------------------------------------------
// KeyboardIdentity interface
// ---------------------------------------------------------------------------

describe("KeyboardIdentity interface", () => {
  it("accepts the required fields for an alphabetic keyboard", () => {
    const identity: KeyboardIdentity = {
      languageName: "Bafut",
      bcp47Tag: "bfd",
      displayName: "Bafut (SIL)",
      copyrightHolder: "SIL International",
      routingGroup: "qwerty-qwertz",
    };
    expect(identity.languageName).toBe("Bafut");
    expect(identity.routingGroup).toBe("qwerty-qwertz");
    expect(identity.scriptFamily).toBeUndefined();
  });

  it("accepts scriptFamily for non-Roman keyboards", () => {
    const identity: KeyboardIdentity = {
      languageName: "Hindi",
      bcp47Tag: "hi",
      displayName: "Hindi (SIL)",
      copyrightHolder: "SIL International",
      routingGroup: "non-roman",
      scriptFamily: "indic",
    };
    expect(identity.scriptFamily).toBe("indic");
  });

  it("accepts all ScriptFamily values without type error", () => {
    const families: ScriptFamily[] = [
      "indic",
      "sea",
      "rtl",
      "syllabic",
      "logographic",
      "alpha-nonlatin",
      "other",
    ];
    families.forEach((sf) => {
      const identity: KeyboardIdentity = {
        languageName: "Test",
        bcp47Tag: "tst",
        displayName: "Test",
        copyrightHolder: "SIL International",
        routingGroup: "non-roman",
        scriptFamily: sf,
      };
      expect(identity.scriptFamily).toBe(sf);
    });
  });
});

// ---------------------------------------------------------------------------
// makeKeyboardIdentity factory
// ---------------------------------------------------------------------------

describe("makeKeyboardIdentity factory", () => {
  it("round-trips all required fields", () => {
    const init: KeyboardIdentity = {
      languageName: "Bafut",
      bcp47Tag: "bfd",
      displayName: "Bafut (SIL)",
      copyrightHolder: "SIL International",
      routingGroup: "qwerty-qwertz",
    };
    const result = makeKeyboardIdentity(init);
    expect(result).toEqual(init);
  });

  it("includes scriptFamily in output when provided", () => {
    const result = makeKeyboardIdentity({
      languageName: "Hindi",
      bcp47Tag: "hi",
      displayName: "Hindi (SIL)",
      copyrightHolder: "SIL International",
      routingGroup: "non-roman",
      scriptFamily: "indic",
    });
    expect("scriptFamily" in result).toBe(true);
    expect(result.scriptFamily).toBe("indic");
  });

  it("omits scriptFamily key entirely when absent (exactOptionalPropertyTypes)", () => {
    const result = makeKeyboardIdentity({
      languageName: "Bafut",
      bcp47Tag: "bfd",
      displayName: "Bafut (SIL)",
      copyrightHolder: "SIL International",
      routingGroup: "qwerty-qwertz",
    });
    // The key must be absent, not merely undefined — exactOptionalPropertyTypes
    expect("scriptFamily" in result).toBe(false);
  });

  it("accepts all three RoutingGroup values", () => {
    const groups = ["qwerty-qwertz", "azerty", "non-roman"] as const;
    groups.forEach((group) => {
      const result = makeKeyboardIdentity({
        languageName: "Test",
        bcp47Tag: "tst",
        displayName: "Test",
        copyrightHolder: "SIL International",
        routingGroup: group,
      });
      expect(result.routingGroup).toBe(group);
    });
  });
});
