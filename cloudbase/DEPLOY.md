# CRIS v2 · CloudBase 部署

## 1. 创建数据库集合

创建：

- `community_bins`
- `backups`
- `responses`（仅为了兼容旧版恢复码；新部署可不创建）

**所有集合都设置为“仅管理员可读写”。**

不要把 `backups` / `responses` 设置成“所有人可读”。前端不会直接访问数据库，所有访问都通过云函数完成。

## 2. 运行时

建议使用 CloudBase 当前推荐的 Node.js 20 LTS 运行时（例如 Nodejs20.19 或平台显示的更新推荐版本）。

## 3. 部署云函数

```bash
npm i -g @cloudbase/cli
tcb login
cd cloudbase
ENV_ID=你的环境ID bash deploy_cloudbase.sh
```

函数目录：`cloudbase/crisApi/`

## 4. HTTP 访问服务

为 `crisApi` 创建 HTTP 触发 / 云接入路由。

**不要自行拼接访问域名。** 不同 CloudBase 环境的完整域名可能包含 ENV_ID、APP_ID、地域等信息。部署后直接从 CloudBase 控制台复制“访问服务 / 网关”显示的完整 URL，并把 `index.html` 中的 `API_BASE` 改为该 URL。

CORS 白名单可配置：

```text
https://cochranek.github.io
```

注意：CORS 只约束浏览器跨域读取，不是 API 身份认证。curl / 服务器程序不受浏览器 CORS 机制保护。

## 5. 接口

```text
GET  /api/community
POST /api/community/submit
POST /api/backup
GET  /api/mine      (x-cris-token)
POST /api/delete    (x-cris-token 或 body.token)
```

兼容接口：

```text
GET  /api/points    -> 返回空 points + deprecated 标记
POST /api/submit    -> 旧前端过渡兼容
```

## 6. 安全建议

- CloudBase 数据库集合只允许管理员读写；
- 网关层再配置全局限流 / WAF；
- 不记录恢复 token；
- 不在监控、截图、公开 issue 中粘贴真实恢复 token；
- 定期检查云平台访问日志的保留策略。

## 7. 旧版 `responses`

v2 `/api/mine` 和 `/api/delete` 会回退查找旧版 `responses.doc(uid)`，所以现有恢复二维码不会立即失效。

旧数据完成迁移并确认不再需要兼容后，可以停用 / 删除 `responses`。如果保留，权限仍必须是“仅管理员可读写”。
