#!/usr/bin/env bash
# CRIS 后端部署到腾讯云开发 CloudBase（需先：npm i -g @cloudbase/cli && tcb login）
# 用法：
#   ENV_ID=你的环境ID ./cloudbase/deploy_cloudbase.sh
set -e
ENV_ID="${ENV_ID:?请先设置 ENV_ID（云开发环境 ID，形如 cris-1gabcde1234）}"
FUNC=crisApi
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> 1/2 部署云函数 $FUNC -> 环境 $ENV_ID"
tcb fn deploy "$FUNC" --envId "$ENV_ID" --name "$FUNC" --entry "index.js" --path "$ROOT/crisApi"

echo "==> 2/2 完成"
echo "请在 CloudBase 控制台为该云函数创建【HTTP 触发】（触发路径 /），"
echo "或使用【云接入】把路由（如 /crisApi）指向此函数，并在跨域白名单加入："
echo "    https://cochranek.github.io"
echo ""
echo "部署后前端 API_BASE 应设为（地域后缀按控制台实际域名调整）："
echo "    https://$ENV_ID.ap-shanghai.app.tcloudbase.com/$FUNC"
