# CRIS 后端部署手册（腾讯云开发 CloudBase）

## 为什么用 CloudBase
- **大陆可达、免费额度、无需信用卡**：CloudBase 让没有外网权限的用户也能**直接上传、直接读取**群体分布。
- 前端继续用 **GitHub Pages**（`github.io`，你的用户能打开），只把后端搬过来即可。

## 前置条件
1. 注册并登录 [腾讯云](https://cloud.tencent.com)。
2. 完成 **实名认证**（国内云产品硬性要求，个人身份证即可）。
3. 开通 **云开发 CloudBase**（选免费版 / 基础版1，有免费额度）。
4. 新建一个环境，记下 **环境 ID**（形如 `cris-1gabcde1234`）与所在**地域**（如 `ap-shanghai` / `ap-guangzhou`）。

## 步骤

### 1. 建数据库集合
- 环境 → **数据库** → 新建集合 `responses`。
- 权限：选「**仅管理端可写，所有人可读**」（云函数以管理员身份写入；前端只读全体落点，已由接口控制）。

### 2. 部署云函数
**方式 A（CLI，推荐）**
```bash
npm i -g @cloudbase/cli
tcb login              # 浏览器扫码授权（一次性）
cd cloudbase
ENV_ID=你的环境ID bash deploy_cloudbase.sh
```

**方式 B（控制台）**
- 环境 → **云函数** → 新建 `crisApi`，运行环境选 Node.js 16/18。
- 把 `cloudbase/crisApi/index.js` 与 `package.json` 上传（或在线编辑 `index.js`，并在依赖里添加 `@cloudbase/node-sdk`）。

### 3. 开 HTTP 触发 / 云接入（让前端能跨域调用）
- 云函数 → `crisApi` → **触发管理** → 创建 **HTTP 触发**，触发路径填 `/`。
  - 触发后访问域名形如：`https://<ENV_ID>-<APP_ID>.<地域>.app.tcloudbase.com/crisApi`
  （`<APP_ID>` 是腾讯云账号 appid，**必须带**，否则域名 404；以控制台「访问服务 / 网关」显示的**完整**域名为准）
- 或者开启 **云接入**（环境 → 云接入 → 新建路由 `/crisApi` → 指向 `crisApi`），并在「跨域配置」白名单加入 `https://cochranek.github.io`。
- ⚠️ 无论哪种，都必须允许来源 `https://cochranek.github.io`。云函数代码里 CORS 已写死该域名；若以后换前端域名，记得同步改 `index.js` 的 `ALLOWED_ORIGIN`。

### 4. 填入前端地址
- 打开 `index.html`，把第 727 行附近的
  ```js
  const API_BASE = 'https://<ENV_ID>-<APP_ID>.ap-shanghai.app.tcloudbase.com/crisApi';
  ```
  中的 `<ENV_ID>` 与地域后缀换成控制台显示的**真实域名**（地域后缀按你环境实际地域，如 `ap-guangzhou`）。
- 推送到 GitHub（`main` 分支），GitHub Pages 自动重建（约 1 分钟）。

### 5. 验证
- 浏览器直接访问 `https://<你的域名>/crisApi/api/points` 应返回 `{"points":[]}`。
- 打开 `https://cochranek.github.io/cris/`，做一份测验（或点第 2 题「自动作答」），刷新后应看到落点出现在群体分布里。

## 接口
- `GET  /api/points`：全体落点 `[{uid,m,f,gender}]`
- `POST /api/submit`：body `{uid,gender,answers[50]}` → 服务端按 50 题重算 m/f/type、按 uid 主键去重，返回 `{uid,m,f,type}`
- `GET  /api/mine`（头 `x-cris-uid`）：返回本人完整记录（含 answers）

## 费用
- 免费版 / 基础版1 含一定云函数调用次数与 1 GB 云数据库存储，小型匿名测验足够；超量再考虑升级。

## 备注
- 隐私：后端只存 `uid / gender / 50 题 answers / m / f / type / createdAt`，**不存姓名、微信、IP**。
- 🔧 免 `tcb login` 反复扫码的替代部署：用 CloudBase MCP（stdio 旁路，`~/.workbuddy/skills/cloudbase-stdio-bypass`）直接调 `tcb fn deploy` 等工具，登录态写盘复用、不会每次重新授权。适合在 WorkBuddy 沙箱/无头环境重部署。
