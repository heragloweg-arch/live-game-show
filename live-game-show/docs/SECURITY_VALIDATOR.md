# Security + Answer Validator

## Validation modes
- `exact` — closed accepted answers / choices
- `open_speed` — structural rules (startsWith, endsWith, length)
- `hybrid` — exact OR open rules (Speed letters)
- `choice` — MCQ

Authority: Edge `answer` + `submit_answer_atomic` only.

## Hardening
- settle_match / credit_coins / submit_answer_atomic → service_role only
- assertMatchParticipant + assertMatchNotFinished on answer
- security_events audit table
- UNIQUE (round_id, user_id) + request_id idempotency
