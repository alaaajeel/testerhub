# TesterHub Help Center — integration notes

## Status
- `help/index.html` is a standalone RTL mobile-first prototype. Search, categories and articles work without Firebase.
- This branch is **not deployed, merged, or connected to production**.
- Draft instructional content must be verified against the final product behavior after Claude's current update.
- Support is an explicit integration hook, **not** a functioning ticket service; do not claim tickets were sent.
- Telegram button appears only if an **official verified** `https://t.me/<account>` is configured; no URL is assumed.
- Admin CMS and dynamic Firestore reading are **not yet implemented**.

## Minimal integration for Claude
1. After current update is merged and reviewed, inspect actual app routes, existing support messages and admin auth. Preserve existing user/project/assignment/XP/report data, Firestore schemas and streaks.
2. Embed the help center in existing app navigation as a reachable public route `/help` (or existing router equivalent), preserving overall app shell/nav and mobile PWA behavior. Avoid duplicating app-wide navigation bars. If Firebase Hosting doesn't rewrite `/help`, configure a specific redirect/rewrite to `/help/` or serve an equivalent route. Do not overwrite existing `index.html`.
3. Implement support hook in host context before the help script loads:
```html
<script>
window.TESTERHUB_HELP_CONFIG = {
  openSupport: () => { /* navigate to EXISTING authorized support chat / support ticket UI */ },
  // telegramUrl: 'https://t.me/verified_official_account'
};
</script>
```
If a native route or API already exists, connect to it and verify permissions. If it does **not** exist, separately propose a Firestore support-ticket feature for approval; do not invent or silently enable one. The standalone preview intentionally indicates unconnected support.
4. Admin-managed help articles: implement a separate reviewed stage. Suggested fields: `slug`, `role`, `title`, `summary`, `steps`, `imageUrl`, `videoUrl`, `published`, `updatedAt`, `order`. Public users may read *published* entries only. Only existing proven admin identity may create/edit/unpublish; implement and emulator-test security rules, rate/size limits and safe output escaping. Do not store admin privilege flags that users can edit. Store external media as approved links if staying on Spark.
5. Do not track support or external Group/Google Play membership with the local checklists; the interactive readiness cards were removed per user request. Visibility status and consent to email sharing must remain **separate**.
6. Verify responsive Android, accessibility, search, route direct-open and reload, offline behavior if app already supports it, category and article links, and app back-navigation. Run tests, create PR, and **do not merge, deploy or change production** without user permission.

## Manual verification checklist
- Search Arabic phrase and open article; navigate back to category.
- Visit tester/developer/FAQ; open `ready-email`, `missing-invites`, `developer-ready`.
- Open support dialog; in standalone mode it must **not** falsely claim a ticket is sent.
- Configure a test `openSupport` callback and verify it opens the existing support workflow.
- Configure a verified Telegram handle and confirm the correct external domain; without it, no Telegram action appears.
- Phone 320–430px width, RTL, keyboard, reload of deep-link URL.
- Zero changes to existing Firebase records, test streaks, counts, XP or production hosting.

## Preview
https://htmlpreview.github.io/?https://github.com/alaaajeel/testerhub/blob/preview/help-center-20261107/help/index.html
