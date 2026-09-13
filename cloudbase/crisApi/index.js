'use strict';

const cloudbase = require('@cloudbase/node-sdk');
const crypto = require('crypto');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const cmd = db.command;
const communityBins = db.collection('community_bins');
const backups = db.collection('backups');
const legacyResponses = db.collection('responses');

const ALLOWED_ORIGIN = 'https://cochranek.github.io';
const M_THRESHOLD = 4.8;
const F_THRESHOLD = 5.0;
const SCALE_VERSION = 'Liu-2011';
const SCHEMA_VERSION = 2;
const CATS = 'FMFNMMFNNNMNNFMFNNFFNMNMNMFFNMFMMFMNMNFFNMFMNNMFNF';
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;
const rate = new Map();

function cors(event = {}) {
  const origin = String((event.headers && (event.headers.origin || event.headers.Origin)) || '');
  const allow = origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type, x-cris-token, x-cris-uid',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  };
}

function json(event, body, statusCode = 200, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...cors(event), ...extraHeaders },
    body: JSON.stringify(body)
  };
}

function noStore(event, body, statusCode = 200) {
  return json(event, body, statusCode, {
    'Cache-Control': 'no-store, private',
    'Pragma': 'no-cache'
  });
}

function pathOf(event = {}) {
  const p = String(event.path || event.requestContext?.path || event.rawPath || '/');
  const i = p.indexOf('/api/');
  return i >= 0 ? p.slice(i) : p;
}

function methodOf(event = {}) {
  return String(event.httpMethod || event.requestContext?.http?.method || 'GET').toUpperCase();
}

function parseBody(event = {}) {
  if (event.body == null || event.body === '') return {};
  if (typeof event.body === 'object') return event.body;
  try { return JSON.parse(event.body); } catch { return {}; }
}

function clientIp(event = {}) {
  const h = event.headers || {};
  return String(h['x-forwarded-for'] || h['X-Forwarded-For'] || h['x-real-ip'] || h['X-Real-IP'] || event.requestContext?.http?.sourceIp || 'unknown').split(',')[0].trim();
}

function allowRequest(event) {
  const key = clientIp(event);
  const now = Date.now();
  const arr = (rate.get(key) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    rate.set(key, arr);
    return false;
  }
  arr.push(now);
  rate.set(key, arr);
  if (rate.size > 2000) {
    for (const [k, xs] of rate.entries()) {
      if (!xs.some(t => now - t < RATE_WINDOW_MS)) rate.delete(k);
    }
  }
  return true;
}

function sanitizeSource(v) {
  const s = String(v || 'direct').slice(0, 16);
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : 'direct';
}

function sanitizeGender(v) {
  return ['male', 'female', 'other', 'unknown'].includes(v) ? v : 'unknown';
}

function validateAnswers(input) {
  if (!Array.isArray(input) || input.length !== 50) throw new Error('invalid answers');
  const out = input.map(Number);
  if (!out.every(v => Number.isInteger(v) && v >= 1 && v <= 7)) throw new Error('invalid answers');
  return out;
}

function score(answers) {
  let sm = 0, sf = 0, nm = 0, nf = 0;
  for (let i = 0; i < 50; i++) {
    if (CATS[i] === 'M') { sm += answers[i]; nm++; }
    else if (CATS[i] === 'F') { sf += answers[i]; nf++; }
  }
  const m = sm / nm;
  const f = sf / nf;
  let type = 'undifferentiated';
  if (m >= M_THRESHOLD && f >= F_THRESHOLD) type = 'androgynous';
  else if (m >= M_THRESHOLD) type = 'masculine';
  else if (f >= F_THRESHOLD) type = 'feminine';
  return { m, f, type };
}

function longestRun(a) {
  let best = 1, cur = 1;
  for (let i = 1; i < a.length; i++) {
    cur = a[i] === a[i - 1] ? cur + 1 : 1;
    if (cur > best) best = cur;
  }
  return best;
}

function variance(a) {
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  return a.reduce((s, x) => s + (x - mean) ** 2, 0) / a.length;
}

function quality(answers, durationMs) {
  const d = Number(durationMs);
  const reasons = [];
  if (!Number.isFinite(d) || d < 45_000) reasons.push('too_fast');
  if (Number.isFinite(d) && d > 60 * 60_000) reasons.push('too_slow');
  if (longestRun(answers) >= 40) reasons.push('long_string');
  if (variance(answers) < 0.08) reasons.push('low_variance');
  return { included: reasons.length === 0, reasons };
}

function rounded(v) { return +Number(v).toFixed(4); }
function bin(v) { return Math.round(Number(v) * 4) / 4; }
function binId(m, f) { return `m${Math.round(m * 4)}_f${Math.round(f * 4)}`; }

function tokenFrom(event, body = {}) {
  const h = event.headers || {};
  return String(h['x-cris-token'] || h['X-Cris-Token'] || h['x-cris-uid'] || h['X-Cris-Uid'] || body.token || body.uid || '').trim();
}

function validToken(t) {
  return /^[A-Za-z0-9_-]{8,128}$/.test(t);
}

function tokenHash(t) {
  return crypto.createHash('sha256').update(t, 'utf8').digest('hex');
}

async function incrementBin(m, f) {
  const mBin = bin(m), fBin = bin(f), id = binId(mBin, fBin), ref = communityBins.doc(id);
  const now = new Date();
  try {
    await ref.update({ count: cmd.inc(1), updatedAt: now });
  } catch (_) {
    try {
      await ref.set({ mBin, fBin, count: 1, updatedAt: now });
    } catch (_) {
      await ref.update({ count: cmd.inc(1), updatedAt: now });
    }
  }
  const meta = communityBins.doc('__meta__');
  try {
    await meta.update({ total: cmd.inc(1), updatedAt: now });
  } catch (_) {
    try { await meta.set({ total: 1, updatedAt: now }); }
    catch (_) { await meta.update({ total: cmd.inc(1), updatedAt: now }); }
  }
}

