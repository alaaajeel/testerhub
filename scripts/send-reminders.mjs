// Entry point for the scheduled GitHub Actions job. The credential exists only as a repository secret.
import {cert, initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {runReminders} from './reminder-job.mjs';

function credential() {
  // JSON.parse quotes the input in its error, so its message must never reach the log.
  try { return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is missing or is not a service account JSON.'); }
}

const app = initializeApp({credential: credential()});
const result = await runReminders({db: getFirestore(app), messaging: getMessaging(app)});
// Counts only: tokens and account ids stay out of the public Actions log.
console.log(JSON.stringify(result));
// Partial failures may be one bad device; nothing delivered at all means the job itself is broken.
if (result.failed && !result.sent) process.exit(1);
