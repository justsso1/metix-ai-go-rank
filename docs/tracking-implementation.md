# Recruiter's View 埋点实现方案

实现以本站代码为准，沿用 `metix-homepage` 的同源 BatchTracker 发送协议。采集业务 ID 为 `go-rank`；`eventId` 和 `properties.event_name` 使用 `go-rank.页面名.事件名`。事件清单与统计口径见 `docs/tracking-events.md`。

![页面、按钮与采集服务的埋点链路](./assets/tracking-flow.svg)

## 1. 链路

```
页面动作
  → trackCampaign / data-track          analytics.ts / metix-track.js
  → window.metix.track                  src/scripts/metix-track.js
  → 队列
  → 匿名：POST /api/track/anonymous/collect（逐条）
  → 有访问令牌：POST /api/track/collect/batch
  → 开发：Vite 代理；部署：nginx 代理
  → NEXT_PUBLIC_API_BASE 的 /hire/api/track/ 路径
  → 采集服务
```

`go.metix.ai` 和 `go-dev.metix.ai` 都向各自环境配置的 API 域名发请求；本地和其他预览域名不上传。`/share/:taskId?from=share` 的 OG 响应与真人重定向不加载这些脚本。

脚本在 `BaseLayout.astro` 里、归因脚本之后加载：

```html
<script src="../scripts/metix-attribution.js"></script>
<script src="../scripts/metix-track.js"></script>
```

## 2. 两层职责

`analytics.ts` 只在 `go.metix.ai` 和 `go-dev.metix.ai` 上处理 React 业务事件。它把已声明的调用名映射成类型、名字、模块，过滤业务属性；未知调用名不交给 SDK。SDK 未就绪时先放进最多 40 条的内存队列，监听 `metix:ready`，5 秒还没就绪就丢弃。埋点异常被隔离，不改变查询、分享、邮件或退订状态。

`metix-track.js` 负责声明式点击、首次加载的 `page_view`、事件 ID、会话、归因、采样和批量 POST。它仅在生产和测试域名发送；本地及其他域名仍可构建并清空队列，但 `post()` 不发网络请求。React 在客户端切换场景时调用 `trackCampaignPage`；SDK 按页面 ID 去重连续的 `page_view`。

业务事件映射在 `resolveEvent`：

| 调用名 | eventType | name | moduleId | 立即发送 |
|---|---|---|---|---|
| `page_view` | `page_view` | `page_view` | — | 否 |
| `lookup_start` | `start` | `lookup` | `lookup` | 是 |
| `lookup_success` | `success` | `lookup` | `lookup` | 否 |
| `lookup_error` | `error` | `lookup` | `lookup` | 否 |
| `result_view` | `show` | `result` | `result` | 否 |
| `navigate` | `click` | `navigate` | `content` | 否 |
| `remove_profile` | `click` | `remove_profile` | `result` | 是 |
| `job_click` | `click` | `job` | `opportunities` | 是 |
| `share` | `click` | `share` | `share` | 是 |
| `card_download` | `click` | `card_download` | `share` | 是 |
| `email_request` | 由 `status` 决定 | 由 `source` 决定 | 见下 | 仅 submit |
| `unsubscribe` | 由 `status` 决定 | `unsubscribe` | `unsubscribe` | 仅 submit |

`email_request` 的 `source`：`ranking_update` → 模块 `improve`，`job_shortlist` → `opportunities`。`status=saved` 变成 `success`，`error` 变成 `error`，其余是 `submit`。

导航、页脚及不需要业务结果回调的按钮用声明式属性，SDK 在捕获阶段监听点击：

```html
data-track="logo" data-track-location="nav"
data-track="nav_link" data-track-location="recruiters-view-nav" data-track-label="check-ranking"
data-track="outbound" data-track-location="footer" data-track-label="terms"
data-track="contact_email" data-track-location="footer"
data-track="lookup_submit" data-track-location="entry"
data-track="email_submit_click" data-track-source="ranking_update"
```

`data-track-*` 变成 `properties` 的下划线键。`data-tracking` 这类名字不会被当成属性。声明式点击包括按钮点击尝试，业务 `trackCampaign` 则记录通过校验后的提交、接口结果和 React 内部页面切换。两者共用 SDK，但独立计数。声明式属性绕过 `analytics.ts` 的业务白名单，当前仅使用静态分类值和序号；不要在属性里放姓名、邮箱、URL 或错误原文。

页面识别在 SDK 内完成，不能把原始 URL 当成事件维度：

| 浏览器路径 | 场景 / `pageId` | 上报的 `path` |
|---|---|---|
| `/recruiters-view/` | `recruiters-view` / `recruiters-view` | `/recruiters-view/` |
| `/recruiters-view/?task_id=...`、`?taskId=...`、`?u=...` | `result` / `result` | `/recruiters-view/` |
| `/share/:taskId` | `result` / `result` | `/share/:taskId` |
| `/recruiters-view/result`、`/recruiters-view/improve`、`/recruiters-view/opportunities` | 对应页面 ID | 不带查询参数的路由路径 |
| `/unsubscribe` | `unsubscribe` / `unsubscribe` | `/unsubscribe` |
| 404、带标记分享链接的直访 | 无业务事件 | — |

结果页成功生成后，React 用 History API 把地址更新为 `/share/:taskId?from=share`，页面保持挂载，不会因此再记首页 PV。直接访问带 `from=share` 的地址由服务端返回 OG 或跳首页；真人到达首页后正常记一条 `recruiters-view` PV。

## 3. 单条事件

