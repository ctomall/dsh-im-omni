package com.ila3.dshomni

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.hasSetTextAction
import com.ila3.dshomni.ui.PreviewData
import com.ila3.dshomni.ui.contacts.ContactsScreen
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
 * Contacts tab: filtering, navigation into the newest conversation, and the
 * empty state. These are the pieces P1 promised; grouping lands with P2.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "zh-rCN-w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ContactsInteractionTest {

    @get:Rule
    val compose = createComposeRule()

    private fun screen(
        state: com.ila3.dshomni.ui.UiState = PreviewData.paired,
        onOpen: (String) -> Unit = {},
        onRefresh: () -> Unit = {},
    ) {
        compose.setContent {
            DshOmniTheme {
                ContactsScreen(
                    state = state,
                    onOpenConversation = onOpen,
                    onRefresh = onRefresh,
                    onDismiss = { },
                )
            }
        }
    }

    @Test
    fun tappingAContactOpensItsNewestConversation() {
        val snapshot = PreviewData.paired.snapshot!!
        val conversation = snapshot.conversations.first()
        val contact = snapshot.contact(conversation.contactId)!!
        var opened: String? = null
        screen(onOpen = { opened = it })
        compose.onNodeWithText(contact.name).assertIsDisplayed().performClick()
        assertEquals(conversation.id, opened)
    }

    @Test
    fun searchNarrowsTheList() {
        screen()
        compose.onNode(hasSetTextAction()).performTextInput("Aisha")
        assertTrue(compose.onAllNodesWithText("Aisha Khan").fetchSemanticsNodes().isNotEmpty())
        assertTrue(compose.onAllNodesWithText("林小满").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun aWorkspaceWithoutContactsExplainsItself() {
        val base = PreviewData.paired
        screen(state = base.copy(snapshot = base.snapshot!!.copy(contacts = emptyList())))
        assertTrue(compose.onAllNodesWithText("还没有联系人").fetchSemanticsNodes().isNotEmpty())
    }

    @Test
    fun groupingSwitchChangesTheSectionHeaders() {
        screen()
        // Default grouping is by account: the demo workspace has a WhatsApp channel.
        // The demo contacts carry no identities, so their bucket is the
        // ungrouped one — the header still has to read like a human wrote it.
        assertTrue(compose.onAllNodesWithText("未分组").fetchSemanticsNodes().isNotEmpty())
        compose.onNodeWithText("按公司").performClick()
        assertTrue(compose.onAllNodesWithText("Northwind", substring = true).fetchSemanticsNodes().isNotEmpty())
    }

    @Test
    fun aFailedFirstSyncOffersRetry() {
        var refreshed = 0
        val base = PreviewData.paired
        screen(
            state = base.copy(snapshot = null, loading = false, error = "网络不可用"),
            onRefresh = { refreshed += 1 },
        )
        compose.onNodeWithText("联系人加载失败").assertIsDisplayed()
        compose.onNodeWithText("重试").performClick()
        assertEquals(1, refreshed)
    }
}
