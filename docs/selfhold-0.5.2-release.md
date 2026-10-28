# Selfhold 0.5.2 candidate evidence

Prepared October 28, 2026. Scoped non-secret browser acceptance is complete. Valid browser key handoff and the limitations below remain untested; publication approval must account for those gaps. No independent audit is claimed.

## Source and scope

Merged baseline: `447b2a0b4571850a442ba019c3d471d1ec2a137e`; previous submitted 0.5.1: `ad78603ba0aaea853568a102662b5ab800655b9b`. SDK: `1e3ab50ab591c1c6ccab3b4187f3dfb984bb1ebe`. GitHub's repository API still identifies `adalinxx/selfhold-wallet` as canonical, although SDK/design references moved to 0xLattice. PR #22 merged during preparation and is included after revalidation; no unmerged feature is included.

Merged PRs #22 and #26–#44 add automatic node/weight-based fees and block-time warnings; branding, typography, activity and approval refinements; same-chain pending-write sequencing and recovery; SDK updates; a separately deployed web wallet; its account handoff into Chrome; account creation in Connect; and account labels derived from accepted Moniker handle writes without additional handle lookups. PR #44 explicitly sets the release version to 0.5.2. Release preparation changes documentation only. The removed unused-node-permissions control remains absent. Homepage: https://selfhold.app/.

## Permissions and privacy

Required/optional host permissions, content-script matches, CSP, storage and alarms permissions match 0.5.1. New `externally_connectable` matches only `https://wallet.selfhold.app/*`. The worker also checks top-level sender origin, rejects extension senders, and requires an extension-owned confirmation before importing. The web wallet offers a private key through local Chrome messaging; it is temporarily retained in session storage outside the encrypted vault. Offers expire after two minutes, with deletion on next access; acceptance, decline or closing the confirmation clears the offer. Existing wallets must be unlocked. The address is bound to the confirmation and no existing extension key is returned to the page. These are source/unit-test findings, not completed browser acceptance.

The policy now describes the handoff and corrects the historical fee description: 0.5.1 used a saved fee or one; 0.5.2 uses the node's automatic fee when no fixed fee is saved. Review the authentication-information declaration and publish the updated policy before Store submission. This draft does not certify Store declarations or change the separate web deployment.

## Completed checks

Node 24.21.0 on macOS; clean lockfile install and pinned SDK build.

- TypeScript passes; wallet suite: 219 pass, 5 opt-in skips, no failures.
- 22 conformance checks and 126 SDK tests pass.
- Extension package and separate web build pass.
- Both production dependency audits report zero vulnerabilities.
- Two package builds with different process timezones are byte-identical. SHA-256: `b8721d0e1a4f2337b109adafd5b72b8c511b65f19cf8304cd3d4eb29f46dda30`.
- ZIP contains 19 files, manifest at root, no maps, node_modules or web build. Manifest comparison and personal-name/local-path/credential-pattern scans pass. Required third-party license attributions are preserved. Pattern scans do not prove absence of all possible secrets.
- Deployed read/discovery test passes. Read-only fee projections for Nexus and testnet both report relay floor 1, empty projected blocks and automatic estimated fee 1. This validates the current read path, not transaction inclusion or future market conditions.
- Deployed purchase-review regression fails its fixture precondition: no eligible unpaid offer in the first 30 deposits. Review itself was not exercised against a live offer; this is not a pass.
- Initial main CI (before the final version-only merge): https://github.com/adalinxx/selfhold-wallet/actions/runs/40785145141 (success). Candidate PR CI must be checked on its exact head.

## Remaining acceptance and publication route

Chrome for Testing 153.0.8010.12 on macOS, with isolated temporary profiles and disposable accounts:

- Unpacked 0.5.1 → 0.5.2 upgrade through the actual extension Reload control preserved account, active address, settings and password. The new manifest reported 0.5.2. This did not establish Store-signed upgrade or recovery-record preservation.
- Malformed and expired requests were refused. Paste, file, QR-image and unconnected website requests reached review and were declined; the unconnected website remained disconnected. The unfunded pasted request could not sign.
- Website write review preserved saved fee 7 and explicit fees 0 and 3. With no saved fee, review resolved the live node floor to 1; the request was declined. No transaction was signed or submitted.
- Connect's new-account option created and selected a fresh account; the site received only its public address. The unused-node-permissions control remained absent and retained-grant guidance was present.
- A synthetic top-level page at the allowed web-wallet origin detected the unpacked extension. A non-secret invalid offer was refused with no pending import. Another origin and an iframe at the allowed origin could not use the detection handler. The no-offer screen and close/cancel path passed.

No private key was transmitted across the web/extension boundary. A valid handoff, its locked/unlocked import decisions and browser expiry behavior were **not** exercised. Tests used the unpacked extension ID and do not validate the published web wallet's Store-ID/passkey integration. In-process unit tests cover synthetic valid offers, address binding, expiry and origin checks, but are not browser acceptance. Test-harness waits were corrected for an already-closed window, extension CSP and asynchronous fee discovery; no product changes were needed. Both isolated browser sessions were closed.

Store-signed upgrade, camera capture, forced outages, deployed purchase-review and funded-flow repeat validation remain untested on this candidate. Default test skips are not evidence for isolated-node or live funded acceptance. Existing historical reports do not validate the new flows.

After owner approval of the disclosed limitations: verify candidate CI and source, merge only the documentation release PR, verify main tree and published policy, rebuild and compare the approved ZIP, then hand the exact artifact to the Store task. Preserve the existing Store item and publisher identity. Do not describe the remaining acceptance gaps as passed.
