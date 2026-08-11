// CRIS 性别角色测验 —— 后端云函数（腾讯云开发 CloudBase，Node.js）
// 路由（基于 event.path 末尾匹配，兼容 HTTP 触发 / 云接入）：
//   GET  /api/points  -> 返回全体落点 [{uid, m, f, gender}]
//   POST /api/submit  -> 写入/更新一条作答（服务端按 50 题重算 m/f/type，忽略客户端值）
//   GET  /api/mine    -> 携带 x-cris-uid 返回本人完整记录（含 answers）
// CORS：仅放行 https://cochranek.github.io（前端托管在 GitHub Pages）

const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });   // 云函数内置环境变量，无需密钥
const db = app.database();

const COLLECTION = 'responses';
const ALLOWED_ORIGIN = 'https://cochranek.github.io';

// CSRI-50 题项性别归类（50 题：16 男 M / 16 女 F / 18 中性 N），与前端 CATS 完全一致
const CATS = 'FMFNMMFNNNMNNFMFNNFFNMNMNMFFNMFMMFMNMNFFNMFMNNMFNF';
const M_THRESHOLD = 4.8, F_THRESHOLD = 5.0;

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
      .field({ uid: true, m: true, f: true, gender: true })
      .skip(skip).limit(LIMIT).get();
    const list = res.data || [];
    for(const d of list) out.push({ uid: d.uid, m: d.m, f: d.f, gender: d.gender });
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
      let body;
      try{ body = JSON.parse(event.body || '{}'); }catch(e){ return json({ error: 'bad json' }, 400); }
      const uid = String(body.uid || '').slice(0, 64);
      const gender = ['male', 'female', 'other'].includes(body.gender) ? body.gender : 'other';
      const answers = Array.isArray(body.answers) ? body.answers.slice(0, 50) : [];
      if(!uid || answers.length < 50) return json({ error: 'uid and 50 answers required' }, 400);
      const { m, f, type } = computeScores(answers);
      const doc = { uid, gender, answers, m, f, type, createdAt: Date.now() };
      await db.collection(COLLECTION).doc(uid).set(doc);   // 以 uid 为主键，天然去重/覆盖
      return json({ uid, m, f, type });
    }

    // —— 取回本人明细 ——
    if(path.endsWith('/api/mine') && method === 'GET'){
      const hdr = event.headers || {};
      const uid = String(hdr['x-cris-uid'] || hdr['X-CRIS-UID'] || '').slice(0, 64);
      if(!uid) return json({ error: 'missing x-cris-uid' }, 400);
      const res = await db.collection(COLLECTION).doc(uid).get();
      const d = (res.data && res.data[0]) || null;
      if(!d) return json({ error: 'not found' }, 404);
      return json({ uid: d.uid, gender: d.gender, answers: d.answers, m: d.m, f: d.f, type: d.type, createdAt: d.createdAt });
    }

    return json({ error: 'not found' }, 404);
  }catch(e){
    return json({ error: String((e && e.message) || e) }, 500);
  }
};
