package com.ila3.dshomni

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.onNodeWithContentDescription
import com.ila3.dshomni.ui.PreviewData
import com.ila3.dshomni.ui.chat.ChatScreen
import com.ila3.dshomni.ui.theme.DshOmniTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Behaviour of the redesigned chat page: the composer keeps a usable field,
 * sending still routes through the existing callback, and a thread with no
 * messages still explains itself.
 *
 * The layout numbers are asserted by the screenshot tests; these check that the
 * rebuild did not change what a tap or a keystroke does.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "zh-rCN-w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ChatInteractionTest {

    @get:Rule
    val compose = createComposeRule()

    private fun chat(
        state: com.ila3.dshomni.ui.UiState = PreviewData.paired,
        conversationId: String = "cnv_lin",
        onSend: (String) -> Unit = {},
        onSendNote: (String) -> Unit = {},
    ) {
        compose.setContent {
            DshOmniTheme {
                ChatScreen(
                    state = state,
                    conversationId = conversationId,
                    onBack = { },
                    onSend = onSend,
                    onMarkRead = { },
                    onSetStatus = { },
                    onSetBotPaused = { },
                    onTranslate = { },
                    onSuggest = { },
                    onDismissSuggestions = { },
                    onSendNote = onSendNote,
                    onRetryMessage = { },
                    onUploadAttachment = { _, _, _, _ -> },
                    onLoadAttachment = { null },
                    onDismissNotice = { },
                )
            }
        }
    }

    @Test
    fun composerTypesAndSendRoutesThroughTheExistingCallback() {
        var sent = ""
        chat(onSend = { sent = it })
        // The field is the only editable node: on the old single-deck layout it
        // was ~60dp wide, which is why the redesign moved actions to their own row.
        compose.onNodeWithText("输入回复…").assertIsDisplayed()
        compose.onNodeWithText("输入回复…").performTextInput("稍后给您补发")
        compose.onNodeWithText("稍后给您补发").assertIsDisplayed()
        compose.onNodeWithContentDescription("发送").performClick()
        assertEquals("稍后给您补发", sent)
    }

    @Test
    fun noteModeRoutesToTheNoteCallbackAndExplainsItself() {
        var note = ""
        chat(onSendNote = { note = it })
        compose.onNodeWithContentDescription("内部备注").performClick()
        compose.onNodeWithText("输入内部备注（客户看不到）…").assertIsDisplayed()
        compose.onNodeWithText("输入内部备注（客户看不到）…").performTextInput("客户在等补发")
        compose.onNodeWithContentDescription("发送").performClick()
        assertEquals("客户在等补发", note)
    }

    @Test
    fun aThreadWithNoMessagesShowsTheEmptyState() {
        val base = PreviewData.paired
        val snapshot = base.snapshot!!
        val empty = snapshot.conversations.first().copy(messages = emptyList())
        chat(
            state = base.copy(snapshot = snapshot.copy(conversations = listOf(empty))),
            conversationId = empty.id,
        )
        assertTrue(
            compose.onAllNodesWithText("还没有消息").fetchSemanticsNodes().isNotEmpty(),
        )
    }

    @Test
    fun aThreadWithMessagesShowsADaySeparator() {
        chat(conversationId = "cnv_lin")
        assertTrue(
            compose.onAllNodesWithText("今天").fetchSemanticsNodes().isNotEmpty(),
        )
    }

    @Test
    fun longPressOpensTheBubbleMenuAndHidesLocally() {
        chat()
        val text = "如果退款的话大概多久到账？"
        compose.onNodeWithText(text).performTouchInput { longClick() }
        compose.onNodeWithText("本地隐藏").assertIsDisplayed().performClick()
        assertTrue(compose.onAllNodesWithText(text).fetchSemanticsNodes().isEmpty())
    }
}
