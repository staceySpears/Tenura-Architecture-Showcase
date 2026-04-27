# Decision Index

> **Last updated:** 2026-04-23
>
> **Purpose:** One-page record of the non-obvious architectural, product, and business-model choices Tenura has made, and why. Captures the rationale that lives nowhere else — not in CHANGELOG (which records what shipped, not why we chose it over the alternative), not in ROADMAP (which describes scope, not trade-offs), not in code (which shows the answer, not the question).
>
> **Three audiences:**
> - **Future-you, six months out.** Prevents re-litigating decisions you already made deliberately.
> - **A new hire.** Ramps them on what is principled vs. incidental.
> - **An investor or partner.** Shows the architecture is deliberate, not accidental.
>
> **Format:** Each entry is a decision, not a feature. If you can answer it by reading the code, it doesn't belong here — the record exists for questions where the code only shows the *what*.
>
> **Adding entries:** When you override an automated proposal or reverse a prior direction, write it down here. When you defer something explicitly, write it down. The index prevents the same proposal from being made twice.

---

## Architecture

### 1. Agents are rule-based, not LLM-based

**Choice:** Compliance, Placement, Notification, and Platform agents are deterministic event-driven processes. No LLM in any current agent.

**Why:** Housing compliance requires legal citability and zero hallucination risk. A rule that says "lead paint disclosure required for pre-1978 buildings" must always return the same answer. An LLM can't be cited in a HUD finding.

**Cost:** No natural-language interface for caseworker Q&A; no document summarization. Both are explicitly deferred.

**Exception — Phase 9 Lease Audit Engine:** Introduces the first LLM-backed agent (`AuditAgent`). Determinism is enforced at the artifact level, not the model level: every `AuditReport` pins rule-set version + prompt version + model version + input hash. This does not dilute the rule-based principle for the other four agents.

**See:** `server/agents/*.js`; ROADMAP "Notes on Agent Design Philosophy"

---

### 2. Two independent status axes on `Lease` (`leaseStatus` + `hapStatus`)

**Choice:** `Lease` has two decoupled enums: `leaseStatus` (draft/active/terminated/expired) and `hapStatus` (not_applicable/pending/active/abated/terminated).

**Why:** Two real-world events must not cascade:
1. **HQS abatement** (unit fails inspection → PHA withholds HAP) is not a lease termination. Tenant still lives there, landlord still has obligations, the tenancy is intact.
2. **Voucher loss** (tenant loses eligibility) terminates the HAP contract but not the lease. Tenant now owes full contract rent.

Collapsing these into one field would force the code to re-derive the distinction at every read site, or to mis-terminate leases when HAP is withheld.

**Cost:** Every lease API response and UI surface must handle both axes. Slightly more complex state machine (`hapTransitions.js` is its own pure-function file).

**See:** `server/models/Lease.js`, `server/utils/hapTransitions.js`, `server/controllers/leaseController.js`

---

### 3. Application flow: `draft → documents_pending`, never `submitted`

**Choice:** New applications go `draft → documents_pending` on submit. The legacy `submitted` status still exists for backward-compat but is skipped by new flows.

**Why:** Landlord review must be gated on *document receipt*, not *form completion*. If a tenant submits an application with no photo ID, moving it straight to `submitted` / `under_review` puts it in the landlord's queue prematurely. `documents_pending` surfaces a photo-ID upload banner and blocks `NotificationAgent` from firing review emails.

**Cost:** `submitted` enum value is now legacy dead weight. Documented in `applicationTransitions.js` and kept only for pre-migration records.

**See:** `server/utils/applicationTransitions.js`, `Application.status` enum, `NotificationAgent.js` skip list

---

### 4. Append-only `paymentStructureHistory` on `Lease`

**Choice:** Every change to `activePaymentStructure` (tenantPortion + hapAmount) appends an immutable entry to `paymentStructureHistory[]` with a `reason` discriminator (`initial | abatement | termination | recertification | reinstatement`).

**Why:** Rent is a financial record subject to audit by PHAs, tenants, and IRS. The landlord (or Tenura itself) must be able to reconstruct every rent change with a reason code, at any point in the future. Overwriting `activePaymentStructure` without a history would make that reconstruction impossible.

**Cost:** Array grows unboundedly on long-lived leases; acceptable because rent changes are low-frequency (~0–3/year).

**See:** `server/models/Lease.js`

---

### 5. Immutable `ownerOfRecord` copied to `Lease` at creation

