package com.ila3.dshomni.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Hub
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ila3.dshomni.data.remote.PairingTarget
import com.ila3.dshomni.ui.channels.AddChannelScreen
import com.ila3.dshomni.ui.channels.ChannelDetailScreen
import com.ila3.dshomni.ui.channels.ChannelsScreen
import com.ila3.dshomni.ui.chat.ChatScreen
import com.ila3.dshomni.ui.inbox.InboxScreen
import com.ila3.dshomni.ui.pairing.PairingScreen
import com.ila3.dshomni.ui.settings.SettingsScreen
import androidx.compose.foundation.shape.RoundedCornerShape
import com.ila3.dshomni.ui.theme.BrandBlue
import com.ila3.dshomni.ui.theme.ThemeMode
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.ila3.dshomni.ui.theme.Radius
import com.ila3.dshomni.ui.theme.Spacing
import androidx.compose.material.icons.rounded.Contacts
import androidx.compose.material.icons.rounded.Person
import androidx.compose.ui.res.stringResource
import com.ila3.dshomni.R
import com.ila3.dshomni.ui.contacts.ContactsScreen

/** Where the app currently is. Chat, channel detail, and the wizard stack on the tabs. */
sealed interface Route {
    data object Inbox : Route
    data object Contacts : Route
    data object Channels : Route
    data object Settings : Route
    data class Chat(val conversationId: String) : Route
    data class ChannelDetail(val channelId: String) : Route
    data object AddChannel : Route
}

/**
 * Root composition: pairing when no server works, otherwise the three tabs
 * plus whatever screen the user drilled into.
 */
