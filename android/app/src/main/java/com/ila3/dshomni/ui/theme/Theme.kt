package com.ila3.dshomni.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
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
    primary = Color(0xFF6C9BFF),
    onPrimary = Color(0xFF06122B),
    primaryContainer = Color(0xFF1B3A7A),
    onPrimaryContainer = Color(0xFFDCE6FF),
    secondary = Color(0xFF2FD0BC),
    onSecondary = Color(0xFF04231F),
    secondaryContainer = Color(0xFF123B36),
    onSecondaryContainer = Color(0xFFB9F2EA),
    tertiary = Color(0xFF9B8CFF),
    background = Color(0xFF080E18),
    onBackground = Color(0xFFE7EDF7),
    surface = Color(0xFF111A2A),
    onSurface = Color(0xFFE7EDF7),
    surfaceVariant = Color(0xFF1A2638),
    onSurfaceVariant = Color(0xFFA9B8CE),
    surfaceContainer = Color(0xFF162034),
    outline = Color(0xFF2C3B54),
    outlineVariant = Color(0xFF213048),
    error = Color(0xFFFF6B7A),
    onError = Color(0xFF2A0509),
)

private val LightScheme = lightColorScheme(
    primary = Color(0xFF2F6BFF),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDDE7FF),
    onPrimaryContainer = Color(0xFF0A2459),
    secondary = Color(0xFF0E9E8D),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFCFF3EE),
    onSecondaryContainer = Color(0xFF04322C),
    tertiary = Color(0xFF6A4CF6),
    background = Color(0xFFF4F7FC),
    onBackground = Color(0xFF111A2A),
    surface = Color.White,
    onSurface = Color(0xFF111A2A),
    surfaceVariant = Color(0xFFEDF1F9),
    onSurfaceVariant = Color(0xFF5A6880),
    surfaceContainer = Color(0xFFFFFFFF),
    outline = Color(0xFFC8D2E4),
    outlineVariant = Color(0xFFE0E7F3),
    error = Color(0xFFD92D3F),
    onError = Color.White,
)

/** Slightly tighter Material 3 type for dense inbox rows. */
private val AppTypography = Typography(
    headlineSmall = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.2).sp),
    titleLarge = TextStyle(fontSize = 19.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium),
    bodyLarge = TextStyle(fontSize = 15.sp),
    bodyMedium = TextStyle(fontSize = 13.5.sp),
    bodySmall = TextStyle(fontSize = 12.sp),
    labelLarge = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium),
)

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
fun DshOmniTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val scheme = if (dark) DarkScheme else LightScheme
    val view = LocalView.current
    val activity = LocalContext.current.findActivity()
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
    MaterialTheme(colorScheme = scheme, typography = AppTypography) {
        Surface(color = scheme.background, modifier = Modifier.fillMaxSize()) {
            content()
        }
    }
}
