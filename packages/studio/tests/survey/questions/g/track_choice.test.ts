import { describe, it, expect } from "vitest";
import { validate, fixtures, definition } from "../../../../src/survey/questions/g/track_choice.ts";

describe("track_choice — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("track_choice — validate() invalid fixtures", () => {
  for (const { value, note, expectedCode } of fixtures.invalid) {
    it(`rejects ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      const result = validate(value);
      expect(result.ok).toBe(false);
      if (expectedCode !== undefined && result.ok === false) {
        expect(result.code).toBe(expectedCode);
      }
    });
  }
});

describe("track_choice — definition shape", () => {
  it("has two options: copy and adapt", () => {
    expect(definition.options).toHaveLength(2);
    const values = (definition.options ?? []).map((o) => o.value);
    expect(values).toContain("copy");
    expect(values).toContain("adapt");
  });

  it("type is radio", () => {
    expect(definition.type).toBe("radio");
  });

  it("required is true", () => {
    expect(definition.required).toBe(true);
  });

  it("next is null (terminal question — copy-vs-adapt fork is handled by PhaseTrack.onTrackSelected, not the runner)", () => {
    // P2 fix: track_choice is terminal (next: null). The runner calls onComplete
    // immediately on Next; PhaseTrack.handleComplete extracts the answer and
    // calls onTrackSelected. The two-arm conditional was dead code (both went to
    // null) — replaced with a single terminal null.
    // Phase 2 qu-mutate-track is where this becomes a routing-live next.
    expect(definition.next).toBeNull();
  });
});

describe("track_choice — terminal routing (phase-1 invariant)", () => {
  it("the runner terminates at track_choice and delegates routing to PhaseTrack", () => {
    // The single-terminal shape ensures the runner always fires onComplete after
    // the user commits their answer — the copy/adapt branch is extracted by
    // PhaseTrack.handleComplete outside the runner's routing graph.
    expect(definition.next).toBeNull();
    expect(Array.isArray(definition.next)).toBe(false);
  });
});
