#!/usr/bin/env python3
"""
BSRI 心理测验 · 后端服务（跨平台版，已去除 Unix 专用的 fcntl）
- 提供静态页面 (/)
- 收集每个填写者的 (男性化, 女性化) 落点
- /api/submit  提交自己的点  -> {"m":float,"f":float,"type":str,"gender":str}
- /api/points  获取全部历史点 -> {"points":[{"m":..,"f":..,"type":..,"gender":..}, ...]}
落点数据存于 data/points.json，使用线程锁防止并发写冲突（单进程 Flask 足够）。

运行：
    pip install -r requirements.txt
    python server.py            # 默认 http://0.0.0.0:8000
    PORT=9000 python server.py  # 自定义端口
"""
import json
import os
import threading
from flask import Flask, send_from_directory, request, jsonify

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE, "data")
DATA_FILE = os.path.join(DATA_DIR, "points.json")
os.makedirs(DATA_DIR, exist_ok=True)
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump([], f)

_lock = threading.Lock()
app = Flask(__name__, static_folder=None)


def _read_points():
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _write_points(points):
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(points, f, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, DATA_FILE)


@app.route("/")
def index():
    return send_from_directory(BASE, "index.html")


@app.route("/api/submit", methods=["POST"])
def submit():
    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({"ok": False, "error": "bad json"}), 400
    m = data.get("m")
    f = data.get("f")
    if not isinstance(m, (int, float)) or not isinstance(f, (int, float)):
        return jsonify({"ok": False, "error": "m/f required"}), 400
    t = data.get("type")
    if not isinstance(t, str):
        return jsonify({"ok": False, "error": "type required"}), 400
    g = data.get("gender") or "unknown"
    m = max(1.0, min(7.0, float(m)))
    f = max(1.0, min(7.0, float(f)))
    with _lock:
        points = _read_points()
        points.append({"m": round(m, 3), "f": round(f, 3), "type": t, "gender": g})
        _write_points(points)
        count = len(points)
    return jsonify({"ok": True, "count": count})


@app.route("/api/points")
def points():
    with _lock:
        return jsonify({"points": _read_points()})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, threaded=True)
