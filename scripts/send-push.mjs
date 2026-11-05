// Entry point for the scheduled GitHub Actions job. The credential exists only as a repository secret.
import {cert, initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {runActivity, runReminders} from './push-job.mjs';

function credential() {
  // JSON.parse quotes the input in its error, so its message must never reach the log.
  try { return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is missing or is not a service account JSON.'); }
}

const app = initializeApp({credential: credential()});
const context = {db: getFirestore(app), messaging: getMessaging(app)};
const activity = await runActivity(context);
const reminders = await runReminders(context);
// Counts only: tokens, text and account ids stay out of the public Actions log.
console.log(JSON.stringify({activity, reminders}));
// Partial failures may be one bad device; nothing delivered at all means the job itself is broken.
const failed = activity.failed + reminders.failed, sent = activity.sent + reminders.sent;
if (failed && !sent) process.exit(1);
