package com.ila3.dshomni.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ila3.dshomni.ui.theme.BrandBlue
import com.ila3.dshomni.ui.theme.BrandTeal
import com.ila3.dshomni.ui.theme.HealthBad
import com.ila3.dshomni.ui.theme.HealthOk
import com.ila3.dshomni.ui.theme.HealthWarn
import com.ila3.dshomni.util.hueColor
import com.ila3.dshomni.util.initialsOf
import com.ila3.dshomni.ui.theme.Radius
import com.ila3.dshomni.ui.theme.Spacing

/** Square platform chip using the catalog badge and hue. */
@Composable
fun PlatformBadge(badge: String, hue: Int, size: Dp = 40.dp) {
    val base = hueColor(hue, saturation = 0.62f, value = 0.92f)
    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.3f))
            .background(Brush.linearGradient(listOf(base, base.copy(alpha = 0.72f)))),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = badge.ifBlank { "IM" }.take(2).uppercase(),
            color = Color.White,
            fontSize = (size.value * 0.32f).sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

/** Circular contact avatar with initials over the contact's stable hue. */
@Composable
fun Avatar(name: String, hue: Int, size: Dp = 46.dp) {
    val base = hueColor(hue, saturation = 0.42f, value = if (isDark()) 0.78f else 0.86f)
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(base.copy(alpha = 0.22f))
            .border(1.dp, base.copy(alpha = 0.45f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initialsOf(name),
            color = base,
            fontSize = (size.value * 0.36f).sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun isDark(): Boolean = !MaterialTheme.colorScheme.background.luminanceHigh()

private fun Color.luminanceHigh(): Boolean =
    (0.299f * red + 0.587f * green + 0.114f * blue) > 0.6f

/** Small status dot for channel health. */
@Composable
fun HealthDot(health: String, size: Dp = 8.dp) {
    val color = when (health) {
        "connected" -> HealthOk
        "error" -> HealthBad
        else -> HealthWarn
    }
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .background(color),
    )
}

/** Rounded label chip. */
@Composable
fun Pill(
    text: String,
    color: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    background: Color = MaterialTheme.colorScheme.surfaceVariant,
    modifier: Modifier = Modifier,
) {
    Surface(color = background, shape = RoundedCornerShape(Radius.full), modifier = modifier) {
        Text(
            text = text,
            color = color,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(horizontal = Spacing.xs, vertical = 3.dp),
            maxLines = 1,
        )
    }
}

/** Bordered card group with an optional small header. */
@Composable
fun SectionCard(
    title: String? = null,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxWidth()) {
        if (title != null) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = Spacing.xxs, bottom = 8.dp),
            )
        }
        Surface(
            color = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(Radius.xl),
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(content = content)
        }
    }
}

/** One label/value row inside a [SectionCard]. */
@Composable
fun FieldValue(label: String, value: String, mono: Boolean = false) {
    if (value.isBlank()) return
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.md, vertical = 11.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(96.dp),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            fontFamily = if (mono) FontFamily.Monospace else null,
            modifier = Modifier.weight(1f),
        )
    }
}

/** Centered empty placeholder. */
@Composable
fun EmptyState(
    title: String,
    hint: String,
    icon: ImageVector = Icons.Rounded.Inbox,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.xxl, vertical = 56.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(RoundedCornerShape(22.dp))
                .background(
                    Brush.linearGradient(
                        listOf(BrandBlue.copy(alpha = 0.16f), BrandTeal.copy(alpha = 0.16f)),
                    ),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(28.dp))
        }
        Spacer(Modifier.height(14.dp))
        Text(title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(6.dp))
        Text(
            hint,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

/** Full-height spinner used before the first snapshot lands. */
@Composable
fun LoadingPane(label: String = "正在同步…") {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 80.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(strokeWidth = 2.5.dp, modifier = Modifier.size(28.dp))
        Spacer(Modifier.height(12.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Dismissible inline banner for errors and confirmations. */
@Composable
fun Banner(message: String, error: Boolean, onDismiss: () -> Unit) {
    val accent = if (error) MaterialTheme.colorScheme.error else BrandTeal
    Surface(
        color = accent.copy(alpha = 0.12f),
        shape = RoundedCornerShape(Radius.md),
        border = androidx.compose.foundation.BorderStroke(1.dp, accent.copy(alpha = 0.3f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Rounded.ErrorOutline,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(16.dp),
            )
            Spacer(Modifier.width(10.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            IconButton(onClick = onDismiss, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Rounded.Close, contentDescription = "关闭", modifier = Modifier.size(16.dp))
            }
        }
    }
}

/** Section header with an optional trailing action. */
@Composable
fun SectionHeader(title: String, action: (@Composable () -> Unit)? = null) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Spacing.xxs, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        action?.invoke()
    }
}
