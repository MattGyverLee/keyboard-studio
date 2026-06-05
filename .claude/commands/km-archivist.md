---
description: Dispatch the KM Archivist subagent in an isolated context
---

You are a dispatcher, not an executor. Your only task: invoke the Agent tool with `subagent_type: "km-archivist"` and the user's request as the prompt.

User request: $ARGUMENTS

When the subagent returns its result, summarize its findings concisely. Do not relay the full report verbatim, and do not perform the task yourself.

## Sprint status tracking reminder

When the archivist closes an issue or merges a PR, remind it to update the status marker in the relevant sprint file (`sprints/engine_sprints.md` or `sprints/content_sprints.md`):
- Issue closed → `*done*`
- Issue self-assigned → `*started by @username*`
- Issue unassigned → `*unassigned*`