const mongoose = require('mongoose');
const { run, AGENT_RULE_VERSION } = require('../../../agents/ComplianceAgent');
const AgentState = require('../../../models/AgentState');
const { createLandlord, createListing } = require('../../helpers/seed');

describe('ComplianceAgent.run()', () => {
  it('returns compliant: true and logs a completed AgentState for a valid listing', async () => {
    const { user } = await createLandlord();
    const listing = await createListing(user._id, {
      status: 'active',
      acceptedPrograms: [],
      utilities: {
        heat: 'tenant',
        electric: 'tenant',
        water: 'landlord',
        gas: 'tenant',
        trash: 'landlord',
        internet: 'tenant',
      },
    });

    const result = await run({ listingId: listing._id });

    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.agentStateId).toBeDefined();

    const state = await AgentState.findById(result.agentStateId);
    expect(state.status).toBe('completed');
    expect(state.agentType).toBe('ComplianceAgent');
    // ruleVersion must be stamped for audit reproducibility
    expect(state.ruleVersion).toBe(AGENT_RULE_VERSION);
    expect(state.ruleVersion).toMatch(/^rules:\d+\.\d+\.\d+\|fmr:FY\d{4}-/);
  });

  it('returns violations and completed AgentState for a pre-1978 listing missing lead paint disclosure', async () => {
    const { user } = await createLandlord();
    // builtBefore1978 + no leadPaintDisclosure → violations from both validateLeadPaint and validateRLTO
    const listing = await createListing(user._id, {
      status: 'active',
      builtBefore1978: true,
      leadPaintDisclosure: false,
    });

    const result = await run({ listingId: listing._id });

    expect(result.compliant).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);

    const state = await AgentState.findById(result.agentStateId);
    expect(state.status).toBe('completed');
    const failEntries = state.actionLog.filter((e) => e.result === 'fail');
    expect(failEntries.length).toBeGreaterThan(0);
  });

  it('violations are objects with message and remediationStep fields', async () => {
    const { user } = await createLandlord();
    const listing = await createListing(user._id, {
      status: 'active',
      builtBefore1978: true,
      leadPaintDisclosure: false,
    });

    const result = await run({ listingId: listing._id });

    expect(result.violations.length).toBeGreaterThan(0);
    result.violations.forEach((v) => {
      expect(typeof v.message).toBe('string');
      expect(v.message.length).toBeGreaterThan(0);
      expect(typeof v.remediationStep).toBe('string');
      expect(v.remediationStep.length).toBeGreaterThan(0);
    });
  });

  it('returns failed AgentState when listingId does not exist', async () => {
    const fakeId = new mongoose.Types.ObjectId();

    const result = await run({ listingId: fakeId });

    expect(result.compliant).toBe(false);
    expect(result.agentStateId).toBeDefined();

    const state = await AgentState.findById(result.agentStateId);
    expect(state.status).toBe('failed');
  });

  it('generates warnings for a Section 8 listing without a move-in date', async () => {
    const { user } = await createLandlord();
    const listing = await createListing(user._id, {
      status: 'active',
      acceptedPrograms: ['section_8_hcv'],
      moveInDate: undefined,
    });

    const result = await run({ listingId: listing._id });

    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('applies Chicago RLTO checks to listings with a Chicago address', async () => {
    const { user } = await createLandlord();
    // Seed default address is Chicago — RLTO should run
    const listing = await createListing(user._id, {
      status: 'active',
      builtBefore1978: true,
      leadPaintDisclosure: false,
      address: { street: '100 N State St', city: 'Chicago', state: 'IL', zip: '60601' },
    });

    const result = await run({ listingId: listing._id });

    // Should have violations from both lead paint (federal) and RLTO (local)
    const violationMessages = result.violations.map((v) => v.message);
    const hasLeadPaintViolation = violationMessages.some((m) => /lead.based paint/i.test(m));
    const hasRltoViolation = violationMessages.some((m) => /rlto/i.test(m));
    expect(hasLeadPaintViolation).toBe(true);
    expect(hasRltoViolation).toBe(true);
  });

  it('does not apply RLTO to listings outside Chicago', async () => {
    const { user } = await createLandlord();
    const listing = await createListing(user._id, {
      status: 'active',
      builtBefore1978: true,
      leadPaintDisclosure: false,
      address: { street: '500 Main St', city: 'Houston', state: 'TX', zip: '77001' },
    });

    const result = await run({ listingId: listing._id });

    // Lead paint violation (federal) should fire; RLTO (Chicago-only) should not
    const violationMessages = result.violations.map((v) => v.message);
    const hasLeadPaintViolation = violationMessages.some((m) => /lead.based paint/i.test(m));
    const hasRltoViolation = violationMessages.some((m) => /rlto/i.test(m));
    expect(hasLeadPaintViolation).toBe(true);
    expect(hasRltoViolation).toBe(false);
  });
});
