// Two-pane shell skeleton. Left pane will host the survey (#48 et al.);
// right pane will host the live preview (#39). For #22 both panes render
// placeholders so the dev server boots end-to-end and the layout is
// reviewable before #39 fills the preview side.

export function StudioShell() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(360px, 1fr) minmax(420px, 1fr)",
        height: "100vh",
        width: "100vw",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#e6edf3",
        background: "#0d1117",
      }}
    >
      <section
        aria-label="Survey pane"
        style={{
          borderRight: "1px solid #283040",
          padding: "24px",
          overflow: "auto",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.4rem" }}>Keyboard Studio</h1>
        <p style={{ color: "#9aa7b8", marginTop: "8px" }}>
          Survey pane — placeholder. The survey flow lands in #48 / #49 / #51.
        </p>
      </section>

      <section
        aria-label="Preview pane"
        style={{
          padding: "24px",
          overflow: "auto",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe" }}>
          Live preview
        </h2>
        <p style={{ color: "#9aa7b8", marginTop: "8px" }}>
          Preview pane — placeholder. KeymanWeb iframe + OSK lands in #39 after
          CompilerService.compile() (#17) is wired.
        </p>
      </section>
    </div>
  );
}