async function getCommunity(event) {
  const res = await communityBins.limit(700).get();
  const bins = [];
  let total = 0, updatedAt = null;
  for (const d of res.data || []) {
    if (d._id === '__meta__') {
      total = Number(d.total) || 0;
      updatedAt = d.updatedAt || null;
      continue;
    }
    if (Number.isFinite(Number(d.mBin)) && Number.isFinite(Number(d.fBin)) && Number(d.count) > 0) {
      bins.push({ mBin: Number(d.mBin), fBin: Number(d.fBin), count: Number(d.count) });
    }
  }
  return json(event, { bins, total, updatedAt, privacy: 'server-side 0.25-point bins; no respondent-level coordinates' });
}

async function submitCommunity(event, body) {
  const answers = validateAnswers(body.answers);
  const s = score(answers);
  const q = quality(answers, body.durationMs);
  if (q.included) await incrementBin(s.m, s.f);
  return json(event, {
    ok: true,
    included: q.included,
    quality: q.included ? 'accepted' : 'excluded',
    m: rounded(s.m), f: rounded(s.f), type: s.type
  });
}

async function saveBackup(event, body, legacy = false) {
  const answers = validateAnswers(body.answers);
  const token = tokenFrom(event, body);
  if (!validToken(token)) return noStore(event, { error: 'invalid recovery token' }, 400);
  const s = score(answers);
  const id = `r_${tokenHash(token)}`;
  const ref = backups.doc(id);
  const existing = await ref.get().catch(() => ({ data: [] }));
  if (existing.data && existing.data.length) {
    const d = existing.data[0];
    return noStore(event, { ok: true, existing: true, m: d.m, f: d.f, type: d.type });
  }
  const record = {
    answers,
    m: rounded(s.m), f: rounded(s.f), type: s.type,
    gender: sanitizeGender(body.gender), source: sanitizeSource(body.source),
    createdAt: new Date(), schemaVersion: SCHEMA_VERSION, scaleVersion: SCALE_VERSION,
    legacyImported: !!legacy
  };
  await ref.set(record);
  return noStore(event, { ok: true, m: record.m, f: record.f, type: record.type });
}

async function mine(event, body) {
  const token = tokenFrom(event, body);
  if (!validToken(token)) return noStore(event, { error: 'invalid recovery token' }, 400);
  const ref = backups.doc(`r_${tokenHash(token)}`);
  const got = await ref.get().catch(() => ({ data: [] }));
  if (got.data && got.data.length) {
    const d = got.data[0];
    const { _id, ...safe } = d;
    return noStore(event, safe);
  }
  // Backward compatibility for recovery codes created by the pre-v2 app.
  const legacy = await legacyResponses.doc(token).get().catch(() => ({ data: [] }));
  if (legacy.data && legacy.data.length) {
    const d = legacy.data[0];
    return noStore(event, {
      answers: d.answers, m: d.m, f: d.f, type: d.type,
      gender: sanitizeGender(d.gender), source: sanitizeSource(d.source),
      createdAt: d.createdAt, schemaVersion: 1, scaleVersion: SCALE_VERSION,
      legacy: true
    });
  }
  return noStore(event, { error: 'not found' }, 404);
}

async function removeBackup(event, body) {
  const token = tokenFrom(event, body);
  if (!validToken(token)) return noStore(event, { error: 'invalid recovery token' }, 400);
  await backups.doc(`r_${tokenHash(token)}`).remove().catch(() => {});
  await legacyResponses.doc(token).remove().catch(() => {});
  return noStore(event, { ok: true });
}

exports.main = async (event = {}) => {
  if (methodOf(event) === 'OPTIONS') return json(event, { ok: true });
  if (!allowRequest(event)) return json(event, { error: 'too many requests' }, 429, { 'Retry-After': '60' });

  const method = methodOf(event);
  const path = pathOf(event);
  const body = parseBody(event);

  try {
    if (method === 'GET' && path.endsWith('/api/community')) return await getCommunity(event);
    if (method === 'POST' && path.endsWith('/api/community/submit')) return await submitCommunity(event, body);
    if (method === 'POST' && path.endsWith('/api/backup')) return await saveBackup(event, body, false);
    if (method === 'GET' && path.endsWith('/api/mine')) return await mine(event, body);
    if (method === 'POST' && path.endsWith('/api/delete')) return await removeBackup(event, body);

    // Transitional compatibility with the pre-v2 front end. Remove after legacy recovery migration.
    if (method === 'GET' && path.endsWith('/api/points')) return json(event, { points: [], deprecated: true });
    if (method === 'POST' && path.endsWith('/api/submit')) {
      const community = await submitCommunity(event, body);
      const token = tokenFrom(event, body);
      if (validToken(token)) await saveBackup(event, body, true);
      const parsed = JSON.parse(community.body);
      return noStore(event, { ...parsed, uid: token || undefined, deprecated: true });
    }

    return json(event, { error: 'not found' }, 404);
  } catch (e) {
    console.error('crisApi error', { path, method, message: e && e.message, stack: e && e.stack });
    if (e && e.message === 'invalid answers') return json(event, { error: 'invalid answers' }, 400);
    return json(event, { error: 'internal server error' }, 500);
  }
};
