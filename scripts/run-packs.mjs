// Entry point for the daily packs job. The credential exists only as a repository secret.
import {cert, initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {runPacks} from './packs-job.mjs';

function credential() {
  // JSON.parse quotes the input in its error, so its message must never reach the log.
  try { return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is missing or is not a service account JSON.'); }
}
const app = initializeApp({credential: credential()});
// Counts only: no names, emails or ids in the public Actions log.
console.log(JSON.stringify(await runPacks({db: getFirestore(app)})));
