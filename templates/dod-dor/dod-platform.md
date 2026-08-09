# Definition of Done — Platform / Infrastructure / CI-CD

> Platform work is done when **someone else can use it without asking you**.
> Fork this, delete what your team will not honour, agree on the rest.

## Change itself

- [ ] Expressed as code in the repository — no console-only change that the next `apply` would revert.
- [ ] Reviewed by someone who did not write it and who understands the blast radius.
- [ ] `plan` / dry-run output was read, not skimmed, and matches what was intended.
- [ ] State and secrets handled through the agreed mechanism; nothing sensitive in the diff.
- [ ] Naming and tagging follow the conventions, so cost and ownership stay attributable.

## Safety

- [ ] **Rollback is written down** and has been tried, not assumed.
- [ ] Change is reversible, or its irreversibility was called out and accepted explicitly.
- [ ] Applied to a non-production environment first, and the difference between the two is known.
- [ ] Blast radius stated: what breaks if this is wrong, and who notices first.
- [ ] Quotas, limits and capacity headroom checked for anything newly provisioned.

## Access and security

- [ ] Permissions are least-privilege, and were justified rather than copied from a broader role.
- [ ] No new public exposure without an explicit decision recorded.
- [ ] Encryption in transit and at rest matches policy for the data class involved.
- [ ] Audit logging remains intact for anything the change touches.
- [ ] Credential rotation path exists for anything newly issued.

## Reliability

- [ ] Monitoring and alerting cover the new component's realistic failure modes.
- [ ] Health checks reflect real health, not "the process is running".
- [ ] Backups exist for new stateful resources, and a restore has been demonstrated at least once.
- [ ] Failure of the new component degrades the system gracefully rather than fataly.
- [ ] Cost impact estimated and, if material, agreed with whoever owns the budget.

## Developer experience

- [ ] Whoever this is for can **use it from the documentation alone**.
- [ ] The path a developer takes is faster or clearer than before — not merely different.
- [ ] Local development still works, or the new requirement is documented and scripted.
- [ ] Pipeline changes keep CI feedback time acceptable; a slower pipeline was a deliberate trade.

## Documentation

- [ ] Runbook covers "how do I know it broke" and "what do I do about it".
- [ ] Architecture note or ADR recorded for a decision the next team will wonder about.
- [ ] Anything deprecated has a stated removal date and a migration path.
- [ ] The change was announced where affected teams actually read announcements.
