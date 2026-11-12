---
name: security-review
description: Use before merging, releasing or deploying, after any change to Firestore/Storage rules, auth, admin features or user input handling, or when asked for a security check (فحص أمني، ثغرات، حماية، قبل الإطلاق) — think like an attacker, prove each hole with a test, fix it, re-test.
---

# Security Review — find it, prove it, fix it

No app is perfectly secure. The goal: every realistic attack has a test that shows it is blocked. Work like an attacker first, then like a fixer. Reply to the user in Iraqi Arabic, plain words, no fear-mongering, no flattery.

## Golden rules
- **Never attack production.** All attack tests run on the Firebase Emulator / local build / a test project. No destructive or bulk actions on live data, ever.
- **The client is the attacker's.** Anyone can open DevTools, read `firebase-config.js` and call Firestore directly with their own account. UI checks are not security; only rules and trusted servers are.
- **Prove, don't guess.** A hole is "confirmed" only when a test reproduces it; "fixed" only when that same test now fails to attack.
- **Fix the smallest thing at the source** (usually a rule), keep old data compatible, and ask before any migration.

## Process
1. **Scope:** list what changed (git diff vs main) and the data/paths it touches. Full review before a release.
2. **Recon:** map collections, who should read/write each, admin powers, user inputs, external links, secrets, GitHub workflows.
3. **Attack:** for each item in the checklist write an emulator/unit test as the attacker (a different user, a signed-out user, an unverified user, a suspended user). Run it.
4. **Fix:** tighten the rule/code. Re-run the attack test (must be denied) AND the normal-user test (must still work).
5. **Report** (format below). Ask before merging anything.

## Attacker checklist (Firebase web apps)

### A. Firestore / Storage rules — the main door
| Attack | How to test | Typical fix |
|---|---|---|
| Read other users' private data (emails, messages, reports) via `get` or a broad `list` query | Emulator: user B reads/lists user A's docs | Per-doc ownership/membership checks; never `allow read: if signedIn()` on private data |
| Write/overwrite someone else's document | User B `set`/`update` A's doc | `request.auth.uid == resource.data.ownerUid` and on create `request.resource.data.ownerUid == request.auth.uid` |
| Privilege escalation: set `role`, `admin`, `xp`, `points`, `verified`, `suspended`, `status` on own doc | User updates own profile with extra fields | `diff(resource.data).affectedKeys().hasOnly([...safe fields])`; admin only via custom claims |
| Mass assignment: extra unexpected fields | Create with extra keys | `keys().hasOnly([...])` on create and update |
| Forged time/counters: fake `createdAt`, old/future day, XP increment by 1000 | Send client timestamps / big increments | `== request.time`; server-day checks; counters computed, not written by clients |
| Bypass limits: join a full group, join twice, 17th member, duplicate daily report | Race / repeat writes | Transactions + rules on sizes; deterministic doc IDs (`uid_day`) so repeats collide |
| Delete evidence | Delete reports/warnings | `allow delete: if false` unless truly needed |
| Unverified / suspended / signed-out access | Run tests with those identities | `verified()` and not-suspended helpers on sensitive paths |
| Storage upload abuse (if used) | Huge file, wrong type, others' path | Size/content-type/path-uid limits |

### B. Auth & admin
- Admin power only from **custom claims** or a trusted server, never from a client-writable field.
- Admin pages (`admin.html`) must be protected by rules, not by hiding the link.
- Email verification enforced in rules where emails or contact data are exposed.

### C. XSS / injection in the UI
- Search for `innerHTML`, `insertAdjacentHTML`, template strings with user data. Every user value must be escaped (`esc()`/`clean()`) or set via `textContent`.
- Links from users: allow only `https:` and expected hosts (e.g. `play.google.com`); block `javascript:` URLs; `target="_blank"` needs `rel="noopener noreferrer"`.
- Test: save a name like `<img src=x onerror=alert(1)>` and a URL like `javascript:alert(1)` in the emulator/preview; nothing may execute.

### D. Secrets & config
- `git grep -nE "private_key|BEGIN PRIVATE|service[_-]?account|AIza[0-9A-Za-z_-]{30,}|sk_live|password\s*="` — the Firebase **web** apiKey is public by design, but must be restricted by HTTP referrer in Google Cloud Console; anything else is a leak.
- `.gitignore` covers service-account JSON, `.env`, keystores. A leaked secret must be **rotated**, not just deleted from git.

### E. Abuse & cost (Spark free-plan denial of service)
- Unbounded queries/listeners (no `limit`), listeners not closed on logout, reloading whole collections after every click.
- Spam writes (messages, reminders) — enforce one-per-day IDs or rate limits in rules.
- Estimate reads per active user per day; flag anything that could exhaust 50k reads/day.

### F. Hosting & browser hardening (`firebase.json` headers)
- `Content-Security-Policy` (scripts only from self + gstatic), `X-Frame-Options: DENY` or `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
- Service worker must not cache private API responses for other users.

### G. Dependencies & CI
- `npm audit --omit=dev`; pin CDN SDK versions.
- GitHub Actions: least `permissions`, no `pull_request_target` running untrusted code, secrets never echoed, deploy workflows manual/protected.

### H. Privacy
- Personal data (emails, names) visible only to who needs it, with consent; deletion path exists; nothing personal in public repo or logs.

## Report format (to the user)
```
## نتيجة الفحص الأمني — <التاريخ / الفرع>
| # | الثغرة | الخطورة | مثبتة باختبار؟ | الحالة |
|---|---|---|---|---|
| 1 | مستخدم يگدر يقرا إيميلات مجموعة مو عضو بيها | عالية | نعم: tests/emulator/x.test.mjs | انحلت (قاعدة members) |
```
Severity: **حرجة** (data leak/takeover) · **عالية** (privilege/abuse) · **متوسطة** (cost/DoS, hardening) · **منخفضة**.
End with: what was NOT tested (e.g. real devices, production config) and the one next action.
