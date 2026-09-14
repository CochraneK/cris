#!/usr/bin/env bash
# CRIS 后端部署到腾讯云开发 CloudBase（需先：npm i -g @cloudbase/cli && tcb login）
# 用法：
#   ENV_ID=你的环境ID ./cloudbase/deploy_cloudbase.sh
set -e
ENV_ID="${ENV_ID:?请先设置 ENV_ID（云开发环境 ID，形如 cris-1gabcde1234）}"
FUNC=crisApi
ROOT="$(cd "$(dirname "$0")" && pwd -W)"

echo "==> 1/2 部署云函数 $FUNC -> 环境 $ENV_ID"
# 适配 tcb CLI 3.8.x（旧写法 --name/--entry/--path 已失效）：
#   - 函数名用位置参数；入口由项目推断（index.main）
#   - 代码目录用 --dir（--path 现在表示 HTTP 访问路径，非代码目录）
#   - --force 覆盖已存在函数；--yes 关闭交互式确认（非 TTY 下必需）
tcb fn deploy "$FUNC" --env-id "$ENV_ID" --dir "$ROOT/crisApi" --force --yes

echo "==> 2/2 完成"
echo "请在 CloudBase 控制台为该云函数创建【HTTP 触发】（触发路径 /），"
echo "或使用【云接入】把路由（如 /crisApi）指向此函数，并在跨域白名单加入："
echo "    https://cochranek.github.io"
echo ""
echo "部署后前端 API_BASE 应设为（地域后缀按控制台实际域名调整）："
echo "    https://$ENV_ID.ap-shanghai.app.tcloudbase.com/$FUNC"
