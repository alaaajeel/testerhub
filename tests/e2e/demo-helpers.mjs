// Fairness (V2 phase 2) in the demo store: publishing needs 3 accepted reports and no other live app.
// The seeded demo developer has three live apps and no reports, so tests that publish first earn the right
// the way a real developer would: accepted reports from testing others, and the old apps ended.
export function grantPublishInDemo(){
 const d=demoState();
 d.xp={...(d.xp||{}),totals:{...(d.xp?.totals||{}),d1:{...(d.xp?.totals?.d1||{}),reports:3,bugs:0}}};
 for(const p of d.projects)if(p.ownerUid==='d1'&&(p.status||'recruiting')==='recruiting')p.status='completed';
 save(d);
}

// V2: today's report is a three-step sheet opened from «اختباراتي».
export async function openReportSheet(page,appName){
 await page.locator('.nav [data-tab="tests"]').click();
 await page.locator('.v2-test',{hasText:appName}).locator('[data-v2="report-open"]').click();
 return page.locator('.v2-sheet');
}
export async function sendReportViaSheet(page,appName,{outcome='ok',notes}={}){
 const sheet=await openReportSheet(page,appName);
 if(outcome==='cant')await sheet.locator('[data-v2="rep-cant"]').click();
 else{await sheet.locator('[data-v2="rep-tried"]').click();await sheet.locator(`[data-v2="rep-res"][data-k="${outcome}"]`).click()}
 if(notes!==undefined)await sheet.locator('#v2-note').fill(notes);
 await sheet.locator('[data-v2="rep-send"]').click();
}
