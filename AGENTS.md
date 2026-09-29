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
| 部署 | Wrangler v4（`npm run deploy` 手动部署） |

## 项目结构

```
/
├── src/                      # 后端源码
│   ├── index.ts              # Hono 应用入口：路由注册、中间件绑定
│   ├── user.ts               # 用户模块：登录/注册/me + jwt_verify 中间件
│   ├── post.ts               # 文章模块：CRUD + owner_or_admin 权限中间件
│   └── auth.ts               # PBKDF2 密码哈希/验证工具函数
├── public/                   # 前端静态资源 (通过 ASSETS binding 托管)
│   ├── index.html            # 入口跳转页：统一跳转 /notes
│   └── notes/                # 墨记笔记应用 (ofa.js)
│       ├── index.html        # 应用入口（加载 ofa.js / marked CDN）
│       ├── auth.html         # 登录/注册页
│       ├── main.html         # 主界面：列表 + Markdown 编辑器
│       ├── store.js          # 数据层：对接 /api/post、token 管理
│       └── app-config.js     # 路由配置
├── types/                    # TypeScript 类型定义
│   └── worker-configuration.d.ts
├── init.sql                  # 数据库初始化：t_user + t_post 建表与种子数据
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
| GET | `/api/post` | JWT | 文章列表（仅自己的文章），支持 `?keyword=` 标题搜索 |
| GET | `/api/post/:id` | JWT | 文章详情（仅自己的文章） |
| POST | `/api/post` | JWT | 创建文章 |
| PUT | `/api/post/:id` | 作者/管理员 | 更新文章 |
| DELETE | `/api/post/:id` | 作者/管理员 | 删除文章 |

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
cp .dev.vars.example .dev.vars   # 配置 jwt_secret
npm run dev                       # 启动本地开发服务器 (http://localhost:8787)
npx wrangler d1 execute workers-api --local --file=init.sql  # 初始化数据库
```

## 部署

- 手动执行 `npm run deploy`（wrangler deploy --minify）部署到 Cloudflare Workers
- 数据库结构变更需手动执行 `npx wrangler d1 execute workers-api --remote`（先迁移库，再部署代码）

## 配置说明

### wrangler.jsonc
- `DB`: D1 数据库绑定
- `open_register`: 注册开关环境变量
- `jwt_secret`: JWT 签名密钥（敏感信息，本地用 `.dev.vars`，生产用 `wrangler secret put`）