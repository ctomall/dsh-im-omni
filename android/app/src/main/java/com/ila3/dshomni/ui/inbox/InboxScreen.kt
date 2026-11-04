package com.ila3.dshomni.ui.inbox

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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ila3.dshomni.data.model.Conversation
import com.ila3.dshomni.data.model.Snapshot
import com.ila3.dshomni.ui.UiState
import com.ila3.dshomni.ui.common.Avatar
import com.ila3.dshomni.ui.common.Banner
import com.ila3.dshomni.ui.common.EmptyState
import com.ila3.dshomni.ui.common.Pill
import com.ila3.dshomni.ui.common.PlatformBadge
import com.ila3.dshomni.ui.theme.BrandBlue
import com.ila3.dshomni.ui.theme.BrandTeal
import com.ila3.dshomni.util.Labels
import com.ila3.dshomni.util.Times

/** Inbox filters; `all` keeps the Host order. */
private val InboxFilters = listOf("all" to "全部", "unread" to "未读", "open" to "待处理", "pending" to "跟进中", "solved" to "已解决")

/**
 * The screen the user actually lives in: every channel folded into one list.
 */
@Composable
fun InboxScreen(
    state: UiState,
    onOpen: (Conversation) -> Unit,
    onRefresh: () -> Unit,
    onSwitchServer: () -> Unit,
    onDismiss: () -> Unit,
    onMarkAllRead: () -> Unit = {},
) {
    val snapshot = state.snapshot
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("all") }

    val conversations = remember(snapshot, query, filter) {
        snapshot?.conversations.orEmpty()
            .filter { conversation ->
                when (filter) {
                    "unread" -> conversation.unread > 0
                    "all" -> true
                    else -> conversation.status == filter
                }
            }
            .filter { conversation ->
                if (query.isBlank()) return@filter true
                val contact = snapshot?.contact(conversation.contactId)
                val haystack = buildString {
                    append(conversation.subject).append(' ')
                    append(contact?.name.orEmpty()).append(' ')
                    append(contact?.company.orEmpty()).append(' ')
                    append(conversation.lastMessage?.text.orEmpty())
                    // 0.4.0: search the whole thread, not only the newest bubble.
                    // Capped so a long history cannot stall typing.
                    conversation.messages.takeLast(200).forEach { message ->
                        append(' ').append(message.text)
                    }
                }
                haystack.contains(query, ignoreCase = true)
            }
            .sortedByDescending { it.updatedAt }
    }

    Column(Modifier.fillMaxSize()) {
        HeroHeader(
            snapshot = snapshot,
            connectionLabel = state.connection?.label.orEmpty(),
            refreshing = state.refreshing,
            onRefresh = onRefresh,
            onSwitchServer = onSwitchServer,
        )

        Column(Modifier.padding(horizontal = 16.dp)) {
            if (state.unauthorized) {
                Spacer(Modifier.height(10.dp))
                Banner("这台设备的登录已失效，请重新配对。", error = true, onDismiss = onDismiss)
            } else if (state.error != null) {
                Spacer(Modifier.height(10.dp))
                Banner(state.error, error = true, onDismiss = onDismiss)
            }

            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("搜索客户、公司或消息") },
                singleLine = true,
                leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, modifier = Modifier.size(18.dp)) },
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(10.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.horizontalScroll(rememberScrollState()),
            ) {
                InboxFilters.forEach { (key, label) ->
                    FilterChip(
                        selected = filter == key,
                        onClick = { filter = key },
                        label = { Text(label, fontSize = 12.sp) },
                        shape = RoundedCornerShape(999.dp),
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = BrandBlue.copy(alpha = 0.16f),
                            selectedLabelColor = BrandBlue,
                        ),
                    )
                }
            }
            val unreadTotal = snapshot?.conversations?.sumOf { it.unread } ?: 0
            if (unreadTotal > 0) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(
                        onClick = onMarkAllRead,
                        enabled = state.busyAction == null,
                    ) {
                        Text(
                            if (state.busyAction == "conversation.read") "处理中…" else "全部标为已读（$unreadTotal）",
                            fontSize = 12.sp,
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        when {
            snapshot == null && state.loading -> LoadingBlock()
            snapshot == null -> EmptyState(
                title = "还没有连接服务器",
                hint = "先在设置里配对一台 DSH 主机。",
                icon = Icons.Rounded.Inbox,
            )
            conversations.isEmpty() -> EmptyState(
                title = if (query.isNotBlank()) "没有匹配的会话" else "收件箱是空的",
                hint = if (query.isNotBlank()) "换个关键词试试。" else "有新客户消息时会出现在这里。",
                icon = Icons.Rounded.Inbox,
            )
            else -> LazyColumn(
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(conversations, key = { it.id }) { conversation ->
                    ConversationRow(
                        conversation = conversation,
                        snapshot = snapshot,
                        onClick = { onOpen(conversation) },
                    )
                }
            }
        }
    }
}

