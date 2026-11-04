package com.ila3.dshomni.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import android.provider.Settings
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import android.content.Context
import android.content.ContextWrapper

/** Plugin brand: the web sidebar icon's blue-to-teal sweep. */
val BrandBlue = Color(0xFF07C160)
val BrandTeal = Color(0xFF06AD56)
val BrandViolet = Color(0xFF576B95)

/** Health colors shared by channel rows and dots. */
val HealthOk = Color(0xFF2CD4A0)
val HealthWarn = Color(0xFFFFB020)
val HealthBad = Color(0xFFFF5D6C)

private val DarkScheme = darkColorScheme(
    primary = Color(0xFF07C160),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF123A24),
    onPrimaryContainer = Color(0xFFB8F2CE),
    secondary = Color(0xFF06AD56),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFF10301D),
    onSecondaryContainer = Color(0xFFA9EAC4),
    tertiary = Color(0xFF576B95),
    background = Color(0xFF111111),
    onBackground = Color(0xFFD6D6D6),
    surface = Color(0xFF191919),
    onSurface = Color(0xFFD6D6D6),
    surfaceVariant = Color(0xFF2C2C2C),
    onSurfaceVariant = Color(0xFF7A7A7A),
    surfaceContainer = Color(0xFF1E1E1E),
    outline = Color(0xFF2E2E2E),
    outlineVariant = Color(0xFF252525),
    error = Color(0xFFFA5151),
    onError = Color.White,
)

private val LightScheme = lightColorScheme(
    primary = Color(0xFF07C160),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDDF6E8),
    onPrimaryContainer = Color(0xFF07331A),
    secondary = Color(0xFF06AD56),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE6F8EE),
    onSecondaryContainer = Color(0xFF0A3D21),
    tertiary = Color(0xFF576B95),
    background = Color(0xFFEDEDED),
    onBackground = Color(0xFF191919),
    surface = Color.White,
    onSurface = Color(0xFF191919),
    surfaceVariant = Color(0xFFF7F7F7),
    onSurfaceVariant = Color(0xFF888888),
    surfaceContainer = Color(0xFFFFFFFF),
    outline = Color(0xFFE5E5E5),
    outlineVariant = Color(0xFFF0F0F0),
    error = Color(0xFFFA5151),
    onError = Color.White,
)


/** Whether the active scheme is the dark one (used by the bubble colours). */
@Composable
private fun isDarkScheme(): Boolean = MaterialTheme.colorScheme.background.luminance() < 0.5f

/** WeChat's outgoing bubble: pale green on light, deeper green on dark. */
@Composable
fun bubbleOutColor(): Color = if (isDarkScheme()) Color(0xFF3EB575) else Color(0xFF95EC69)

/** Text/icon colour inside the outgoing bubble. */
@Composable
fun onBubbleOut(): Color = if (isDarkScheme()) Color.White else Color(0xFF191919)

/** WeChat's incoming bubble: white on light, #2C2C2C on dark. */
@Composable
fun bubbleInColor(): Color = if (isDarkScheme()) Color(0xFF2C2C2C) else Color.White

/** Text colour inside the incoming bubble. */
@Composable
fun onBubbleIn(): Color = if (isDarkScheme()) Color(0xFFD6D6D6) else Color(0xFF191919)

/** Text/icon colour on top of a warning-tinted surface, per scheme. */
@Composable
fun warningInk(): Color = if (MaterialTheme.colorScheme.background.luminance() < 0.5f) {
    Color(0xFFFFD9A0)
} else {
    Color(0xFFB07A00)
}

/** Muted white used on the brand gradient (headline subtitle, sent stamp). */
val OnBrandMuted = Color(0xB8FFFFFF)

/** The decorative gradient used by avatars, headers, and the send button. */
@Composable
fun brandGradient(): Brush = Brush.linearGradient(listOf(BrandBlue, BrandTeal))

/** The warmer gradient used for AI affordances. */
fun aiGradient(): Brush = Brush.linearGradient(listOf(BrandViolet, BrandBlue))

/** Walk context wrappers to the hosting Activity (Robolectric previews wrap it). */
private fun Context.findActivity(): Activity? {
    var current: Context? = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return current as? Activity
}

@Composable
fun DshOmniTheme(
    mode: ThemeMode = ThemeMode.SYSTEM,
    content: @Composable () -> Unit,
) {
    // SYSTEM keeps the pre-existing behaviour; the other modes are the in-app
    // override added in 0.4.0.
    val dark = when (mode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val scheme = if (dark) DarkScheme else LightScheme
    val view = LocalView.current
    val context = LocalContext.current
    val activity = context.findActivity()
    // Developer options / accessibility: "Remove animations" sets this to 0.
    // Screens read LocalReduceMotion and settle on the final state instead.
    val reduceMotion = remember(context) {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    if (!view.isInEditMode && activity != null) {
        SideEffect {
            val window = activity.window
            WindowCompat.setDecorFitsSystemWindows(window, false)
            window.statusBarColor = Color.Transparent.toArgb()
            window.navigationBarColor = Color.Transparent.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        }
    }
    CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
        MaterialTheme(colorScheme = scheme, typography = AppTypography) {
            Surface(color = scheme.background, modifier = Modifier.fillMaxSize()) {
                content()
            }
        }
    }
}
