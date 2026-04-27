const AgentState = require('../models/AgentState');
const Listing = require('../models/Listing');
const { validateListing, COMPLIANCE_RULE_VERSION } = require('../services/compliance-engine');
const { getPaymentStandard, FMR_DATA_VERSION } = require('../utils/fmrData');
const { estimateApprovalTimeline } = require('../utils/approvalTimeline');

// Composite rule version stamped on every AgentState record.
// Lets you reconstruct exactly which rules and FMR data produced a given result.
const AGENT_RULE_VERSION = `rules:${COMPLIANCE_RULE_VERSION}|fmr:${FMR_DATA_VERSION}`;

/**
 * ComplianceAgent — runs compliance checks on a listing.
 *
 * Applies federal rules (HUD, lead paint) to all listings.
 * Applies local ordinances automatically based on listing.address via the jurisdiction registry.
 * Rule-based, deterministic — no LLM involvement.
 * Every run is persisted to AgentState for full observability.
 *
 * Usage:
 *   const { run } = require('./agents/ComplianceAgent');
 *   const result = await run({ listingId: '...' });
 *
 * Returns:
 *   { compliant, violations, warnings, agentStateId }
 */
const run = async ({ listingId } = {}) => {
  const state = await AgentState.create({
    agentType: 'ComplianceAgent',
    targetId: listingId,
    targetModel: 'Listing',
    status: 'running',
    lastAction: 'Starting compliance check',
    ruleVersion: AGENT_RULE_VERSION,
  });

  try {
    const listing = await Listing.findById(listingId).lean();

    if (!listing) {
      state.status = 'failed';
      state.lastAction = `Listing ${listingId} not found`;
      state.actionLog.push({ action: 'fetch_listing', result: 'fail', note: `Listing ${listingId} not found` });
      await state.save();
      return { compliant: false, violations: [], warnings: [], agentStateId: state._id };
    }

    state.actionLog.push({ action: 'fetch_listing', result: 'pass', note: `Fetched listing ${listingId}` });

    const { compliant, violations, warnings } = validateListing(listing);

    for (const v of violations) {
      // violations are objects: { message, remediationStep }
      state.actionLog.push({ action: 'compliance_check', result: 'fail', note: v.message });
    }
    for (const w of warnings) {
      state.actionLog.push({ action: 'compliance_check', result: 'warn', note: w });
    }
    if (violations.length === 0 && warnings.length === 0) {
      state.actionLog.push({ action: 'compliance_check', result: 'pass', note: 'All checks passed' });
    }

    // ── Rent Reasonableness check ───────────────────────────────
    // Only runs for Section 8 listings in metros where we have FMR data.
    // When data is unavailable, rentReasonable is null (not false) — the
    // frontend treats null as "data not available," not as a failure.
    let rentCheck = { rentReasonable: null, paymentStandard: null, fmrDelta: null, metro: null };

    const acceptsSection8 =
      listing.section8Accepted ||
      (Array.isArray(listing.acceptedPrograms) && listing.acceptedPrograms.includes('section_8_hcv'));

    if (acceptsSection8 && listing.monthlyRent && listing.address) {
      const fmrResult = getPaymentStandard(listing.address, listing.bedrooms ?? 1);
      if (fmrResult) {
        const { paymentStandard, fmr, multiplier, metro, effectiveYear } = fmrResult;
        const fmrDelta = listing.monthlyRent - paymentStandard;
        const rentReasonable = fmrDelta <= 0;

        rentCheck = { rentReasonable, paymentStandard, fmrDelta, fmr, multiplier, metro, effectiveYear };

        state.actionLog.push({
          action: 'rent_reasonableness',
          result: rentReasonable ? 'pass' : 'fail',
          note: rentReasonable
            ? `Rent $${listing.monthlyRent} is within ${metro} payment standard $${paymentStandard}`
            : `Rent $${listing.monthlyRent} exceeds ${metro} payment standard $${paymentStandard} by $${fmrDelta}`,
        });

        // Persist rent check fields directly on the listing document
        // (non-blocking — best effort, does not affect agent result)
        try {
          await Listing.findByIdAndUpdate(listing._id, {
            rentReasonable,
            fmrDelta,
            lastRentCheckAt: new Date(),
          });
        } catch (updateErr) {
          state.actionLog.push({ action: 'rent_reasonableness', result: 'warn', note: `Could not persist rent check: ${updateErr.message}` });
        }
      } else {
        state.actionLog.push({ action: 'rent_reasonableness', result: 'skip', note: 'No FMR data for this location — skipping rent check' });
      }
    }

    // ── Approval Timeline ───────────────────────────────────────
    const timeline = estimateApprovalTimeline(
      { violations, warnings },
      { rentReasonable: rentCheck.rentReasonable }
    );

    state.status = 'completed';
    state.lastAction = compliant
      ? 'All compliance checks passed'
      : `${violations.length} violation(s) found`;
    state.lastRunAt = new Date();
    await state.save();

    return { compliant, violations, warnings, rentCheck, timeline, agentStateId: state._id };
  } catch (err) {
    state.status = 'failed';
    state.lastAction = `Unexpected error: ${err.message}`;
    state.actionLog.push({ action: 'run', result: 'fail', note: err.message });
    await state.save();
    throw err;
  }
};

module.exports = { run, AGENT_RULE_VERSION };
