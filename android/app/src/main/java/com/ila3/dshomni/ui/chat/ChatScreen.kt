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
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Notes
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
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
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ila3.dshomni.data.model.Conversation
import com.ila3.dshomni.data.model.Attachment
import com.ila3.dshomni.data.model.Message
import com.ila3.dshomni.data.model.Snapshot
import com.ila3.dshomni.ui.UiState
import com.ila3.dshomni.ui.common.Avatar
import com.ila3.dshomni.ui.common.Banner
import com.ila3.dshomni.ui.common.HealthDot
import com.ila3.dshomni.ui.common.Pill
import com.ila3.dshomni.ui.common.PlatformBadge
import com.ila3.dshomni.ui.theme.HealthWarn
import com.ila3.dshomni.ui.theme.bubbleInColor
import com.ila3.dshomni.ui.theme.bubbleOutColor
import com.ila3.dshomni.ui.theme.onBubbleIn
import com.ila3.dshomni.ui.theme.onBubbleOut
import com.ila3.dshomni.ui.theme.OnBrandMuted
import com.ila3.dshomni.ui.theme.warningInk
import com.ila3.dshomni.ui.theme.BrandBlue
import com.ila3.dshomni.ui.theme.BrandTeal
import com.ila3.dshomni.ui.theme.aiGradient
import com.ila3.dshomni.util.Labels
import com.ila3.dshomni.util.Times
import com.ila3.dshomni.util.formatBytes
import com.ila3.dshomni.ui.theme.Radius
import com.ila3.dshomni.ui.theme.Spacing
import java.util.Locale
import java.time.format.DateTimeFormatter
import java.time.ZoneId
import java.time.LocalDate
import java.time.Instant
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.layout.BoxWithConstraints
import com.ila3.dshomni.ui.theme.Sizes
import com.ila3.dshomni.ui.theme.IconSize
import com.ila3.dshomni.ui.theme.Elevation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.FilledIconButton

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
    onDismissSuggestions: () -> Unit,
    onSendNote: (String) -> Unit,
    onRetryMessage: (String) -> Unit,
    onUploadAttachment: (ByteArray, String, String, String) -> Unit,
    onLoadAttachment: suspend (String) -> ByteArray?,
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
    // 回复 / 备注：备注只进 Host，不会发给客户。
    var noteMode by remember(conversationId) { mutableStateOf(false) }
    var templatesOpen by remember { mutableStateOf(false) }
    val context = LocalContext.current

    /** Read a picked URI into bytes plus the display name the system knows. */
    fun readPicked(uri: Uri): Triple<ByteArray, String, String>? = runCatching {
        val type = context.contentResolver.getType(uri) ?: "application/octet-stream"
        val name = context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        } ?: uri.lastPathSegment.orEmpty().substringAfterLast('/').ifBlank { "attachment" }
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        if (bytes == null || bytes.isEmpty()) null else Triple(bytes, name, type)
    }.getOrNull()

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) readPicked(uri)?.let { (bytes, name, type) -> onUploadAttachment(bytes, name, type, draft) }
    }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) readPicked(uri)?.let { (bytes, name, type) -> onUploadAttachment(bytes, name, type, draft) }
    }
    val listState = rememberLazyListState()

    LaunchedEffect(conversation.messages.size) {
        if (conversation.messages.isNotEmpty()) listState.animateScrollToItem(conversation.messages.lastIndex)
    }
    LaunchedEffect(conversationId) {
        onMarkRead()
        onDismissSuggestions()
    }

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

        Box(
            Modifier
                .weight(1f)
                .background(MaterialTheme.colorScheme.background),
        ) {
            if (conversation.messages.isEmpty()) {
                Column(
                    Modifier
                        .fillMaxSize()
                        .padding(Spacing.xxl),
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
                        start = Spacing.md, end = Spacing.md, top = Spacing.xs, bottom = Spacing.sm,
                    ),
                ) {
                    itemsIndexed(conversation.messages, key = { _, item -> item.id }) { index, message ->
                        val previous = conversation.messages.getOrNull(index - 1)
                        val newDay = previous == null || !sameDay(previous.createdAt, message.createdAt)
                        if (newDay) DaySeparator(dayLabel(message.createdAt))
                        // Tight inside a burst from one speaker, looser when the
                        // speaker changes, so the eye can group bubbles.
                        val gap = when {
                            previous == null || newDay -> 0.dp
                            previous.inbound == message.inbound &&
                                message.createdAt - previous.createdAt < 3 * 60_000L -> Spacing.xxs
                            else -> Spacing.sm
                        }
                        Box(Modifier.padding(top = gap)) {
                            MessageBubble(message, onLoadAttachment, onRetryMessage)
                        }
                    }
                }
            }
        }

        // Drafts are a per-conversation aid: hidden when AI suggestions are off,
        // and dismissible so a strip cannot linger over the composer.
        if (state.suggestions.isNotEmpty() && snapshot.workspace.aiSuggestions) {
            SuggestionStrip(
                suggestions = state.suggestions,
                onPick = { draft = it },
                onRefresh = onSuggest,
                onDismiss = onDismissSuggestions,
            )
        }

        if (templatesOpen) {
            TemplateSheet(
                templates = snapshot.templates.filter { it.appliesTo(conversation.channelId) },
                onPick = { body -> draft = if (draft.isBlank()) body else "$draft\n$body"; templatesOpen = false },
                onDismiss = { templatesOpen = false },
            )
        }

        Composer(
            draft = draft,
            noteMode = noteMode,
            onToggleNoteMode = { noteMode = !noteMode },
            onOpenTemplates = { templatesOpen = true },
            onDraftChange = { draft = it },
            sending = state.busyAction == "message.send" || state.busyAction == "attachment.upload",
            uploading = state.busyAction == "attachment.upload",
            aiEnabled = snapshot.workspace.aiSuggestions,
            suggestionBusy = state.suggestionBusy,
            onPickImage = {
                imagePicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            },
            onPickFile = { filePicker.launch(arrayOf("*/*")) },
            onSuggest = onSuggest,
            onSend = {
                val body = draft.trim()
                if (body.isNotEmpty()) {
                    if (noteMode) onSendNote(body) else onSend(body)
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
                    .padding(start = Spacing.xxs, end = 4.dp, top = 4.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Rounded.ArrowBack, contentDescription = "返回")
                }
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
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
                Spacer(Modifier.width(Sizes.touchTarget))
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
private fun MessageBubble(
    message: Message,
    onLoad: suspend (String) -> ByteArray?,
    onRetry: (String) -> Unit,
) {
    if (message.isNote) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Surface(
                color = HealthWarn.copy(alpha = 0.10f),
                shape = RoundedCornerShape(Radius.xs),
                modifier = Modifier.fillMaxWidth(0.92f),
            ) {
                Column(Modifier.padding(10.dp)) {
                    Text(
                        "内部备注",
                        style = MaterialTheme.typography.labelSmall,
                        color = warningInk(),
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(message.text, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        return
    }
    val inbound = message.inbound
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        // Bubbles hug their text and only cap at 82% of the pane: a forced
        // 84% width made every "好的" look like a wall of empty space.
        val bubbleMax = maxWidth * 0.82f
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = if (inbound) Arrangement.Start else Arrangement.End,
        ) {
        Surface(
            color = if (inbound) bubbleInColor() else bubbleOutColor(),
            shape = RoundedCornerShape(
                topStart = if (inbound) 4.dp else 16.dp,
                topEnd = if (inbound) 16.dp else 4.dp,
                bottomStart = 16.dp,
                bottomEnd = 16.dp,
            ),
            modifier = Modifier.widthIn(max = bubbleMax),
        ) {
            Box {
                Column(Modifier.padding(horizontal = Spacing.sm, vertical = 9.dp)) {
                    message.attachments.forEach { attachment ->
                        AttachmentView(attachment, onLoad)
                        Spacer(Modifier.height(6.dp))
                    }
                    if (message.text.isNotBlank()) {
                        Text(
                            message.text,
                            style = MaterialTheme.typography.bodyLarge,
                            color = if (inbound) onBubbleIn() else onBubbleOut(),
                        )
                    }
                    message.translation?.let { translated ->
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "译：$translated",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (inbound) {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            } else {
                                onBubbleOut().copy(alpha = 0.65f)
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
                                onBubbleOut().copy(alpha = 0.55f)
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
                                color = onBubbleOut().copy(alpha = 0.55f),
                                fontWeight = if (message.failed) FontWeight.Medium else FontWeight.Normal,
                            )
                            if (message.failed) {
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    "重试",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = onBubbleOut(),
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(Radius.full))
                                        .background(onBubbleOut().copy(alpha = 0.12f))
                                        .clickable { onRetry(message.id) }
                                        .padding(horizontal = Spacing.xs, vertical = 2.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
    }
}


/** Whether two timestamps fall on the same local calendar day. */
private fun sameDay(a: Long, b: Long): Boolean {
    val zone = ZoneId.systemDefault()
    return Instant.ofEpochMilli(a).atZone(zone).toLocalDate() ==
        Instant.ofEpochMilli(b).atZone(zone).toLocalDate()
}

/** `今天` / `昨天` / `11月3日` for a day separator. */
private fun dayLabel(millis: Long): String {
    val zone = ZoneId.systemDefault()
    val day = Instant.ofEpochMilli(millis).atZone(zone).toLocalDate()
    val today = LocalDate.now(zone)
    return when (day) {
        today -> "今天"
        today.minusDays(1) -> "昨天"
        else -> DateTimeFormatter.ofPattern("M月d日", Locale.SIMPLIFIED_CHINESE).format(day)
    }
}

/** Centred pill between two days of a thread. */
@Composable
private fun DaySeparator(label: String) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.xs),
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .clip(RoundedCornerShape(Radius.full))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .padding(horizontal = Spacing.sm, vertical = 2.dp),
        )
    }
}

/** Bottom sheet with the workspace's canned replies, filtered to this channel. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun TemplateSheet(
    templates: List<com.ila3.dshomni.data.model.Template>,
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    androidx.compose.material3.ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(horizontal = Spacing.md, vertical = 4.dp)) {
            Text("快捷回复", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            if (templates.isEmpty()) {
                Text(
                    "这个渠道还没有可用的快捷回复，可在电脑端的「快捷回复」里添加。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                androidx.compose.foundation.lazy.LazyColumn {
                    items(templates, key = { it.id }) { template ->
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                            shape = RoundedCornerShape(Radius.sm),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = Spacing.xxs)
                                .clickable { onPick(template.body) },
                        ) {
                            Column(Modifier.padding(Spacing.sm)) {
                                Text(template.name, style = MaterialTheme.typography.titleSmall)
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    template.body,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(18.dp))
        }
    }
}

/** Inline image thumbnail, or a file chip when the bytes are not an image. */
@Composable
private fun AttachmentView(attachment: Attachment, onLoad: suspend (String) -> ByteArray?) {
    if (attachment.isImage) {
        var bitmap by remember(attachment.url) { mutableStateOf<ImageBitmap?>(null) }
        var failed by remember(attachment.url) { mutableStateOf(false) }
        LaunchedEffect(attachment.url) {
            val bytes = onLoad(attachment.url)
            if (bytes == null) {
                failed = true
            } else {
                val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (decoded == null) failed = true else bitmap = decoded.asImageBitmap()
            }
        }
        val image = bitmap
        if (image != null) {
            var previewing by remember { mutableStateOf(false) }
            Image(
                bitmap = image,
                contentDescription = attachment.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .widthIn(max = 220.dp)
                    .height(140.dp)
                    .clip(RoundedCornerShape(Radius.sm))
                    .clickable { previewing = true },
            )
            if (previewing) {
                Dialog(onDismissRequest = { previewing = false }) {
                    Surface(
                        color = Color.Black.copy(alpha = 0.92f),
                        shape = RoundedCornerShape(Radius.xl),
                    ) {
                        Image(
                            bitmap = image,
                            contentDescription = attachment.name,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(Spacing.sm)
                                .clickable { previewing = false },
                        )
                    }
                }
            }
            return
        }
        if (!failed) {
            Box(
                Modifier
                    .widthIn(max = 220.dp)
                    .height(140.dp)
                    .clip(RoundedCornerShape(Radius.sm))
                    .background(Color.Black.copy(alpha = 0.08f)),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
            }
            return
        }
    }
    FileChip(attachment)
}

@Composable
private fun FileChip(attachment: Attachment) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(Radius.xs))
            .background(Color.Black.copy(alpha = 0.08f))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.Description, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Column(Modifier.widthIn(max = 200.dp)) {
            Text(attachment.name, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(formatBytes(attachment.size), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SuggestionStrip(
    suggestions: List<String>,
    onPick: (String) -> Unit,
    onRefresh: () -> Unit,
    onDismiss: () -> Unit,
) {
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
                Spacer(Modifier.width(12.dp))
                IconButton(onClick = onDismiss, modifier = Modifier.size(20.dp)) {
                    Icon(Icons.Rounded.Close, contentDescription = "关闭草稿", modifier = Modifier.size(14.dp))
                }
            }
            Spacer(Modifier.height(6.dp))
            suggestions.forEach { suggestion ->
                Surface(
                    color = BrandBlue.copy(alpha = 0.07f),
                    shape = RoundedCornerShape(Radius.sm),
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
    noteMode: Boolean,
    onToggleNoteMode: () -> Unit,
    onOpenTemplates: () -> Unit,
    onDraftChange: (String) -> Unit,
    sending: Boolean,
    uploading: Boolean,
    aiEnabled: Boolean,
    suggestionBusy: Boolean,
    onPickImage: () -> Unit,
    onPickFile: () -> Unit,
    onSuggest: () -> Unit,
    onSend: () -> Unit,
) {
    var attachOpen by remember { mutableStateOf(false) }
    val busy = sending || uploading
    Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = Elevation.medium) {
        Column(
            Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
        ) {
            // Secondary actions live on their own deck: five icon buttons next to
            // the field used to leave it ~60dp wide on a 411dp screen and the
            // text wrapped one character per line.
            Row(verticalAlignment = Alignment.CenterVertically) {
                ComposerTool(
                    icon = if (noteMode) Icons.Rounded.Notes else Icons.Rounded.Description,
                    label = if (noteMode) "退出备注模式" else "内部备注",
                    tint = if (noteMode) warningInk() else MaterialTheme.colorScheme.onSurfaceVariant,
                    enabled = !busy,
                    onClick = onToggleNoteMode,
                )
                ComposerTool(
                    icon = Icons.Rounded.Bolt,
                    label = "快捷回复",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    enabled = !busy,
                    onClick = onOpenTemplates,
                )
                Box {
                    ComposerTool(
                        icon = Icons.Rounded.AttachFile,
                        label = "添加附件",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        enabled = !busy && !noteMode,
                        onClick = { attachOpen = true },
                    )
                    DropdownMenu(expanded = attachOpen, onDismissRequest = { attachOpen = false }) {
                        DropdownMenuItem(text = { Text("照片") }, onClick = { attachOpen = false; onPickImage() })
                        DropdownMenuItem(text = { Text("文件") }, onClick = { attachOpen = false; onPickFile() })
                    }
                }
                if (aiEnabled) {
                    ComposerTool(
                        icon = Icons.Rounded.AutoAwesome,
                        label = "AI 建议",
                        tint = BrandBlue,
                        enabled = !suggestionBusy && !busy,
                        loading = suggestionBusy,
                        onClick = onSuggest,
                    )
                }
                Spacer(Modifier.weight(1f))
                if (noteMode) {
                    Text("仅内部可见", style = MaterialTheme.typography.labelSmall, color = warningInk())
                }
            }
            Spacer(Modifier.height(Spacing.xxs))
            Row(verticalAlignment = Alignment.Bottom) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = onDraftChange,
                    placeholder = { Text(if (noteMode) "输入内部备注（客户看不到）…" else "输入回复…") },
                    shape = RoundedCornerShape(Radius.xs),
                    maxLines = 5,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        focusedBorderColor = Color.Transparent,
                        unfocusedBorderColor = Color.Transparent,
                    ),
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(Spacing.xs))
                FilledIconButton(
                    onClick = onSend,
                    enabled = draft.isNotBlank() && !busy,
                    modifier = Modifier.size(Sizes.touchTarget),
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = BrandBlue,
                        contentColor = Color.White,
                    ),
                ) {
                    if (busy) {
                        CircularProgressIndicator(
                            strokeWidth = 2.dp,
                            color = Color.White,
                            modifier = Modifier.size(18.dp),
                        )
                    } else {
                        Icon(Icons.Rounded.Send, contentDescription = "发送", modifier = Modifier.size(IconSize.md))
                    }
                }
            }
        }
    }
}

/** One 48dp tool button on the composer deck; keeps hit targets accessible. */
@Composable
private fun ComposerTool(
    icon: ImageVector,
    label: String,
    tint: Color,
    enabled: Boolean = true,
    loading: Boolean = false,
    onClick: () -> Unit,
) {
    IconButton(onClick = onClick, enabled = enabled, modifier = Modifier.size(Sizes.touchTarget)) {
        if (loading) {
            CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
        } else {
            Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(IconSize.md))
        }
    }
}
