/* Permanent project deletion without a server, shared by the developer app and the admin console. */
(function (root) {
  const RELATED = ['messages', 'reports', 'assignments', 'applications'];
  // Firestore rules read the same few documents for every write, so one batch can hold many deletes.
  const BATCH_SIZE = 100;
  const scoped = (f, db, name, projectId, ownerUid, extra = []) => {
    const filters = [f.where('projectId', '==', projectId)];
    // Without admin rights a query must be limited to the owner's own records.
    if (ownerUid) filters.push(f.where('ownerUid', '==', ownerUid));
    return f.query(f.collection(db, name), ...filters, ...extra);
  };
  async function countRelated({db, f, projectId, ownerUid = null}) {
    const counts = {};
    await Promise.all(RELATED.map(async name => {
      const snap = await f.getCountFromServer(scoped(f, db, name, projectId, ownerUid));
      counts[name] = snap.data().count;
    }));
    return counts;
  }
  async function deleteProject({db, f, projectId, ownerUid = null, audit = null}) {
    const ref = f.doc(db, 'projects', projectId), current = await f.getDoc(ref);
    if (!current.exists()) return false;
    // Lock first: rules then reject new reports and messages, and a retry can pick up from here.
    if (current.data().status !== 'deleting') await f.updateDoc(ref, {status: 'deleting'});
    for (const name of RELATED) {
      for (;;) {
        const snap = await f.getDocs(scoped(f, db, name, projectId, ownerUid, [f.limit(BATCH_SIZE)]));
        if (snap.empty) break;
        const batch = f.writeBatch(db);
        for (const item of snap.docs) batch.delete(item.ref);
        await batch.commit();
      }
    }
    const finish = f.writeBatch(db);
    finish.delete(ref);
    if (audit) audit(finish);
    await finish.commit();
    return true;
  }
  root.TesterHubDeletion = {countRelated, deleteProject};
})(globalThis);
