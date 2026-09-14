from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

bad17 = "cheer('已完成 1/3 啦 🌟\n慢慢来，你愿意花时间看看自己，就很了不起');"
bad33 = "cheer('完成 2/3 了 💪\n再坚持一下，你离「看清自己」更近一步');"
# Python strings above contain real newlines. Replace them with two-character \\n in JS source.
good17 = "cheer('已完成 1/3 啦 🌟\\n慢慢来，你愿意花时间看看自己，就很了不起');"
good33 = "cheer('完成 2/3 了 💪\\n再坚持一下，你离「看清自己」更近一步');"

if bad17 not in s or bad33 not in s:
    raise SystemExit('expected generated multiline milestone strings not found')
s = s.replace(bad17, good17, 1).replace(bad33, good33, 1)

p.write_text(s, encoding='utf-8')
print('fixed milestone JS string escaping')
