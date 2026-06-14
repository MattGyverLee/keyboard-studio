import { describe, it, expect } from "vitest";
import { parseKvksFontFamily } from "./parseKvksFontFamily.js";

// Representative snippet of the real sil_cameroon_azerty.kvks, inlined so the test
// is hermetic: CI checks out only keyboard-studio, not the sibling keymanapp/keyboards
// repo, so reading an absolute path into ../keyboards fails (ENOENT) in CI.
const kvksText = `<?xml version="1.0" encoding="utf-8"?>
<visualkeyboard>
  <encoding name="unicode" fontname="Andika Afr" fontsize="-12">
    <layer/>
  </encoding>
</visualkeyboard>`;

describe("parseKvksFontFamily", () => {
  it('extracts "Andika Afr" from the real sil_cameroon_azerty.kvks', () => {
    expect(parseKvksFontFamily(kvksText)).toBe("Andika Afr");
  });

  it("returns null when there is no fontname attribute", () => {
    const xml = `<encoding name="unicode" fontsize="-12"><layer/></encoding>`;
    expect(parseKvksFontFamily(xml)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseKvksFontFamily("")).toBeNull();
  });

  it("handles a fontname with spaces correctly", () => {
    const xml = `<encoding name="unicode" fontname="My Custom Font" fontsize="10">`;
    expect(parseKvksFontFamily(xml)).toBe("My Custom Font");
  });

  it("returns null when fontname attribute value is empty", () => {
    const xml = `<encoding name="unicode" fontname="" fontsize="10">`;
    expect(parseKvksFontFamily(xml)).toBeNull();
  });

  it("is case-insensitive on the encoding tag name", () => {
    // The regex uses /i; upper-case ENCODING should still match.
    const xml = `<ENCODING name="unicode" fontname="Arial" fontsize="12">`;
    expect(parseKvksFontFamily(xml)).toBe("Arial");
  });
});
