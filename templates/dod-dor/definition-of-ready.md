# Definition of Ready

> A shared answer to "can we start this without getting stuck on Tuesday?"
> Fork this, cut it down, and get the team to agree line by line.

## The item itself

- [ ] The **problem** is stated, not just the solution. A reader can say who hurts and how.
- [ ] There is a **user or business outcome** attached — what changes once this ships.
- [ ] The title describes the change, not the component it touches.
- [ ] It is **small enough to finish inside one iteration** with room to be wrong once.
- [ ] It is **independent enough to start** — or its dependency is identified and scheduled, not hoped for.

## Acceptance criteria

- [ ] Written from the outside in: observable behaviour, not implementation steps.
- [ ] Each criterion is **testable** — someone other than the author could decide pass or fail.
- [ ] The **unhappy paths** are covered: empty, invalid, unauthorised, offline, too large, too slow.
- [ ] Anything explicitly **out of scope** is written down, so it is not re-litigated mid-sprint.

## Inputs the team needs

- [ ] Designs, mockups or API contracts exist at the fidelity this item needs (not more).
- [ ] Test data or an environment to reproduce the current behaviour is available.
- [ ] Any **third-party or other-team dependency** has a named contact and a known lead time.
- [ ] Legal, security, privacy or compliance constraints are surfaced — before design, not after.

## Shared understanding

- [ ] The team has **discussed it together** at least once. A ticket read alone is not refinement.
- [ ] More than one person could pick it up. If only one person can, that is the risk to talk about.
- [ ] Someone can answer questions about it during the iteration and is expected to be reachable.
- [ ] The team has **sized it** — or has explicitly agreed to spike it first instead of guessing.

## When it is not ready

Say so, out loud, with the specific missing thing. "Not ready" without a named gap is just a queue.

Useful phrasings:

- "We are missing the error behaviour for X — who decides that?"
- "This depends on team Y's endpoint. Until we have a date, taking it in is a commitment we cannot keep."
- "We do not know enough to size this. Give us a two-day spike and we will come back with a number."

## Anti-patterns to watch for

| Smell | What it usually means |
|---|---|
| Everything is always ready | The gate is not being applied; refinement is theatre |
| Nothing is ever ready | The gate has become a shield against uncomfortable work |
| Ready checked by one person | Shared understanding was skipped — the expensive part |
| Acceptance criteria written as tasks | The item is a plan, not an outcome; it will grow silently |
| "Ready" used to reject tickets | The DoR turned into paperwork; make it a prompt to go ask instead |
