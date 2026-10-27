# workers-api — 项目概览

基于 Cloudflare Workers + Hono 的全栈笔记应用（墨记，ofa.js 前端）。

## 技术栈

| 层面 | 技术 |
|------|------|
| 运行时 | Cloudflare Workers (ESNext) |
| 后端框架 | Hono v4 |
| 数据库 | Cloudflare D1 (SQLite) |
| 认证 | JWT (`hono/jwt`) + PBKDF2 密码哈希 |
| 前端 | ofa.js 墨记笔记应用（Markdown 编辑，移动/桌面自适应） |
| 部署 | Wrangler v4 + GitHub 推送自动部署（Cloudflare GitHub 集成） |

## 项目结构

```
/
├── src/                      # 后端源码
│   ├── index.ts              # Hono 应用入口：路由注册、中间件绑定
│   ├── user.ts               # 用户模块：登录/注册/me + jwt_verify 中间件
│   ├── post.ts               # 文章模块：CRUD + owner_or_admin 权限中间件
│   ├── auth.ts               # PBKDF2 密码哈希/验证工具函数
│   └── upload.ts             # 图片上传：代理转发到 CloudFlare ImgBed 图床
├── public/                   # 前端静态资源 (通过 ASSETS binding 托管)
│   ├── index.html            # 入口跳转页：统一跳转 /notes
│   └── notes/                # 墨记笔记应用 (ofa.js)
│       ├── index.html        # 应用入口（加载 ofa.js / marked CDN）
│       ├── auth.html         # 登录/注册页
│       ├── main.html         # 主界面：列表 + Markdown 编辑器
│       ├── store.js          # 数据层：对接 /api/post、/api/upload、token 管理
│       └── app-config.js     # 路由配置
├── types/                    # TypeScript 类型定义
│   └── worker-configuration.d.ts
├── migrations/               # D1 数据库迁移（wrangler d1 migrations）
│   └── 0001_init.sql         # 基线：t_user + t_post + t_login_fail + FTS 索引表
├── wrangler.jsonc            # Wrangler 配置文件
├── .dev.vars.example         # 本地环境变量模板
├── AGENTS.md                 # 项目说明文档（本文件）
├── package.json
└── tsconfig.json
```

## API 接口

所有接口返回格式: `{ code: number, msg: string, data?: any, token?: string }`

### 用户 (`/api/user`)
| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/user/login` | 无 | 登录，返回 JWT token (30天有效) |
| POST | `/api/user/register` | 无 | 注册（需 `open_register=1`） |
| GET | `/api/user/me` | JWT | 获取当前用户信息 |

### 文章 (`/api/post`) — 全部需 JWT
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/post` | JWT | 文章列表（仅自己的文章），分页 `page`/`page_size`（默认 20，上限 50），返回 `has_more`；列表仅含摘要 `excerpt`，正文全文见详情接口；支持 `?keyword=` 全文搜索（标题+正文） |
| GET | `/api/post/:id` | JWT | 文章详情（仅自己的文章，返回正文全文 `body`） |
| POST | `/api/post` | JWT | 创建文章，返回新文章 `data.id` |
| PUT | `/api/post/:id` | 作者/管理员 | 更新文章 |
| DELETE | `/api/post/:id` | 作者/管理员 | 删除文章 |

