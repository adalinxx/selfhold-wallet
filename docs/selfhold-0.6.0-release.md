# Selfhold 0.6.0 candidate evidence

Prepared October 28, 2026. **Draft: not ready for Store submission.** Browser acceptance and review of the new web-account import disclosure remain pending. No independent audit is claimed.

## Source and scope

Merged baseline: `e58e0d9a0f50570291a7d10e1f38e0be8649959b`; previous submitted 0.5.1: `ad78603ba0aaea853568a102662b5ab800655b9b`. SDK: `1e3ab50ab591c1c6ccab3b4187f3dfb984bb1ebe`. GitHub's repository API still identifies `adalinxx/selfhold-wallet` as canonical, although SDK/design references moved to 0xLattice. PR #22 merged during preparation and is included after revalidation; no unmerged feature is included.

Merged PRs #22 and #26–#42 add automatic node/weight-based fees and block-time warnings; branding, typography, activity and approval refinements; same-chain pending-write sequencing and recovery; SDK updates; a separately deployed web wallet; its account handoff into Chrome; account creation in Connect; and account labels derived from accepted Moniker handle writes without additional handle lookups. The new features justify a minor candidate version of 0.6.0. Release preparation changes version and documentation only. The removed unused-node-permissions control remains absent. Homepage: https://selfhold.app/.

## Permissions and privacy

Required/optional host permissions, content-script matches, CSP, storage and alarms permissions match 0.5.1. New `externally_connectable` matches only `https://wallet.selfhold.app/*`. The worker also checks top-level sender origin, rejects extension senders, and requires an extension-owned confirmation before importing. The web wallet offers a private key through local Chrome messaging; it is temporarily retained in session storage outside the encrypted vault. Offers expire after two minutes, with deletion on next access; acceptance, decline or closing the confirmation clears the offer. Existing wallets must be unlocked. The address is bound to the confirmation and no existing extension key is returned to the page. These are source/unit-test findings, not completed browser acceptance.

The policy now describes the handoff and corrects the historical fee description: 0.5.1 used a saved fee or one; 0.6.0 uses the node's automatic fee when no fixed fee is saved. Review the authentication-information declaration and publish the updated policy before Store submission. This draft does not certify Store declarations or change the separate web deployment.

## Completed checks

Node 24.21.0 on macOS; clean lockfile install and pinned SDK build.

- TypeScript passes; wallet suite: 219 pass, 5 opt-in skips, no failures.
- 22 conformance checks and 126 SDK tests pass.
- Extension package and separate web build pass.
- Both production dependency audits report zero vulnerabilities.
- Two package builds with different process timezones are byte-identical. SHA-256: `50b2f2d937b12530206e3a43a3f5e480092b2e8ca017a8861b203f651d93821a`.
- ZIP contains 19 files, manifest at root, no maps, node_modules or web build. Manifest comparison and personal-name/local-path/credential-pattern scans pass. Required third-party license attributions are preserved. Pattern scans do not prove absence of all possible secrets.
- Deployed read/discovery test passes. Read-only fee projections for Nexus and testnet both report relay floor 1, empty projected blocks and automatic estimated fee 1. This validates the current read path, not transaction inclusion or future market conditions.
- Deployed purchase-review regression fails its fixture precondition: no eligible unpaid offer in the first 30 deposits. Review itself was not exercised against a live offer; this is not a pass.
- Merged baseline CI: https://github.com/adalinxx/selfhold-wallet/actions/runs/40785145141 (success). Candidate PR CI must be checked on its exact head.

## Remaining acceptance and publication route

Browser work is held for an uninterrupted interval coordinated with the user and Store task. Repeat unpacked 0.5.1 upgrade using the actual extension Reload control; verify vault/accounts/settings/recovery preservation and changed fee behavior. Exercise paste, QR-image, file and website request review/decline and the new external account handoff with synthetic accounts only, including locked wallet, wrong origin, expiry and decline. No live signing, funded transactions or real keys are authorized for these checks.

Store-signed upgrade, camera capture, forced outages, deployed purchase-review and funded-flow repeat validation remain untested on this candidate. Default test skips are not evidence for isolated-node or live funded acceptance. Existing historical reports do not validate the new flows.

After browser acceptance and disclosure review: update this evidence, verify candidate CI and source, reconcile/merge only the release PR with owner authorization, verify main tree and published policy, rebuild and compare the approved ZIP, then hand the exact artifact to the Store task. Preserve the existing Store item and publisher identity. Do not upload this draft candidate while its acceptance gaps are unresolved.
