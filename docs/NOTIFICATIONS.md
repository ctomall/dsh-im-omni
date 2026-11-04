# 新消息通知：企业微信群机器人

> 内部部署没有厂商推送通道，Host 在收到入站消息后向**企业微信群机器人**发一张卡片。
> 代码：`lib/notify.js`；配置命令：`settings.update`；自测命令：`notify.test`。

## 1. 为什么是企业微信

| 方案 | 可行性 | 说明 |
| --- | --- | --- |
| 企业微信群机器人 | ✅ 推荐 | 零资质，5 分钟配好；企业微信自己保活 |
| 企业微信自建应用消息 | ✅ 进阶 | 可按人推送、可带按钮；需要企微管理员建应用（corpId/agentId/secret） |
| 微信个人号 / 公众号模板消息 | ❌ | 个人号无官方通知接口；公众号需认证 + 用户关注 + 48 小时会话限制，做不到"每条消息都提醒" |
| 厂商推送（FCM/华为/小米） | 需要上架与资质 | 内部自用不划算 |

## 2. 配置步骤

1. 企业微信 → 群聊 → 群设置 → **群机器人** → 添加 → 复制 Webhook：
   `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx`
2. 在控制台（或直接调命令）写入配置：

```bash
curl -sS -X POST https://<host>/api/im-omni.command \
  -H 'content-type: application/json' \
  --cookie '<owner cookie>' \
  -d '{"command":"settings.update","payload":{"notify":{
        "enabled": true,
        "wecomWebhook": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx",
        "quietStart": "22:00",
        "quietEnd": "08:00",
        "privatePreview": false,
        "linkTemplate": "dshomni://chat/{conversationId}"
      }}}'
```

3. 发测试：

```bash
curl -sS -X POST https://<host>/api/im-omni.command \
  -H 'content-type: application/json' --cookie '<owner cookie>' \
  -d '{"command":"notify.test","payload":{}}'
# {"ok":true,"result":{"receipt":{"sent":true}}}
```

## 3. 卡片长什么样

```
林小满 · 售后 WhatsApp
如果退款的话大概多久到账？
> 未读 2 · 跟进中
[打开会话](dshomni://chat/cnv_lin)
```

- `privatePreview=true` 时正文改成「你有一条新消息」（适合客户隐私敏感场景）
- `linkTemplate` 为空则不附链接；支持 `{conversationId}` 占位
- 附件消息显示 `[附件] 文件名`

## 4. 行为规则

| 规则 | 说明 |
| --- | --- |
| 只通知入站 | 自己的回复不触发 |
| 去重 | 同一个 webhook 事件只发一次（`receipt.duplicate` 时跳过） |
| 安静时段 | 支持跨零点（`22:00`–`08:00`） |
| 超时与重试 | 8s 超时；HTTP 失败重试 1 次；业务错误（errcode≠0）不重试 |
| 不影响主链路 | webhook 已 ack 之后异步发送，失败只记日志 |
| 频率 | 企业微信机器人限 20 条/分钟，超出会被限流；消息量大时应改用自建应用消息或合并卡片 |

## 5. 后续

- 控制台「设置 → 通知」卡片（webhook、启用、安静时段、测试按钮）
- 合并策略：同一会话 60 秒内多条只发一张（避免刷屏）
- 按人推送：企业微信自建应用消息（需要 corpId/agentId/secret）
- App 内通知：前台本地通知 + 点击跳转会话
