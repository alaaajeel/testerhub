# TesterHub Admin — implementation and production gate

**State:** Code-only staging. Not live until production Firebase Functions are deployed, admin claims are granted, and Firestore rules are reviewed and published.

## Single administrator
The only eligible administrator is the *verified* Firebase Auth account \`dhi98886@gmail.com\` plus custom claim \`testerhubAdmin: true\`. Email alone never grants access. The admin page does not use normal Firestore SDK reads; all admin data comes from callable Functions. Do not grant admin rights from client code or a Firestore profile role.

## What the admin console can do
- Read counts for users, apps, assignments, reports, messages and deletion jobs.
- Browse paginated user and application lists.
- Initiate permanent deletion by typing the exact application name.
- Poll a durable deletion job and manually continue it.
- A Cloud Scheduler function resumes queued jobs every five minutes after proper deployment. It is not operational until deployed.

## Permanent deletion model
1. Callable function validates the server-issued admin claim and fixed admin email.
2. Firestore transaction changes \`projects/{id}.status\` to \`deleting\` and creates \`adminDeleteJobs/{id}\`.
3. **New** report/message writes and all assignment updates are rejected by the updated Firestore security rules while the project is deleting. Existing historical data is readable during the operation.
4. The worker deletes at most 150 scoped documents per run, from \`messages\`, \`reports\`, \`assignments\`, \`bugs\`, \`bugReports\`. Only a strict projectId match qualifies; user profiles and data for other projects are never deleted.
5. When related records are exhausted, the project document is removed and an audit record is created in \`adminAuditLogs\`. A job can be resumed after a client disconnect or worker interruption.
6. The worker does **not** delete Firebase Storage objects; if image uploads are introduced later, add scoped Storage cleanup. There is no recovery after permanent deletion.
7. The platform remains live in GitHub Pages and Firebase while this PR is under review.

## Deployment checklist (requires authorized owner, not a chatbot secret)
1. In Firebase Console for \`testhubiq-c7711\`, check the actual deployed rules against repository \`firestore.rules\`. Merge differences; never blindly overwrite newer rules.
2. Test the changed rules against the Emulator and with two real users, including project locking and denial of message/report/checkin after lock.
3. From an authenticated local computer or Cloud Shell, install the Firebase CLI and deploy **functions** to this existing project. Enable Blaze for 2nd-gen Cloud Functions and Cloud Scheduler if required. Deployment: \`firebase deploy --only functions --project testhubiq-c7711\`. Avoid deploying \`firestore\` or overwriting Hosting.
4. Grant the claim from a trusted Cloud Shell/ADC environment: \`cd functions && npm install && node grant-admin.cjs --confirm-grant\`. Confirm that ADC has permission; do not upload credentials or print private keys.
5. Sign out and sign back in with the verified admin account; visit \`https://testiqx.web.app/admin.html\` after deploying that web file.
6. Test with a sacrificial project containing >200 messages/reports. Verify that unrelated applications, user accounts, and messages are retained, with audit trail.
7. Only after passing production smoke tests, enable access to non-test data.

## Required release order
Rules have to block writes on deletion *before* activating permanent-delete callables. Deploy the web UI after Functions are available; otherwise it will show a safe "service unavailable" error.

## Existing site
Firebase Hosting URL: https://testiqx.web.app/
GitHub repository: https://github.com/alaaajeel/testerhub