```json
{
  "eventId": "go-rank.recruiters-view.lookup-start",
  "businessId": "go-rank",
  "pageId": "recruiters-view",
  "positionId": "page",
  "moduleId": "lookup",
  "eventType": "start",
  "sessionId": "s_<时间>_<随机>",
  "timestamp": 1785997792000,
  "properties": {
    "path": "/recruiters-view/",
    "campaign": "rank",
    "scene": "recruiters-view",
    "event_name": "go-rank.recruiters-view.lookup-start",
    "is_logged_in": "false",
    "visitor_id": "v_...",
    "source": "input",
    "mode": "live",
    "utm_source": "direct"
  }
}
```

`eventId` 与 `properties.event_name` 均由 `businessId.pageId.事件名` 拼出，`positionId=page` 单独上报。原 `name` 与 `eventType` 组成末段，同名时不重复，例如 `page_view` → `go-rank.recruiters-view.page-view`、`lookup.success` → `go-rank.recruiters-view.lookup-success`。内部入口场景仍叫 `root`，但上报的页面名为 `recruiters-view`。调用方传入的 `eventId`、`pageId`、`userId`、`sessionId` 会被丢掉，身份以 SDK 生成的为准。已登录时请求头带 `Authorization: Bearer <metix_auth_at>`，客户端不传 `userId`。示例中的 `path` 是规范化路径，不包含 LinkedIn URL、任务 ID、退订 token 或查询参数。

限制与官网 SDK 相同：事件名 128、属性键 64、属性值 255、单事件最多 24 个属性、队列最多 100 条。

## 4. 采集接口

| 方法 | 路径 | 请求体 | 用途 |
|---|---|---|---|
| POST | `/api/track/collect/batch` | `{ "batchTrackEventList": [Event] }` | 有访问令牌时批量 |
| POST | `/api/track/collect` | `Event` | 有访问令牌时 `trackOnce` |
| POST | `/api/track/anonymous/collect` | `Event` | 无访问令牌时逐条；令牌被拒绝时回退 |

请求头 `Content-Type: application/json`，`credentials: same-origin`，`referrerPolicy: no-referrer`，避免分享路径里的 taskId 出现在 Referer。

发送时机与官网 TrackerProvider 一致：

- 队列达到 5 条
- 每 30 秒
- 页面变为 hidden，或 `beforeunload`，用 `keepalive`
- 上表标了「立即发送」的转化动作

失败不重试、不回灌；仅当认证接口返回 HTTP 401/403 时改用匿名接口发送一次。并发 flush 时，强制发送会把之后入队的事件另发出去。采样率默认 1，按会话决定一次，写在 `sessionStorage` 的 `metix_track_sample`。这是一条尽力而为的观测链路，不能拿发送动作代替采集端入库确认。

## 5. 代理

开发：`astro.config.mjs` 用 `NEXT_PUBLIC_API_BASE` 把 `/api/track/` 转到对应 API origin 的 `/hire/api/track/`。

测试和生产部署：`nginx/40-campaign-upstreams.sh` 写 `location ^~ /api/track/`，把前缀改成 `/hire/api/track/`，与 `openjobs-recruiter-ui` 的采集路径一致。上游必须是 `http(s)://host[:port]`，不能带账号或路径。未配置 `NEXT_PUBLIC_API_BASE` 时该 location 返回 503 `{"msg":"Service upstream is not configured"}`。

测试环境设置 `NEXT_PUBLIC_API_BASE=https://www-dev.metix.ai`，生产环境设置 `NEXT_PUBLIC_API_BASE=https://www.metix.ai`，并在部署时重启代理。代码修复后仍需部署到两个环境；前端发出请求或 HTTP 200 都不等于采集平台已经入库。

## 6. 标识从哪来

| 字段 | 存储 | 说明 |
|---|---|---|
| `sessionId` | `sessionStorage` `metix_track_session` | 前缀 `s_`，标签页会话内稳定 |
| `visitor_id` | `localStorage` `metix_track_visitor` | 前缀 `v_`，跨会话保留 |
| 归因 | cookie `metix_attribution` | 版本 1，14 天。键含 utm_*、li_campaign_id、gclid、gbraid、wbraid、gad_source、gad_campaignid、gclsrc、fbclid、msclkid |
| 登录 | cookie `metix_auth_at` / `metix_auth_rt` / `metix_auth_user` | 有 refresh token 且 user cookie 含 `userUuid` 时 `is_logged_in=true` |

页面 id 由当前场景决定，不靠原始 pathname 里的 handle。`page_view` 若场景没变则丢弃。

## 7. 隐私

- `analytics.ts` 的业务事件白名单之外的键全部丢掉。字符串不符合分类值格式也丢掉；声明式 `data-track-*` 另由 SDK 读取，新增字段需人工保持为非个人信息的分类值。
- 分享 URL、外链 target、referrer 只保留本站规范路径或外部 origin；`/share/{taskId}` 只记录 `/share/:taskId`。
- 归因参数由独立脚本保存并由 SDK 带入事件，不经过业务属性白名单；投放链接需保证 UTM / 点击标识不含个人信息。
- 页面标题固定成 `Metix Rank — <scene>`，不用文档标题。
- 异常全部吞掉。埋点失败不能影响查询、邮件和退订。

## 8. 文件

| 文件 | 作用 |
|---|---|
| `src/scripts/metix-track.js` | SDK、枚举、匿名逐条与认证批量上报 |
| `src/scripts/metix-attribution.js` | 归因 cookie |
| `src/recruiters-view/analytics.ts` | 业务事件映射和属性过滤 |
| `src/layouts/BaseLayout.astro` | 脚本加载顺序 |
| `astro.config.mjs` | 开发代理 |
| `nginx/40-campaign-upstreams.sh` | 生产代理 |

清单见 `docs/tracking-events.md`。部署后需分别核对 dev 和 prod 的请求响应、采集端查询结果，以及 `go-rank.recruiters-view.*` 等事件是否映射到预期报表。
