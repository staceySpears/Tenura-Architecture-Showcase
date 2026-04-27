# Runbooks

> **Last updated:** 2026-04-23
>
> **Purpose:** If something goes wrong tomorrow, these are the playbooks for what to do first. Each runbook is written for a single operator with access to Render, MongoDB Atlas, Cloudinary, the Stripe dashboard (when Phase 7c Stripe integration lands), and the codebase.
>
> **When to use:** When a user-reported symptom arrives, or when automated alerts fire (Phase 8 — not yet built). Do not improvise; use the runbook. Record what happened in the [incident log](./incidents/) (create on first use).

---

## Index

| Runbook | Symptom | Typical blast radius |
|---|---|---|
| [Cloudinary upload failure](./cloudinary-failure.md) | Landlord can't add photos to listing; tenant can't upload documents | One upload attempt at a time; fail-open (no data corruption) |
| [Email delivery failure](./email-failure.md) | Password resets not arriving; status-change notifications missing | Per-user; registration is **not blocked** by email failure (fire-and-forget) |
| [MongoDB connection loss](./mongo-connection-loss.md) | All API requests return 500/503; dashboards empty | Platform-wide; complete outage until restored |
| [Lease data integrity incident](./lease-data-integrity.md) | Tenant or landlord reports missing/wrong lease, rent, or HAP status | Single lease; requires forensic reconstruction from `paymentStructureHistory` and `auditTrail` |

---

## General principles (read before using any runbook)

### 1. Fail-safe defaults already exist — know which are open vs. closed

Tenura's architecture fails open in most places. Knowing which failures are contained vs. cascading changes triage.

**Fail-open (user flow continues):**
- Email delivery — `NODE_ENV=test` uses `jsonTransport`; production catches nodemailer errors and logs. Registration and password resets do not block on email send.
- Agent post-hooks — `ComplianceAgent` runs async after `Listing.save()` and `Document.upload()`; errors are caught and logged, never bubble to the save caller.
- Socket.io disconnect — messages queue in-memory in the browser; no data loss during transient disconnects.
- Compliance engine failure on one listing — does not halt others; failure is per-listing.

**Fail-closed (user flow blocks):**
- MongoDB connection loss — all API routes 500.
- JWT signing key missing — auth fails for everyone.
- Cloudinary credential missing — upload endpoints 500 immediately.

### 2. Preserve the audit trail

Never mutate `paymentStructureHistory`, `Application.auditTrail`, `Listing.statusHistory`, or `Lease.hqsInspections` to "clean up" an incident. These are append-only by design. If a record is wrong, write a correction entry, don't overwrite.

### 3. Communicate before you fix

For any user-affecting incident lasting more than 15 minutes:
- Post a short note via `SupportButton`'s admin channel (or direct email if support is down) acknowledging the issue.
- The 4-hour SLA is a commitment. Beat it on communication even if the fix takes longer.

### 4. Record the incident

After resolving, write a brief note under `docs/runbooks/incidents/YYYY-MM-DD-slug.md`:
- What the symptom was
- What the root cause was
- What the fix was
- What should prevent this next time (if anything)

Even three sentences is better than zero. Patterns only emerge from a record.

---

## Escalation

There is no formal on-call rotation during the pilot. The founder is the operator. If a systemic issue persists past 4 hours and no remediation path is working:

1. Put the app in read-only mode (stop Render service — users see "maintenance" via Vercel fallback).
2. Post a status note to pilot users directly (email list).
3. Do not improvise on user data. When in doubt, pause writes.
