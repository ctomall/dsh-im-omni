package com.ila3.dshomni

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.ila3.dshomni.data.remote.PairingTarget
import com.ila3.dshomni.ui.OmniViewModel
import com.ila3.dshomni.ui.RootApp
import com.ila3.dshomni.ui.theme.DshOmniTheme
import com.ila3.dshomni.ui.theme.ThemeMode
import com.ila3.dshomni.ui.theme.ThemeStore
import androidx.compose.runtime.remember

/** Single activity; pairing links can arrive as a cold start or a new intent. */
class MainActivity : ComponentActivity() {

    private val viewModel: OmniViewModel by viewModels()
    private var deepLink by mutableStateOf<PairingTarget?>(null)
    private var openConversation by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        deepLink = pairingFrom(intent)
        openConversation = intent.getStringExtra(EXTRA_CONVERSATION_ID)
        setContent {
            var themeMode by remember { mutableStateOf(ThemeStore.load(this)) }
            DshOmniTheme(mode = themeMode) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    RootApp(
                        viewModel = viewModel,
                        deepLink = deepLink,
                        openConversationId = openConversation,
                        themeMode = themeMode,
                        onThemeMode = { mode: ThemeMode ->
                            themeMode = mode
                            ThemeStore.save(this, mode)
                        },
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        pairingFrom(intent)?.let { deepLink = it }
        intent.getStringExtra(EXTRA_CONVERSATION_ID)?.let { openConversation = it }
    }

    /**
     * Accept `dshomni://pair?base=<url>&code=<code>` (what the desktop offers
     * as a fallback when the QR camera is unavailable).
     */
    private fun pairingFrom(intent: Intent?): PairingTarget? {
        val uri: Uri = intent?.data ?: return null
        if (uri.scheme != "dshomni" || uri.host != "pair") return null
        val base = uri.getQueryParameter("base")
        val code = uri.getQueryParameter("code").orEmpty()
        if (base.isNullOrBlank()) return null
        val normalized = PairingTarget.normalizeBase(base) ?: return null
        return PairingTarget(normalized, code.filter { it.isLetterOrDigit() || it == '-' })
    }

    companion object {
        /** Extra set by the notification so a tap lands on the conversation. */
        const val EXTRA_CONVERSATION_ID = "com.ila3.dshomni.CONVERSATION_ID"
    }
}
