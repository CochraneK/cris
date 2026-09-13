# Security Policy

## Supported configuration

生产部署必须满足：

- `community_bins`、`backups`、旧版 `responses` 集合均为**仅管理员可读写**；
- 浏览器仅通过云函数访问数据库；
- 不把 CORS 当作身份认证；
- 恢复凭证不得写入日志、分享 JSON、公开 URL query 或群体接口；
- `/api/mine`、`/api/backup`、`/api/delete` 使用 `Cache-Control: no-store, private`；
- HTTP 网关应配置额外的全局限流 / WAF 规则，云函数内存限流只是一层基础节流。

## Threat model

恢复 token 是 bearer secret：持有者可以读取或删除对应私人备份。当前设计通过高熵随机 token、数据库仅保存哈希、URL fragment 和 no-store 响应降低泄露风险。

## Reporting

发现安全问题时，请通过仓库维护者的私密联系方式报告，不要在公开 issue 中粘贴真实恢复 token、原始作答或云端访问凭证。
