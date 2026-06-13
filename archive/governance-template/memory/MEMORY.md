# Memory index (template)

Durable rulings — the distilled do/don't, especially rejections. One fact per file. The moment
a directional decision is made, it lands here so the next session inherits it. (See
CONSTITUTION.md → "Capturing decisions" for the discipline.)

Each ruling is one file with frontmatter:

```markdown
---
name: <short-kebab-case-slug>
description: <one-line summary — used to decide relevance during recall>
metadata:
  type: user | feedback | project | reference
---

<the fact; for feedback/project, follow with **Why:** and **How to apply:** lines.
Link related memories with [[their-name]].>
```

- `user` — who the user is (role, expertise, preferences).
- `feedback` — guidance on how to work, with the why.
- `project` — ongoing decisions/constraints not derivable from the code or history; convert
  relative dates to absolute.
- `reference` — pointers to external resources (URLs, dashboards, datasets, verdicts).

After writing a ruling, add a one-line pointer here: `- [title](file.md) — hook`. Keep this
index to one line per memory; never put memory content here. Before saving, check for an
existing file that already covers it — update rather than duplicate; delete rulings that turn
out wrong.

## Rulings
- _(none yet — the first directional decision or rejection goes here)_
