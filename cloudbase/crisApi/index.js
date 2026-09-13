// CRIS 性别角色测验 —— 后端云函数（腾讯云开发 CloudBase，Node.js）
// 目标：保持原版前端/API 体验不变，同时兼容 hardening-v2 短暂运行期留下的数据。
//
// 路由：
//   GET  /api/points  -> 返回逐人落点 [{m, f, gender, source}]（不含 uid）
//   POST /api/submit  -> 写入/更新 responses（服务端按 50 题重算）
//   GET  /api/mine    -> 优先读取 responses；找不到时兼容读取 v2 backups
//   POST /api/delete  -> 同时删除 responses 与对应 v2 backup
//
// 兼容说明：
// - 历史真人数据仍在 responses；本文件不会迁移或删除它们。
// - hardening-v2 的过渡 /api/submit 会把原版前端提交保存到 backups，并标记 legacyImported=true。
//   这些记录原本就参与逐人落点，因此 /api/points 会把它们补回。
// - v2 中用户主动创建的“私人备份” legacyImported=false，不会被公开进逐人落点。

const tcb = require('@cloudbase/node-sdk');
const crypto = require('crypto');
const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
const db = app.database();

const COLLECTION = 'responses';
const BACKUP_COLLECTION = 'backups';
const ALLOWED_ORIGIN = 'https://cochranek.github.io';

const CATS = 'FMFNMMFNNNMNNFMFNNFFNMNMNMFFNMFMMFMNMNFFNMFMNNMFNF';
const M_THRESHOLD = 4.8, F_THRESHOLD = 5.0;

const RATE = new Map();
const RATE_LIMIT = 40;
const RATE_WINDOW = 60 * 1000;
function clientIp(event){
  const h = (event && event.headers) || {};
  const xff = h['x-forwarded-for'] || h['X-Forwarded-For'] || '';
  return (xff.split(',')[0] || h['x-real-ip'] || 'unknown').trim() || 'unknown';
}
function rateLimited(ip){
  if(RATE.size > 10000) RATE.clear();
  const now = Date.now();
  const e = RATE.get(ip);
  if(!e || now - e.ts > RATE_WINDOW){ RATE.set(ip, { count: 1, ts: now }); return false; }
  e.count++;
  return e.count > RATE_LIMIT;
}

function computeScores(answers){
  let sumM = 0, nM = 0, sumF = 0, nF = 0;
  for(let i = 0; i < answers.length; i++){
    const v = Number(answers[i]);
    if(!v || v < 1 || v > 7) continue;
    const c = CATS[i];
    if(c === 'M'){ sumM += v; nM++; }
    else if(c === 'F'){ sumF += v; nF++; }
  }
  const m = nM ? +(sumM / nM).toFixed(3) : 0;
  const f = nF ? +(sumF / nF).toFixed(3) : 0;
  let type = 'undifferentiated';
  if(m >= M_THRESHOLD && f >= F_THRESHOLD) type = 'androgynous';
  else if(m >= M_THRESHOLD) type = 'masculine';
  else if(f >= F_THRESHOLD) type = 'feminine';
  return { m, f, type };
}

function corsHeaders(){
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,x-cris-uid,x-cris-token',
    'Content-Type': 'application/json; charset=utf-8'
  };
}
function json(body, status = 200, extra = {}){
  return { statusCode: status, headers: Object.assign(corsHeaders(), extra), body: JSON.stringify(body) };
}

function backupIdForToken(token){
  const hash = crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
  return 'r_' + hash;
}
function validPoint(d){
  const m = Number(d && d.m), f = Number(d && d.f);
  return Number.isFinite(m) && Number.isFinite(f) && m >= 1 && m <= 7 && f >= 1 && f <= 7;
}

async function listPoints(){
  const out = [];
  const seenBackupIds = new Set();
  let skip = 0;
  const LIMIT = 1000;

  // 1) 原始 responses：这是历史真实逐人落点的主数据源。
  while(true){
    const res = await db.collection(COLLECTION)
      .field({ uid: true, m: true, f: true, gender: true, demo: true, source: true })
      .skip(skip).limit(LIMIT).get();
    const list = res.data || [];
    for(const d of list){
      if(d.demo === true || d.source === 'test' || !validPoint(d)) continue;
      out.push({ m: Number(d.m), f: Number(d.f), gender: d.gender, source: d.source });
      if(d.uid) seenBackupIds.add(backupIdForToken(d.uid));
    }
    if(list.length < LIMIT) break;
    skip += LIMIT;
    if(skip > 20000) break;
  }

  // 2) hardening-v2 过渡期数据：只补回 legacyImported=true。
  //    私人备份 legacyImported=false 绝不公开成逐人落点。
  skip = 0;
  while(true){
    let res;
    try{
      res = await db.collection(BACKUP_COLLECTION)
        .field({ _id: true, m: true, f: true, gender: true, source: true, legacyImported: true })
        .skip(skip).limit(LIMIT).get();
    }catch(e){
      // 环境里从未创建 backups 时，直接保持原版行为。
      break;
    }
    const list = res.data || [];
    for(const d of list){
      if(d.legacyImported !== true || !validPoint(d)) continue;
      if(d._id && seenBackupIds.has(d._id)) continue;
      out.push({ m: Number(d.m), f: Number(d.f), gender: d.gender, source: d.source });
    }
    if(list.length < LIMIT) break;
    skip += LIMIT;
    if(skip > 20000) break;
  }
  return out;
}

