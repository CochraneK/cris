from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')
orig = s

def sub_once(pattern, repl, text, flags=0, label='patch'):
    out, n = re.subn(pattern, repl, text, count=1, flags=flags)
    if n != 1:
        raise SystemExit(f'{label}: expected 1 replacement, got {n}')
    return out

# 1) Bottom progress UI + low-motion / low-power CSS.
css_anchor = "  .quiz-foot .btn{padding:14px;font-size:16px;}\n"
css_add = r'''  .quiz-foot .btn{padding:14px;font-size:16px;}
  .foot-progress{background:#fff;border:1px solid #f3dce7;border-radius:16px;padding:11px 13px 12px;box-shadow:0 8px 20px rgba(255,94,138,.16);cursor:pointer;}
  .foot-progress-row{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;font-weight:700;color:#6f5e68;margin-bottom:7px;}
  .foot-progress-row span:last-child{color:var(--pink);}
  .foot-progress-track{height:8px;background:#f4e8ee;border-radius:999px;overflow:hidden;}
  .foot-progress-track>i{display:block;height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#ff8fab,#ff5e8a,#b388ff);transition:width .28s ease;}
  #submit-btn{display:none;}
  .quiz-foot.complete .foot-progress{display:none;}
  .quiz-foot.complete #submit-btn{display:block;}
  .low-power .blob{animation:none;filter:blur(32px);}
  @media (prefers-reduced-motion: reduce){
    .blob{animation:none!important;}
    .screen{animation:none!important;}
    .progress>i,.foot-progress-track>i,.opt,.btn{transition:none!important;}
  }
'''
if css_anchor not in s:
    raise SystemExit('CSS anchor missing')
s = s.replace(css_anchor, css_add, 1)

# Replace bottom submit-only footer with dynamic progress + submit-on-complete.
footer_old = '''    <div class="quiz-foot">\n      <button class="btn" id="submit-btn" onclick="finishQuiz()">查看我的结果 ✨</button>\n    </div>'''
footer_new = '''    <div class="quiz-foot" id="quiz-foot">\n      <div class="foot-progress" id="foot-progress" onclick="jumpToFirstUnanswered()" role="button" tabindex="0" title="点这里跳到下一道未答题">\n        <div class="foot-progress-row"><span id="foot-status">已完成 0 / 50</span><span id="foot-pct">0%</span></div>\n        <div class="foot-progress-track"><i id="foot-progress-bar"></i></div>\n      </div>\n      <button class="btn" id="submit-btn" onclick="finishQuiz()">查看我的结果 ✨</button>\n    </div>'''
if footer_old not in s:
    raise SystemExit('footer anchor missing')
s = s.replace(footer_old, footer_new, 1)

# 2) Draft persistence + smart auto-scroll + device capability helpers.
state_anchor = "const answers = new Array(50).fill(0);\nlet _milestoneShown = {17:false, 33:false}; // 1/3、2/3 鼓励提示只弹一次（50 题下的约数）\n"
state_add = r'''const answers = new Array(50).fill(0);
let _milestoneShown = {17:false, 33:false}; // 1/3、2/3 鼓励提示只弹一次（50 题下的约数）

const DRAFT_KEY = 'cris_quiz_draft_v1';
const PREFERS_REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const LOW_POWER_DEVICE = ((navigator.hardwareConcurrency || 8) <= 4) || ((navigator.deviceMemory || 8) <= 4);
if(LOW_POWER_DEVICE) document.documentElement.classList.add('low-power');

function saveDraft(){
  try{
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      answers: answers.slice(),
      gender: currentGender || '',
      savedAt: Date.now()
    }));
  }catch(e){}
}
function clearDraft(){ try{ sessionStorage.removeItem(DRAFT_KEY); }catch(e){} }
function restoreDraft(){
  try{
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if(!raw) return null;
    const d = JSON.parse(raw);
    if(!d || !Array.isArray(d.answers) || d.answers.length !== 50) return null;
    const vals = d.answers.map(Number);
    if(!vals.every(v=>Number.isInteger(v) && v>=0 && v<=7)) return null;
    const done = vals.filter(v=>v>0).length;
    if(done >= 50){ clearDraft(); return null; }
    vals.forEach((v,i)=>answers[i]=v);
    if(d.gender === 'male' || d.gender === 'female') currentGender = d.gender;
    _milestoneShown[17] = done >= 17;
    _milestoneShown[33] = done >= 33;
    return {done};
  }catch(e){ return null; }
}
function jumpToFirstUnanswered(){
  const first = answers.findIndex(a=>a===0);
  if(first < 0) return;
  const card = document.querySelectorAll('.q-card')[first];
  if(card) card.scrollIntoView({behavior:PREFERS_REDUCED_MOTION?'auto':'smooth',block:'center'});
}
function maybeAutoScroll(q, done){
  if(PREFERS_REDUCED_MOTION || done >= 50) return;
  let next = answers.findIndex((a,i)=>i>q && a===0);
  if(next < 0) next = answers.findIndex(a=>a===0);
  if(next < 0) return;
  setTimeout(()=>{
    const card = document.querySelectorAll('.q-card')[next];
    if(!card) return;
    const rect = card.getBoundingClientRect();
    const foot = document.getElementById('quiz-foot');
    const safeBottom = window.innerHeight - (foot ? foot.offsetHeight : 84);
    // 下一题已经在舒适阅读区就不抢滚动；只有偏低/被底栏挡住时才轻推。
    if(rect.top > window.innerHeight*0.60 || rect.bottom > safeBottom + 36){
      card.scrollIntoView({behavior:LOW_POWER_DEVICE?'auto':'smooth',block:'center'});
    }
  }, LOW_POWER_DEVICE ? 50 : 110);
}
'''
if state_anchor not in s:
    raise SystemExit('state anchor missing')
