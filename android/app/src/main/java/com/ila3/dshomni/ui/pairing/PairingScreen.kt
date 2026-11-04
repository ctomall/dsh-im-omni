package com.ila3.dshomni.ui.pairing

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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowForward
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Lan
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ila3.dshomni.data.model.Connection
import com.ila3.dshomni.data.model.EntryKind
import com.ila3.dshomni.data.remote.PairingTarget
import com.ila3.dshomni.ui.UiState
import com.ila3.dshomni.ui.common.Banner
import com.ila3.dshomni.ui.common.Pill
import com.ila3.dshomni.ui.theme.BrandBlue
import com.ila3.dshomni.ui.theme.BrandTeal
import com.ila3.dshomni.util.Times

/**
 * Onboarding and reconnection: pick a saved server or pair a new one.
 *
 * One pairing code covers both network entries; the user chooses which address
 * the phone should use, and the app stores each entry separately so switching
 * between home Wi-Fi and mobile data never needs a new code.
 */
@Composable
fun PairingScreen(
    state: UiState,
    onPair: (PairingTarget, String) -> Unit,
    onConnect: (Connection) -> Unit,
    onForget: (Connection) -> Unit,
    onScan: () -> Unit,
    initialLink: PairingTarget?,
    onNoticeShown: () -> Unit,
    onBack: (() -> Unit)? = null,
) {
    var address by remember { mutableStateOf(initialLink?.baseUrl.orEmpty()) }
    var code by remember { mutableStateOf(initialLink?.code.orEmpty()) }
    var label by remember { mutableStateOf("") }
    var workaround by remember { mutableStateOf(false) }

    // The screen is already composed when the scanner returns, so a plain
    // `remember` initializer would never apply the scanned target. A dead code
    // (401) is cleared here too, because retrying with it can only fail again.
    LaunchedEffect(initialLink) {
        if (initialLink != null) {
            address = initialLink.baseUrl
            code = initialLink.code
        }
    }
    LaunchedEffect(state.errorCode) {
        if (state.errorCode == "pair-code-invalid") code = ""
    }

    val scroll = rememberScrollState()
    val parsed = remember(address, code) { PairingTarget.parse(buildString { append(address); if (code.isNotBlank()) append(if (address.contains('?')) "&" else "?").append("code=").append(code) }) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .systemBarsPadding()
            .imePadding()
            .verticalScroll(scroll)
            .padding(horizontal = 20.dp),
    ) {
        if (onBack != null) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onBack) { Text("返回收件箱") }
            }
        }
        Spacer(Modifier.height(if (onBack == null) 28.dp else 8.dp))
        Hero()
        Spacer(Modifier.height(22.dp))

        state.error?.let {
            Banner(it, error = true, onDismiss = onNoticeShown)
            Spacer(Modifier.height(14.dp))
        }

        if (state.connections.isNotEmpty()) {
            Text("已保存的服务器", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            state.connections.forEach { connection ->
                SavedConnection(
                    connection = connection,
                    current = state.connection?.id == connection.id,
                    enabled = !state.loading,
                    onConnect = { onConnect(connection) },
                    onForget = { onForget(connection) },
                )
                Spacer(Modifier.height(8.dp))
            }
            Spacer(Modifier.height(18.dp))
        }

        Text("配对新的服务器", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        Surface(
            color = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(20.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(16.dp)) {
                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it; workaround = false },
                    label = { Text("服务器地址") },
                    placeholder = { Text("https://harness.ila3.net/phone/") },
                    singleLine = false,
                    maxLines = 3,
                    leadingIcon = { Icon(Icons.Rounded.Link, contentDescription = null) },
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = { value -> code = value.filter { it.isLetterOrDigit() || it == '-' }.take(12) },
                    label = { Text("配对码") },
                    placeholder = { Text("6 位一次性配对码") },
                    singleLine = true,
                    leadingIcon = { Icon(Icons.Rounded.Lock, contentDescription = null) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = label,
                    onValueChange = { label = it.take(32) },
                    label = { Text("备注（可选）") },
                    placeholder = { Text("家里 Wi-Fi / 公司内网 / 公网") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    parsed?.let {
                        Pill(
                            text = when (it.guess) {
                                EntryKind.LAN -> "内网入口 · HTTP"
                                EntryKind.PUBLIC -> "外网入口 · HTTPS"
                                EntryKind.CUSTOM -> "自定义入口"
                            },
                            color = if (it.guess == EntryKind.LAN) BrandTeal else BrandBlue,
                            background = (if (it.guess == EntryKind.LAN) BrandTeal else BrandBlue).copy(alpha = 0.12f),
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    if (parsed == null && address.isNotBlank()) {
                        Text("地址格式无效", color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                    }
                }

                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedFieldButton(
                        text = "扫码",
                        icon = Icons.Rounded.QrCodeScanner,
                        modifier = Modifier.weight(1f),
                        onClick = onScan,
                    )
                    Button(
                        onClick = { parsed?.let { onPair(it, label) } },
                        enabled = parsed != null && code.isNotBlank() && !state.loading,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.weight(1.4f),
                    ) {
                        if (state.loading) {
                            CircularProgressIndicator(
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                        }
                        Text(if (state.loading) "配对中…" else "配对并连接")
                    }
                }
                if (state.error != null && state.errorCode?.startsWith("pair") == true) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        state.error,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "配对码 5 分钟内有效、只能使用一次；过期请在电脑端重新生成。",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Spacer(Modifier.height(18.dp))
        HowToCard(expanded = workaround, onToggle = { workaround = !workaround })
        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun Hero() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(58.dp)
                .background(Brush.linearGradient(listOf(BrandBlue, BrandTeal)), RoundedCornerShape(18.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Rounded.CloudOff,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(28.dp),
            )
        }
        Spacer(Modifier.width(14.dp))
        Column {
            Text("全渠道 IM", style = MaterialTheme.typography.headlineSmall)
            Text(
                "手机上的统一收件箱 · 连接你的 DSH 主机",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SavedConnection(
    connection: Connection,
    current: Boolean,
    enabled: Boolean,
    onConnect: () -> Unit,
    onForget: () -> Unit,
) {
    Surface(
        color = if (current) BrandBlue.copy(alpha = 0.10f) else MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            if (current) BrandBlue.copy(alpha = 0.4f) else MaterialTheme.colorScheme.outlineVariant,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onConnect),
    ) {
        Row(
            modifier = Modifier.padding(start = 14.dp, end = 4.dp, top = 12.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (connection.isHttps) Icons.Rounded.Public else Icons.Rounded.Lan,
                    contentDescription = null,
                    tint = if (connection.isHttps) BrandBlue else BrandTeal,
                    modifier = Modifier.size(18.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        connection.label,
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (current) {
                        Spacer(Modifier.width(6.dp))
                        Pill("当前", color = BrandBlue, background = BrandBlue.copy(alpha = 0.14f))
                    }
                }
                Text(
                    connection.baseUrl,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (connection.lastSyncAt > 0) {
                    Text(
                        "上次连接 ${Times.relative(connection.lastSyncAt)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            IconButton(onClick = onForget, enabled = enabled) {
                Icon(
                    Icons.Rounded.DeleteOutline,
                    contentDescription = "删除这台服务器",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(19.dp),
                )
            }
            Icon(Icons.Rounded.ArrowForward, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(8.dp))
        }
    }
}

@Composable
private fun HowToCard(expanded: Boolean, onToggle: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggle),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("怎么拿到配对码？", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                Text(if (expanded) "收起" else "展开", style = MaterialTheme.typography.labelSmall, color = BrandBlue)
            }
            if (expanded) {
                Spacer(Modifier.height(10.dp))
                Step(1, "在电脑上的 DSH 会话里让 Agent 执行 phone_remote 工具的 pair 操作，会生成配对码和二维码。")
                Step(2, "内网：手机与电脑同一 Wi-Fi，填 http://电脑局域网IP:8080/phone/。")
                Step(3, "外网：填你的 HTTPS 入口，例如 https://harness.ila3.net/phone/。")
                Step(4, "也可以直接扫二维码，地址和配对码会自动填好。配对码 5 分钟内有效。")
                Spacer(Modifier.height(6.dp))
                Text(
                    "内网与外网是两个独立入口，首次使用需要各自配对一次；之后在已保存列表里一键切换。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun Step(index: Int, text: String) {
    Row(Modifier.padding(vertical = 3.dp)) {
        Box(
            modifier = Modifier
                .size(18.dp)
                .background(BrandBlue.copy(alpha = 0.16f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text("$index", fontSize = 10.sp, color = BrandBlue, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.width(9.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun OutlinedFieldButton(
    text: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
        modifier = modifier,
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(17.dp))
        Spacer(Modifier.width(6.dp))
        Text(text)
    }
}
