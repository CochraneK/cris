import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../cloudbase/crisApi/index.js', import.meta.url), 'utf8');

const itemBlock = html.match(/const ITEMS = \[(.*?)\n\];/s)?.[1] || '';
const cats = [...itemBlock.matchAll(/cat:'([MFN])'/g)].map(m => m[1]);
assert.equal(cats.length, 50, 'front end must contain exactly 50 CSRI items');
assert.equal(cats.filter(x => x === 'M').length, 16, 'M item count');
assert.equal(cats.filter(x => x === 'F').length, 16, 'F item count');
assert.equal(cats.filter(x => x === 'N').length, 18, 'N item count');

const backendCats = api.match(/const CATS = '([MFN]+)'/)?.[1];
assert.ok(backendCats, 'backend CATS must exist');
assert.equal(backendCats, cats.join(''), 'front-end and backend category order must match');

assert.match(html, /const M_THRESHOLD = 4\.8/);
assert.match(html, /const F_THRESHOLD = 5\.0/);
assert.match(api, /const M_THRESHOLD = 4\.8, F_THRESHOLD = 5\.0/);

assert.match(html, /完全符合你的情况选 7/);
assert.match(html, /2–6 请按符合程度选择/);
assert.doesNotMatch(html, /基本不是|比较不符合|说不清|较符合|基本符合/, 'do not invent intermediate CSRI anchor labels');

assert.match(html, /<button type="button" class="opt/);
assert.match(html, /aria-pressed=/);

assert.doesNotMatch(html, /uid:rec\.uid/, 'downloaded JSON must not contain recovery credential');
assert.match(html, /#recover=/, 'new recovery links must use URL fragments');
assert.match(html, /recoveryConfirmed/, 'QR generation must require a confirmed cloud record');

assert.match(api, /responseIdForToken\(uid\)/, 'new response records must use hashed identifiers');
assert.doesNotMatch(api, /const doc = \{ uid,/, 'new response records must not store plaintext uid');
assert.match(api, /Cache-Control': 'no-store, private'/, 'private API responses must disable caching');
assert.match(api, /error: 'internal server error'/, '500 responses must not leak internal exception messages');

console.log('CRIS validation passed');
