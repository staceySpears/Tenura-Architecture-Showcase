# Tenura — Architecture Showcase

This repository is a curated selection of code, documentation, and operational
artifacts from **Tenura**, a full-stack MERN application that connects
voucher holders and income-qualified renters with landlords accepting government
housing assistance programs (HCV/Section 8, LIHTC, income-restricted units).

It is intended to demonstrate code quality, architectural discipline, and
documentation practices — not to expose the full application.

---

## What Is in This Showcase

| Folder | What it demonstrates |
|---|---|
| [`architecture/decisions.md`](./architecture/decisions.md) | Architecture Decision Records: non-obvious choices, trade-offs, and deliberate deferrals |
| [`compliance-engine/`](./compliance-engine/) | Modular, jurisdiction-aware compliance service (HUD, RLTO, lead paint) |
| [`agents/ComplianceAgent.js`](./agents/ComplianceAgent.js) | Deterministic rule-based agent that runs compliance checks and persists a full audit log |
| [`tests/ComplianceAgent.test.js`](./tests/ComplianceAgent.test.js) | Integration tests covering pass, fail, warning, and jurisdiction-isolation scenarios |
| [`runbooks/INDEX.md`](./runbooks/INDEX.md) | Operational runbooks for known failure modes, written for a single operator |
| [`mission.md`](./mission.md) | Revenue pledge and product north star |

---

## Application Stack (Full Project)

- **Backend:** Node.js + Express.js, MongoDB + Mongoose
- **Frontend:** React 19 + Vite
- **Auth:** JWT + bcryptjs
- **Real-time:** Socket.io
- **File Storage:** Cloudinary
- **Email:** Nodemailer
- **Testing:** Jest + Supertest + mongodb-memory-server (33+ test files)
- **Deployment:** Render (API) + Vercel (client)

---

## Architecture Highlights

### Compliance Engine

Federal housing regulations (HUD Section 8, lead paint) and local ordinances
(Chicago RLTO) change independently of the UI. The compliance engine is a
standalone service with no UI coupling — rule files are isolated modules, the
jurisdiction registry maps address → applicable rules automatically, and a
semver `COMPLIANCE_RULE_VERSION` is stamped on every audit record so results
are reproducible months later.

Adding a new jurisdiction requires one rule file and one line in the registry.
No changes to the engine core.

### Agent Architecture

Four deterministic agents (Compliance, Placement, Notification, Platform) run
as async post-hooks on resource events. They are rule-based, never LLM-backed,
because housing compliance requires legal citability and zero hallucination
risk. Every agent run is persisted to `AgentState` with a full `actionLog` for
observability.

### Scoring Without Storage

Trust scores and landlord merit scores are pure functions computed at request
time — no DB column. This keeps scores always current, eliminates cache
invalidation, and makes the functions independently testable without fixtures.

### Two-Axis Lease State

`Lease` carries two independent status enums: `leaseStatus` and `hapStatus`.
HQS abatement (PHA withholds HAP) is not a lease termination. Voucher loss
terminates the HAP contract but not the tenancy. Collapsing these into one
field would force incorrect cascades; separating them reflects how housing law
actually works.

---

## Testing Approach

Unit tests cover pure-function utilities (trust score, compliance rules, state
machines) in complete isolation. Integration tests use Supertest + an
in-memory MongoDB instance to fire real HTTP requests against the full
request-response cycle — auth middleware, validation, database write, response
format — from a deterministic starting state on every run.

---

## Development Philosophy

The Architecture Decision Records capture not just what was built but why
alternatives were rejected. Decisions that involve legal surface area (lease
audit engine, rent reasonableness) are explicitly gated on practitioner
validation before code is written. The ADR index also records the two or three
places where the founder's judgment overrode a proposed direction — those
overrides are as important as the decisions themselves.
