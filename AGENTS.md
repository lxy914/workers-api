# workers-api — 项目概览

基于 Cloudflare Workers + Hono 的全栈博客与实时聊天应用。

## 技术栈

| 层面 | 技术 |
|------|------|
| 运行时 | Cloudflare Workers (ESNext) |
| 后端框架 | Hono v4 |
| 数据库 | Cloudflare D1 (SQLite) |
| 认证 | JWT (`hono/jwt`) + PBKDF2 密码哈希 |
| Durable Objects | WebSocket 实时聊天 (ChatRoom) |
| 前端(桌面) | Webix UI — 文章管理数据表格 |
| 前端(移动) | Tailwind CSS + Font Awesome — SPA 文章管理 |
| 部署 | Wrangler v4 + GitHub Actions 自动部署 |

## 项目结构

```
/
├── src/                      # 后端源码
│   ├── index.ts              # Hono 应用入口：路由注册、中间件绑定
│   ├── user.ts               # 用户模块：登录/注册/me + jwt_verify 中间件
│   ├── post.ts               # 文章模块：CRUD + owner_or_admin 权限中间件
│   ├── auth.ts               # PBKDF2 密码哈希/验证工具函数
│   ├── durable-object.ts     # ChatRoom (WebSocket 聊天) + Counter(已删除)
│   └── types/                # TypeScript 类型定义
│       ├── webix.d.ts
│       ├── webix.global.d.ts
│       └── worker-configuration.d.ts
├── public/                   # 前端静态资源 (通过 ASSETS binding 托管)
│   ├── index.html            # 入口跳转页：移动端→/m，桌面端→/post
│   ├── login.html            # 登录/注册页 (Tailwind CSS)
│   ├── post.html             # 桌面端文章管理 (Webix 数据表格)
│   ├── m.html                # 移动端文章管理 SPA (Tailwind CSS)
│   ├── chat-client.html      # WebSocket 聊天客户端
│   ├── css/                  # Vditor、Webix 样式文件
│   └── js/                   # Vditor、Webix 脚本文件
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
| GET | `/api/post` | JWT | 文章列表，支持 `?keyword=` 标题搜索 |
| GET | `/api/post/:id` | 作者/管理员 | 文章详情 |
| POST | `/api/post` | JWT | 创建文章 |
| PUT | `/api/post/:id` | 作者/管理员 | 更新文章 |
| DELETE | `/api/post/:id` | 作者/管理员 | 删除文章 |

### Durable Objects (`/durable`)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/durable/chat` | WebSocket 实时聊天入口 |

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
| update_time | INTEGER | 更新时间戳 |
| user_id | INTEGER | 作者ID (关联 t_user.id) |

## 认证机制

- **JWT**: 请求头 `token` 字段携带，有效期 30 天
- **自动续期**: `jwt_verify` 中间件验证 token 后查询 `last_time`，若距上次登录≤30天则在响应头 `x-new-token` 中签发新 token
- **前端**: `post.html` 的 `api()` 函数和 `m.html` 的 `api()` 函数自动检测 `x-new-token` 并更新 `localStorage`
- **密码**: PBKDF2 + SHA-256，100000 次迭代，兼容旧明文自动升级

## 权限控制

- `jwt_verify` 中间件: 解析 token 设置 `role` 和 `uid` 到请求上下文
- `owner_or_admin` 中间件: 文章作者（`user_id` 匹配）或 `admin` 角色可操作
- 非管理员用户只能看到自己的文章

## 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | `index.html` | 设备检测跳转 |
| `/login` | `login.html` | 登录/注册 |
| `/post` | `post.html` | 桌面端文章管理 |
| `/m` | `m.html` | 移动端文章管理 |
| `/chat-client` | `chat-client.html` | WebSocket 聊天 |

## 本地开发

```bash
cp .dev.vars.example .dev.vars   # 配置 jwt_secret
npm run dev                       # 启动本地开发服务器 (http://localhost:8787)
npx wrangler d1 execute workers-api --local --file=init.sql  # 初始化数据库
```

## 自动部署 (CI/CD)

- **触发方式**: 推送 `master` 分支到 GitHub 自动触发

## 配置说明

### wrangler.jsonc
- `DB`: D1 数据库绑定
- `COUNTER` (已删除): 原计数器 DO，v3 migration 标记删除
- `CHAT`: ChatRoom Durable Object (WebSocket 聊天)
- `open_register`: 注册开关环境变量
- `jwt_secret`: JWT 签名密钥（敏感信息，本地用 `.dev.vars`，生产用 `wrangler secret put`）