---
name: security-review
description: Use for any app, site, API or game before merging, releasing or deploying, after changes to auth, permissions, database rules, payments or user input, or when asked for a security check (فحص أمني، ثغرات، حماية، قبل الإطلاق) — think like an attacker, prove each hole with a test, fix it, re-test.
---

# Security Review — find it, prove it, fix it (any project)

No app is perfectly secure. The goal: every realistic attack has a test showing it is blocked. Work like an attacker first, then like a fixer. Works for web apps, PWAs, mobile apps (Android/Capacitor/Flutter), backends/APIs and games. Reply to the user in Iraqi Arabic, plain words, no fear-mongering, no flattery.

## Golden rules
- **Never attack production or other people's systems.** Attack only the user's own project, on a local build, emulator, staging or test project. No destructive or bulk actions on live data.
- **The client belongs to the attacker.** Web pages, APKs and game builds can be read, modified and replayed. Anything checked only in the UI/client is not security; only the server, database rules or a trusted backend can enforce it.
- **Prove, don't guess.** "Confirmed" = a test reproduces it. "Fixed" = the same test is now blocked, and the normal-user test still passes.
- **Fix the smallest thing at the source**, keep old data compatible, and ask before migrations, deleting data, or rotating keys that could break users.

## Process
1. **Detect the stack** (package.json, firebase.json, supabase/, server code, AndroidManifest, Unity project…) and load the matching module below.
2. **Scope:** what changed (`git diff` vs main) and what data/endpoints it touches. Full review before a release.
3. **Recon / threat map:** assets (accounts, personal data, money, points/XP, admin power), entry points (forms, APIs, rules, deep links, uploads, webhooks), trust boundaries (client ↔ server), secrets, CI/CD.
4. **Attack:** for each checklist item write a test as the attacker — another user, signed-out, unverified, suspended, a modified client, a replayed/duplicated request, a huge/malformed input. Run it.
5. **Fix**, re-run attack + normal tests.
6. **Report** (format at the end). Ask before merging.

## Universal checklist (every project)
| # | Attack | What to try | Typical fix |
|---|---|---|---|
| 1 | **Broken access control (IDOR)** | Change an ID in a request/path to read or edit another user's data; list everything | Check ownership/membership on the server/rules for every read and write |
| 2 | **Privilege escalation** | Send extra fields: `role`, `isAdmin`, `points`, `balance`, `verified`, `status` | Allow-list writable fields; admin only via server-side claims/roles |
| 3 | **Broken auth** | Unverified email, weak/reset-password abuse, token reuse after logout, suspended account still working | Enforce verification/suspension server-side; short-lived tokens |
| 4 | **Injection** | SQL/NoSQL injection, command injection, path traversal (`../`), template injection | Parameterized queries, strict validation, no shell/eval with user input |
| 5 | **XSS / HTML injection** | Name = `<img src=x onerror=alert(1)>`, link = `javascript:alert(1)` | Escape output / `textContent`; allow only `https:` + expected hosts; `rel="noopener noreferrer"` |
| 6 | **Forged values & business logic** | Fake timestamps, negative quantities, price=0, XP +1000, skip a step, use a coupon twice | Server computes time, prices, counters; validate state transitions |
| 7 | **Race / replay / duplicates** | Double-click, two devices, replay the same request, join a full group twice | Transactions, idempotency keys, deterministic IDs, unique constraints |
| 8 | **Secrets exposure** | `git grep -nE "private_key|BEGIN PRIVATE|service[_-]?account|sk_live|secret|password\s*=|AIza[0-9A-Za-z_-]{30,}"`, check APK/JS bundles | Secrets only on server/CI secrets; leaked key = **rotate**, not just delete |
| 9 | **Abuse & cost (DoS / free-tier drain)** | Spam writes, unbounded queries, huge uploads, loops that reload everything | Rate limits, `limit` on queries, size limits, one-per-day IDs, budget alerts |
| 10 | **Insecure uploads** | Huge file, wrong type, HTML/SVG with script, overwrite others' path | Size/type limits, per-user paths, serve as download/inert |
| 11 | **Sensitive data exposure / privacy** | Emails/phones visible to strangers, data in logs/URLs/analytics, public repo | Least exposure + consent; deletion path; nothing personal in repo/logs |
| 12 | **Security headers & transport** | Clickjacking (iframe), mixed content, no CSP | HTTPS only; CSP, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` |
| 13 | **Vulnerable dependencies** | `npm audit --omit=dev` / Gradle / pub / NuGet advisories | Update/pin; remove unused packages |
| 14 | **CI/CD supply chain** | Workflows with broad `permissions`, `pull_request_target` on untrusted code, secrets printed | Least permissions, manual/protected deploys, mask secrets |

## Stack modules (use what applies)

### Firebase (Firestore / Storage / Auth)
- Rules are the real backend. Test with the **Emulator** and `@firebase/rules-unit-testing` as different identities.
- `keys().hasOnly([...])` on create, `diff().affectedKeys().hasOnly([...])` on update, `== request.time` for timestamps, `allow delete: if false` by default.
- Never `allow read: if request.auth != null` on private data; check broad `list` queries too.
- Admin via custom claims only. Web apiKey is public by design — restrict it by HTTP referrer in Google Cloud.
- Spark plan: count reads per user per day; rules `get()`/`exists()` also cost reads.

### Supabase / Postgres
- **RLS enabled on every table** with policies per operation; the `anon` key is public, the `service_role` key must never reach the client.
- Test as `anon`, as user A on user B's rows, and via RPC functions (`security definer` functions bypass RLS — review them).

### Custom backend / API (Node, Express, PHP, Python…)
- Authorization check in every handler, not only in middleware for some routes; validate body schemas; parameterized SQL.
- Rate limiting, CORS restricted to your origins, no stack traces to clients, secure cookies (`HttpOnly`, `Secure`, `SameSite`).

### Android / Capacitor / Flutter apps
- Decompile your own APK (jadx/apktool) and search for keys and hidden endpoints — what you find, an attacker finds.
- `android:exported` components, deep links/intents validated, WebView: no `addJavascriptInterface` with untrusted pages, no loading arbitrary URLs.
- Release builds: `debuggable=false`, minify/obfuscate, keystore never in repo, network security config HTTPS-only.
- In-app purchases/subscriptions verified on a server, never trusted from the device.

### Games (Unity and others)
- Assume the player edits memory, saves and network packets. Scores, currency, unlocks and rewards are validated server-side if they matter (leaderboards, purchases, competitive play).
- Save files: checksum/sign if tampering matters; never store purchase state only locally.
- Multiplayer: server-authoritative movement/damage; rate-limit actions; validate every client message.

## Report format (to the user)
```
## نتيجة الفحص الأمني — <المشروع / الفرع / التاريخ>
| # | الثغرة | الخطورة | مثبتة باختبار؟ | الحالة |
|---|---|---|---|---|
| 1 | مستخدم يگدر يعدّل نقاطه بنفسه | عالية | نعم: tests/security/xp.test | انحلت (حقول مسموحة بالقواعد) |
```
Severity: **حرجة** (data leak / account takeover / money) · **عالية** (privilege, abuse) · **متوسطة** (cost/DoS, hardening) · **منخفضة**.
End with: what was NOT tested (real devices, production config, third-party services) and the one next action.