async function getBackupByToken(token){
  try{
    const res = await db.collection(BACKUP_COLLECTION).doc(backupIdForToken(token)).get();
    return (res.data && res.data[0]) || null;
  }catch(e){
    return null;
  }
}

exports.main = async (event, context) => {
  const method = (event.httpMethod || event.method || 'GET').toUpperCase();
  const path = (event.path || (event.requestContext && event.requestContext.path) || '/').split('?')[0];

  if(method === 'OPTIONS') return json({ ok: true }, 204);

  try{
    if(path.endsWith('/api/points') && method === 'GET'){
      const points = await listPoints();
      return json({ points });
    }

    if(path.endsWith('/api/submit') && method === 'POST'){
      const ip = clientIp(event);
      if(rateLimited(ip)) return json({ error: 'too many requests, slow down' }, 429);
      let body;
      try{ body = JSON.parse(event.body || '{}'); }catch(e){ return json({ error: 'bad json' }, 400); }
      const uid = String(body.uid || '').slice(0, 64);
      const gender = ['male', 'female', 'unknown', 'other'].includes(body.gender) ? body.gender : 'other';
      const answers = Array.isArray(body.answers) ? body.answers : [];
      if(!uid) return json({ error: 'uid required' }, 400);
      if(answers.length !== 50 || !answers.every(v => Number.isInteger(v) && v >= 1 && v <= 7))
        return json({ error: 'answers must be an array of exactly 50 integers in 1..7' }, 400);
      const { m, f, type } = computeScores(answers);
      const demo = body.demo === true;
      const doc = { uid, gender, answers, m, f, type, createdAt: Date.now(), demo, source: String(body.source||'direct').slice(0,16) };
      await db.collection(COLLECTION).doc(uid).set(doc);
      return json({ uid, m, f, type, demo });
    }

    if(path.endsWith('/api/mine') && method === 'GET'){
      const hdr = event.headers || {};
      const uid = String(hdr['x-cris-uid'] || hdr['X-CRIS-UID'] || hdr['x-cris-token'] || hdr['X-CRIS-TOKEN'] || '').slice(0, 128);
      if(!uid) return json({ error: 'missing x-cris-uid' }, 400);

      // 先按原版逻辑读取 responses。
      const res = await db.collection(COLLECTION).doc(uid.slice(0,64)).get().catch(()=>({data:[]}));
      const d = (res.data && res.data[0]) || null;
      if(d){
        return json({ uid: d.uid, gender: d.gender, answers: d.answers, m: d.m, f: d.f, type: d.type, createdAt: d.createdAt, source: d.source });
      }

      // 再兼容 v2 的哈希备份。
      const b = await getBackupByToken(uid);
      if(!b) return json({ error: 'not found' }, 404);
      return json({ uid, gender: b.gender, answers: b.answers, m: b.m, f: b.f, type: b.type, createdAt: b.createdAt, source: b.source, legacyV2: true });
    }

    if(path.endsWith('/api/delete') && (method === 'POST' || method === 'DELETE')){
      let b = {};
      try{ b = JSON.parse(event.body || '{}'); }catch(e){}
      const hdr = event.headers || {};
      const uid = String(b.uid || hdr['x-cris-uid'] || hdr['X-CRIS-UID'] || hdr['x-cris-token'] || hdr['X-CRIS-TOKEN'] || '').slice(0, 128);
      if(!uid) return json({ error: 'missing uid' }, 400);
      await db.collection(COLLECTION).doc(uid.slice(0,64)).remove().catch(()=>{});
      await db.collection(BACKUP_COLLECTION).doc(backupIdForToken(uid)).remove().catch(()=>{});
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  }catch(e){
    return json({ error: String((e && e.message) || e) }, 500);
  }
};
