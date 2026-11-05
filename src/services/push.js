/* Registers this device for notifications while the app is closed. Sending happens in scripts/push-job.mjs. */
(function (root) {
  const DEVICE = 'testerhub_push_device', SYNCED = 'testerhub_push_synced';
  const RESYNC_MS = 7 * 86400000;
  function utcHour(localHour, now = new Date()) {
    const at = new Date(now);
    at.setHours(localHour, 0, 0, 0);
    return at.getUTCHours();
  }
  async function hashHex(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }
  function createPush({db, f, storage, available, getToken, getHour}) {
    // Runs on every app open but writes only on a change or once a week, to keep Spark writes low.
    async function sync(uid, {force = false} = {}) {
      if (!available() || !uid) return false;
      const token = await getToken();
      if (!token) return false;
      const id = await hashHex(token), hour = utcHour(getHour());
      const signature = [uid, id, hour].join('|');
      const [lastSignature, lastAt] = String(storage.getItem(SYNCED) || '').split('@');
      if (!force && lastSignature === signature && Date.now() - Number(lastAt) < RESYNC_MS) return true;
      await f.setDoc(f.doc(db, 'pushDevices', id), {uid, token, reminderUtcHour: hour, updatedAt: f.serverTimestamp()}, {merge: true});
      storage.setItem(DEVICE, id);
      storage.setItem(SYNCED, signature + '@' + Date.now());
      return true;
    }
    // Signing out must stop this device receiving the account's notifications.
    async function remove() {
      const id = storage.getItem(DEVICE);
      storage.removeItem(DEVICE);
      storage.removeItem(SYNCED);
      if (id) await f.deleteDoc(f.doc(db, 'pushDevices', id));
    }
    return {available, sync, remove};
  }
  root.TesterHubPush = {createPush, utcHour, hashHex};
})(globalThis);
