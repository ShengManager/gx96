# Bonus System Reference

## Suggested Terminology

Use these terms consistently:

- trigger event
- eligibility
- bonus rule
- bonus ledger
- settlement
- idempotency key
- audit record

## Common Formula Patterns

### Fixed

`bonus = fixed_amount`

### Percentage with Cap

`bonus = min(base_amount * rate, cap_amount)`

### Tiered

Evaluate thresholds from highest to lowest and apply the first matched tier.

## Rounding Guidance

- Use one rounding mode globally for a domain (for example: round half up).
- Store raw calculation and rounded result for auditability.
- Keep precision policy explicit for each unit (currency vs points).

## Anti-Abuse Controls

- Frequency limits per account/device/IP.
- Cooldown windows per trigger.
- Deduplication by business event ID.
- Optional manual review for high-risk payouts.

## Event-Sourcing Style Audit Fields

Store at least:

- rule_version
- trigger_event_id
- subject_id
- computed_amount_raw
- computed_amount_final
- created_at
- operator_or_source
- idempotency_key

## Test Case Matrix

Minimal matrix:

1. eligible + normal amount
2. ineligible condition
3. exact threshold boundary
4. cap boundary
5. repeat trigger (idempotency)
6. concurrent trigger race
7. expired or inactive rule
8. rule version migration path
