# Legacy backends

这里保存 v2 之前的 Flask / Cloudflare D1 实验实现，仅用于历史参考。

**不要用于生产部署。** 这些实现与当前前端 API、隐私模型和数据聚合方式不一致，其中旧 Cloudflare 版本曾公开逐人 uid / 坐标，旧 Flask 版本也不具备当前服务端复核与恢复安全模型。

生产环境只维护 `cloudbase/crisApi/`。
