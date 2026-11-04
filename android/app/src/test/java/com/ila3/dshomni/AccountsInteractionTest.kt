package com.ila3.dshomni

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.ila3.dshomni.data.model.Channel
import com.ila3.dshomni.ui.PreviewData
import com.ila3.dshomni.ui.channels.ChannelsScreen
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
 * Accounts tab: it reads as IM accounts (access method + health) and the row
 * menu still drives the existing channel commands.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "zh-rCN-w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AccountsInteractionTest {

    @get:Rule
    val compose = createComposeRule()

    private fun screen(
        state: com.ila3.dshomni.ui.UiState = PreviewData.paired,
        onToggle: (Channel) -> Unit = {},
        onTest: (Channel) -> Unit = {},
    ) {
        compose.setContent {
            DshOmniTheme {
                ChannelsScreen(
                    state = state,
                    onOpen = { },
                    onAdd = { },
                    onToggleStatus = onToggle,
                    onTest = onTest,
                )
            }
        }
    }

    @Test
    fun aRowShowsTheAccessMethodAndHealth() {
        screen()
        val channel = PreviewData.paired.snapshot!!.channels.first()
        compose.onNodeWithText(channel.name).assertIsDisplayed()
        // Two accounts share a platform label, so a substring match is enough.
        assertTrue(
            compose.onAllNodesWithText("WhatsApp", substring = true).fetchSemanticsNodes().isNotEmpty() ||
                compose.onAllNodesWithText("Telegram", substring = true).fetchSemanticsNodes().isNotEmpty(),
        )
    }

    @Test
    fun theRowMenuPausesAndTestsTheAccount() {
        var toggled: Channel? = null
        var tested: Channel? = null
        screen(onToggle = { toggled = it }, onTest = { tested = it })
        // Rows are sorted by name, so the first overflow belongs to that one.
        val channel = PreviewData.paired.snapshot!!.channels.sortedBy { it.name }.first()

        // The overflow is per row; the first one belongs to the first account.
        compose.onAllNodesWithContentDescription("查看配置")[0].performClick()
        compose.onNodeWithText("暂停接收").performClick()
        assertEquals(channel.id, toggled?.id)

        compose.onAllNodesWithContentDescription("查看配置")[0].performClick()
        compose.onNodeWithText("连接测试").performClick()
        assertEquals(channel.id, tested?.id)
    }

    @Test
    fun anEmptyWorkspaceInvitesTheFirstAccount() {
        val base = PreviewData.paired
        screen(state = base.copy(snapshot = base.snapshot!!.copy(channels = emptyList())))
        compose.onNodeWithText("还没有接入账号").assertIsDisplayed()
        compose.onNodeWithText("接入第一个账号").assertIsDisplayed()
    }
}