@Composable
fun RootApp(
    viewModel: OmniViewModel,
    deepLink: PairingTarget? = null,
    openConversationId: String? = null,
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    onThemeMode: (ThemeMode) -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var route by remember { mutableStateOf<Route>(Route.Inbox) }
    var pairingOpen by remember { mutableStateOf(false) }
    var scanned by remember { mutableStateOf<PairingTarget?>(null) }

    val scanner = rememberLauncherForActivityResult(ScanContract()) { result ->
        val contents = result.contents
        if (contents != null) {
            PairingTarget.parse(contents)?.let {
                scanned = it
                pairingOpen = true
            }
        }
    }

    LaunchedEffect(deepLink) {
        if (deepLink != null) {
            scanned = deepLink
            pairingOpen = true
        }
    }

    val showPairing = pairingOpen || !state.paired

    LaunchedEffect(state.paired) {
        if (state.paired) pairingOpen = false
    }

    // The Host is polled only while the app has a paired server on screen.
    LaunchedEffect(state.paired) {
        if (state.paired) viewModel.startPolling() else viewModel.stopPolling()
    }

    LaunchedEffect(openConversationId, state.paired) {
        if (openConversationId != null && state.paired) {
            viewModel.markRead(openConversationId)
            route = Route.Chat(openConversationId)
        }
    }

    BackHandler(enabled = showPairing) {
        if (state.connection != null) pairingOpen = false
    }

    if (showPairing) {
        PairingScreen(
            state = state,
            onPair = { target, label -> viewModel.pair(target, label) },
            onConnect = { viewModel.connect(it) },
            onForget = { viewModel.forget(it) },
            onScan = {
                scanner.launch(
                    ScanOptions()
                        .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                        .setPrompt("扫描 DSH 配对二维码")
                        .setBeepEnabled(false)
                        .setOrientationLocked(true),
                )
            },
            initialLink = scanned,
            onNoticeShown = viewModel::clearError,
            onBack = if (state.connection != null) ({ pairingOpen = false }) else null,
        )
        return
    }

    BackHandler(enabled = route !is Route.Inbox) {
        route = when (route) {
            is Route.Chat, is Route.ChannelDetail, Route.AddChannel -> Route.Inbox
            else -> Route.Inbox
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            BottomBar(
                tabs = listOf(
                    BottomTab(
                        icon = Icons.Rounded.Inbox,
                        label = stringResource(R.string.tab_chats),
                        selected = route is Route.Inbox || route is Route.Chat,
                        badge = state.snapshot?.unreadTotal ?: 0,
                        onClick = { route = Route.Inbox },
                    ),
                    BottomTab(
                        icon = Icons.Rounded.Contacts,
                        label = stringResource(R.string.tab_contacts),
                        selected = route is Route.Contacts,
                        badge = 0,
                        onClick = { route = Route.Contacts },
                    ),
                    BottomTab(
                        icon = Icons.Rounded.Hub,
                        label = stringResource(R.string.tab_channels),
                        selected = route is Route.Channels || route is Route.ChannelDetail || route is Route.AddChannel,
                        badge = 0,
                        onClick = { route = Route.Channels },
                    ),
                    BottomTab(
                        icon = Icons.Rounded.Settings,
                        label = stringResource(R.string.tab_me),
                        selected = route is Route.Settings,
                        badge = 0,
                        onClick = { route = Route.Settings },
                    ),
                ),
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(bottom = padding.calculateBottomPadding())) {
            when (val current = route) {
                Route.Contacts -> ContactsScreen(
                    state = state,
                    onOpenConversation = { conversationId ->
                        viewModel.markRead(conversationId)
                        route = Route.Chat(conversationId)
                    },
                    onRefresh = { viewModel.refresh() },
                    onDismiss = viewModel::clearError,
                )
                Route.Inbox -> InboxScreen(
                    state = state,
                    onMarkAllRead = viewModel::markAllRead,
                    onOpen = { conversation ->
                        viewModel.markRead(conversation.id)
                        route = Route.Chat(conversation.id)
                    },
                    onRefresh = { viewModel.refresh() },
                    onSwitchServer = { pairingOpen = true },
                    onDismiss = viewModel::clearError,
                )
                is Route.Chat -> ChatScreen(
                    state = state,
                    conversationId = current.conversationId,
                    onBack = { route = Route.Inbox },
                    onSend = { viewModel.sendMessage(current.conversationId, it) },
                    onMarkRead = { viewModel.markRead(current.conversationId) },
                    onSetStatus = { viewModel.setConversationStatus(current.conversationId, it) },
                    onSetBotPaused = { viewModel.setBotPaused(current.conversationId, it) },
                    onTranslate = {
                        viewModel.translateConversation(
                            current.conversationId,
                            state.snapshot?.workspace?.translationTarget ?: "zh-CN",
                        )
                    },
                    onSuggest = {
                        val detected = state.snapshot?.conversation(current.conversationId)?.customerLanguage
                        viewModel.suggestReplies(
                            current.conversationId,
                            detected?.takeIf { it.isNotBlank() } ?: "auto",
                        )
                    },
                    onDismissSuggestions = viewModel::clearSuggestions,
                    onSendNote = { text -> viewModel.sendNote(current.conversationId, text) },
                    onRetryMessage = { messageId -> viewModel.retryMessage(messageId) },
                    onUploadAttachment = { bytes, name, type, caption ->
                        viewModel.uploadAttachment(current.conversationId, bytes, name, type, caption)
                    },
                    onLoadAttachment = { url -> viewModel.attachmentBytes(url) },
                    onDismissNotice = viewModel::clearError,
                )
                Route.Channels -> ChannelsScreen(
                    state = state,
                    onOpen = { route = Route.ChannelDetail(it.id) },
                    onAdd = { route = Route.AddChannel },
                    onToggleStatus = { channel ->
                        viewModel.updateChannel(
                            channel,
                            channel.name,
                            channel.description,
                            if (channel.isPaused) "active" else "paused",
                        )
                    },
                    onTest = { channel -> viewModel.testChannel(channel.id) },
                )
                Route.AddChannel -> AddChannelScreen(
                    state = state,
                    onBack = { route = Route.Channels },
                    onCreate = { name, type, description, config ->
                        viewModel.createChannel(name, type, description, config) { id ->
                            route = Route.ChannelDetail(id)
                        }
                    },
                )
                is Route.ChannelDetail -> ChannelDetailScreen(
                    state = state,
                    channelId = current.channelId,
                    onBack = { route = Route.Channels },
                    onTest = { viewModel.testChannel(current.channelId) },
                    onQrLogin = { viewModel.qrLogin(current.channelId) },
                    onQrPoll = { viewModel.qrStatus(current.channelId) },
                    onReveal = { deliver -> viewModel.revealSecret(current.channelId, deliver) },
                    onRotate = { deliver -> viewModel.rotateSecret(current.channelId, deliver) },
                    onToggleStatus = { status ->
                        state.snapshot?.channel(current.channelId)?.let { channel ->
                            viewModel.updateChannel(channel, channel.name, channel.description, status)
                        }
                    },
                    onSave = { name, description ->
                        state.snapshot?.channel(current.channelId)?.let { channel ->
                            viewModel.updateChannel(channel, name, description, channel.status)
                        }
                    },
                    onDelete = {
                        viewModel.deleteChannel(current.channelId) { route = Route.Channels }
                    },
                    onClearQr = viewModel::clearQr,
                    onDismissNotice = viewModel::clearError,
                )
                Route.Settings -> SettingsScreen(
                    state = state,
                    themeMode = themeMode,
                    onThemeMode = onThemeMode,
                    onSwitchServer = { pairingOpen = true },
                    onDisconnect = { viewModel.disconnect() },
                    onRefresh = { viewModel.refresh() },
                    onUpdateSetting = { payload, success -> viewModel.updateSettings(payload, success) },
                    onCheckUpdate = viewModel::checkUpdate,
                    onDownloadUpdate = viewModel::downloadUpdate,
                    onDismissUpdate = viewModel::clearUpdate,
                    onDismissNotice = viewModel::clearError,
                )
            }
        }
    }
}

/** One destination in the bottom bar. */
private data class BottomTab(
    val icon: ImageVector,
    val label: String,
    val selected: Boolean,
    val badge: Int,
    val onClick: () -> Unit,
)

/**
 * Hand-built bottom bar: a floating pill for the active tab reads better on
 * the gradient headers than a flat navigation bar, and keeps the unread badge
 * independent of the icon's own tint.
 */
@Composable
private fun BottomBar(tabs: List<BottomTab>) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 12.dp,
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = Spacing.sm, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            for (tab in tabs) {
                val active = tab.selected
                Box(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(Radius.md))
                        .background(
                            if (active) BrandBlue.copy(alpha = 0.12f) else Color.Transparent,
                        )
                        .clickable(onClick = tab.onClick)
                        .padding(vertical = 7.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box {
                            Icon(
                                tab.icon,
                                contentDescription = tab.label,
                                tint = if (active) BrandBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(22.dp),
                            )
                            if (tab.badge > 0) {
                                Box(
                                    Modifier
                                        .align(Alignment.TopEnd)
                                        .offset(x = 10.dp, y = (-6).dp)
                                        .background(MaterialTheme.colorScheme.error, RoundedCornerShape(Radius.full))
                                        .padding(horizontal = Spacing.xxs, vertical = 1.dp),
                                ) {
                                    Text(
                                        if (tab.badge > 99) "99+" else "${tab.badge}",
                                        color = MaterialTheme.colorScheme.onError,
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(3.dp))
                        Text(
                            tab.label,
                            fontSize = 11.sp,
                            fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (active) BrandBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}