**Choice:** When a PM/agent creates a listing for someone else, `Listing.legalOwner` holds the owner's identity. At lease creation, this value is *copied* into `Lease.ownerOfRecord` — not referenced.

**Why:** The HAP contract counterparty must be fixed at signing time. If a landlord later updates the listing's legal owner (e.g., property sale, management change), the existing lease must continue to reflect the original HAP signatory. A live reference would invisibly rewrite the counterparty of active contracts.

**Cost:** Two near-identical structures in the DB. Accepted in exchange for audit-trail integrity.

**See:** `server/controllers/leaseController.js` `createLease`, `server/models/Lease.js`

---

### 6. Compliance engine jurisdiction is derived from `listing.address`, not passed in

**Choice:** `validateListing(listing)` — no jurisdiction parameter. Rules are looked up from `STATE_REGISTRY[listing.address.state]` + `CITY_REGISTRY[\`${city}_${state}\`]`.

**Why:** Avoid a catch-22 where a caller has to know which jurisdiction applies before running compliance. The address *is* the jurisdiction.

**Cost:** A listing with a malformed address silently falls back to federal-only rules. Validation must catch that upstream.

**Adding a jurisdiction:** one rule file in `server/services/compliance-engine/` + one line in the registry. No core engine changes.

**See:** `server/services/compliance-engine/jurisdictionRegistry.js`

---

## Scores and signals

### 7. Trust score and landlord merit score are computed, never stored

**Choice:** `computeTrustScore(user, profile, documents)` and `computeLandlordScore(landlord, listings, applications)` are pure functions called at request time. No DB column.

**Why:**
1. **Always current** — no stale cache to invalidate when an underlying signal changes.
2. **Ungameable via history** — you can't tamper with a column that doesn't exist.
3. **Testable in isolation** — pure functions → property-based tests → no DB fixtures needed.

**Cost:** Each profile/dashboard render pays a compute cost. Acceptable because inputs are already loaded (aggregation, not re-fetch).

**See:** `server/utils/trustScore.js`, `server/utils/landlordPerformanceScore.js`

---

### 8. Lease Health Score is per-lease, not per-tenant

**Choice:** Composite score attached to the lease relationship (payment + HQS + HAP + communication), not the tenant.

**Why:** Tenura is not in the tenant risk-scoring business. A score on the *relationship* has two owners — landlord and tenant — and is actionable by both. A score on the tenant is legally precarious (source-of-income discrimination under FHA) and adversarial in posture.

**Cost:** Harder to aggregate tenant-level analytics. We don't need them yet.

**See:** `server/utils/leaseHealthScore.js`

---

## Product and business model

### 9. Section 8 depth over feature breadth

**Choice:** Every feature proposal is filtered through: "Does this make a Section 8 landlord more likely to successfully house a voucher holder?" If no, defer.

**Why:** The competitive risk is becoming "TurboTenant plus Section 8 stuff" rather than "the Section 8 platform that also does property management basics." TurboTenant can add a Section 8 checkbox; they cannot build HAP lifecycle management without rebuilding their whole data model. Build moat before parity.

**Cost:** Tenura is explicitly not the best tool for a market-rate-only landlord. That's fine — market-rate-only landlords are not our buyer.

**See:** ROADMAP "Design Principle 4," MEMORY.md "Competitive Positioning"

---

### 10. First revenue is pass-through, not subscription

**Choice:** Background/credit check margin (Phase 6f, ~$5–10/screen) is live before Pro subscription (~$19/mo, deferred until Phase 7d). Consent was already captured on every application.

**Why:** Charging subscription before a daily engagement loop exists creates churn, not retention. A landlord who collects rent through Tenura but manages deposits elsewhere has no daily reason to return. The Managed Deposit Vault (Phase 7d) is the first feature a landlord cannot replicate with a spreadsheet or a competing free tool — until it ships, recurring fees are premature.

**Cost:** Revenue-per-user stays low until Phase 7d. Accepted in exchange for sustainable retention.

**See:** ROADMAP Phase 7f "Design principle — subscription gate," CHANGELOG screening pass-through entry

---

### 11. Progressive trust gates, informational first

**Choice:** Every trust signal (email verified, landlord verified, background check) starts as informational. Promotion to soft gate → hard gate requires explicit justification (legal or operational).

**Why:** Catch-22 gates kill development. If registration requires email verification and there's no live mail server in dev, the app cannot be tested without production secrets. The platform's early phases need to run end-to-end in a clean checkout.

