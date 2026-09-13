// CSRI-50 Worker —— Cloudflare D1 版（模块格式）
// 量表：中国大学生性别角色量表（CSRI-50，刘电芝 等 2011，心理学报）
//   —— 在 Bem(1974) BSRI 与钱铭怡(2000) CSRI 基础上重编，全国 5008 名大学生常模。
//   —— 结构：50 题 = 男性化 16 + 女性化 16 + 中性（干扰）18；7 点计分；仅 M/F 计分，N 不计。
//   —— 分类阈值：男性化分量表常模中位数 4.8、女性化分量表常模中位数 5.0
//      （双性化 M≥4.8 & F≥5.0；男性化 M≥4.8 & F<5.0；女性化 M<4.8 & F≥5.0；未分化 M<4.8 & F<5.0）。
// 安全要点（按审查意见 ③④⑤ 实现）：
//  ③ 群体数据用 D1（一行一个 respondent），不再用单 KV key 做 read-modify-write，避免并发覆盖/写额度问题；
//  ④ 不信任客户端上传的 m/f/type，全部由 answers 后端重算；校验 answers 必为 50 题、每题整数 1–7；校验 Origin；
//  ⑤ 按 uid 主键 INSERT OR REPLACE，天然去重——同一人重复测试只保留最新一条（"已有 N 位填写者"= 不同 uid 数）。
// 注意：首次部署前需在 Cloudflare 侧建好 D1 数据库并把绑定名设为 DB（见 cf_deploy.sh）。

const M_THRESHOLD = 4.8;
const F_THRESHOLD = 5.0;
const CATS = 'FMFNMMFNNNMNNFMFNNFFNMNMNMFFNMFMMFMNMNFFNMFMNNMFNF';
const ALLOWED_ORIGINS = ['https://cochranek.github.io'];

function corsHeaders(request){
  const origin = request.headers.get('origin');
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-cris-uid',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
  };
  if(origin && checkOrigin(request)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
function checkOrigin(request){
  const origin = request.headers.get('origin');
  if(!origin) return true;
  if(ALLOWED_ORIGINS.includes(origin)) return true;
  if(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}
function computeFromAnswers(answers){
  let sumM=0,nM=0,sumF=0,nF=0;
  for(let i=0;i<50;i++){
    const a = answers[i], c = CATS[i];
    if(c==='M'){ sumM+=a; nM++; }
    else if(c==='F'){ sumF+=a; nF++; }
  }
  const m = nM ? sumM/nM : 0, f = nF ? sumF/nF : 0;
  let type;
  if(m>=M_THRESHOLD && f>=F_THRESHOLD) type='androgynous';
  else if(m>=M_THRESHOLD && f<F_THRESHOLD) type='masculine';
  else if(m<M_THRESHOLD && f>=F_THRESHOLD) type='feminine';
  else type='undifferentiated';
  return { m:+m.toFixed(3), f:+f.toFixed(3), type };
}
function isValidAnswers(a){
  if(!Array.isArray(a) || a.length!==50) return false;
  for(const v of a) if(typeof v!=='number' || !Number.isInteger(v) || v<1 || v>7) return false;
  return true;
}
const UID_RE = /^[A-Za-z0-9_-]{8,64}$/;

async function handle(request, env){
  const url = new URL(request.url), p = url.pathname;
  if(request.method==='OPTIONS') return new Response(null, {status:204, headers:corsHeaders(request)});
  if(!checkOrigin(request)) return new Response(JSON.stringify({error:'origin not allowed'}), {status:403, headers:corsHeaders(request)});
  try{
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS responses (uid TEXT PRIMARY KEY, gender TEXT, m REAL, f REAL, type TEXT, answers TEXT, created_at INTEGER)').run();
  }catch(e){}
  if(p==='/api/points' && request.method==='GET'){
    const {results} = await env.DB.prepare('SELECT uid, gender, m, f, type FROM responses').all();
    return new Response(JSON.stringify({points: results || []}), {headers:corsHeaders(request)});
  }
  if(p==='/api/mine' && request.method==='GET'){
    const uid = request.headers.get('x-cris-uid') || '';
    if(!UID_RE.test(uid)) return new Response(JSON.stringify({error:'bad uid'}), {status:400, headers:corsHeaders(request)});
    const row = await env.DB.prepare('SELECT * FROM responses WHERE uid=?').bind(uid).first();
    if(!row) return new Response(JSON.stringify({error:'not found'}), {status:404, headers:corsHeaders(request)});
    try{ row.answers = JSON.parse(row.answers || '[]'); }catch(e){ row.answers = []; }
    return new Response(JSON.stringify({ok:true, data: row}), {headers:corsHeaders(request)});
  }
  if(p==='/api/submit' && request.method==='POST'){
    let body;
    try{ body = await request.json(); }catch(e){ return new Response(JSON.stringify({error:'bad json'}), {status:400, headers:corsHeaders(request)}); }
    const uid = typeof body.uid==='string' ? body.uid : '';
    const gender = ['male','female','unknown'].includes(body.gender) ? body.gender : 'unknown';
    const answers = body.answers;
    if(!UID_RE.test(uid)) return new Response(JSON.stringify({error:'bad uid'}), {status:400, headers:corsHeaders(request)});
    if(!isValidAnswers(answers)) return new Response(JSON.stringify({error:'answers must be an array of 50 integers 1-7'}), {status:400, headers:corsHeaders(request)});
    const {m,f,type} = computeFromAnswers(answers);
    await env.DB.prepare('INSERT OR REPLACE INTO responses (uid, gender, m, f, type, answers, created_at) VALUES (?,?,?,?,?,?,?)').bind(uid, gender, m, f, type, JSON.stringify(answers), Date.now()).run();
    return new Response(JSON.stringify({ok:true, uid}), {headers:corsHeaders(request)});
  }
  return new Response(JSON.stringify({error:'not found'}), {status:404, headers:corsHeaders(request)});
}
export default { async fetch(request, env){ return handle(request, env); } };
