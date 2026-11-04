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
val BrandBlue = Color(0xFF2F6BFF)
val BrandTeal = Color(0xFF16B8A6)
val BrandViolet = Color(0xFF7B5CFF)

/** Health colors shared by channel rows and dots. */
val HealthOk = Color(0xFF2CD4A0)
val HealthWarn = Color(0xFFFFB020)
val HealthBad = Color(0xFFFF5D6C)

private val DarkScheme = darkColorScheme(
    primary = Color(0xFF4C8DFF),
    onPrimary = Color(0xFF04101F),
    primaryContainer = Color(0xFF16335F),
    onPrimaryContainer = Color(0xFFD8E6FF),
    secondary = Color(0xFF2BC7B4),
    onSecondary = Color(0xFF03231F),
    secondaryContainer = Color(0xFF0F3A35),
    onSecondaryContainer = Color(0xFFB7F1E8),
    tertiary = Color(0xFF9A8CFF),
    background = Color(0xFF0B1220),
    onBackground = Color(0xFFE8EEF9),
    surface = Color(0xFF121B2E),
    onSurface = Color(0xFFE8EEF9),
    surfaceVariant = Color(0xFF1A2438),
    onSurfaceVariant = Color(0xFFA9B9D0),
    surfaceContainer = Color(0xFF162034),
    outline = Color(0xFF2A3A55),
    outlineVariant = Color(0xFF1F2C42),
    error = Color(0xFFFF6B7A),
    onError = Color(0xFF2A0509),
)

private val LightScheme = lightColorScheme(
    primary = Color(0xFF2A64E8),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCE7FF),
    onPrimaryContainer = Color(0xFF08204F),
    // #0B8574 is 4.54:1 on white; the older #0E9E8D was 3.34:1 and failed AA.
    secondary = Color(0xFF0B8574),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFCFF3EE),
    onSecondaryContainer = Color(0xFF04322C),
    tertiary = Color(0xFF6A4CF6),
    background = Color(0xFFF5F8FD),
    onBackground = Color(0xFF0F1726),
    surface = Color.White,
    onSurface = Color(0xFF0F1726),
    surfaceVariant = Color(0xFFECF1FA),
    onSurfaceVariant = Color(0xFF54637A),
    surfaceContainer = Color(0xFFFFFFFF),
    outline = Color(0xFFC6D1E4),
    outlineVariant = Color(0xFFE0E7F3),
    error = Color(0xFFC92A3C),
    onError = Color.White,
)

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
