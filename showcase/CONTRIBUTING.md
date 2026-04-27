# Keeping This Showcase Current

This repo is manually curated — it does not auto-sync with the main application.
The value is editorial judgment: which decisions matter, which patterns are worth
explaining, what a reader would need to understand the architecture.

Update it when any of the following happens in the Tenura codebase.

---

## Trigger Checklist

Run through this after any meaningful change to the main app:

- [ ] Made a non-obvious architectural decision → add an ADR
- [ ] Changed how a compliance rule works → update `compliance-engine/`
- [ ] Added or changed agent behavior → update `agents/`
- [ ] Discovered a new failure mode with a known fix → add a runbook
- [ ] Changed a data model in a way that reflects a trade-off → update `architecture/decisions.md`
- [ ] Wrote a test pattern worth highlighting → update `tests/`

A change belongs here if you could explain it in an interview or to a new
collaborator without needing to show them the full application first.

---

## Adding a New ADR

```bash
./scripts/new-adr.sh "your-decision-slug"
```

Creates a pre-filled template at `showcase/architecture/YYYY-MM-DD-your-decision-slug.md`.
Fill in Context, Decision, and Consequences — then commit.

**Rule of thumb:** if you had to choose between two approaches and the code
only shows which one you picked, write an ADR. The code shows the answer;
the ADR shows the question.

---

## What Does Not Belong Here

- Bug fixes with no architectural implication
- Dependency bumps
- UI copy or style changes
- Anything that requires walking through the full application to understand
