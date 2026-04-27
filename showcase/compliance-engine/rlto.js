/**
 * Chicago Residential Landlord Tenant Ordinance (RLTO) compliance rules.
 * Municipal Code of Chicago, Chapter 5-12.
 * Note: RLTO applies to most Chicago residential rentals (some exemptions exist).
 *
 * Each violation is an object: { message: String, remediationStep: String }
 * Warnings remain plain strings — they are advisory only.
 */

const validateRLTO = (listing) => {
  const violations = [];
  const warnings = [];

  const rlto = listing.rltoCompliance || {};

  // RLTO 5-12-050: Entry notice
  if (rlto.entryNoticeHours !== undefined && rlto.entryNoticeHours < 2) {
    violations.push({
      message: 'RLTO 5-12-050: Landlord must provide at least 2 hours notice before entry for repairs/inspections (non-emergency).',
      remediationStep: "Update the listing's RLTO compliance settings to reflect a minimum entry notice of 2 hours.",
    });
  }

  // RLTO 5-12-130: Rent increase notice
  if (rlto.rentIncreaseNoticedays !== undefined && rlto.rentIncreaseNoticedays < 30) {
    violations.push({
      message: 'RLTO 5-12-130: Rent increases require at least 30 days written notice.',
      remediationStep: "Update the listing's RLTO compliance settings to reflect a minimum rent increase notice of 30 days.",
    });
  }

  // Security deposit rules — RLTO 5-12-080 to 5-12-100
  if (listing.securityDeposit && listing.securityDeposit > 0) {
    warnings.push(
      'RLTO 5-12-080 to 5-12-100: Security deposits in Chicago must be held in a federally insured interest-bearing account ' +
      'and interest must be returned annually. Verify compliance with deposit handling requirements.'
    );
  }

  // Lead paint disclosure — separate check, but RLTO reinforces it
  if (listing.builtBefore1978 && !listing.leadPaintDisclosure) {
    violations.push({
      message:
        'EPA / RLTO: Lead-based paint disclosure is required for buildings built before 1978. ' +
        'Tenants must receive the EPA "Protect Your Family from Lead in Your Home" pamphlet.',
      remediationStep:
        'Upload a signed EPA lead paint disclosure form and mark the lead paint disclosure checkbox on the listing.',
    });
  }

  // Required disclosures
  if (!listing.description) {
    warnings.push("RLTO recommends providing a written description of the unit's condition at move-in.");
  }

  return { violations, warnings };
};

module.exports = { validateRLTO };
