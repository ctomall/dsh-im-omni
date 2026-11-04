package com.ila3.dshomni.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Translate
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ila3.dshomni.data.model.Conversation
import com.ila3.dshomni.data.model.Message
import com.ila3.dshomni.data.model.Snapshot
import com.ila3.dshomni.ui.UiState
import com.ila3.dshomni.ui.common.Avatar
import com.ila3.dshomni.ui.common.Banner
import com.ila3.dshomni.ui.common.HealthDot
import com.ila3.dshomni.ui.common.Pill
import com.ila3.dshomni.ui.common.PlatformBadge
import com.ila3.dshomni.ui.theme.BrandBlue
import com.ila3.dshomni.ui.theme.BrandTeal
import com.ila3.dshomni.ui.theme.aiGradient
import com.ila3.dshomni.util.Labels
import com.ila3.dshomni.util.Times

/**
 * One conversation: read, translate, draft with AI, and reply.
 *
 * Sending never blocks on the provider: the Host queues the message and the
 * bubble shows its delivery state, so a slow channel never freezes the phone.
 */
@Composable
fun ChatScreen(
    state: UiState,
    conversationId: String,
    onBack: () -> Unit,
    onSend: (String) -> Unit,
    onMarkRead: () -> Unit,
    onSetStatus: (String) -> Unit,
    onSetBotPaused: (Boolean) -> Unit,
    onTranslate: () -> Unit,
    onSuggest: () -> Unit,
    onDismissNotice: () -> Unit,
) {
    val snapshot = state.snapshot
    val conversation = snapshot?.conversation(conversationId)
    if (snapshot == null || conversation == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("会话不存在或已被删除", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    val contact = snapshot.contact(conversation.contactId)
    val channel = snapshot.channel(conversation.channelId)
    var draft by remember(conversationId) { mutableStateOf("") }
    var menuOpen by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    LaunchedEffect(conversation.messages.size) {
        if (conversation.messages.isNotEmpty()) listState.animateScrollToItem(conversation.messages.lastIndex)
    }
    LaunchedEffect(conversationId) { onMarkRead() }

    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .imePadding(),
    ) {
        ChatHeader(
            conversation = conversation,
            contactName = contact?.name ?: "未知客户",
            contactHue = contact?.hue ?: 210,
            channelName = channel?.name.orEmpty(),
            channelBadge = channel?.badge.orEmpty(),
            channelHue = channel?.hue ?: 210,
            channelHealth = channel?.health ?: "ready",
            onBack = onBack,
            menuOpen = menuOpen,
            onMenuOpenChange = { menuOpen = it },
            onMarkRead = onMarkRead,
            onSetStatus = onSetStatus,
            onSetBotPaused = onSetBotPaused,
            onTranslate = onTranslate,
            onSuggest = onSuggest,
            translating = state.translating,
            aiEnabled = snapshot.workspace.aiSuggestions,
        )

        if (state.error != null) {
            Box(Modifier.padding(horizontal = 14.dp, vertical = 6.dp)) {
                Banner(state.error, error = true, onDismiss = onDismissNotice)
            }
        }

        Box(Modifier.weight(1f)) {
            if (conversation.messages.isEmpty()) {
                Column(
                    Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("还没有消息", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "客户的第一条消息会出现在这里。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(
                    state = listState,
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        start = 14.dp, end = 14.dp, top = 10.dp, bottom = 14.dp,
                    ),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(conversation.messages, key = { it.id }) { message ->
                        MessageBubble(message)
                    }
                }
            }
        }

        if (state.suggestions.isNotEmpty()) {
            SuggestionStrip(
                suggestions = state.suggestions,
                onPick = { draft = it },
                onRefresh = onSuggest,
            )
        }

        Composer(
            draft = draft,
            onDraftChange = { draft = it },
            sending = state.busyAction == "message.send",
            aiEnabled = snapshot.workspace.aiSuggestions,
            suggestionBusy = state.suggestionBusy,
            onSuggest = onSuggest,
            onSend = {
                val body = draft.trim()
                if (body.isNotEmpty()) {
                    onSend(body)
                    draft = ""
                }
            },
        )
    }
}

@Composable
private fun ChatHeader(
    conversation: Conversation,
    contactName: String,
    contactHue: Int,
    channelName: String,
    channelBadge: String,
    channelHue: Int,
    channelHealth: String,
    onBack: () -> Unit,
    menuOpen: Boolean,
    onMenuOpenChange: (Boolean) -> Unit,
    onMarkRead: () -> Unit,
    onSetStatus: (String) -> Unit,
    onSetBotPaused: (Boolean) -> Unit,
    onTranslate: () -> Unit,
    onSuggest: () -> Unit,
    translating: Boolean,
    aiEnabled: Boolean,
) {
    Surface(color = MaterialTheme.colorScheme.surface) {
        Column {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(start = 4.dp, end = 4.dp, top = 4.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Rounded.ArrowBack, contentDescription = "返回")
                }
                Avatar(contactName, contactHue, size = 38.dp)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        contactName,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (channelBadge.isNotBlank()) {
                            PlatformBadge(channelBadge, channelHue, size = 12.dp)
                            Spacer(Modifier.width(5.dp))
                        }
                        Text(
                            channelName.ifBlank { "未知渠道" },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(6.dp))
                        HealthDot(channelHealth, size = 6.dp)
                        Spacer(Modifier.width(4.dp))
                        Text(
                            Labels.health(channelHealth),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (conversation.status == "pending") {
                    Pill("跟进中", color = Color(0xFFFFB020), background = Color(0xFFFFB020).copy(alpha = 0.12f))
                    Spacer(Modifier.width(4.dp))
                }
                Box {
                    IconButton(onClick = { onMenuOpenChange(true) }) {
                        Icon(Icons.Rounded.MoreVert, contentDescription = "更多")
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { onMenuOpenChange(false) }) {
                        DropdownMenuItem(
                            text = { Text("标记已读") },
                            onClick = { onMenuOpenChange(false); onMarkRead() },
                            leadingIcon = { Icon(Icons.Rounded.Check, contentDescription = null) },
                        )
                        DropdownMenuItem(
                            text = { Text(if (translating) "翻译中…" else "翻译客户消息") },
                            onClick = { onMenuOpenChange(false); onTranslate() },
                            leadingIcon = { Icon(Icons.Rounded.Translate, contentDescription = null) },
                        )
                        if (aiEnabled) {
                            DropdownMenuItem(
                                text = { Text("AI 建议回复") },
                                onClick = { onMenuOpenChange(false); onSuggest() },
                                leadingIcon = { Icon(Icons.Rounded.AutoAwesome, contentDescription = null) },
                            )
                        }
                        DropdownMenuItem(
                            text = { Text("标为已解决") },
                            onClick = { onMenuOpenChange(false); onSetStatus("solved") },
                        )
                        DropdownMenuItem(
                            text = { Text("转为待处理") },
                            onClick = { onMenuOpenChange(false); onSetStatus("open") },
                        )
                        DropdownMenuItem(
                            text = { Text(if (conversation.botPaused) "恢复 AI 接待" else "暂停 AI 接待") },
                            onClick = { onMenuOpenChange(false); onSetBotPaused(!conversation.botPaused) },
                        )
                    }
                }
            }
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(MaterialTheme.colorScheme.outlineVariant),
            )
        }
    }
}