s = s.replace(state_anchor, state_add, 1)

# Restore selected answers visually after refresh.
s = sub_once(
    r"opts \+= `<div class=\"opt\" data-q=\"\$\{idx\}\" data-v=\"\$\{v\}\">\$\{v\}</div>`;",
    "opts += `<div class=\"opt${answers[idx]===v?' on':''}\" data-q=\"${idx}\" data-v=\"${v}\">${v}</div>`;",
    s,
    label='restore selected option'
)

# Answer click: persist, update footer, and smart-scroll only on first answer of a question.
click_old = '''      const q = +el.dataset.q, v = +el.dataset.v;\n      answers[q] = v;\n      const siblings = box.querySelectorAll(`.opt[data-q="${q}"]`);\n      siblings.forEach(s=>s.classList.remove('on'));\n      el.classList.add('on');\n      updateProgress();'''
click_new = '''      const q = +el.dataset.q, v = +el.dataset.v;\n      const wasAnswered = answers[q] > 0;\n      answers[q] = v;\n      const siblings = box.querySelectorAll(`.opt[data-q="${q}"]`);\n      siblings.forEach(s=>s.classList.remove('on'));\n      el.classList.add('on');\n      saveDraft();\n      const done = updateProgress();\n      if(!wasAnswered) maybeAutoScroll(q, done);'''
if click_old not in s:
    raise SystemExit('answer click anchor missing')
s = s.replace(click_old, click_new, 1)

# Progress: keep top bar, drive bottom progress, switch to result CTA at 50/50.
progress_pattern = re.compile(r'''function updateProgress\(\)\{\n  const done = answers\.filter\(a=>a>0\)\.length;\n  document\.getElementById\('prog-text'\)\.textContent = done \+ ' / 50';\n  document\.getElementById\('prog-bar'\)\.style\.width = \(done/50\*100\)\+'%';\n  if\(done===17 && !_milestoneShown\[17\]\)\{\n    _milestoneShown\[17\]=true;\n    cheer\('已完成 1/3 啦 🌟\\n慢慢来，你愿意花时间看看自己，就很了不起'\);\n  \}\n  if\(done===33 && !_milestoneShown\[33\]\)\{\n    _milestoneShown\[33\]=true;\n    cheer\('完成 2/3 了 💪\\n再坚持一下，你离「看清自己」更近一步'\);\n  \}\n\}''')
progress_new = r'''function updateProgress(opts){
  const done = answers.filter(a=>a>0).length;
  const pct = done/50*100;
  document.getElementById('prog-text').textContent = done + ' / 50';
  document.getElementById('prog-bar').style.width = pct+'%';
  const fs=document.getElementById('foot-status'), fp=document.getElementById('foot-pct'), fb=document.getElementById('foot-progress-bar');
  if(fs) fs.textContent = `已完成 ${done} / 50`;
  if(fp) fp.textContent = Math.round(pct) + '%';
  if(fb) fb.style.width = pct + '%';
  const foot=document.getElementById('quiz-foot');
  if(foot) foot.classList.toggle('complete', done===50);
  const silent = !!(opts && opts.silent);
  if(!silent && done===17 && !_milestoneShown[17]){
    _milestoneShown[17]=true;
    cheer('已完成 1/3 啦 🌟\n慢慢来，你愿意花时间看看自己，就很了不起');
  }
  if(!silent && done===33 && !_milestoneShown[33]){
    _milestoneShown[33]=true;
    cheer('完成 2/3 了 💪\n再坚持一下，你离「看清自己」更近一步');
  }
  return done;
}'''
s, n = progress_pattern.subn(progress_new, s, count=1)
if n != 1:
    raise SystemExit(f'progress patch: expected 1 replacement, got {n}')

# 3) Start/gender/restart/finish persistence lifecycle.
s = s.replace("  renderQuiz(); updateProgress();\n  show('quiz');", "  renderQuiz(); updateProgress();\n  saveDraft();\n  show('quiz');", 1)

