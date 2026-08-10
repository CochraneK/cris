#!/usr/bin/env bash
# 用 Cloudflare API 自动完成：建 KV 命名空间 + 部署 worker.js + 绑定 POINTS
# 用法（在本目录执行）： CLOUDFLARE_API_TOKEN=xxxx bash cf_deploy.sh
set -e
PY="${PYTHON_BIN:-/c/Users/cunyi/.workbuddy/binaries/python/versions/3.13.12/python.exe}"
TOKEN="${CLOUDFLARE_API_TOKEN:?请提供 CLOUDFLARE_API_TOKEN 环境变量（不要硬编码进文件）}"
ACCT="ae27d2977eacb9430d01773a28d42c93"
SCRIPT="polished-moon-b698"          # 你已建的 Worker 名
KV_NAME="bsri-points"
API="https://api.cloudflare.com/client/v4"
AUTH="Authorization: Bearer $TOKEN"

echo "==> 1/3 创建 KV 命名空间（已存在则复用）"
KV_ID=$(curl -s -X POST "$API/accounts/$ACCT/storage/kv/namespaces" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"title\":\"$KV_NAME\"}" | "$PY" -c "import sys,json;d=json.load(sys.stdin);print(d.get('result',{}).get('id','') if d.get('success') else '')")
if [ -z "$KV_ID" ]; then
  KV_ID=$(curl -s "$API/accounts/$ACCT/storage/kv/namespaces" -H "$AUTH" \
    | "$PY" -c "import sys,json;d=json.load(sys.stdin);print([n['id'] for n in d.get('result',[]) if n.get('title')=='$KV_NAME'][0])")
fi
echo "    KV namespace id = $KV_ID"

echo "==> 2/3 写绑定元数据（经典 worker 不需要 main_module）"
cat > _cf_meta.json <<EOF
{"body_part":"worker.js","compatibility_date":"2025-01-01","bindings":[{"type":"kv_namespace","name":"POINTS","namespace_id":"$KV_ID"}]}
EOF

echo "==> 3/3 部署 Worker 并绑定 KV"
curl -s -X PUT "$API/accounts/$ACCT/workers/scripts/$SCRIPT" \
  -H "$AUTH" \
  -F "worker.js=@worker.js;type=application/javascript" \
  -F "metadata=@_cf_meta.json;type=application/json" \
  | "$PY" -c "import sys,json;d=json.load(sys.stdin);print('    success =',d.get('success'), '| errors =', d.get('errors'))"

echo
echo "✅ 完成。Worker 地址： https://$SCRIPT.cunyikang.workers.dev"
rm -f _cf_meta.json
