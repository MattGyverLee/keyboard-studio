---
name: lex-README
description: Roster reference: explains who is on the LEX crew, what each agent does, when to invoke each. Read-only lookup tool.
tools: Read, Grep, Glob
model: haiku
---
# LEX Team — Code Review Crew (Global)

A code-review team of 9 personas, installed at `~/.claude/commands/lex-*.md`. Sister to the Babel server team (`/boss` and friends), but a **separate org** — see "Why not under /boss?" below.

Originally developed in the flexlibs2 v2.0.0 refactoring project (`D:\Github\_Projects\_LEX\flexlibs2\agents\`); moved here on 2026-05-20 to live globally alongside the Babel crew. `/lex-archivist` was added later to handle git/GitHub work that the original seven didn't cover.

## Roster

| Slash command | Role | Key output |
|---|---|---|
| `/lex-lead` | Planning, coordination, final approval | Approval decision with rationale |
| `/lex-programmer` | Implementation specialist | Working code that meets requirements |
| `/lex-simplify` | Post-goal refactor via Claude's `/simplify` | Simplify report + behavior-preserving diff |
| `/lex-verification` | Completeness + correctness validation | Verification report (pass/fail) |
| `/lex-qc` | Code quality + standards enforcement | QC report with quality score |
| `/lex-domain` | Domain correctness (linguistics, FLEx, LCM) | Domain expert review |
| `/lex-author` | Philosophy, style, backward compatibility | Author perspective review |
| `/lex-synthesis` | Pattern analysis, lessons learned | Synthesis report |
| `/lex-archivist` | Git/GitHub manager + historical record | Clean commits, PRs, releases, history reports |

## When to use each

- **`/lex-programmer`** — implementation tasks, bug fixes, feature development.
- **`/lex-simplify`** — *after* a goal is met and tests are green, run Claude's `/simplify` to clean up reuse/quality/efficiency issues. Hands off to `/lex-verification` to confirm nothing broke.
- **`/lex-verification`** — checking completeness, testing coverage, API compatibility.
- **`/lex-qc`** — code quality review, standards enforcement.
- **`/lex-domain`** — projects with specialized domain knowledge (linguistics for FLEx work). Customize per project.
- **`/lex-author`** — refactoring existing codebases, preserving design philosophy.
- **`/lex-synthesis`** — end of implementation phase, pattern analysis, lessons learned.
- **`/lex-archivist`** — committing, opening PRs, cutting releases, investigating git history ("when did X change?"), keeping CHANGELOG/migration guides honest.
- **`/lex-lead`** — anything requiring multi-agent coordination.

## How `/lex-lead` actually dispatches

`/lex-lead` runs as a subagent and **cannot call the `Agent` tool itself** — only the main Claude Code session can spawn subagents. So the lead doesn't dispatch the crew directly; it emits a structured `dispatch_plan` YAML block at the end of its response, and the main session parses that block and fires the `Agent` calls.

Round-trip per cycle:

1. Main session invokes `/lex-lead` with the task.
2. Lead returns a plan + `dispatch_plan` block (parallel groups run concurrently, sequential groups serialize).
3. Main session executes the plan, collects specialist reports.
4. Main session re-invokes `/lex-lead` with the reports.
5. Repeat until lead returns a response with **no** `dispatch_plan` block — that's the final approval/rejection.

Full contract is in `~/.claude/agents/lex-lead.md`; the main-session executor protocol is in `~/.claude/CLAUDE.md` under "LEX Crew Dispatch Protocol". The workflow diagrams below describe the **logical** flow; physically, every arrow into a non-lead agent goes via a `dispatch_plan` block parsed by the main session, and every arrow back to `/lex-lead` is a re-invocation carrying the prior cycle's reports.

## Workflows

`/lex-lead` orchestrates one of three flows (full detail in `lex-lead.md`):

```
Sequential (comprehensive):
  /lex-lead -> /lex-programmer -> /lex-verification -> /lex-simplify -> /lex-verification
              -> /lex-qc -> /lex-domain + /lex-author (parallel)
              -> /lex-synthesis -> /lex-lead (approval)
              -> /lex-archivist (commit + PR + docs)

Parallel review (faster):
  /lex-lead -> /lex-programmer -> /lex-verification -> /lex-simplify -> /lex-verification
              -> { /lex-qc, /lex-domain, /lex-author } in parallel
              -> /lex-synthesis -> /lex-lead -> /lex-archivist

Iterative (quality-critical):
  /lex-lead -> /lex-programmer -> /lex-qc -> fix -> /lex-qc -> ... -> approve
              -> /lex-simplify -> /lex-verification -> /lex-archivist

Archivist also operates standalone:
  /lex-archivist  (history investigations, release cuts, doc sync — no review cycle needed)

Simplify is gated by verification:
  /lex-simplify never lands its own work — it always hands off to /lex-verification
  for a second pass that confirms the refactor breaks nothing.
```

`/lex-archivist` always lands work — it's the only crew member that runs `git commit` / `gh pr create`. Other agents read and review but never touch git directly.

## Why not under `/boss`?

`/boss` (also global) runs a **Linux DevOps crew** for the Babel server (langtech.cloud): Ziva (security), Parker (users), Scotty (uptime), Data (LLM stack), Jack (logs), McGee (webmaster), etc. Their world is `docker compose`, `nginx -s reload`, fail2ban, and `/home/lee2mr/...` paths.

`/lex-lead` runs an **abstract Python code-review process** — scored review reports, backward-compatibility checks, FLEx/LCM API correctness. The two teams:

- Share no tools (`/boss` runs bash on a Linux server; `/lex-lead` reads source code and produces scored reviews)
- Share no environment (`/boss` is Linux-locked; `/lex-lead` is mostly used inside `D:\Github\_Projects\_LEX\` on this Windows box)
- Share no deliverables (operational outcomes vs. review reports)
- Share no personas (NCIS/Trek characters vs. abstract dev roles)

Keeping them parallel ‑‑ `/boss` for server work, `/lex-lead` for code review ‑‑ is cleaner than nesting one under the other. The `lex-` prefix is the namespace separator.

## Where these files come from

The 7 persona files were authored during the flexlibs2 refactoring project and tuned for Python/FLEx code review. They retain that flavor (e.g. the linguistics example in `/lex-domain`). To adapt for non-FLEx projects, see the "Customization Guide" sections inside each file.

## Customizing for a project

Each agent supports per-project customization:

1. **`/lex-domain`** — replace "linguistics" with your domain (finance, healthcare, etc.); update terminology standards; modify workflow examples.
2. **`/lex-author`** — define the project's "philosophy" (style guide, design principles, team conventions).
3. **Quality thresholds** in `/lex-lead` — adjust acceptable scores (e.g., QC >= 85/100), coverage requirements, blocking vs. non-blocking issue rules.
4. **Workflows** in `/lex-lead` — choose sequential vs. parallel vs. iterative.

## Multi-agent benefits

1. **Comprehensive coverage** — each agent brings a unique perspective.
2. **Separation of concerns** — clear responsibilities reduce overlap.
3. **Quality gating** — multiple checkpoints catch different issues.
4. **Documented process** — agent reports create an audit trail.
5. **Reusable patterns** — lessons learned documented systematically.

---

**Status:** Production-ready agent personalities
**Originally documented:** 2025-11-24 (flexlibs2 v2.0.0 refactoring)
**Moved to global commands:** 2026-05-20
