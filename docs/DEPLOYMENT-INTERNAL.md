# 内部分公司部署：不上架、自用

> 状态：规划稿。目标形态是「公司内部几十人用」，不上应用商店、不接厂商推送。
> 本文据此收窄 ARCHITECTURE 里的推送、分发、安全与运维方案。

## 1. 形态收窄带来的简化

| 原方案（上架产品） | 内部自用 |
| --- | --- |
| FCM / 华为/小米/OPPO/vivo 厂商推送 | **用企业微信/钉钉机器人推送**（见 §3），不接厂商通道 |
| 应用商店上架、审核、隐私政策页 | **内网分发 APK**，应用内一键升级（已有） |
| 多租户、账号体系、计费 | 单工作区、设备配对码即登录 |
| 高可用集群、Postgres | 单机 + SQLite，公司内服务器，定期备份 |
| 公网暴露 + CDN | 优先内网/公司 VPN；公网隧道只作为出差兜底 |

## 2. 网络形态：LAN 优先，公网兜底

这是当前最大的可靠性问题来源（`POST /phone/pair` 经 Cloudflare 会挂住）。

```
首选：手机与 Host 同一内网
  二维码 → http://192.168.x.x:8443/phone/?code=XXXX
  （直连插件端口，无 TLS、无 CDN，延迟 <10ms）

兜底：出差 / 外网
  二维码 → https://dsh.example.com/phone/?code=XXXX
  （Cloudflare + nginx，注意 POST 偶发卡死，见 §6）
```

**实践**：Host 同时生成两个入口的二维码，App 端按"内网可达优先"自动选择；配对码一次性、5 分钟有效不变。

## 3. 通知：借用企业微信/钉钉，不自建推送

手机被系统杀掉后，自建长连接不可靠。内部场景最省事的方案：

```
Host 收到 inbound
   ├─ 写库、更新会话
   ├─ 若会话未读且不在当前客户端前台
   └─ 调企业微信群机器人 webhook
        POST https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...
        { "msgtype":"news", "news":{"articles":[{
            "title":"林小满：订单破损申请退款",
            "description":"售后 WhatsApp · 2 分钟前",
            "url":"https://dsh.example.com/im-omni#cnv_lin"   ← 点开可跳到会话
        }]}}
```

- 优点：零推送资质、通知稳定（企业微信自己保活）、可多端、可群内协作
- 缺点：不能"通知内直接回复"，只能点进 App（内部分可接受）
- 备选：钉钉群机器人（同样的 webhook 模型）、飞书自定义机器人

**App 内的前台通知**仍保留（本地通知），用于 App 在前台/最近任务时的提醒。

## 4. 分发与升级

- **分发**：Host 上放 `GET /api/im-omni.app.apk` + 版本清单（已实现），发一条内网链接给同事即可
- **升级**：应用内一键升级（已实现，需 `versionCode` 单调 + 同签名）——现有配置已满足
- **灰度**：先给自己装，稳定两天再发群里
- **回滚**：`dist/` 里保留上一版 APK，清单指回旧版即可

## 5. 安全基线（内部也要有）

| 项 | 做法 |
| --- | --- |
| 传输 | 内网 HTTP 可接受；公网必须 HTTPS（已有 nginx + Cloudflare） |
| 设备 | 配对码 5 分钟、一次性；设备可在控制台撤销（`/v1/devices`） |
| 数据 | 客户 PII 落库，Host 机器限制登录用户；每日备份 SQLite |
| App | 设备 token 存 EncryptedSharedPreferences；可选应用锁（离开 5 分钟需指纹） |
| 人员 | 离职 = 撤销设备 + 轮换渠道密钥 |

## 6. 已知问题与对策

| 问题 | 对策 |
| --- | --- |
| `POST /phone/pair` 经 Cloudflare 偶发挂起 | ① LAN 优先配对；② 网关响应加 `Content-Length`（现在是 chunked）；③ App 端配对加 8s 超时 + 重试提示 |
| 重启后停在配对页 | 已保存主机直接进会话（M0 修） |
| 断网即空列表 | Room 本地缓存（M0） |
| 消息量大后 JSON 存储变慢 | 换 SQLite（`better-sqlite3`），消息表按 `conversationId, createdAt` 建索引 |

## 7. 运维

- **部署**：`systemd` 单元（已有 `dsh-web.service`），改代码后 `systemctl restart dsh-web`
- **备份**：每日 `sqlite3 .backup` 或 JSON 快照到另一台机器，保留 7 天
- **监控**：`GET /api/im-omni.health`（新增）返回版本、队列积压、最近错误；配合 `journalctl`
- **日志**：结构化 JSON，按天轮转，保留 14 天

## 8. 里程碑调整（相比 ARCHITECTURE 的 M0–M3）

| 阶段 | 内容 | 说明 |
| --- | --- | --- |
| **M0**（1 周） | LAN 优先配对 + 配对超时重试；重启回会话；Room + `/v1/sync` 增量；outbox 幂等发送 | 解决"登录挂、断网空、发重"三个 demo 感来源 |
| **M1**（2~3 天） | 企业微信机器人通知（Host 侧，不动 App）+ App 前台通知 | 没有推送也能被叫住 |
| **M2**（1~2 周） | 搜索（本地 FTS）、媒体库、转发、多选、置顶/免打扰；控制台补团队/分配 | 手机当日常主力 |
| **M3**（按需） | 客户 CSAT、质检、报表；多工作区 | 有需要再做 |

## 9. 分工建议

| 角色 | 负责 |
| --- | --- |
| Host/后端 | v1 API、SQLite、企业微信机器人、备份、撤销设备 |
| Android | Room/同步/outbox、通知、搜索与媒体、列表性能 |
| 运营/客服主管 | 账号接入、分配规则、快捷回复与标签内容 |
