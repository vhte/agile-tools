# Definition of Done — Frontend / Web UI

> Done means **releasable**. Fork it, cut what your team will not honour, agree on the rest line by line.

## Code

- [ ] Implemented as designed; every deviation was raised with design rather than quietly shipped.
- [ ] Reviewed by someone who did not write it.
- [ ] Components reuse what exists in the design system instead of forking a near-copy.
- [ ] No new type or lint suppressions without a comment explaining why.
- [ ] Dead code, commented-out blocks and stray `console.log` removed.

## Behaviour

- [ ] **Loading, empty, error and partial states** are all designed and implemented — not just the populated one.
- [ ] Failures are recoverable: the user is told what happened and what to do, and can retry.
- [ ] Forms preserve input on failure. Nobody retypes anything because of a server error.
- [ ] Destructive actions are confirmable or undoable.
- [ ] Optimistic updates roll back correctly when the request fails.

## Accessibility

- [ ] Reachable and operable by **keyboard alone**, in a sensible tab order.
- [ ] Focus is visible, and is moved deliberately when content appears or replaces the view.
- [ ] Semantic elements used before ARIA; ARIA used correctly where it is needed.
- [ ] Contrast meets WCAG AA in **every theme you ship**, including dark mode.
- [ ] Images and icon-only buttons have text alternatives; decorative ones are hidden from readers.
- [ ] Checked once with a screen reader or an automated audit — and the findings were acted on.

## Responsive and cross-browser

- [ ] Works at the narrow end of your supported range without horizontal scroll.
- [ ] Verified on the browsers your analytics actually show, including one Safari.
- [ ] Touch targets are large enough to hit on a phone.
- [ ] Text scales when the user increases their font size; nothing is clipped.
- [ ] Respects `prefers-reduced-motion` for anything that animates.

## Tests

- [ ] Component tests cover the states above, especially error and empty.
- [ ] A test exists for the interaction a user would file a bug about.
- [ ] Regression test added for every bug fixed here.
- [ ] CI green, including any visual snapshot suite.

## Performance

- [ ] No unnecessary render loops or unbounded lists; long lists are virtualised or paginated.
- [ ] Bundle impact checked; a new dependency was justified against writing it.
- [ ] Images sized and served appropriately for their slot.
- [ ] Above-the-fold content does not wait on a request that could have been avoided.

## Privacy and analytics

- [ ] New events collect the minimum needed, and no free text that could carry personal data.
- [ ] Third-party scripts: none added, or added with an explicit decision and an owner.

## Shipping

- [ ] Verified in pre-production against the real API, not only against mocks.
- [ ] Feature flag default deliberate; someone owns removing the flag.
- [ ] Acceptance criteria checked by someone other than the author.
- [ ] Copy reviewed by whoever owns product wording.
