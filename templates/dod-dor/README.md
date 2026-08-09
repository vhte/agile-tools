# Definition of Done / Definition of Ready templates

Starting points, not standards. Every file here is a Markdown checklist meant to be
**forked, cut down, and argued about** by the team that will live with it.

## How to use these

1. Copy the file closest to your team into your own repository — next to the code, not in a wiki.
2. Delete every line the team does not actually intend to honour. A Definition of Done with
   aspirational lines in it is worse than a short one, because it teaches people that the
   checklist is decoration.
3. Bring the remainder to the team and get explicit agreement, line by line.
4. Review it once a quarter, or the first time it blocks something it should not have.

## Why version-control it

A DoD in a wiki page is a document nobody has opened since onboarding. A DoD in the repository
shows up in diffs, gets discussed in review, and has a history you can point at when someone
asks "when did we start requiring that?".

## The files

| File | For |
|---|---|
| [`definition-of-ready.md`](definition-of-ready.md) | Any team — what has to be true before work starts |
| [`dod-backend.md`](dod-backend.md) | Services, APIs, workers |
| [`dod-frontend.md`](dod-frontend.md) | Web UI |
| [`dod-platform.md`](dod-platform.md) | Infrastructure, CI/CD, developer platform |
| [`dod-data.md`](dod-data.md) | Pipelines, warehouse models, analytics |
| [`dod-mobile.md`](dod-mobile.md) | iOS / Android |

## Two rules worth keeping

**Done means releasable.** If a line can be true while the change still cannot reach a user,
it belongs somewhere else. "Done" that needs a follow-up phase is not done, it is a status.

**Ready is a conversation gate, not a paperwork gate.** The Definition of Ready exists so the
team stops starting work that will stall on day two. The moment it becomes a reason to reject
tickets rather than a prompt to go ask someone something, delete it.
