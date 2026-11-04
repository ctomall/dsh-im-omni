package com.ila3.dshomni.ui.channels

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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Hub
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ila3.dshomni.data.model.Channel
import com.ila3.dshomni.data.model.Snapshot
import com.ila3.dshomni.ui.UiState
import com.ila3.dshomni.ui.common.EmptyState
import com.ila3.dshomni.ui.common.HealthDot
import com.ila3.dshomni.ui.common.Pill
import com.ila3.dshomni.ui.common.PlatformBadge
import com.ila3.dshomni.ui.theme.BrandBlue
import com.ila3.dshomni.util.Labels
import com.ila3.dshomni.ui.theme.Radius
import com.ila3.dshomni.ui.theme.Spacing

/** Channel list with health, traffic, and a path into binding a new one. */
@Composable
fun ChannelsScreen(
    state: UiState,
    onOpen: (Channel) -> Unit,
    onAdd: () -> Unit,
) {
    val snapshot = state.snapshot
    val channels = snapshot?.channels.orEmpty().sortedBy { it.name }
    val connected = channels.count { it.isConnected }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(start = 18.dp, end = 12.dp, top = 14.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("渠道", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "${channels.size} 个渠道 · $connected 已连接",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Button(onClick = onAdd, shape = RoundedCornerShape(Radius.md)) {
                Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(6.dp))
                Text("添加")
            }
        }

        when {
            snapshot == null -> EmptyState("尚未连接服务器", "配对成功后这里会列出全部渠道。", Icons.Rounded.Hub)
            channels.isEmpty() -> Column(
                Modifier
                    .fillMaxSize()
                    .padding(horizontal = Spacing.lg),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                EmptyState(
                    title = "还没有绑定渠道",
                    hint = "添加 WhatsApp、Telegram、企业微信等渠道，客户消息就会进入收件箱。",
                    icon = Icons.Rounded.Hub,
                )
                Button(onClick = onAdd, shape = RoundedCornerShape(Radius.md)) {
                    Text("添加第一个渠道")
                }
            }
            else -> LazyColumn(
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.navigationBarsPadding(),
            ) {
                items(channels, key = { it.id }) { channel ->
                    ChannelRow(channel) { onOpen(channel) }
                }
            }
        }
    }
}

@Composable
fun ChannelRow(channel: Channel, onClick: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(Radius.lg),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(Modifier.padding(Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            PlatformBadge(channel.badge, channel.hue, size = 42.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        channel.name,
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    Spacer(Modifier.width(6.dp))
                    if (channel.isPaused) Pill("已暂停") else if (channel.official) {
                        Pill("官方", color = BrandBlue, background = BrandBlue.copy(alpha = 0.12f))
                    }
                }
                Spacer(Modifier.height(2.dp))
                Text(
                    Labels.channelType(channel.type),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(5.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    HealthDot(channel.health, size = 7.dp)
                    Spacer(Modifier.width(5.dp))
                    Text(
                        Labels.health(channel.health),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        "收 ${channel.inbound} · 发 ${channel.outbound}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.outline)
        }
    }
}
