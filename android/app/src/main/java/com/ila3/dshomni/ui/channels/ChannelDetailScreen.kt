package com.ila3.dshomni.ui.channels

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ila3.dshomni.data.model.Channel
import com.ila3.dshomni.ui.UiState
import com.ila3.dshomni.ui.common.Banner
import com.ila3.dshomni.ui.common.FieldValue
import com.ila3.dshomni.ui.common.HealthDot
import com.ila3.dshomni.ui.common.Pill
import com.ila3.dshomni.ui.common.PlatformBadge
import com.ila3.dshomni.ui.common.SectionCard
import com.ila3.dshomni.ui.theme.BrandBlue
import com.ila3.dshomni.ui.theme.HealthBad
import com.ila3.dshomni.ui.theme.HealthOk
import com.ila3.dshomni.util.Labels
import com.ila3.dshomni.util.decodeDataUrlImage
import kotlinx.coroutines.delay
import com.ila3.dshomni.ui.theme.Radius
import com.ila3.dshomni.ui.theme.Spacing

/**
 * One channel: probe it, bind a personal account by QR, reveal or rotate its
 * secret, pause it, or delete it.
 */
@Composable
fun ChannelDetailScreen(
    state: UiState,
    channelId: String,
    onBack: () -> Unit,
    onTest: () -> Unit,
    onQrLogin: () -> Unit,
    onQrPoll: () -> Unit,
    onReveal: ((Map<String, String>) -> Unit) -> Unit,
    onRotate: ((Map<String, String>) -> Unit) -> Unit,
    onToggleStatus: (String) -> Unit,
    onSave: (String, String) -> Unit,
    onDelete: () -> Unit,
    onClearQr: () -> Unit,
    onDismissNotice: () -> Unit,
) {
    val channel = state.snapshot?.channel(channelId)
    if (channel == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("渠道不存在", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    val clipboard = LocalClipboardManager.current
    var secrets by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var confirmDelete by remember { mutableStateOf(false) }
    var editOpen by remember { mutableStateOf(false) }
    var name by remember(channel.id) { mutableStateOf(channel.name) }
    var description by remember(channel.id) { mutableStateOf(channel.description) }
    val qrImage: ImageBitmap? = remember(state.qrImage, channel.id) {
        if (state.qrChannelId == channel.id) state.qrImage?.let { decodeDataUrlImage(it) } else null
    }
    val busy = state.busyAction?.startsWith("channel.") == true

    LaunchedEffect(channel.id) { onClearQr() }
    LaunchedEffect(channel.id, channel.qrStatus) {
        while (channel.supportsQr && channel.qrStatus != "connected") {
            delay(3_000)
            onQrPoll()
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding(),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(start = Spacing.xxs, end = 6.dp, top = 6.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, contentDescription = "返回") }
            Text("渠道详情", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            IconButton(onClick = { editOpen = true }) {
                Icon(Icons.Rounded.Edit, contentDescription = "编辑", modifier = Modifier.size(18.dp))
            }
            IconButton(
                onClick = { confirmDelete = true },
                enabled = !busy,
            ) {
                Icon(
                    Icons.Rounded.DeleteOutline,
                    contentDescription = "删除渠道",
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(19.dp),
                )
            }
        }

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.md),
        ) {
            state.error?.let {
                Banner(it, error = true, onDismiss = onDismissNotice)
                Spacer(Modifier.height(10.dp))
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                PlatformBadge(channel.badge, channel.hue, size = 52.dp)
                Spacer(Modifier.width(13.dp))
                Column(Modifier.weight(1f)) {
                    Text(channel.name, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        Labels.channelType(channel.type),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(5.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        HealthDot(channel.health, size = 7.dp)
                        Spacer(Modifier.width(5.dp))
                        Text(
                            Labels.health(channel.health),
                            style = MaterialTheme.typography.labelSmall,
                            color = when (channel.health) {
                                "connected" -> HealthOk
                                "error" -> HealthBad
                                else -> MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                        Spacer(Modifier.width(8.dp))
                        Pill(Labels.status(channel.status))
                    }
                }
            }

            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionTile(
                    icon = Icons.Rounded.Wifi,
                    label = if (busy) "测试中…" else "测试连接",
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                    onClick = onTest,
                )
                if (channel.supportsQr) {
                    ActionTile(
                        icon = Icons.Rounded.QrCode2,
                        label = "扫码登录",
                        modifier = Modifier.weight(1f),
                        enabled = !busy,
                        onClick = onQrLogin,
                    )
                }
                ActionTile(
                    icon = Icons.Rounded.Key,
                    label = "查看密钥",
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                    onClick = { onReveal { shown -> secrets = shown } },
                )
            }

            if (channel.supportsQr) {
                Spacer(Modifier.height(14.dp))
                SectionCard(title = "扫码绑定") {
                    Column(Modifier.padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        val current = state.qrChannelId == channel.id
                        when {
                            channel.qrStatus == "connected" -> {
                                Text("已登录 ${channel.account}", style = MaterialTheme.typography.titleSmall, color = HealthOk)
                                Spacer(Modifier.height(4.dp))
                                Text("个人号已绑定，消息会进入收件箱。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            qrImage != null && current -> {
                                Image(
                                    bitmap = qrImage,
                                    contentDescription = "登录二维码",
                                    modifier = Modifier
                                        .size(228.dp)
                                        .background(Color.White, RoundedCornerShape(Radius.sm))
                                        .padding(Spacing.xs),
                                )
                                Spacer(Modifier.height(10.dp))
                                Text(
                                    state.qrDetail.ifBlank { Labels.qrStatus(channel.qrStatus) },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Spacer(Modifier.height(8.dp))
                                OutlinedButton(onClick = onQrLogin, enabled = !busy) {
                                    Icon(Icons.Rounded.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("刷新二维码")
                                }
                            }
                            else -> {
                                Text(
                                    "用手机上的 WhatsApp / 微信扫一扫完成登录",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Spacer(Modifier.height(10.dp))
                                Button(onClick = onQrLogin, enabled = !busy, shape = RoundedCornerShape(Radius.md)) {
                                    if (busy) {
                                        CircularProgressIndicator(
                                            strokeWidth = 2.dp,
                                            color = MaterialTheme.colorScheme.onPrimary,
                                            modifier = Modifier.size(15.dp),
                                        )
                                        Spacer(Modifier.width(8.dp))
                                    }
                                    Text("生成二维码")
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(14.dp))
            SectionCard(title = "回调地址") {
                Column(Modifier.padding(14.dp)) {
                    Text(
                        channel.webhookPath.ifBlank { "—" },
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedButton(
                            onClick = {
                                clipboard.setText(AnnotatedString(channel.webhookPath))
                            },
                            enabled = channel.webhookPath.isNotBlank(),
                        ) {
                            Icon(Icons.Rounded.ContentCopy, contentDescription = null, modifier = Modifier.size(15.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("复制路径")
                        }
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "需要公网 HTTPS 的渠道，把这个路径拼到 DSH 域名后面。",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            Spacer(Modifier.height(14.dp))
            SectionCard(title = "运行状态") {
                Column {
                    FieldValue("账号", channel.account.ifBlank { "未提供" })
                    FieldValue("收 / 发", "${channel.inbound} / ${channel.outbound}")
                    FieldValue("健康", Labels.health(channel.health))
                    if (channel.lastError.isNotBlank()) {
                        FieldValue("最近错误", channel.lastError)
                    }
                }
            }

            Spacer(Modifier.height(14.dp))
            SectionCard(title = "凭据") {
                Column {
                    if (channel.config.isEmpty()) {
                        FieldValue("配置", "无")
                    }
                    channel.config.entries.take(8).forEach { (key, value) ->
                        StackedValue(
                            label = key,
                            value = when {
                                secrets[key] != null -> secrets[key].orEmpty()
                                channel.configuredSecrets[key] == true -> "已配置（••••）"
                                value.isBlank() -> "未配置"
                                else -> value
                            },
                            mono = secrets[key] != null,
                        )
                    }
                    Row(
                        Modifier.padding(horizontal = Spacing.md, vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        OutlinedButton(
                            onClick = { onRotate { rotated -> secrets = rotated } },
                            enabled = !busy,
                        ) { Text("轮换桥接密钥") }
                    }
                }
            }

            Spacer(Modifier.height(14.dp))
            SectionCard {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.md, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("启用这个渠道", style = MaterialTheme.typography.titleSmall)
                        Text(
                            "暂停后不再接收与投递消息，配置与历史记录保留。",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Switch(
                        checked = !channel.isPaused,
                        enabled = !busy,
                        onCheckedChange = { onToggleStatus(if (it) "active" else "paused") },
                    )
                }
            }
            Spacer(Modifier.height(30.dp))
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("删除渠道？") },
            text = { Text("删除后这个渠道的配置会从主机移除。已有会话的渠道无法删除，请先处理会话。") },
            confirmButton = {
                TextButton(onClick = { confirmDelete = false; onDelete() }) {
                    Text("删除", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("取消") } },
        )
    }

    if (editOpen) {
        AlertDialog(
            onDismissRequest = { editOpen = false },
            title = { Text("编辑渠道") },
            text = {
                Column {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it.take(40) },
                        label = { Text("名称") },
                        singleLine = true,
                        shape = RoundedCornerShape(Radius.sm),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = description,
                        onValueChange = { description = it.take(140) },
                        label = { Text("备注") },
                        singleLine = true,
                        shape = RoundedCornerShape(Radius.sm),
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        editOpen = false
                        onSave(name.trim().ifBlank { channel.name }, description.trim())
                    },
                    enabled = name.isNotBlank(),
                ) { Text("保存") }
            },
            dismissButton = { TextButton(onClick = { editOpen = false }) { Text("取消") } },
        )
    }
}

/** Two-line row for long credential keys, which never fit one label column. */
@Composable
private fun StackedValue(label: String, value: String, mono: Boolean = false) {
    Column(Modifier.padding(horizontal = Spacing.md, vertical = 9.dp)) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            fontFamily = if (mono) FontFamily.Monospace else null,
        )
    }
}

@Composable
private fun ActionTile(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(Radius.md),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier.clickable(enabled = enabled, onClick = onClick),
    ) {
        Column(
            Modifier.padding(vertical = Spacing.sm),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(icon, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(19.dp))
            Spacer(Modifier.height(5.dp))
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}
