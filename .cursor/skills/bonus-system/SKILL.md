---
name: bonus-system
description: Design, implement, and review bonus system logic including eligibility, reward calculation, payout safeguards, and auditability. Use when the user mentions bonus rules, incentives, payouts, rewards, rebates, commissions, or bonus-related bugs.
---

# Bonus System

## Quick Start

When working on bonus-related requests:

1. Clarify event triggers, eligibility constraints, and payout timing.
2. Define deterministic calculation rules and rounding strategy.
3. Add idempotency and anti-duplicate payout protections.
4. Ensure full audit logs and reversible operations where needed.
5. Verify with edge-case tests before finalizing.

## Required Inputs Checklist

Before writing code, gather or infer:

- Bonus source event (e.g. order paid, daily task completed, referral confirmed)
- Eligible subjects (user segment, role, region, level, status)
- Formula (fixed amount, percentage, tiered, capped, minimum threshold)
- Time windows (effective period, settlement cycle, expiration)
- Conflict strategy (stacking rules, precedence across multiple campaigns)
- Risk controls (rate limits, blacklist, cooldown, abuse detection)

## Workflow

Copy this checklist and track progress:

```markdown
Bonus Task Progress:
- [ ] Step 1: Confirm scope and constraints
- [ ] Step 2: Model bonus rule and lifecycle
- [ ] Step 3: Implement calculation and eligibility checks
- [ ] Step 4: Add idempotency and audit trail
- [ ] Step 5: Add tests for normal and edge cases
- [ ] Step 6: Validate data integrity and rollback behavior
```

### Step 1: Confirm Scope

- Identify business goal and measurable outcome.
- Confirm currency/points precision and rounding mode.
- Define whether bonuses are immediate or deferred.

### Step 2: Model Rule and Lifecycle

- Represent rule as explicit fields: trigger, condition, formula, cap, window, status.
- Use versioned rules for safe future changes.
- Preserve historical evaluation against the rule version used at award time.

### Step 3: Implement Core Logic

- Evaluate eligibility first, then compute amount.
- Apply caps and thresholds in a deterministic order.
- Use explicit constants/config, avoid hidden magic numbers.

### Step 4: Add Safety Controls

- Enforce idempotency key per business event.
- Record immutable ledger entries for each bonus mutation.
- Ensure failures are retriable without double payout.

### Step 5: Test Thoroughly

At minimum, include tests for:

- Happy path payout
- Ineligible user/event
- Boundary values (exact threshold, cap reached)
- Rounding and precision behavior
- Concurrent/repeated requests (idempotency)
- Rule version change compatibility

## Output Templates

### Bonus Rule Spec Template

Use this when asked to design or document a new rule:

```markdown
# Bonus Rule: <rule-name>

## Goal
<business objective and KPI>

## Trigger
<event name and source>

## Eligibility
- <condition 1>
- <condition 2>

## Formula
<fixed/percentage/tiered formula>

## Limits
- Cap: <value>
- Minimum threshold: <value>
- Max frequency: <value>

## Time Settings
- Active period: <start ~ end>
- Settlement timing: <immediate/daily/weekly>
- Expiry: <duration>

## Risk Controls
- <anti-abuse rule>
- <idempotency key>

## Audit Fields
- <required trace fields>
```

### Debug Report Template

Use this when asked to investigate bonus payout issues:

```markdown
# Bonus Issue Report

## Symptom
<what user/system observed>

## Scope
<who/which events affected>

## Root Cause
<logic, data, config, or timing issue>

## Fix
<what changed and why>

## Verification
- [ ] Reproduced before fix
- [ ] Confirmed fix on target case
- [ ] Regression checks on related rules

## Risk
<possible side effects and mitigation>
```

## Quality Gates

Before final answer:

- Confirm formula determinism and rounding consistency.
- Confirm idempotency and duplicate-award prevention.
- Confirm logs/audit fields are sufficient for tracing.
- Confirm tests cover boundary and concurrency scenarios.

## Additional Resources

- For detailed examples, see [reference.md](reference.md)
