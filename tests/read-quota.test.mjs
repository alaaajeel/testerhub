import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const section = (from, to) => {
 const start = source.indexOf(from);
 assert.ok(start >= 0, 'missing section: '+from);
 const end = source.indexOf(to, start);
 assert.ok(end > start, 'missing section end: '+to);
 return source.slice(start, end);
};

test('Firestore listeners ignore metadata-only snapshots to avoid duplicate full dashboard reads', () => {
 const listener = section('function startLiveSync()', 'function canRerenderLive()');
 assert.match(listener, /if\(user\?\.uid!==uid\|\|!snap\.docChanges\(\)\.length\)return/);
});

test('listener-driven refresh is rate limited and preserves deferred work', () => {
 const live = section('const LIVE_REFRESH_MIN_GAP=', 'let leagueNameChecked=');
 assert.match(live, /LIVE_REFRESH_MIN_GAP=60000/);
 assert.match(live, /LIVE_REFRESH_MIN_GAP-\(Date\.now\(\)-lastLiveFetchAt\)/);
 assert.match(live, /setTimeout\(flushLiveSync,wait\)/);
 assert.match(live, /lastLiveFetchAt=Date\.now\(\)/);
 assert.match(live, /if\(user\?\.uid===uid\)\{dashboard=fresh;liveSyncDeferred=false;render\(\)\}/);
 assert.match(live, /lastLiveFetchAt=0/);
});
