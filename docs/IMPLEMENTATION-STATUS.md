# TesterHub continuation checkpoint

Baseline: dd84d5179496afec2b7a428b1a940d3064076c60. Existing repository only.

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
