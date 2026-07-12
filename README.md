# XenonChat

高级网页 IM（私聊 / 群聊 / 好友 / Moments），技术栈为 Next.js 15 + NestJS + PostgreSQL + Redis + MinIO（S3）。

## 功能概览（MVP）

- 注册 / 登录 / 刷新 Token / 多设备管理
- 用户资料：`user_id`、昵称、头像、签名、主题、圆角、中英双语
- 好友申请、通讯录、黑名单
- 私聊与群聊实时消息（WebSocket）
- Markdown / LaTeX、引用（整条 / 片段）、链接预览
- 图片 / 视频 / 语音 / 文件消息
- 私聊与群聊 TTL 自动销毁、慢速模式、群总速率限制
- 群角色（owner / admin / member）、公告置顶、审计日志
- Moments：发布、可见范围、评论、点赞
- 消息虚拟滚动、历史分页、幂等发送

## 仓库结构

```
apps/web          Next.js 前端
apps/api          NestJS API + WebSocket + Retention Worker
packages/shared   错误码、Zod schema、权限与 SSRF 工具、WS 事件
docker-compose.yml  Postgres / Redis / MinIO
```

## 快速开始

### 1. 依赖服务

推荐 Docker Compose：

```bash
docker compose up -d
```

将启动：

- PostgreSQL `localhost:5432`（xenon / xenon / xenonchat）
- Redis `localhost:6379`
- MinIO `localhost:9000`（控制台 `9001`）

也可自行安装同等版本的 Postgres 16 与 Redis 7；对象存储不可用时 API 会回退到本地 `.uploads`。

### 2. 环境变量

```bash
cp .env.example .env
# 同步给 API（Prisma 会读取 apps/api/.env）
cp .env apps/api/.env
cp .env.example apps/web/.env.local   # 至少保留 NEXT_PUBLIC_* 
```

### 3. 安装与数据库

```bash
pnpm install
pnpm --filter @xenonchat/shared build
pnpm --filter @xenonchat/api prisma:generate
pnpm --filter @xenonchat/api exec prisma migrate deploy
# 或开发：pnpm --filter @xenonchat/api exec prisma migrate dev
pnpm db:seed
```

### 4. 启动

```bash
# 两个终端，或：
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/health
- WS:  ws://localhost:4000/ws?token=<access_token>

### 演示账号（seed）

| Email | Password | Username |
|-------|----------|----------|
| alice@xenonchat.local | Password123! | alice |
| bob@xenonchat.local | Password123! | bob |
| carol@xenonchat.local | Password123! | carol |

三人互为好友，并加入示例群 `xenon_lounge`。

## 测试

```bash
pnpm --filter @xenonchat/shared test
pnpm --filter @xenonchat/api test
```

## 关键设计决策

- 置顶公告：每群仅 1 条
- Quote + TTL：snapshot 随新消息 TTL；原消息过期后清空 snapshot（高隐私）
- 慢速模式：owner/admin 豁免单用户慢速，**不**豁免群总速率
- 退群后不可再拉历史消息
- 链接预览：每条消息最多 1 张卡片，后端抓取并防 SSRF
- 默认群上限 500，系统绝对上限 2000（环境变量可配）

## API 前缀

所有 REST 接口位于 `/api/*`，例如：

- `POST /api/auth/login`
- `GET  /api/conversations`
- `POST /api/messages`
- `GET  /api/moments/feed`

统一响应：`{ ok: true, data }` 或 `{ ok: false, error: { code, message } }`。

## 生产注意

- 必须更换 `JWT_SECRET` / `REFRESH_TOKEN_SECRET`
- 全站 HTTPS + WSS
- 对象存储私有桶 + 短时签名 URL
- 第一版未实现 E2EE；预留扩展点
- 管理后台未完整实现，已预留 `moderation_actions` 与用户封禁字段
