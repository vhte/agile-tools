# Definition of Done — Mobile (iOS / Android)

> Mobile has a property web does not: **the old version does not go away**.
> Anything on this list that ships wrong stays in the wild for months.
> Fork this, cut it down, agree on the rest.

## Code

- [ ] Reviewed by someone who did not write it.
- [ ] Follows the platform's conventions rather than fighting them.
- [ ] No new warnings, and no suppressions without a comment saying why.
- [ ] Strings externalised for localisation; nothing user-visible hard-coded.
- [ ] Third-party SDK additions justified against binary size and privacy impact.

## Behaviour

- [ ] Loading, empty, error and offline states implemented — offline especially.
- [ ] Works with **no network**, with a slow network, and when the network drops mid-request.
- [ ] Handles process death and restore: state comes back, or the user is told why it cannot.
- [ ] Background / foreground transitions do not lose work or duplicate a request.
- [ ] Permission denial is handled gracefully, including "denied forever".
- [ ] Deep links land where they should, including cold start.

## Compatibility

- [ ] Verified on the **oldest OS version you support** and the newest.
- [ ] Verified on a small screen and a large one; nothing clipped or unreachable.
- [ ] Tested on a real device, not only the simulator, for anything touching camera, sensors or performance.
- [ ] Dark mode and dynamic type both look intentional.

## Accessibility

- [ ] Screen reader reaches everything interactive with a meaningful label.
- [ ] Touch targets meet the platform minimum.
- [ ] Contrast meets WCAG AA in both themes.
- [ ] Respects reduce-motion and larger-text settings.

## Backward compatibility

- [ ] The change works against the **currently deployed** backend, not only the new one.
- [ ] Local database migration tested by upgrading from the released version, not from a clean install.
- [ ] Server-driven behaviour degrades safely on older app versions still in the wild.
- [ ] Anything requiring a forced update was an explicit decision with product.

## Tests

- [ ] Unit tests over new logic and its edge cases.
- [ ] UI test for the flow a user would file a bug about.
- [ ] Regression test for every bug fixed here.
- [ ] CI green, including the build for the store configuration.

## Release

- [ ] Crash-free rate and startup time unaffected, or the change is understood and accepted.
- [ ] Analytics events collect the minimum, with no free text carrying personal data.
- [ ] Privacy manifest / data-safety declaration updated if data collection changed.
- [ ] Release notes written for humans, not a changelog dump.
- [ ] Feature flag or staged rollout in place for anything risky, with someone owning the ramp.
