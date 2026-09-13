# CRIS hardening v2 change summary

- 重写前端数据流：个人计算、本地导出、匿名聚合、私人备份分离。
- 群体展示由逐人散点改为 0.25 分服务器端密度分箱。
- 完整 50 题默认不云存；私人备份改为显式操作。
- 恢复 token 使用 Web Crypto 安全随机数，服务端仅保存 SHA-256 哈希。
- 分享 JSON 移除 uid / token。
- 新恢复 URL 使用 fragment；旧 `?uid=` 继续兼容。
- 新增私人备份删除 UI 与旧恢复码删除兼容。
- 分数改显示两位小数；阈值附近给出非官方阅读提醒。
- 性别改为可选，并增加“其他 / 不填写”。
- 报告文案降低过度人格化解释，尤其修正“未分化 = 自由”的推断。
- AI prompt 禁止职业适配、性别认同、性取向和诊断推断。
- 后端私人 API 加 `no-store, private`；外部 500 错误不再泄露内部异常文本。
- 数据库部署文档改为所有集合仅管理员可读写；明确 CORS 不是认证。
- 修正 CloudBase 部署脚本错误拼接访问域名的问题。
- 新增 `PRIVACY.md`、`SECURITY.md`、`REFERENCES.md`、`THIRD_PARTY_NOTICES.md`。
- 新增 GitHub Actions 静态验证：题目数量/分类、阈值、前后端一致性、隐私不变量。
