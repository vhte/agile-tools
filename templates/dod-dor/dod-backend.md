# Definition of Done — Backend service / API

> Done means **releasable**: nothing on this list may still be true while the change cannot reach a user.
> Fork it, delete what your team will not honour, and get explicit agreement on the rest.

## Code

- [ ] Implemented against the agreed contract; deviations from it were raised, not absorbed.
- [ ] Reviewed by someone who did not write it, who actually read it.
- [ ] No new linter or type-checker suppressions without a comment saying why.
- [ ] Dead code, feature-flag leftovers and debug logging removed.
- [ ] Errors are handled explicitly — no silent catch, no `500` where the client could have been told something useful.

## Tests

- [ ] Unit tests cover the new logic **and its edge cases**, not only the happy path.
- [ ] Integration tests cover the boundary this change touches (database, queue, external call).
- [ ] Contract tests updated if a consumer-visible shape changed.
- [ ] The whole suite is green in CI, not just locally.
- [ ] A regression test exists for every bug this change fixes, and it failed before the fix.

## Data and migrations

- [ ] Migrations are **backward compatible** with the currently deployed version, or the rollout order is written down.
- [ ] Migration tested against a realistic data volume, not an empty table.
- [ ] A rollback path exists and someone has said out loud what it is.
- [ ] No personal data added to logs, error payloads or analytics events.
- [ ] Retention and deletion behaviour is intentional for any new data being stored.

## Security

- [ ] Input validated at the boundary; authorisation checked per operation, not per route group.
- [ ] Secrets come from configuration, never from the repository.
- [ ] Dependencies added are known, maintained, and free of open critical advisories.
- [ ] Anything touching authentication, permissions or PII was reviewed with that lens explicitly.

## Operability

- [ ] Logs, metrics and traces let an on-call engineer answer "is this working?" without a debugger.
- [ ] New failure modes are alertable — or a conscious decision was made not to alert.
- [ ] Performance impact is understood for the realistic case (not measured only on one row).
- [ ] Timeouts, retries and idempotency behave sanely for every new outbound call.
- [ ] Rate limits and backpressure considered for anything a client can call in a loop.

## Documentation

- [ ] API reference / OpenAPI updated in the same change, not a follow-up.
- [ ] Runbook updated if there is a new way for this to break at 3am.
- [ ] Any decision worth arguing about later is recorded where the next person will find it.

## Shipping

- [ ] Deployed to the pre-production environment and exercised there.
- [ ] Feature flag default is deliberate, and someone owns removing the flag.
- [ ] Acceptance criteria verified against the running system by someone other than the author.
- [ ] The tracker item reflects reality — status, links, and what actually changed.
