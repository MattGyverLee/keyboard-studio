// AssignLoopShell.tsx — surface-parameterized chrome shared by the physical
// and touch assign-loop galleries (MechanismGallery and a future TouchGallery
// retrofit).
//
// Owns:
//   - Outer page container (flex column, full height, no overflow)
//   - Header bar (title h1 + surface label, layout controlled by flags)
//   - Two-pane row (left 45% | right flex-1) with correct overflow/scroll setup
//   - Right-pane preview gating (loading text / loadError null / preview element)
//
// Does NOT own:
//   - Any per-character state or handlers (those live in physicalBehavior.ts /
//     a future touchBehavior sibling)
//   - The left-pane body (supplied as renderLeft render-prop)
//   - The preview element (supplied as previewPane prop, built by the gallery)

import type { CSSProperties, ReactNode } from "react";
import {
  BG_PAGE, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT,
} from "../../lib/galleryTheme.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AssignLoopShellProps {
  /**
   * The heading text rendered inside the <h1> (e.g. "Mechanism Gallery").
   */
  title: string;

  /**
   * The surface label text (e.g. "Desktop", "Touch").
   * physical: rendered as a SIBLING <span> next to the <h1> (not inside it).
   * touch: rendered as a CHILD <span> inside the <h1> when
   * surfaceLabelInsideHeading is true.
   */
  surfaceLabel: string;

  /**
   * When true the surface label is rendered as a child span inside the h1.
   * When false (default) it is rendered as a sibling span after the h1.
   *
   * MechanismGallery.test.tsx asserts:
   *   getByRole("heading", { level: 1, name: /Mechanism Gallery/i })
   *   getByText(/^Desktop$/i)
   * The first passes only when "Desktop" is NOT inside the h1 (otherwise the
   * accessible name would include "Desktop"). Keep surfaceLabelInsideHeading
   * false for physical.
   */
  surfaceLabelInsideHeading?: boolean;

  /**
   * Optional description rendered below the title in the header bar.
   * Only used when surfaceLabelInsideHeading is true (touch shape).
   */
  headerDescription?: ReactNode;

  /**
   * Optional "Character N of M" counter text rendered in the header bar.
   * Only used when surfaceLabelInsideHeading is true (touch shape).
   */
  charCounter?: string;

  /**
   * Render-prop for the left pane body. The shell supplies the left pane div
   * with its scroll/overflow/border-right setup; the gallery provides the
   * inner content.
   */
  renderLeft: () => ReactNode;

  /**
   * The preview element to render in the right pane when not loading/errored.
   * The gallery constructs this (e.g. <GalleryPreviewPane .../>) so it controls
   * heading/warningLabel/defaultOskMode/onKeyTap.
   */
  previewPane: ReactNode;

  /**
   * Whether pattern loading is in progress. When true the right pane shows
   * "Loading patterns..." instead of the preview.
   */
  previewLoading: boolean;

  /**
   * Error message from pattern loading. When non-null AND not loading, the
   * right pane renders null (the loadError banner is shown in the left pane
   * by the gallery's renderLeft).
   */
  loadError: string | null;
}

// ---------------------------------------------------------------------------
// AssignLoopShell
// ---------------------------------------------------------------------------

export function AssignLoopShell({
  title,
  surfaceLabel,
  surfaceLabelInsideHeading = false,
  headerDescription,
  charCounter,
  renderLeft,
  previewPane,
  previewLoading,
  loadError,
}: AssignLoopShellProps) {
  const pageStyle: CSSProperties = {
    background: BG_PAGE,
    height: "100%",
    boxSizing: "border-box",
    fontFamily: FONT,
    color: TEXT_MAIN,
  };

  const surfaceLabelStyle: CSSProperties = {
    fontSize: 12,
    color: TEXT_DIM,
    fontFamily: FONT,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  return (
    <div
      style={{
        ...pageStyle,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          padding: "16px 24px 14px",
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        {surfaceLabelInsideHeading ? (
          // Touch shape: label is a child span inside the h1 (+ optional
          // description + counter as siblings).
          // Matches TouchGallery.tsx header verbatim (lines 1576-1628).
          <>
            <h1
              style={{
                margin: 0,
                fontSize: "1.05rem",
                fontWeight: 600,
                color: ACCENT,
                fontFamily: FONT,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {title}
              <span
                style={{
                  fontSize: 12,
                  color: TEXT_DIM,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.06em",
                  fontWeight: 400,
                }}
              >
                {surfaceLabel}
              </span>
            </h1>
            {headerDescription !== undefined && (
              <span
                style={{
                  fontSize: 13,
                  color: TEXT_DIM,
                  fontFamily: FONT,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {headerDescription}
              </span>
            )}
            {charCounter !== undefined && (
              <span
                style={{
                  fontSize: 12,
                  color: TEXT_DIM,
                  fontFamily: FONT,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {charCounter}
              </span>
            )}
          </>
        ) : (
          // Physical shape: label is a SIBLING span after the h1.
          // MechanismGallery.test.tsx asserts heading level 1 name /Mechanism Gallery/
          // and getByText(/^Desktop$/i) — both require Desktop to NOT be inside h1.
          <>
            <h1
              style={{
                margin: 0,
                fontSize: "1.05rem",
                fontWeight: 600,
                color: ACCENT,
                fontFamily: FONT,
              }}
            >
              {title}
            </h1>
            <span style={surfaceLabelStyle}>
              {surfaceLabel}
            </span>
          </>
        )}
      </div>

      {/* Two-pane row */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          overflow: "hidden",
        }}
      >
        {/* LEFT pane */}
        <div
          style={{
            flexBasis: "45%",
            flexShrink: 0,
            borderRight: `1px solid ${BORDER}`,
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          {renderLeft()}
        </div>

        {/* RIGHT pane */}
        <div
          style={{
            flexGrow: 1,
            overflowY: "auto",
            padding: "24px 20px",
            boxSizing: "border-box",
          }}
        >
          {!previewLoading && loadError === null ? (
            previewPane
          ) : previewLoading ? (
            <p style={{ color: TEXT_DIM, fontSize: 13, fontFamily: FONT }}>
              Loading patterns...
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
