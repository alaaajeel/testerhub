// The daily packs job (GitHub Actions, Firebase Admin SDK). It is the only writer of warnings:
// for each finished day of a running pack, a member who confirmed fewer than 70% of the other active
// members' apps gets one warning; 3 warnings and they are out. Day 1 (the day the pack filled) is for
// installing, so it is never counted. After day 16 the pack is done. It also opens the first pack.

export const PACK_SIZE = 16, PACK_DAYS = 16, PASS = 0.7, MAX_STRIKES = 3;
const DAY_MS = 86400000;
const dayKey = date => date.toISOString().slice(0, 10);
const addDays = (key, n) => dayKey(new Date(Date.parse(key + 'T00:00:00Z') + n * DAY_MS));

// Pure: who gets a warning for one day. members: [{uid,status,strikes}], confirmed: {uid: [confirmed uids]}.
export function judgeDay(members, confirmed) {
  const active = members.filter(m => m.status === 'active');
  const results = [];
  for (const m of active) {
    const others = active.filter(x => x.uid !== m.uid).map(x => x.uid);
    if (!others.length) continue;
    const need = Math.ceil(others.length * PASS);
    const got = new Set((confirmed[m.uid] || []).filter(uid => others.includes(uid))).size;
    if (got < need) {
      const strikes = (m.strikes || 0) + 1;
      results.push({uid: m.uid, got, need, strikes, out: strikes >= MAX_STRIKES});
    }
  }
  return results;
}

export async function runPacks({db, now = new Date()}) {
  const {FieldValue} = await import('firebase-admin/firestore');
  const flags = await db.doc('appConfig/features').get();
  if (!(flags.exists && flags.data().packs === true)) return {enabled: false};
  const summary = {enabled: true, opened: 0, judged: 0, warnings: 0, removed: 0, finished: 0};
  // The first pack: created here once, then every 16th joiner opens the next one.
  const meta = db.doc('packMeta/current');
  if (!(await meta.get()).exists) {
    const batch = db.batch();
    batch.set(meta, {openPackId: 'p1', number: 1, updatedAt: FieldValue.serverTimestamp()});
    batch.set(db.doc('packs/p1'), {number: 1, status: 'open', size: PACK_SIZE, days: PACK_DAYS, memberCount: 0, createdAt: FieldValue.serverTimestamp()});
    await batch.commit();summary.opened++;
  }
  const yesterday = addDays(dayKey(now), -1);
  const running = await db.collection('packs').where('status', '==', 'running').get();
  for (const packSnap of running.docs) {
    const pack = packSnap.data();
    if (!pack.startDay) continue;
    const last = addDays(pack.startDay, PACK_DAYS - 1);
    // Day 1 is for installing; judging starts with day 2.
    let day = pack.checkedThrough ? addDays(pack.checkedThrough, 1) : addDays(pack.startDay, 1);
    const membersSnap = await packSnap.ref.collection('members').get();
    const members = membersSnap.docs.map(d => ({uid: d.id, ...d.data()}));
    while (day <= yesterday && day <= last) {
      const daysSnap = await packSnap.ref.collection('days').where('date', '==', day).get();
      const confirmed = Object.fromEntries(daysSnap.docs.map(d => [d.data().uid, d.data().confirmed || []]));
      const verdicts = judgeDay(members, confirmed);
      const batch = db.batch();
      for (const v of verdicts) {
        const m = members.find(x => x.uid === v.uid);
        m.strikes = v.strikes;
        const change = {strikes: v.strikes, lastWarningDay: day};
        if (v.out) {m.status = 'out';change.status = 'out';change.outDay = day;summary.removed++}
        batch.update(packSnap.ref.collection('members').doc(v.uid), change);
        summary.warnings++;
      }
      const done = day >= last;
      batch.update(packSnap.ref, {checkedThrough: day, ...(done ? {status: 'done', endedDay: day} : {})});
      await batch.commit();
      summary.judged++;
      if (done) summary.finished++;
      day = addDays(day, 1);
    }
  }
  return summary;
}