pick_old = '''function pickGender(g){\n  currentGender = g;\n  document.querySelectorAll('.gp').forEach(b=>{\n    const on = b.dataset.g===g;\n    b.classList.toggle('on', on);\n    b.classList.toggle('male', on && g==='male');\n    b.classList.toggle('female', on && g==='female');\n  });\n}'''
pick_new = '''function pickGender(g, skipSave){\n  currentGender = g;\n  document.querySelectorAll('.gp').forEach(b=>{\n    const on = b.dataset.g===g;\n    b.classList.toggle('on', on);\n    b.classList.toggle('male', on && g==='male');\n    b.classList.toggle('female', on && g==='female');\n  });\n  if(!skipSave) saveDraft();\n}'''
if pick_old not in s:
    raise SystemExit('pickGender anchor missing')
s = s.replace(pick_old, pick_new, 1)

finish_old = '''  renderReport(r);\n  show('result');\n  submitAndLoadPoints(r);'''
finish_new = '''  renderReport(r);\n  clearDraft();\n  show('result');\n  submitAndLoadPoints(r);'''
if finish_old not in s:
    raise SystemExit('finish anchor missing')
s = s.replace(finish_old, finish_new, 1)

restart_old = '''  _milestoneShown = {17:false, 33:false};   // 重置鼓励提示，重测可再次触发 1/3、2/3 喝彩\n  show('cover');'''
restart_new = '''  _milestoneShown = {17:false, 33:false};   // 重置鼓励提示，重测可再次触发 1/3、2/3 喝彩\n  clearDraft();\n  show('cover');'''
if restart_old not in s:
    raise SystemExit('restart anchor missing')
s = s.replace(restart_old, restart_new, 1)

# 4) Low-power confetti degradation, while preserving milestone cards and normal-device visuals.
confetti_old = "function launchConfetti(){\n  const c=document.getElementById('confetti'); if(!c) return;\n  const ctx=c.getContext('2d');\n  const W=c.width=window.innerWidth, H=c.height=window.innerHeight;\n  const colors=['#ff5e8a','#3f7fe0','#b388ff','#ffd166','#06d6a0','#ff8fab'];\n  const N=160, parts=[];"
confetti_new = "function launchConfetti(){\n  const c=document.getElementById('confetti'); if(!c || PREFERS_REDUCED_MOTION) return;\n  const ctx=c.getContext('2d');\n  const W=c.width=window.innerWidth, H=c.height=window.innerHeight;\n  const colors=['#ff5e8a','#3f7fe0','#b388ff','#ffd166','#06d6a0','#ff8fab'];\n  const N=LOW_POWER_DEVICE?72:160, maxMs=LOW_POWER_DEVICE?1800:2800, parts=[];"
if confetti_old not in s:
    raise SystemExit('confetti anchor missing')
s = s.replace(confetti_old, confetti_new, 1)
s = s.replace("    ctx.clearRect(0,0,W,H);\n    let alive=false;", "    ctx.clearRect(0,0,W,H);\n    if(document.hidden) return;\n    let alive=false;", 1)
s = s.replace("    if(alive && t-t0<2800) requestAnimationFrame(frame);", "    if(alive && t-t0<maxMs) requestAnimationFrame(frame);", 1)

# 5) Two decimal places everywhere user-visible scores are narrated.
count_1dp = s.count('toFixed(1)')
if count_1dp < 4:
    raise SystemExit(f'expected at least 4 one-decimal score displays, got {count_1dp}')
s = s.replace('toFixed(1)', 'toFixed(2)')

# Restore draft on normal visits; recovery URLs retain priority.
init_old = '''    const uid=p.get('uid');\n    if(uid && /^[A-Za-z0-9_-]{8,64}$/.test(uid)){ recoverData(uid); }\n  }catch(e){}\n})();'''
init_new = '''    const uid=p.get('uid');\n    if(uid && /^[A-Za-z0-9_-]{8,64}$/.test(uid)){ recoverData(uid); return; }\n    const restored = restoreDraft();\n    if(restored && currentGender) pickGender(currentGender, true);\n    if(restored && restored.done>0){\n      renderQuiz(); updateProgress({silent:true}); show('quiz');\n      setTimeout(()=>toast(`已恢复上次进度 · ${restored.done} / 50 ✨`), 120);\n    }\n  }catch(e){}\n})();'''
if init_old not in s:
    raise SystemExit('init anchor missing')
s = s.replace(init_old, init_new, 1)

# Keyboard activation for bottom progress panel.
keyboard_add = "\ndocument.addEventListener('keydown',e=>{\n  if((e.key==='Enter'||e.key===' ') && e.target && e.target.id==='foot-progress'){ e.preventDefault(); jumpToFirstUnanswered(); }\n});\n"
end_anchor = "})();\n</script>"
if end_anchor not in s:
    raise SystemExit('script end anchor missing')
s = s.replace(end_anchor, "})();" + keyboard_add + "</script>", 1)

if s == orig:
    raise SystemExit('no changes made')
p.write_text(s, encoding='utf-8')
print('frontend polish patch applied')
print('remaining toFixed(1):', s.count('toFixed(1)'))
print('draft key:', DRAFT_KEY if False else 'cris_quiz_draft_v1')
