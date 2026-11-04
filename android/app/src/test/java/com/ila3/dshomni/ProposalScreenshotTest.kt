package com.ila3.dshomni

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.ila3.dshomni.ui.PreviewData
import com.ila3.dshomni.ui.inbox.InboxScreen
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

/**
 * Design proposal renders — NOT part of the shipped UI.
 *
 * The visual refresh direction is still an open question, so this test renders
 * the real inbox compose tree under two candidate colour schemes (Harbor and
 * Graphite) in both light and dark. The output PNGs are what the product owner
 * picks from; nothing here touches production code.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "zh-rCN-w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ProposalScreenshotTest {

    private val harborDark = darkColorScheme(
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

    private val harborLight = lightColorScheme(
        primary = Color(0xFF2A64E8),
        onPrimary = Color.White,
        primaryContainer = Color(0xFFDCE7FF),
        onPrimaryContainer = Color(0xFF08204F),
        // 0B8574 instead of 0E9E8D: the lighter teal is 3.34:1 on white, below AA
        // for small text; this one reaches 4.54:1.
        secondary = Color(0xFF0B8574),
        onSecondary = Color.White,
        secondaryContainer = Color(0xFFCFF3EE),
        onSecondaryContainer = Color(0xFF04322C),
        background = Color(0xFFF5F8FD),
        onBackground = Color(0xFF0F1726),
        surface = Color(0xFFFFFFFF),
        onSurface = Color(0xFF0F1726),
        surfaceVariant = Color(0xFFECF1FA),
        onSurfaceVariant = Color(0xFF54637A),
        surfaceContainer = Color(0xFFFFFFFF),
        outline = Color(0xFFC6D1E4),
        error = Color(0xFFC92A3C),
        onError = Color.White,
    )

    private val graphiteDark = darkColorScheme(
        primary = Color(0xFFFFB020),
        onPrimary = Color(0xFF261A00),
        primaryContainer = Color(0xFF4A3300),
        onPrimaryContainer = Color(0xFFFFE7B8),
        secondary = Color(0xFF8AB4F8),
        onSecondary = Color(0xFF0A1B33),
        secondaryContainer = Color(0xFF1D2C44),
        onSecondaryContainer = Color(0xFFD3E3FF),
        tertiary = Color(0xFFC7A0FF),
        background = Color(0xFF101113),
        onBackground = Color(0xFFECEDEE),
        surface = Color(0xFF181A1D),
        onSurface = Color(0xFFECEDEE),
        surfaceVariant = Color(0xFF23262A),
        onSurfaceVariant = Color(0xFFA8ADB5),
        surfaceContainer = Color(0xFF1D1F23),
        outline = Color(0xFF33373D),
        outlineVariant = Color(0xFF26292E),
        error = Color(0xFFFF8A80),
        onError = Color(0xFF2B0000),
    )

    private val graphiteLight = lightColorScheme(
        primary = Color(0xFF8A5A00),
        onPrimary = Color.White,
        primaryContainer = Color(0xFFFFE7B8),
        onPrimaryContainer = Color(0xFF2B1D00),
        secondary = Color(0xFF1F5FD0),
        onSecondary = Color.White,
        secondaryContainer = Color(0xFFDCE6FF),
        onSecondaryContainer = Color(0xFF0A2044),
        background = Color(0xFFFAFAF9),
        onBackground = Color(0xFF1B1C1E),
        surface = Color(0xFFFFFFFF),
        onSurface = Color(0xFF1B1C1E),
        surfaceVariant = Color(0xFFF0F0EE),
        onSurfaceVariant = Color(0xFF5C5F63),
        surfaceContainer = Color(0xFFFFFFFF),
        outline = Color(0xFFD3D4D2),
        error = Color(0xFFB3261E),
        onError = Color.White,
    )

    @Test
    fun captureHarborDark() = render("proposal-harbor-dark.png", harborDark)

    @Test
    fun captureHarborLight() = render("proposal-harbor-light.png", harborLight)

    @Test
    fun captureGraphiteDark() = render("proposal-graphite-dark.png", graphiteDark)

    @Test
    fun captureGraphiteLight() = render("proposal-graphite-light.png", graphiteLight)

    private fun render(name: String, scheme: androidx.compose.material3.ColorScheme) {
        val activity = Robolectric.buildActivity(ComponentActivity::class.java).setup().get()
        activity.setContent {
            MaterialTheme(colorScheme = scheme) {
                Surface(color = scheme.background, modifier = Modifier.fillMaxSize()) {
                    InboxScreen(
                        state = PreviewData.paired,
                        onOpen = { },
                        onRefresh = { },
                        onSwitchServer = { },
                        onDismiss = { },
                    )
                }
            }
        }
        val root: View = activity.window.decorView
        root.measure(
            View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(2340, View.MeasureSpec.EXACTLY),
        )
        root.layout(0, 0, 1080, 2340)
        val bitmap = Bitmap.createBitmap(1080, 2340, Bitmap.Config.ARGB_8888)
        root.draw(Canvas(bitmap))
        val dir = File("build/screenshots").apply { mkdirs() }
        FileOutputStream(File(dir, name)).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
