package com.ila3.dshomni

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.ila3.dshomni.data.auth.AuthSession
import com.ila3.dshomni.data.auth.AuthStore
import com.ila3.dshomni.data.auth.TenantRef
import com.ila3.dshomni.ui.auth.LoginScreen
import com.ila3.dshomni.ui.theme.DshOmniTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The sign-in gate: it must refuse an incomplete form, hand the credentials to
 * the caller untouched, and the store must round-trip a session.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "zh-rCN-w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class LoginInteractionTest {

    @get:Rule
    val compose = createComposeRule()

    private fun screen(onSubmit: (String, String, String, Boolean, String) -> Unit = { _, _, _, _, _ -> }) {
        compose.setContent {
            DshOmniTheme {
                LoginScreen(initialBaseUrl = "https://dsh.ila3.top/", loading = false, error = null, onSubmit = onSubmit)
            }
        }
    }

    @Test
    fun theSubmitButtonStaysDisabledUntilTheFormIsComplete() {
        screen()
        // "登录" also appears as the page title, so target the clickable node.
        compose.onNode(hasText("登录") and hasClickAction()).assertIsNotEnabled()
        compose.onNodeWithText("邮箱").performTextInput("agent@corp.com")
        compose.onNodeWithText("密码（至少 8 位）").performTextInput("short")
        compose.onNode(hasText("登录") and hasClickAction()).assertIsNotEnabled()
        compose.onNodeWithText("密码（至少 8 位）").performTextInput("123")
        compose.onNode(hasText("登录") and hasClickAction()).assertIsEnabled()
    }

    @Test
    fun submittingPassesTheCredentialThrough() {
        var captured: List<String>? = null
        screen { base, email, password, register, _ ->
            captured = listOf(base, email, password, register.toString())
        }
        compose.onNodeWithText("邮箱").performTextInput("agent@corp.com")
        compose.onNodeWithText("密码（至少 8 位）").performTextInput("correct horse")
        compose.onNode(hasText("登录") and hasClickAction()).performClick()
        assertEquals(
            listOf("https://dsh.ila3.top/", "agent@corp.com", "correct horse", "false"),
            captured,
        )
    }

    @Test
    fun registerModeAsksForTheName() {
        screen()
        compose.onNodeWithText("注册").performClick()
        compose.onNodeWithText("你的名字").assertExists()
    }

    @Test
    fun theStoreRoundTripsASession() {
        val store = AuthStore(RuntimeEnvironment.getApplication())
        store.clear()
        assertNull(store.load())
        val session = AuthSession(
            baseUrl = "https://dsh.ila3.top/",
            accessToken = "access",
            refreshToken = "refresh",
            tenantId = "t1",
            role = "owner",
            email = "agent@corp.com",
            name = "Agent",
            tenants = listOf(TenantRef("t1", "售后团队", "owner"), TenantRef("t2", "第二团队", "agent")),
        )
        store.save(session)
        assertEquals(session, store.load())
        store.rememberBaseUrl(session.baseUrl)
        assertEquals(session.baseUrl, store.rememberedBaseUrl())
        store.clear()
        assertNull(store.load())
    }
}
