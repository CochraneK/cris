from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

# Restore original fixed footer button; keep low-power/reduced-motion support.
css_old = """  .quiz-foot .btn{padding:14px;font-size:16px;}\n  .foot-progress{background:#fff;border:1px solid #f3dce7;border-radius:16px;padding:11px 13px 12px;box-shadow:0 8px 20px rgba(255,94,138,.16);cursor:pointer;}\n  .foot-progress-row{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;font-weight:700;color:#6f5e68;margin-bottom:7px;}\n  .foot-progress-row span:last-child{color:var(--pink);}\n  .foot-progress-track{height:8px;background:#f4e8ee;border-radius:999px;overflow:hidden;}\n  .foot-progress-track>i{display:block;height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#ff8fab,#ff5e8a,#b388ff);transition:width .28s ease;}\n  #submit-btn{display:none;}\n  .quiz-foot.complete .foot-progress{display:none;}\n  .quiz-foot.complete #submit-btn{display:block;}\n"""
css_new = "  .quiz-foot .btn{padding:14px;font-size:16px;}\n"
if css_old not in s:
    raise SystemExit('dynamic footer CSS anchor missing')
s = s.replace(css_old, css_new, 1)
s = s.replace('.progress>i,.foot-progress-track>i,.opt,.btn{transition:none!important;}', '.progress>i,.opt,.btn{transition:none!important;}', 1)

footer_old = '''    <div class="quiz-foot" id="quiz-foot">\n      <div class="foot-progress" id="foot-progress" onclick="jumpToFirstUnanswered()" role="button" tabindex="0" title="点这里跳到下一道未答题">\n        <div class="foot-progress-row"><span id="foot-status">已完成 0 / 50</span><span id="foot-pct">0%</span></div>\n        <div class="foot-progress-track"><i id="foot-progress-bar"></i></div>\n      </div>\n      <button class="btn" id="submit-btn" onclick="finishQuiz()">查看我的结果 ✨</button>\n    </div>'''
footer_new = '''    <div class="quiz-foot">\n      <button class="btn" id="submit-btn" onclick="finishQuiz()">查看我的结果 ✨</button>\n    </div>'''
if footer_old not in s:
    raise SystemExit('dynamic footer HTML anchor missing')
s = s.replace(footer_old, footer_new, 1)

helpers_old = '''function jumpToFirstUnanswered(){\n  const first = answers.findIndex(a=>a===0);\n  if(first < 0) return;\n  const card = document.querySelectorAll('.q-card')[first];\n  if(card) card.scrollIntoView({behavior:PREFERS_REDUCED_MOTION?'auto':'smooth',block:'center'});\n}\nfunction maybeAutoScroll(q, done){\n  if(PREFERS_REDUCED_MOTION || done >= 50) return;\n  let next = answers.findIndex((a,i)=>i>q && a===0);\n  if(next < 0) next = answers.findIndex(a=>a===0);\n  if(next < 0) return;\n  setTimeout(()=>{\n    const card = document.querySelectorAll('.q-card')[next];\n    if(!card) return;\n    const rect = card.getBoundingClientRect();\n    const foot = document.getElementById('quiz-foot');\n    const safeBottom = window.innerHeight - (foot ? foot.offsetHeight : 84);\n    // 下一题已经在舒适阅读区就不抢滚动；只有偏低/被底栏挡住时才轻推。\n    if(rect.top > window.innerHeight*0.60 || rect.bottom > safeBottom + 36){\n      card.scrollIntoView({behavior:LOW_POWER_DEVICE?'auto':'smooth',block:'center'});\n    }\n  }, LOW_POWER_DEVICE ? 50 : 110);\n}\n'''
if helpers_old not in s:
    raise SystemExit('auto-scroll helper anchor missing')
s = s.replace(helpers_old, '', 1)

click_old = '''      const q = +el.dataset.q, v = +el.dataset.v;\n      const wasAnswered = answers[q] > 0;\n      answers[q] = v;\n      const siblings = box.querySelectorAll(`.opt[data-q="${q}"]`);\n      siblings.forEach(s=>s.classList.remove('on'));\n      el.classList.add('on');\n      saveDraft();\n      const done = updateProgress();\n      if(!wasAnswered) maybeAutoScroll(q, done);'''
click_new = '''      const q = +el.dataset.q, v = +el.dataset.v;\n      answers[q] = v;\n      const siblings = box.querySelectorAll(`.opt[data-q="${q}"]`);\n      siblings.forEach(s=>s.classList.remove('on'));\n      el.classList.add('on');\n      saveDraft();\n      updateProgress();'''
if click_old not in s:
    raise SystemExit('answer click auto-scroll anchor missing')
s = s.replace(click_old, click_new, 1)

progress_old = '''  const fs=document.getElementById('foot-status'), fp=document.getElementById('foot-pct'), fb=document.getElementById('foot-progress-bar');\n  if(fs) fs.textContent = `已完成 ${done} / 50`;\n  if(fp) fp.textContent = Math.round(pct) + '%';\n  if(fb) fb.style.width = pct + '%';\n  const foot=document.getElementById('quiz-foot');\n  if(foot) foot.classList.toggle('complete', done===50);\n'''
if progress_old not in s:
    raise SystemExit('bottom progress JS anchor missing')
s = s.replace(progress_old, '', 1)

p.write_text(s, encoding='utf-8')
print('reverted auto-scroll and dynamic footer only')
