// The packs job (GitHub Actions every 15 minutes, Firebase Admin SDK). It is the only writer of warnings and
// earned coins. Coins arrive within the next run: 1 per confirmed app of another active member, 1 per daily
// report on any app. Once a day is over, a member who confirmed fewer than 70% of the day's apps gets one
// warning; 3 warnings and they are out. Day 1 (the day the pack filled) is for installing: it earns coins but
// never warns. After day 16 the pack is done and its public app cards are hidden. It also opens the first pack.

export const PACK_SIZE = 16, PACK_DAYS = 16, PASS = 0.7, MAX_STRIKES = 3;
// Daily reports on any app (the old invitations and the new apps alike) also earn 1 coin each, from this day on.
export const REPORT_COINS_FROM = '2026-11-13';
const DAY_MS = 86400000;
const dayKey = date => date.toISOString().slice(0, 10);
const addDays = (key, n) => dayKey(new Date(Date.parse(key + 'T00:00:00Z') + n * DAY_MS));

// Pure: who gets a warning for one day. members: [{uid,status,strikes}], confirmed: {uid: [confirmed uids]}.
// Pure: coins earned for one day — each confirmed app of another active member, once.
export function coinsForDay(members, confirmed) {
  const active = new Set(members.filter(m => m.status === 'active').map(m => m.uid));
  const out = {};
  for (const uid of active) {
    const n = new Set((confirmed[uid] || []).filter(x => x !== uid && active.has(x))).size;
    if (n) out[uid] = n;
  }
  return out;
}
// Pure: coins for one day of daily reports — one per report, none for a rejected one.
export function coinsForReports(reports) {
  const out = {};
  for (const r of reports) if (r.testerUid && r.reviewStatus !== 'rejected') out[r.testerUid] = (out[r.testerUid] || 0) + 1;
  return out;
}
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
  const {FieldValue, Timestamp} = await import('firebase-admin/firestore');
  const flags = await db.doc('appConfig/features').get();
  if (!(flags.exists && flags.data().packs === true)) return {enabled: false};
  const summary = {enabled: true, opened: 0, judged: 0, warnings: 0, removed: 0, finished: 0, packCoins: 0, reportCoins: 0};
  const give = (batch, uid, n) => batch.set(db.doc('coins/' + uid), {earned: FieldValue.increment(n), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  // The first pack: created here once, then every 16th joiner opens the next one.
  const meta = db.doc('packMeta/current');
  if (!(await meta.get()).exists) {
    const batch = db.batch();
    batch.set(meta, {openPackId: 'p1', number: 1, updatedAt: FieldValue.serverTimestamp()});
    batch.set(db.doc('packs/p1'), {number: 1, status: 'open', size: PACK_SIZE, days: PACK_DAYS, memberCount: 0, createdAt: FieldValue.serverTimestamp()});
    await batch.commit();summary.opened++;
  }
  // Coins for daily reports arrive within the run after they are sent (every 15 minutes): only reports newer than the cursor are read.
  {
    const cursor = db.doc('coinsState/reports'), seen = await cursor.get();
    const since = seen.exists && seen.data().after ? seen.data().after : Timestamp.fromMillis(Date.parse(REPORT_COINS_FROM + 'T00:00:00Z'));
    const snap = await db.collection('reports').where('submittedAt', '>', since).orderBy('submittedAt').limit(400).get();
    if (snap.size) {
      const fresh = snap.docs.map(d => d.data()).filter(r => r.date >= REPORT_COINS_FROM);
      const batch = db.batch();
      for (const [uid, n] of Object.entries(coinsForReports(fresh))) {give(batch, uid, n);summary.reportCoins += n}
      batch.set(cursor, {after: snap.docs[snap.size - 1].data().submittedAt, updatedAt: FieldValue.serverTimestamp()});
      await batch.commit();
    }
  }
  const today = dayKey(now), yesterday = addDays(today, -1);
  const running = await db.collection('packs').where('status', '==', 'running').get();
  for (const packSnap of running.docs) {
    const pack = packSnap.data();
    if (!pack.startDay) continue;
    const last = addDays(pack.startDay, PACK_DAYS - 1);
    const membersSnap = await packSnap.ref.collection('members').get();
    const members = membersSnap.docs.map(d => ({uid: d.id, ...d.data()}));
    // Pack coins as they happen: each confirmation of another active member's app, once. The ledger
    // packs/{id}/paid/{date} (unreadable to members) remembers what each member was already paid that day.
    const since = pack.coinsAfter || Timestamp.fromMillis(0);
    const changed = await packSnap.ref.collection('days').where('updatedAt', '>', since).orderBy('updatedAt').limit(400).get();
    if (changed.size) {
      const byDate = {};
      for (const d of changed.docs) {
        const rec = d.data();
        if (rec.date < pack.startDay || rec.date > last || (pack.checkedThrough && rec.date <= pack.checkedThrough)) continue;
        (byDate[rec.date] ||= {})[rec.uid] = rec.confirmed || [];
      }
      const batch = db.batch();
      for (const [date, confirmed] of Object.entries(byDate)) {
        const ledgerRef = packSnap.ref.collection('paid').doc(date), ledger = (await ledgerRef.get()).data()?.counts || {};
        const due = coinsForDay(members, confirmed), counts = {...ledger};
        for (const [uid, n] of Object.entries(due)) {
          const extra = n - (ledger[uid] || 0);
          if (extra > 0) {give(batch, uid, extra);counts[uid] = n;summary.packCoins += extra}
        }
        batch.set(ledgerRef, {counts});
      }
      batch.update(packSnap.ref, {coinsAfter: changed.docs[changed.size - 1].data().updatedAt});
      await batch.commit();
    }
    // Warnings once a day is over. Day 1 is for installing: it never warns.
    let day = pack.checkedThrough ? addDays(pack.checkedThrough, 1) : pack.startDay;
    while (day <= yesterday && day <= last) {
      const daysSnap = await packSnap.ref.collection('days').where('date', '==', day).get();
      const confirmed = Object.fromEntries(daysSnap.docs.map(d => [d.data().uid, d.data().confirmed || []]));
      const batch = db.batch();
      const verdicts = day === pack.startDay ? [] : judgeDay(members, confirmed);
      for (const v of verdicts) {
        const m = members.find(x => x.uid === v.uid);
        m.strikes = v.strikes;
        const change = {strikes: v.strikes, lastWarningDay: day};
        if (v.out) {
          m.status = 'out';change.status = 'out';change.outDay = day;summary.removed++;
          batch.set(db.doc(`packApps/${packSnap.id}_${v.uid}`), {active: false}, {merge: true});
        }
        batch.update(packSnap.ref.collection('members').doc(v.uid), change);
        summary.warnings++;
      }
      const done = day >= last;
      batch.update(packSnap.ref, {checkedThrough: day, ...(done ? {status: 'done', endedDay: day} : {})});
      if (done) for (const m of members) batch.set(db.doc(`packApps/${packSnap.id}_${m.uid}`), {active: false}, {merge: true});
      await batch.commit();
      summary.judged++;
      if (done) summary.finished++;
      day = addDays(day, 1);
    }
  }
  return summary;
}
