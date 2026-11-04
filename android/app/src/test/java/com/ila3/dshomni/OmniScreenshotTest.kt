package com.ila3.dshomni

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.ila3.dshomni.ui.PreviewData
import com.ila3.dshomni.ui.channels.AddChannelScreen
import com.ila3.dshomni.ui.contacts.ContactsScreen
import com.ila3.dshomni.ui.channels.ChannelDetailScreen
import com.ila3.dshomni.ui.channels.ChannelsScreen
import com.ila3.dshomni.ui.chat.ChatScreen
import com.ila3.dshomni.ui.inbox.InboxScreen
import com.ila3.dshomni.ui.pairing.PairingScreen
import com.ila3.dshomni.ui.settings.SettingsScreen
import com.ila3.dshomni.ui.theme.DshOmniTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

/**
 * Renders every screen with [PreviewData] and writes PNGs to `build/screenshots`.
 *
 * These are real Compose frames on a 411×891dp / xxhdpi canvas, so the files are
 * usable in the README without a device.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "zh-rCN-w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OmniScreenshotTest {

    @Test
    fun capturePairing() {
        val activity = activity()
        activity.setContent {
            DshOmniTheme {
                PairingScreen(
                    state = PreviewData.pairing,
                    onPair = { _, _ -> },
                    onConnect = { },
                    onForget = { },
                    onScan = { },
                    initialLink = null,
                    onNoticeShown = { },
                )
            }
        }
        capture(activity, "omni-pairing.png")
    }

    @Test
    fun captureInbox() {
        val activity = activity()
        activity.setContent {
            DshOmniTheme {
                InboxScreen(
                    state = PreviewData.paired,
                    onOpen = { },
                    onRefresh = { },
                    onSwitchServer = { },
                    onDismiss = { },
                )
            }
        }
        capture(activity, "omni-inbox.png")
    }

    @Test
    fun captureChat() {
        val activity = activity()
        activity.setContent {
            DshOmniTheme {
                ChatScreen(
                    state = PreviewData.paired,
                    conversationId = "cnv_lin",
                    onBack = { },
                    onSend = { },
                    onMarkRead = { },
                    onSetStatus = { },
                    onSetBotPaused = { },
                    onTranslate = { },
                    onSuggest = { },
                    onDismissSuggestions = { },
                    onSendNote = { },
                    onRetryMessage = { },
                    onUploadAttachment = { _, _, _, _ -> },
                    onLoadAttachment = { null },
                    onDismissNotice = { },
                )
            }
        }
        capture(activity, "omni-chat.png")
    }

    @Test
    fun captureChannels() {
        val activity = activity()
        activity.setContent {
            DshOmniTheme {
                ChannelsScreen(state = PreviewData.paired, onOpen = { }, onAdd = { })
            }
        }
        capture(activity, "omni-channels.png")
    }

    @Test
    fun captureAddChannel() {
        val activity = activity()
        activity.setContent {
            DshOmniTheme {
                AddChannelScreen(state = PreviewData.paired, onBack = { }, onCreate = { _, _, _, _ -> })
            }
        }
        capture(activity, "omni-add-channel.png")
    }

    @Test
    fun captureAddChannelForm() {
        val activity = activity()
        activity.setContent {
            DshOmniTheme {
                AddChannelScreen(
                    state = PreviewData.paired,
                    onBack = { },
                    onCreate = { _, _, _, _ -> },
                    initialPlatformId = "whatsapp_qr",
                )
            }
        }
        capture(activity, "omni-add-channel-form.png")
    }

    @Test
    fun captureChannelDetail() {
        val activity = activity()
        activity.setContent {
            DshOmniTheme {
                ChannelDetailScreen(
                    state = PreviewData.paired,
                    channelId = "chn_wq",
                    onBack = { },
                    onTest = { },
                    onQrLogin = { },
                    onQrPoll = { },
                    onReveal = { },
                    onRotate = { },
                    onToggleStatus = { },
                    onSave = { _, _ -> },
                    onDelete = { },
                    onClearQr = { },
                    onDismissNotice = { },
                )
            }
        }
        capture(activity, "omni-channel-detail.png")
    }

    @Test
    fun captureSettings() {
        val activity = activity()
        activity.setContent {
            DshOmniTheme {
                SettingsScreen(
                    state = PreviewData.paired,
                    onSwitchServer = { },
                    onDisconnect = { },
                    onRefresh = { },
                    onUpdateSetting = { _, _ -> },
                    onCheckUpdate = { },
                    onDownloadUpdate = { },
                    onDismissUpdate = { },
                    onDismissNotice = { },
                )
            }
        }
        capture(activity, "omni-settings.png")
    }

    @Test
    fun captureContacts() {
        val activity = activity()
        activity.setContent {
            DshOmniTheme {
                ContactsScreen(
                    state = PreviewData.paired,
                    onOpenConversation = { },
                    onRefresh = { },
                    onDismiss = { },
                )
            }
        }
        capture(activity, "omni-contacts.png")
    }


    private fun activity(): ComponentActivity =
        Robolectric.buildActivity(ComponentActivity::class.java).setup().get()

    private fun capture(activity: ComponentActivity, name: String) = writeFrame(activity, name)
}

/** Same canvas rendered with the night qualifier, to prove the dark palette. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "zh-rCN-w411dp-h891dp-night-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OmniDarkScreenshotTest {

    @Test
    fun captureInboxDark() {
        val activity = Robolectric.buildActivity(ComponentActivity::class.java).setup().get()
        activity.setContent {
            DshOmniTheme {
                InboxScreen(
                    state = PreviewData.paired,
                    onOpen = { },
                    onRefresh = { },
                    onSwitchServer = { },
                    onDismiss = { },
                )
            }
        }
        writeFrame(activity, "omni-inbox-dark.png")
    }

    @Test
    fun captureChatDark() {
        val activity = Robolectric.buildActivity(ComponentActivity::class.java).setup().get()
        activity.setContent {
            DshOmniTheme {
                ChatScreen(
                    state = PreviewData.paired,
                    conversationId = "cnv_lin",
                    onBack = { },
                    onSend = { },
                    onMarkRead = { },
                    onSetStatus = { },
                    onSetBotPaused = { },
                    onTranslate = { },
                    onSuggest = { },
                    onDismissSuggestions = { },
                    onSendNote = { },
                    onRetryMessage = { },
                    onUploadAttachment = { _, _, _, _ -> },
                    onLoadAttachment = { null },
                    onDismissNotice = { },
                )
            }
        }
        writeFrame(activity, "omni-chat-dark.png")
    }
}

/** Draw one activity frame into `build/screenshots/<name>`. */
private fun writeFrame(activity: ComponentActivity, name: String) {
    val root: View = activity.window.decorView
    val width = 1080
    val height = 2340
    root.measure(
        View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY),
    )
    root.layout(0, 0, width, height)
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    root.draw(Canvas(bitmap))
    val dir = File("build/screenshots").apply { mkdirs() }
    FileOutputStream(File(dir, name)).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
}
