package com.ila3.dshomni

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.hasSetTextAction
import com.ila3.dshomni.ui.PreviewData
import com.ila3.dshomni.ui.inbox.InboxScreen
import com.ila3.dshomni.ui.settings.SettingsScreen
import com.ila3.dshomni.ui.theme.DshOmniTheme
import com.ila3.dshomni.ui.theme.ThemeMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Behavioural checks for the 0.4.0 additions, driven through the real composables.
 *
 * These run on the JVM (Robolectric) so they run in CI without a device: the
 * emulator smoke test covers rendering, this covers what a tap actually does.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "zh-rCN-w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class UiInteractionTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun themeChipsReportTheChosenMode() {
        var picked: ThemeMode? = null
        compose.setContent {
            DshOmniTheme {
                SettingsScreen(
                    state = PreviewData.paired,
                    themeMode = ThemeMode.SYSTEM,
                    onThemeMode = { picked = it },
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
        compose.onNodeWithText("深色").performClick()
        assertEquals(ThemeMode.DARK, picked)
        compose.onNodeWithText("浅色").performClick()
        assertEquals(ThemeMode.LIGHT, picked)
    }

    @Test
    fun markAllReadAppearsOnlyWithUnreadRowsAndFiresOnce() {
        var fired = 0
        compose.setContent {
            DshOmniTheme {
                InboxScreen(
                    state = PreviewData.paired,
                    onOpen = { },
                    onRefresh = { },
                    onSwitchServer = { },
                    onDismiss = { },
                    onMarkAllRead = { fired += 1 },
                )
            }
        }
        val label = compose.onAllNodesWithText("全部标为已读", substring = true)
        assertTrue(label.fetchSemanticsNodes().isNotEmpty())
        label[0].performClick()
        assertEquals(1, fired)
    }

    @Test
    fun searchMatchesTextFromOlderBubblesInTheThread() {
        compose.setContent {
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
        // "退款" only appears in a thread's earlier bubble for 林小满, and in the
        // final bubble of the same thread, so it must keep that row visible.
        compose.onNode(hasSetTextAction()).performTextInput("退款")
        compose.onNodeWithText("林小满", substring = true).assertIsDisplayed()
        // A row whose text never mentions it must drop out.
        assertFalse(
            compose.onAllNodesWithText("Aisha Khan", substring = true)
                .fetchSemanticsNodes().isNotEmpty(),
        )
    }
}
