/**
 * Tenura Compliance Engine
 * Isolated from the UI layer — handles multi-jurisdictional, multi-program rules.
 *
 * Design principle: compliance rules are updated here without touching the frontend.
 * Each rule set returns:
 *   { compliant: boolean, violations: Array<{message, remediationStep}>, warnings: string[] }
 *
 * Jurisdiction is derived from listing.address automatically. Federal rules always run.
 * Local ordinances run only when the listing's city+state matches a registered jurisdiction.
 * Adding a new city requires only a rule file + one entry in jurisdictionRegistry.js.
 *
 * ── Rule Versioning ───────────────────────────────────────────────────────────
 * COMPLIANCE_RULE_VERSION is stamped on every AgentState record produced by
 * ComplianceAgent. This makes every audit log entry reproducible: if HUD or a
 * PHA asks why a listing was flagged six months ago, you can identify exactly
 * which version of the rules produced that result.
 *
 * Bump this version (semver) whenever rule logic changes:
 *   - PATCH (x.x.1): wording / remediation text changes only
 *   - MINOR (x.1.0): new warning or non-blocking check added
 *   - MAJOR (1.0.0): violation criteria changed (may retroactively flip pass/fail)
 *
 * Do NOT bump for FMR data updates — those are versioned separately via
 * FMR_DATA_VERSION in server/utils/fmrData.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const COMPLIANCE_RULE_VERSION = '1.0.0';

const { validateHUD } = require('./hud');
const { validateLeadPaint } = require('./leadPaint');
const { getLocalValidators } = require('./jurisdictionRegistry');

/**
 * Run all applicable compliance checks for a listing.
 * Federal rules (HUD, lead paint) always apply.
 * Local ordinances are selected automatically from listing.address via the jurisdiction registry.
 *
 * @param {Object} listing - Mongoose Listing document (plain object)
 * @returns {{ compliant: boolean, violations: Array<{message, remediationStep}>, warnings: string[] }}
 */
const validateListing = (listing) => {
  const results = [];

  // Federal: HUD Section 8 checks — triggered by legacy flag or acceptedPrograms array
  const acceptsSection8 =
    listing.section8Accepted ||
    (Array.isArray(listing.acceptedPrograms) && listing.acceptedPrograms.includes('section_8_hcv'));
  if (acceptsSection8) {
    results.push(validateHUD(listing));
  }

  // Federal: lead paint disclosure (required for all pre-1978 buildings nationwide)
  results.push(validateLeadPaint(listing));

  // Local: run whichever ordinances apply to the listing's city + state
  const localValidators = getLocalValidators(listing.address);
  for (const validate of localValidators) {
    results.push(validate(listing));
  }

  // Aggregate results
  const violations = results.flatMap((r) => r.violations);
  const warnings = results.flatMap((r) => r.warnings);

  return {
    compliant: violations.length === 0,
    violations,
    warnings,
  };
};

/**
 * Validate a Section 8 RTA workflow for completeness.
 * @param {Object} rtaWorkflow - application.rtaWorkflow object
 * @returns {{ ready: boolean, missingSteps: string[] }}
 */
const validateRTAReadiness = (rtaWorkflow) => {
  const requiredSteps = [
    { key: 'rtaFormSubmitted', label: 'RTA form submitted to PHA' },
    { key: 'leaseReady', label: 'Lease agreement prepared' },
    { key: 'inspectionScheduled', label: 'HQS inspection scheduled' },
    { key: 'rentReasonablenessConfirmed', label: 'Rent reasonableness confirmed by PHA' },
  ];

  const missingSteps = requiredSteps
    .filter((step) => !rtaWorkflow[step.key])
    .map((step) => step.label);

  return {
    ready: missingSteps.length === 0,
    missingSteps,
  };
};

/**
 * Calculate rent reasonableness — simple check against voucher payment standard.
 * @param {number} monthlyRent - Landlord's listed rent
 * @param {number} voucherAmount - Tenant's voucher subsidy amount
 * @param {number} tenantPortion - What the tenant would pay out of pocket
 * @returns {{ reasonable: boolean, message: string }}
 */
const checkRentReasonableness = (monthlyRent, voucherAmount, tenantPortion) => {
  // HUD rule: tenant portion cannot exceed 40% of gross monthly income at initial lease-up
  // This is a simplified check — PHA does the full calculation
  const totalCovered = voucherAmount + tenantPortion;
  const gap = monthlyRent - totalCovered;

  if (gap > 0) {
    return {
      reasonable: false,
      message: `Rent exceeds combined voucher + tenant contribution by $${gap}. PHA may not approve.`,
    };
  }

  return {
    reasonable: true,
    message: 'Rent appears within range of voucher coverage. PHA final approval required.',
  };
};

module.exports = { validateListing, validateRTAReadiness, checkRentReasonableness, COMPLIANCE_RULE_VERSION };
