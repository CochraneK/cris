// CRIS 性别角色测验 —— 后端云函数（腾讯云开发 CloudBase，Node.js）
// 路由（基于 event.path 末尾匹配，兼容 HTTP 触发 / 云接入）：
//   GET  /api/points  -> 返回全体落点 [{m, f, gender, source}]（不含任何 uid，杜绝批量扒答案）
//   POST /api/submit  -> 写入/更新一条作答（服务端按 50 题重算 m/f/type，忽略客户端值）
//   GET  /api/mine    -> 携带 x-cris-uid 返回本人完整记录（含 answers）
//   POST /api/delete  -> 携带 x-cris-uid 删除本人记录（用户自主删除权）
// CORS：仅放行 https://cochranek.github.io（前端托管在 GitHub Pages）

const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });   // 云函数内置环境变量，无需密钥
const db = app.database();

const COLLECTION = 'responses';
const ALLOWED_ORIGIN = 'https://cochranek.github.io';

// CSRI-50 题项性别归类（50 题：16 男 M / 16 女 F / 18 中性 N），与前端 CATS 完全一致
const CATS = 'FMFNMMFNNNMNNFMFNNFFNMNMNMFFNMFMMFMNMNFFNMFMNNMFNF';
const M_THRESHOLD = 4.8, F_THRESHOLD = 5.0;

// 基础限流（单实例内存滑动窗口；生产环境建议再叠加云接入/API 网关限流）
// 注意：CloudBase 函数可能多实例，内存级限流仅作第一道闸，不保证全局精确
const RATE = new Map();
const RATE_LIMIT = 40;            // 每窗口最多提交次数
const RATE_WINDOW = 60 * 1000;    // 窗口时长(ms)
function clientIp(event){
  const h = (event && event.headers) || {};
  const xff = h['x-forwarded-for'] || h['X-Forwarded-For'] || '';
  return (xff.split(',')[0] || h['x-real-ip'] || 'unknown').trim() || 'unknown';
}
function rateLimited(ip){
  if(RATE.size > 10000) RATE.clear();   // 防止内存无限增长
  const now = Date.now();
  const e = RATE.get(ip);
  if(!e || now - e.ts > RATE_WINDOW){ RATE.set(ip, { count: 1, ts: now }); return false; }
  e.count++;
  return e.count > RATE_LIMIT;
}

// 仅用男性/女性题项计分（中性题仅作干扰，不参与），与论文阈值一致
function computeScores(answers){
  let sumM = 0, nM = 0, sumF = 0, nF = 0;
  for(let i = 0; i < answers.length; i++){
    const v = Number(answers[i]);
    if(!v || v < 1 || v > 7) continue;          // 跳过缺答/非法
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
    'Access-Control-Allow-Headers': 'Content-Type,x-cris-uid',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(body, status = 200, extra = {}){
  return { statusCode: status, headers: Object.assign(corsHeaders(), extra), body: JSON.stringify(body) };
}

// 分页拉取全体落点（免费版单次查询上限 1000，循环取全量）
async function listPoints(){
  const out = [];
  let skip = 0;
  const LIMIT = 1000;
  while(true){
    const res = await db.collection(COLLECTION)
      .field({ uid: true, m: true, f: true, gender: true, demo: true, source: true })
      .skip(skip).limit(LIMIT).get();
    const list = res.data || [];
    for(const d of list){
      if(d.demo === true) continue;   // 排除隐藏入口产生的合成数据，保证"真实填写者"计数纯净
      if(d.source === 'test') continue;   // 排除测试来源（仅供自己联调），不计入真实分布
      out.push({ m: d.m, f: d.f, gender: d.gender, source: d.source });
    }
    if(list.length < LIMIT) break;
    skip += LIMIT;
    if(skip > 20000) break;   // 安全阀
  }
  return out;
}

exports.main = async (event, context) => {
  const method = (event.httpMethod || event.method || 'GET').toUpperCase();
  const path = (event.path || (event.requestContext && event.requestContext.path) || '/').split('?')[0];

  if(method === 'OPTIONS') return json({ ok: true }, 204);   // 预检直接放行

  try{
    // —— 全体落点 ——
    if(path.endsWith('/api/points') && method === 'GET'){
      const points = await listPoints();
      return json({ points });
    }

    // —— 提交一条作答 ——
    if(path.endsWith('/api/submit') && method === 'POST'){
      const ip = clientIp(event);
      if(rateLimited(ip)) return json({ error: 'too many requests, slow down' }, 429);
      let body;
      try{ body = JSON.parse(event.body || '{}'); }catch(e){ return json({ error: 'bad json' }, 400); }
      const uid = String(body.uid || '').slice(0, 64);
      // 允许 male / female / unknown（前端未选性别时传 unknown），其余归一为 other
      const gender = ['male', 'female', 'unknown', 'other'].includes(body.gender) ? body.gender : 'other';
      const answers = Array.isArray(body.answers) ? body.answers : [];
      // 严格校验：必须是恰好 50 项、且每一项都是 1–7 的整数，否则拒绝（防止脏数据写入）
      if(!uid) return json({ error: 'uid required' }, 400);
      if(answers.length !== 50 || !answers.every(v => Number.isInteger(v) && v >= 1 && v <= 7))
        return json({ error: 'answers must be an array of exactly 50 integers in 1..7' }, 400);
      const { m, f, type } = computeScores(answers);
      // demo=true 仅来自隐藏入口（前端自动作答），用于后期在库中识别/清理合成数据，不计入"真实填写者"
      const demo = body.demo === true;
      const doc = { uid, gender, answers, m, f, type, createdAt: Date.now(), demo, source: String(body.source||'direct').slice(0,16) };
      await db.collection(COLLECTION).doc(uid).set(doc);   // 以 uid 为主键，天然去重/覆盖
      return json({ uid, m, f, type, demo });
    }

    // —— 取回本人明细 ——
    if(path.endsWith('/api/mine') && method === 'GET'){
      const hdr = event.headers || {};
      const uid = String(hdr['x-cris-uid'] || hdr['X-CRIS-UID'] || '').slice(0, 64);
      if(!uid) return json({ error: 'missing x-cris-uid' }, 400);
      const res = await db.collection(COLLECTION).doc(uid).get();
      const d = (res.data && res.data[0]) || null;
      if(!d) return json({ error: 'not found' }, 404);
      return json({ uid: d.uid, gender: d.gender, answers: d.answers, m: d.m, f: d.f, type: d.type, createdAt: d.createdAt, source: d.source });
    }

    // —— 删除本人记录 ——
    if(path.endsWith('/api/delete') && (method === 'POST' || method === 'DELETE')){
      let b = {};
      try{ b = JSON.parse(event.body || '{}'); }catch(e){}
      const hdr = event.headers || {};
      const uid = String(b.uid || hdr['x-cris-uid'] || hdr['X-CRIS-UID'] || '').slice(0, 64);
      if(!uid) return json({ error: 'missing uid' }, 400);
      await db.collection(COLLECTION).doc(uid).remove();
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  }catch(e){
    return json({ error: String((e && e.message) || e) }, 500);
  }
};
