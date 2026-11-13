// Fairness (V2 phase 2) in the demo store: publishing needs 3 accepted reports and no other live app.
// The seeded demo developer has three live apps and no reports, so tests that publish first earn the right
// the way a real developer would: accepted reports from testing others, and the old apps ended.
export function grantPublishInDemo(){
 const d=demoState();
 d.xp={...(d.xp||{}),totals:{...(d.xp?.totals||{}),d1:{...(d.xp?.totals?.d1||{}),reports:3,bugs:0}}};
 for(const p of d.projects)if(p.ownerUid==='d1'&&(p.status||'recruiting')==='recruiting')p.status='completed';
 save(d);
}