### 图片 (`/api/upload`) — 需 JWT
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload` | `multipart/form-data` 字段 `file`，后端转发到 CloudFlare ImgBed 图床，返回 `data.url` 直链；仅接受 `image/*`，单图上限 8MB |

- 图床凭据（`imgbed_token` / `imgbed_auth_code`）只存服务端，浏览器不可见
- 前端上传前自动压缩：超过 1MB 或长边超过 1920px 的位图转 WebP（质量 0.85），GIF/SVG 原样上传

## 数据库 (D1)

### t_user
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 用户ID |
| username | TEXT UNIQUE | 用户名 |
| password | TEXT | PBKDF2 哈希密码 (`pbkdf2$100000$salt$hash`) |
| role | TEXT | 角色: `admin` / `user` |
| last_time | INTEGER | 最后登录时间戳 |

### t_post
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 文章ID |
| title | TEXT | 标题 |
| body | TEXT | 正文 |
| create_time | INTEGER | 创建时间戳 |
| update_time | INTEGER | 更新时间戳 |
| user_id | INTEGER | 作者ID (关联 t_user.id) |

索引：`idx_post_user_update(user_id, update_time)`（列表分页过滤 + 排序，迁移 0002）

### t_post_fts（全文索引）
| 说明 | 内容 |
|------|------|
| 类型 | FTS5 虚表（contentless-delete 模式，不存原文，正文经 rowid join t_post 获取） |
| 维护方 | 应用层：`src/post.ts` 增删改用 D1 `batch` 与正文同事务更新索引（原因见下） |
| 分词 | trigram（3 字符子串）；1-2 字短词由接口层 LIKE 兜底 |

## 数据库迁移

使用 `wrangler d1 migrations` 管理结构变更：

| 命令 | 说明 |
|------|------|
| `npm run db:local` | 应用迁移到本地库 |
| `npm run db:remote` | 应用迁移到生产库（发布代码前先执行） |
| `npx wrangler d1 migrations create workers-api <变更名>` | 创建新的迁移文件 |

- 迁移文件位于 `migrations/`（按序号命名），已应用的迁移**不可修改**（`d1_migrations` 账本记录后不会重跑）
- 本地与生产账本相互独立：生产必须手动 `npm run db:remote`
- **迁移文件中禁止写触发器**：D1 远程执行按分号拆分多语句，触发器必需的 `BEGIN...END` 会被拆断（报 `incomplete input`）；因此 FTS 索引改由应用层维护

## 认证机制

- **JWT**: 请求头 `token` 字段携带，有效期 30 天
- **自动续期**: `jwt_verify` 中间件验证 token 后查询 `last_time`，若距上次登录≤30天则在响应头 `x-new-token` 中签发新 token
- **前端**: `notes/store.js` 的 `api()` 函数自动检测 `x-new-token` 并更新 `localStorage`
- **密码**: PBKDF2 + SHA-256，100000 次迭代，兼容旧明文自动升级

## 权限控制

- `jwt_verify` 中间件: 解析 token 设置 `role` 和 `uid` 到请求上下文
- `owner_or_admin` 中间件: 文章作者（`user_id` 匹配）或 `admin` 角色可更新/删除
- 所有用户（含管理员）只能看到自己的文章，列表与详情均按 `user_id` 过滤

## 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | `index.html` | 入口跳转页（统一跳转 /notes） |
| `/notes` | `notes/index.html` | 墨记笔记应用 |

## 本地开发

```bash
cp .dev.vars.example .dev.vars   # 配置 jwt_secret、imgbed_token
npm run db:local                  # 应用数据库迁移（本地）
npm run dev                       # 启动本地开发服务器 (http://localhost:8787)
```

## 部署

- 推送 `master` 分支到 GitHub 后自动触发部署（Cloudflare 控制台的 GitHub 集成，仓库内无 workflow 文件）
- 数据库结构变更的发布顺序：先 `npm run db:remote` 应用迁移，再推送代码触发部署（新代码可能依赖新库结构）

## 配置说明

### wrangler.jsonc
- `DB`: D1 数据库绑定
- `durable_objects`: bindings 已清空（聊天功能已下线），migrations 保留历史 v1-v4：v4 为 `deleted_classes: [ChatRoom]`，用于回收生产环境存量 ChatRoom 实例（直接删除绑定会报 10064）
- `open_register`: 注册开关，字符串 `"0"`/`"1"`（代码判断 `String(c.env.open_register) !== '1'` 即拒绝注册）；当前为 `"0"`，注册关闭
- `jwt_secret`: JWT 签名密钥（敏感信息，本地用 `.dev.vars`，生产用 `wrangler secret put`）
- `imgbed_url` / `imgbed_channel` / `imgbed_channel_name`: 图床地址 `https://cfbed.325641.xyz`、渠道类型 `huggingface`（对应 `uploadChannel`）、渠道名 `hf`（对应 `channelName`）。**不要省略渠道参数**：不指定时图床会逐渠道尝试，经 Worker 中转耗时从 4-8 秒恶化到 12-30 秒甚至触发 30 秒超时
- `imgbed_token`: 图床 API Token（需 upload 权限，走 `Authorization: Bearer`；敏感信息，本地用 `.dev.vars`，生产用 `wrangler secret put`）；若改用上传认证码则配 `imgbed_auth_code`（走 `authCode` 查询参数）；两者都未配置时 `/api/upload` 返回“图片上传服务未配置”