**Cost:** Operators must be deliberate about when to promote a gate. Easy to leave something informational forever.

**See:** ROADMAP "Design Principle 2," Phase 3 Email Verification entry

---

## Deferrals

### 12. Phase 9 Lease Audit Engine is gated on a Chicago practitioner validation conversation

**Choice:** No audit-engine code — rule taxonomy, severity model, redline generation, refuse-to-draft list — lands before one full validation conversation with a Chicago landlord-tenant practitioner.

**Why:** A lease audit engine that encodes the wrong severity thresholds or misses a jurisdiction-specific required clause will ship incorrect advice at scale. The "boil the ocean" permission granted for Phase 7 rent billing explicitly does not extend to Phase 9. This is the largest legal-surface feature on the roadmap and the most expensive to retract.

**Cost:** Phase 9 cannot begin until the validation gate is cleared. Acceptable.

**See:** `docs/PHASE9_LEASE_AUDIT.md`, `memory/feedback_lease_audit_guardrails.md`

---

### 13. Notification persistence is prioritized over household / co-applicant model

**Choice:** In the five-item Bucket 3 queue (missing-and-worth-building-next), notification persistence is #1; household / co-applicant is #5.

**Why:** Notification persistence is additive and non-destructive — it ships in days, turns every existing workflow from "dashboard you check" into "platform that reaches you," and is the shift that most clearly justifies a Pro tier. Household model is architecturally deeper but can wait until voucher workflows expose concrete pain. Execution leverage + monetization readiness over architectural completeness.

**Cost:** Co-applicant voucher workflows remain partial until the household model lands.

**See:** `docs/PLATFORM_POSTURE.md` Bucket 3 priority order

---

### 14. MongoDB database name unchanged at Tenura rebrand

**Choice:** Product renamed Nestera → Tenura (2026-04-21) across code, UI, docs, localStorage keys, and deploy configs. The MongoDB database name (`nestera`) and the on-disk working directory (`[local working directory]`) were intentionally left unchanged.

**Why:** Data migration carries real risk (seed ordering, index rebuilds, connection string updates across environments, rollback complexity). A purely external rename avoids all of it. Users don't see the DB name.

**Cost:** Future operators may be briefly confused by the legacy name on connection strings. Low cost; documented in CHANGELOG and here.

**See:** CHANGELOG "Rebrand: Nestera → Tenura" entry

---

## Architectural Overrides

These are durable records of places where deliberate architectural judgment diverged from initial automated proposals or standard scaffolding. Future implementations should refer to these first.

| Date | Topic | Initial Proposal | Final Architectural Decision | Recorded in |
| --- | --- | --- | --- | --- |
| 2026-04-?? | Lease Audit Engine start | Begin scaffolding Phase 9 alongside Phase 7 | Stop; validation gate first | `memory/feedback_lease_audit_guardrails.md` |
| 2026-04-?? | Preview verification | Start dev server on every automated batch | Only start for browser-observable changes | `memory/feedback_preview_verification.md` |
| 2026-04-22 | Pre-pilot gate calibration | Cohort size determines pre-pilot bar | UX is always a hard gate regardless of cohort | This index (see #15) |
| 2026-04-22 | eslint-plugin-react-hooks v6 violations | Fix all 18 violations before merging #49 | Merge #49 with 5 rules disabled; fix during UX polish sweep | `client/eslint.config.js` TODO + this index |
| 2026-04-22 | Bucket 3 priority | Household / co-applicant earlier in order | Notification persistence first (leverage, not architectural order) | `docs/PLATFORM_POSTURE.md` + this index |

### 15. Pre-pilot UX polish is a hard gate regardless of cohort size

**Choice:** UX polish sweep + notification persistence + doc-sync are pre-pilot hard gates, not scaled to pilot size.

**Why (founder's reasoning):** "If I have a clunky UI/UX, that's a first impression I can't win back. So, whether that's for 17 vs 23, it doesn't matter." Cohort size controls support load, not first-impression quality.

**Initial Assumption (Overridden):** It was initially proposed that pilot cohort size (tight 17 vs. wider 23) should calibrate the pre-pilot bar — wider cohort → more gates. This conflated support capacity with first-impression risk. They are independent.

**Cost:** Pilot launch waits on polish sweep regardless of who's in it.

---

*When adding an entry: keep it ≤10 lines. If a decision needs a full page, it belongs in its own ADR file under `docs/decisions/NNNN-slug.md` and linked from this index.*
