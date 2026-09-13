#!/usr/bin/env bash
set -euo pipefail

ENV_ID="${ENV_ID:?请先设置 ENV_ID，例如 cris-xxxx}"
FUNC="crisApi"
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> 部署 $FUNC 到 $ENV_ID"
tcb fn deploy "$FUNC" --envId "$ENV_ID" --name "$FUNC" --entry "index.js" --path "$ROOT/crisApi"

echo
echo "✅ 云函数部署完成"
echo "下一步："
echo "1. 在 CloudBase 控制台创建 community_bins / backups（以及需要兼容旧数据时的 responses）"
echo "2. 所有集合权限设为【仅管理员可读写】"
echo "3. 创建 HTTP 触发 / 云接入"
echo "4. 从控制台复制【完整访问 URL】到 index.html 的 API_BASE"
echo "   不要根据 ENV_ID 手工猜域名；不同环境的 APP_ID / 地域格式可能不同。"
