# TesterHub continuation checkpoint

Current candidate: `integration/mvp-candidate`, combining PR #3–#8 into one Firestore rules file and UI. See `MVP-CANDIDATE-AR.md` for tests, production gate and remaining work. Local verification: Node 55, emulator 22, Chromium 16, build/preflight. Keep PR open until production rules are checked and published before merging the UI.

Baseline: dd84d5179496afec2b7a428b1a940d3064076c60. Existing repository only. Phase 1 and phase 2 tester selection merged into main through PR #1 and PR #2. Their matching rules were reported published by the user, but the Console editor content was not independently verified.

Integration branch: `integration/phase-2-3`, combining draft projects (PR #3), UTC reports (PR #4), and daily task snapshots (PR #5). Combined rules and UI passed Node 55, Firebase emulator 19, Chromium 14, build and preflight. See `PHASE-2-LIFECYCLE-AR.md`, `PHASE-2-TIMING-AR.md`, `PHASE-3-TASKS-AR.md`. PR #6 is the prerequisite integration; individual draft PRs remain unmerged. Publish the combined Firestore rules before the UI merge and verify them with real accounts. No production rules or data were modified by this branch.

Phase 2 invitation follow-up branch `phase-2/invitation-status` builds on integration #6. New assignments require explicit tester response before starting the 14-day clock; seven-day pending expiry uses server creation time. Read `PHASE-2-INVITATIONS-AR.md`. This branch has additional rules: deploy them before its UI, after integrating #6.
Phase 4 follow-up branch `phase-4/message-idempotency` builds on the integration branch. It prevents duplicate message writes on retry and sorts by server timestamp; see `PHASE-4-MESSAGES-AR.md`. PR #6 remains the prerequisite for this branch. No production data has been changed.


Phase 1 branch: phase-1/accounts-security. Read PHASE-1-AR.md for exact implementation, verification evidence, production dependency and deployment commands.

User authorization: existing accounts are disposable personal test accounts; approved freedom to modify production rules after verification. No deletion required. GitHub PR before merge; never claim production deployment from local tests. Firebase CLI has no administrative authentication. No production data inspected or mutated.

Priority backlog (separate branches/PRs):
1. Phase 2: explicit tester selection, invitations with statuses, unique assignment IDs, retain progress on repair, project lifecycle and immutable participation configuration; authoritative UTC report timing and concurrency.
2. Phase 3: task snapshots, meaningful daily reports, structured bugs, optional secure Storage upload and retest flow.
3. Phase 4: scoped chat, idempotency, persistent read markers/notifications; honest disabled Push scaffold until trusted backend and credentials available.
4. Phase 5: admin custom claims and trusted backend actions; no client privilege toggle.
5. Phase 6: Android UX/PWA/performance; keep brand and splash.
6. Phase 7: extended rules audit, privacy/terms, deletion request/retention and email consent.
7. Phase 8: XP quality criteria, no fake reviews or Google Play verification claims.
8. Phase 9: five specialist QA tracks, acceptance between accounts; distinguish emulator/doubles from physical devices and real people.
9. Phase 10: verify production rules/auth/indexes; approved migration only if necessary; deploy and verify Actions + live login.

Do not merge phase 1 UI before the matching Firebase rules. Test command npm run test:rules uses project demo-testerhub and isolated Auth/Firestore emulators. Existing browser Firebase SDK is 13.1.0; npm test SDK is pinned by package-lock (12.6.0) and production CDN behavior still needs a live smoke test.

Phase 2 selection slice: branch phase-2/tester-selection, based on phase 1. Explicit opt-in tester checkboxes; selected-only copy; selectedTesterUids on new projects; repair only from saved selected list; rules enforce membership and uniqueness. Legacy projects have no automatic broad repair. See PHASE-2-SELECTION-AR.md. Remaining phase 2 work is listed there.

Firebase Console authentication subsequently succeeded. The project and current rules view were opened. Automatic approval review blocked reading/copying editor content due to usage limit; no production rules changed. Do not attempt an alternate route to bypass that block.
