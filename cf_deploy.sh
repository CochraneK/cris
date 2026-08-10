#!/usr/bin/env bash
# 部署 BSRI Worker（Cloudflare D1 版，模块格式）
# 用法（在本目录执行）： CLOUDFLARE_API_TOKEN=xxxx bash cf_deploy.sh
# 说明：群体数据改用 D1（一行一个 respondent），不再用单 KV key 做 read-modify-write；
#       Worker 会按 answers 后端自算 M/F/type、校验输入、并按 uid 去重。
set -e
PY="${PYTHON_BIN:-python3}"   # 可移植：默认 python3，需要时用 PYTHON_BIN 覆盖
TOKEN="${CLOUDFLARE_API_TOKEN:?请提供 CLOUDFLARE_API_TOKEN 环境变量（不要硬编码进文件）}"
ACCT="ae27d2977eacb9430d01773a28d42c93"
SCRIPT="polished-moon-b698"          # 你已建的 Worker 名
DB_NAME="bsri"
API="https://api.cloudflare.com/client/v4"
AUTH="Authorization: Bearer $TOKEN"

echo "==> 1/3 创建 D1 数据库（已存在则复用）"
DB_ID=$(curl -s -X POST "$API/accounts/$ACCT/d1/database" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"$DB_NAME\"}" | "$PY" -c "import sys,json;d=json.load(sys.stdin);print(d.get('result',{}).get('id','') if d.get('success') else '')")
if [ -z "$DB_ID" ]; then
  DB_ID=$(curl -s "$API/accounts/$ACCT/d1/database" -H "$AUTH" \
    | "$PY" -c "import sys,json;d=json.load(sys.stdin);print([n['id'] for n in d.get('result',[]) if n.get('name')=='$DB_NAME'][0])")
fi
echo "    D1 database id = $DB_ID"

echo "==> 2/3 写绑定元数据（模块格式 + D1 绑定 DB）"
cat > _cf_meta.json <<EOF
{"main_module":"worker.js","compatibility_date":"2025-01-01","bindings":[{"type":"d1","name":"DB","id":"$DB_ID"}]}
EOF

echo "==> 3/3 部署 Worker（模块格式）并绑定 D1"
curl -s -X PUT "$API/accounts/$ACCT/workers/scripts/$SCRIPT" \
  -H "$AUTH" \
  -F "worker.js=@worker.js;type=application/javascript" \
  -F "metadata=@_cf_meta.json;type=application/json" \
  | "$PY" -c "import sys,json;d=json.load(sys.stdin);print('    success =',d.get('success'), '| errors =', d.get('errors'))"

echo
echo "✅ 完成。Worker 地址： https://$SCRIPT.cunyikang.workers.dev"
rm -f _cf_meta.json