@Composable
private fun MessageBubble(message: Message) {
    if (message.isNote) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Surface(
                color = Color(0xFFFFB020).copy(alpha = 0.10f),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth(0.92f),
            ) {
                Column(Modifier.padding(10.dp)) {
                    Text(
                        "内部备注",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFFB07A00),
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(message.text, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        return
    }
    val inbound = message.inbound
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (inbound) Arrangement.Start else Arrangement.End,
    ) {
        Surface(
            color = if (inbound) MaterialTheme.colorScheme.surfaceVariant else Color.Transparent,
            shape = RoundedCornerShape(
                topStart = if (inbound) 4.dp else 16.dp,
                topEnd = if (inbound) 16.dp else 4.dp,
                bottomStart = 16.dp,
                bottomEnd = 16.dp,
            ),
            modifier = Modifier.fillMaxWidth(0.84f),
        ) {
            Box(
                Modifier
                    .background(
                        if (inbound) Brush.linearGradient(
                            listOf(
                                MaterialTheme.colorScheme.surfaceVariant,
                                MaterialTheme.colorScheme.surfaceVariant,
                            ),
                        ) else Brush.linearGradient(listOf(BrandBlue, BrandTeal)),
                    ),
            ) {
                Column(Modifier.padding(horizontal = 12.dp, vertical = 9.dp)) {
                    Text(
                        message.text,
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (inbound) MaterialTheme.colorScheme.onSurface else Color.White,
                    )
                    message.translation?.let { translated ->
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "译：$translated",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (inbound) {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            } else {
                                Color.White.copy(alpha = 0.82f)
                            },
                            fontStyle = FontStyle.Italic,
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            Times.messageStamp(message.createdAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (inbound) {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            } else {
                                Color.White.copy(alpha = 0.72f)
                            },
                        )
                        if (!inbound) {
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = when {
                                    message.failed -> "发送失败"
                                    message.status == "queued" -> "发送中…"
                                    else -> "已发送"
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = if (message.failed) Color(0xFFFFD9DD) else Color.White.copy(alpha = 0.72f),
                                fontWeight = if (message.failed) FontWeight.Medium else FontWeight.Normal,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SuggestionStrip(suggestions: List<String>, onPick: (String) -> Unit, onRefresh: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.AutoAwesome, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
                Text("AI 草稿", style = MaterialTheme.typography.labelSmall, color = BrandBlue, modifier = Modifier.weight(1f))
                Text(
                    "换一批",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.clickable(onClick = onRefresh),
                )
            }
            Spacer(Modifier.height(6.dp))
            suggestions.forEach { suggestion ->
                Surface(
                    color = BrandBlue.copy(alpha = 0.07f),
                    shape = RoundedCornerShape(12.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, BrandBlue.copy(alpha = 0.18f)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 3.dp)
                        .clickable { onPick(suggestion) },
                ) {
                    Text(
                        suggestion,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun Composer(
    draft: String,
    onDraftChange: (String) -> Unit,
    sending: Boolean,
    aiEnabled: Boolean,
    suggestionBusy: Boolean,
    onSuggest: () -> Unit,
    onSend: () -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 8.dp) {
        Row(
            Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            if (aiEnabled) {
                IconButton(onClick = onSuggest, enabled = !suggestionBusy) {
                    if (suggestionBusy) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    } else {
                        Icon(Icons.Rounded.AutoAwesome, contentDescription = "AI 建议", tint = BrandBlue)
                    }
                }
            }
            OutlinedTextField(
                value = draft,
                onValueChange = onDraftChange,
                placeholder = { Text("输入回复…") },
                shape = RoundedCornerShape(20.dp),
                maxLines = 4,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = onSend,
                enabled = draft.isNotBlank() && !sending,
                shape = RoundedCornerShape(20.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            ) {
                if (sending) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(16.dp),
                    )
                } else {
                    Icon(Icons.Rounded.Send, contentDescription = "发送", modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}
