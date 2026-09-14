from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

bad17 = "cheer('已完成 1/3 啦 🌟\n慢慢来，你愿意花时间看看自己，就很了不起');"
bad33 = "cheer('完成 2/3 了 💪\n再坚持一下，你离「看清自己」更近一步');"
good17 = "cheer('已完成 1/3 啦 🌟\\n慢慢来，你愿意花时间看看自己，就很了不起');"
good33 = "cheer('完成 2/3 了 💪\\n再坚持一下，你离「看清自己」更近一步');"

changed = False
if bad17 in s:
    s = s.replace(bad17, good17, 1); changed = True
elif good17 not in s:
    raise SystemExit('17-question milestone string not found')

if bad33 in s:
    s = s.replace(bad33, good33, 1); changed = True
elif good33 not in s:
    raise SystemExit('33-question milestone string not found')

if changed:
    p.write_text(s, encoding='utf-8')
    print('fixed milestone JS string escaping')
else:
    print('milestone JS string escaping already valid')
