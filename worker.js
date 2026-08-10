// BSRI 落点收集 · Cloudflare Worker + KV（免费、无需信用卡）
// 经典 service worker 格式（addEventListener + 全局绑定），兼容性最好。
// 作用：
//   1) 真实累积每个填写者的 (M, F, 性别, 类型) 落点，前端 /api/points 读取真实全体分布（散点图用）
//   2) 匿名存每个人的 60 题完整作答（resp:<uid>），本人凭 uid 可取回「只属于自己的数据」
//
// 部署（自动化脚本 cf_deploy.sh 已搞定）：
//   - KV 命名空间 bsri-points 存放全体落点（键 points）与每人明细（键 resp:<uid>）
//   - 本 Worker 绑定一个 KV 变量，变量名必须是 POINTS（全局可用，无需 env 参数）
//   - 部署后地址形如 https://polished-moon-b698.cunyikang.workers.dev
//
// 隐私说明：只存匿名字段（M/F/类型/性别/60题打分 + 随机 uid），绝不存姓名、微信、IP。
// 每人用自己的 uid 取回，uid 为随机长串，他人无法猜到，因此「只能下载自己的数据」。
//
// 接口：
//   GET  /api/points  -> {"points":[{"m":..,"f":..,"type":..,"gender":..}, ...]}   全体落点（散点图）
//   POST /api/submit  -> body {"m","f","type","gender","uid","answers":[60个1-7]}
//                         返回 {"ok":true,"count":N,"uid":<实际用的uid>}
//   GET  /api/mine    -> 头部 x-bsri-uid 或 ?uid= 传自己的 uid；返回该人明细（404=无记录）
//   OPTIONS           -> CORS 预检（已放行跨域，前端在 GitHub Pages 上也能调用）

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-bsri-uid',
};

const KEY = 'points';          // KV 中存放全体落点的键
const MAX_KEEP = 5000;         // 散点图最多保留最近 5000 条，控制体积
const DETAIL_PREFIX = 'resp:'; // 每人明细键前缀：resp:<uid>

// uid 只接受安全字符，避免奇怪的 KV 键名
function safeUid(u){
  return (typeof u === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(u)) ? u : null;
}
function newUid(){
  try { return crypto.randomUUID(); }
  catch(e){ return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2,10); }
}
const clamp = v => Math.max(1, Math.min(7, +v));

async function readAll() {
  const raw = await POINTS.get(KEY);   // POINTS 是 KV 全局绑定
  return raw ? JSON.parse(raw) : [];
}
async function writeAll(arr) {
  await POINTS.put(KEY, JSON.stringify(arr));
}

async function handle(request) {
  const url = new URL(request.url);
  const p = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (p === '/api/points') {
    const pts = await readAll();
    return new Response(JSON.stringify({ points: pts }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  if (p === '/api/submit' && request.method === 'POST') {
    let data;
    try { data = await request.json(); }
    catch (e) {
      return new Response(JSON.stringify({ ok: false, error: 'bad json' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
    }
    const m = Number(data.m), f = Number(data.f);
    if (!isFinite(m) || !isFinite(f)) {
      return new Response(JSON.stringify({ ok: false, error: 'm/f required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
    }
    const t = typeof data.type === 'string' ? data.type : 'unknown';
    const g = typeof data.gender === 'string' ? data.gender : 'unknown';
    const uid = safeUid(data.uid) || newUid();
    // 取 60 题作答（若前端传了）；过滤成合法数字
    const answers = Array.isArray(data.answers)
      ? data.answers.map(v => Number(v)).filter(n => isFinite(n))
      : [];

    // ① 存个人明细（键 resp:<uid>），本人可凭 uid 取回
    const record = {
      uid,
      m: clamp(m), f: clamp(f),
      type: t, gender: g,
      ts: Date.now(),
      answers,
    };
    await POINTS.put(DETAIL_PREFIX + uid, JSON.stringify(record));

    // ② 全体落点（供散点图），与明细分开存，互不干扰
    const pts = await readAll();
    pts.push({ m: clamp(m), f: clamp(f), type: t, gender: g, ts: record.ts });
    const trimmed = pts.slice(-MAX_KEEP);
    await writeAll(trimmed);

    return new Response(JSON.stringify({ ok: true, count: trimmed.length, uid }),
      { headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  if (p === '/api/mine' && request.method === 'GET') {
    // 优先读自定义头，其次查询参数（换设备时用户手动贴码）
    let uid = request.headers.get('x-bsri-uid');
    if (!uid) uid = url.searchParams.get('uid');
    uid = safeUid(uid);
    if (!uid) {
      return new Response(JSON.stringify({ error: 'missing_or_invalid_uid' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
    }
    const raw = await POINTS.get(DETAIL_PREFIX + uid);
    if (!raw) {
      return new Response(JSON.stringify({ error: 'not_found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...CORS } });
    }
    return new Response(raw, { headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  return new Response('BSRI points API — GET /api/points, POST /api/submit, GET /api/mine', { headers: CORS });
}

addEventListener('fetch', (event) => {
  event.respondWith(handle(event.request));
});
