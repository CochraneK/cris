import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../cloudbase/crisApi/index.js', import.meta.url), 'utf8');

const itemBlock = html.match(/const ITEMS = \[(.*?)\n\];/s)?.[1] || '';
const cats = [...itemBlock.matchAll(/cat:'([MFN])'/g)].map(m => m[1]);
assert.equal(cats.length, 50, 'front end must contain exactly 50 items');
assert.equal(cats.filter(x => x === 'M').length, 16, 'M item count');
assert.equal(cats.filter(x => x === 'F').length, 16, 'F item count');
assert.equal(cats.filter(x => x === 'N').length, 18, 'N item count');

const backendCats = api.match(/const CATS = '([MFN]+)'/)?.[1];
assert.ok(backendCats, 'backend CATS must exist');
assert.equal(backendCats, cats.join(''), 'front-end and backend category order must match');

assert.match(html, /const M_THRESHOLD=4\.8,F_THRESHOLD=5\.0/);
assert.match(api, /const M_THRESHOLD = 4\.8;/);
assert.match(api, /const F_THRESHOLD = 5\.0;/);
assert.match(html, /toFixed\(2\)/, 'result UI should display at least 2 decimals near cutoffs');
assert.doesNotMatch(html, /meta:\{[^}]*uid:/s, 'share/export payload must not contain recovery uid');
assert.match(html, /#recover=/, 'recovery links must use URL fragments');
assert.match(api, /Cache-Control': 'no-store, private'/, 'private APIs must be no-store');
assert.match(api, /server-side 0\.25-point bins/, 'community endpoint must expose aggregate bins');
assert.doesNotMatch(api, /SELECT uid|\{uid,m,f,gender\}|points\.push\(\{\s*m:/s, 'community API must not expose respondent-level identifiers/points');

const score = answers => {
  let sm=0,sf=0,nm=0,nf=0;
  cats.forEach((c,i)=>{ if(c==='M'){sm+=answers[i];nm++} if(c==='F'){sf+=answers[i];nf++} });
  const m=sm/nm,f=sf/nf;
  let type='undifferentiated';
  if(m>=4.8&&f>=5.0)type='androgynous'; else if(m>=4.8)type='masculine'; else if(f>=5.0)type='feminine';
  return {m,f,type};
};
assert.deepEqual(score(Array(50).fill(1)), {m:1,f:1,type:'undifferentiated'});
assert.deepEqual(score(Array(50).fill(7)), {m:7,f:7,type:'androgynous'});

console.log('CRIS validation passed');
