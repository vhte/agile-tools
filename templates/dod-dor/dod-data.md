# Definition of Done — Data pipelines / Analytics / Warehouse models

> A data change is done when someone can **trust the number** without asking who built it.
> Fork this, cut it down, agree on the rest.

## Correctness

- [ ] Output reconciled against a trusted source, and the difference is explained rather than tolerated.
- [ ] Row counts and key cardinality checked against expectation, not just "the job succeeded".
- [ ] Joins verified for fan-out; duplicates are impossible or deliberate.
- [ ] Time zones and date boundaries are explicit. UTC unless there is a stated reason.
- [ ] Late-arriving and out-of-order data behave predictably, and the behaviour is documented.
- [ ] Historical backfill either done or explicitly deferred with a note saying so.

## Tests and quality checks

- [ ] Schema tests: not-null, unique, accepted values, referential integrity where it matters.
- [ ] A freshness check exists and fails loudly when data stops arriving.
- [ ] Volume anomaly check exists for the tables people will build dashboards on.
- [ ] Transformation logic has unit tests over fixture data, including the awkward rows.
- [ ] The pipeline is **idempotent** — a re-run does not double-count anything.

## Definitions

- [ ] Every new metric has a **written definition**: what is counted, what is excluded, at what grain.
- [ ] The definition matches any existing metric with the same name, or the name was changed.
- [ ] Grain of each model is stated and enforced by a uniqueness test.
- [ ] Whoever owns the business question has confirmed the definition means what they meant.

## Privacy

- [ ] Personal data classified, and only present where it is genuinely needed.
- [ ] Pseudonymised or aggregated wherever the use case allows it.
- [ ] Retention and deletion behaviour is implemented, not just intended.
- [ ] Access grants are role-based; no broad grant added for convenience.
- [ ] Nothing that could identify an individual leaks into a shared dashboard by accident.

## Operability

- [ ] Failures alert someone who can act, with enough context to start.
- [ ] Runtime and cost are understood; a materially slower or pricier job was a conscious choice.
- [ ] Dependencies and run order are declared, not implied by scheduling luck.
- [ ] Rerun and recovery procedure documented for a failed partition.

## Documentation

- [ ] Model and column descriptions exist in the catalogue, in plain language.
- [ ] Lineage is discoverable — a consumer can see where a number came from.
- [ ] Deprecated tables and columns are marked, with a removal date and a replacement.
- [ ] Consumers of anything you changed were told before you changed it.
