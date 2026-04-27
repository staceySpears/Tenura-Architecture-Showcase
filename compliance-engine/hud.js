/**
 * HUD Section 8 Housing Choice Voucher compliance rules.
 * Source: HCV Program regulations (24 CFR Part 982)
 *
 * Each violation is an object: { message: String, remediationStep: String }
 * Warnings remain plain strings — they are advisory only.
 */

const validateHUD = (listing) => {
  const violations = [];
  const warnings = [];

  // HQS (Housing Quality Standards) — all Section 8 units must pass
  if (!listing.bedrooms && listing.bedrooms !== 0) {
    violations.push({
      message: 'Bedroom count is required for Section 8 listings.',
      remediationStep: 'Edit the listing and select the number of bedrooms.',
    });
  }

  if (!listing.monthlyRent) {
    violations.push({
      message: 'Monthly rent is required.',
      remediationStep: 'Edit the listing and enter the monthly rent amount.',
    });
  }

  // Utilities: HUD requires clarity on who pays what
  const { utilities } = listing;
  if (!utilities) {
    violations.push({
      message: 'Utility responsibility breakdown is required for Section 8 listings.',
      remediationStep: 'Edit the listing and specify who pays each utility (heat, electric, water, gas).',
    });
  }

  // Address completeness required for inspection scheduling
  const addr = listing.address || {};
  if (!addr.street || !addr.city || !addr.state || !addr.zip) {
    violations.push({
      message: 'Complete property address is required for HQS inspection scheduling.',
      remediationStep: 'Edit the listing and fill in the full street address, city, state, and ZIP.',
    });
  }

  // Move-in date should be set before RTA submission
  if (!listing.moveInDate) {
    warnings.push('Move-in date not set. Required before RTA submission to PHA.');
  }

  // Security deposit cannot exceed 1 month's rent under HCV program in many jurisdictions
  if (listing.securityDeposit && listing.monthlyRent && listing.securityDeposit > listing.monthlyRent) {
    warnings.push(
      `Security deposit ($${listing.securityDeposit}) exceeds one month's rent ($${listing.monthlyRent}). ` +
      'Many PHAs require deposits to not exceed one month rent for Section 8 units.'
    );
  }

  return { violations, warnings };
};

module.exports = { validateHUD };