@Composable
private fun LoadingBlock() {
    Box(Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(strokeWidth = 2.5.dp, modifier = Modifier.size(26.dp))
    }
}

@Composable
private fun HeroHeader(
    snapshot: Snapshot?,
    connectionLabel: String,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onSwitchServer: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.linearGradient(
                    listOf(BrandBlue.copy(alpha = 0.92f), BrandTeal.copy(alpha = 0.85f)),
                ),
            ),
    ) {
        Column(
            Modifier
                .statusBarsPadding()
                .padding(start = 18.dp, end = 10.dp, top = 10.dp, bottom = 16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "收件箱",
                        color = Color.White,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier
                                .size(6.dp)
                                .background(if (snapshot != null) Color(0xFFB7FFE9) else Color(0xFFFFD9A0), CircleShape),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = when {
                                snapshot == null -> "未连接"
                                connectionLabel.isNotBlank() -> connectionLabel
                                else -> "已连接"
                            },
                            color = Color.White.copy(alpha = 0.9f),
                            fontSize = 12.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (snapshot != null) {
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "· ${snapshot.workspace.name}",
                                color = Color.White.copy(alpha = 0.75f),
                                fontSize = 12.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
                if (snapshot != null && snapshot.unreadTotal > 0) {
                    Surface(color = Color.White.copy(alpha = 0.22f), shape = RoundedCornerShape(999.dp)) {
                        Text(
                            "${snapshot.unreadTotal} 未读",
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        )
                    }
                    Spacer(Modifier.width(4.dp))
                }
                IconButton(onClick = onRefresh, enabled = !refreshing) {
                    if (refreshing) {
                        CircularProgressIndicator(
                            strokeWidth = 2.dp,
                            color = Color.White,
                            modifier = Modifier.size(17.dp),
                        )
                    } else {
                        Icon(Icons.Rounded.Refresh, contentDescription = "刷新", tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                }
                IconButton(onClick = onSwitchServer) {
                    Icon(Icons.Rounded.SwapHoriz, contentDescription = "切换服务器", tint = Color.White, modifier = Modifier.size(20.dp))
                }
            }
        }
    }
}

@Composable
private fun ConversationRow(conversation: Conversation, snapshot: Snapshot, onClick: () -> Unit) {
    val contact = snapshot.contact(conversation.contactId)
    val channel = snapshot.channel(conversation.channelId)
    val last = conversation.lastMessage
    val preview = when {
        last == null -> "还没有消息"
        last.isNote -> "内部备注：${last.text}"
        last.inbound -> last.text
        else -> "你：${last.text}"
    }
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
            Avatar(contact?.name ?: "客户", contact?.hue ?: 210)
            Spacer(Modifier.width(11.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        contact?.name ?: "未知客户",
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (conversation.priority == "high" || conversation.priority == "urgent") {
                        Spacer(Modifier.width(6.dp))
                        Box(
                            Modifier
                                .size(6.dp)
                                .background(
                                    if (conversation.priority == "urgent") MaterialTheme.colorScheme.error else Color(0xFFFFB020),
                                    CircleShape,
                                ),
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    Text(
                        Times.relative(conversation.updatedAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(3.dp))
                Text(
                    text = preview,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (conversation.unread > 0) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(7.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (channel != null) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(999.dp))
                                .padding(horizontal = 7.dp, vertical = 2.dp),
                        ) {
                            PlatformBadge(channel.badge, channel.hue, size = 14.dp)
                            Spacer(Modifier.width(5.dp))
                            Text(
                                channel.name,
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                        }
                        Spacer(Modifier.width(6.dp))
                    }
                    if (conversation.status == "pending") {
                        Pill("跟进中", color = Color(0xFFFFB020), background = Color(0xFFFFB020).copy(alpha = 0.12f))
                        Spacer(Modifier.width(6.dp))
                    }
                    if (conversation.tags.isNotEmpty()) {
                        Pill("#${conversation.tags.first()}", modifier = Modifier)
                    }
                    Spacer(Modifier.weight(1f))
                    if (conversation.unread > 0) {
                        Box(
                            modifier = Modifier
                                .background(BrandBlue, RoundedCornerShape(999.dp))
                                .padding(horizontal = 7.dp, vertical = 1.dp),
                        ) {
                            Text(
                                if (conversation.unread > 99) "99+" else "${conversation.unread}",
                                color = Color.White,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }
        }
    }
}
