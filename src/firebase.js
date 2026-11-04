import {initializeApp} from 'firebase/app';
import {getAuth, connectAuthEmulator} from 'firebase/auth';
import {initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, connectFirestoreEmulator} from 'firebase/firestore';

// Local verification only: the switch cannot exist on a deployed hostname.
const emulator = location.hostname === '127.0.0.1' && new URLSearchParams(location.search).has('emulator');
const config = emulator ? {apiKey: 'demo', authDomain: 'demo.local', projectId: 'demo-testerhub', appId: '1:1:web:1'} : window.TESTERHUB_FIREBASE_CONFIG;

export const app = initializeApp(config);
export const auth = getAuth(app);
auth.languageCode = 'ar';

// The persistent cache lets listeners resume without re-reading everything, which protects the Spark quota.
function firestore() {
  try {
    return initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})});
  } catch {
    return initializeFirestore(app, {localCache: memoryLocalCache()});
  }
}
export const db = firestore();

if (emulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings: true});
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
