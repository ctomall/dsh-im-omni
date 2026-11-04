package com.ila3.dshomni.ui.channels

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ila3.dshomni.data.model.Platform
import com.ila3.dshomni.data.model.PlatformField
import com.ila3.dshomni.ui.UiState
import com.ila3.dshomni.ui.common.PlatformBadge
import com.ila3.dshomni.ui.common.Pill
import com.ila3.dshomni.ui.theme.BrandBlue
import com.ila3.dshomni.ui.theme.BrandTeal
import com.ila3.dshomni.ui.theme.Radius
import com.ila3.dshomni.ui.theme.Spacing

/**
 * Bind a new channel from the phone.
 *
 * Step one picks the platform; step two renders the exact fields the Host
 * catalog declares, so the phone never invents a form the Host cannot validate.
 */
@Composable
fun AddChannelScreen(
    state: UiState,
    onBack: () -> Unit,
    onCreate: (name: String, type: String, description: String, config: Map<String, String>) -> Unit,
    initialPlatformId: String? = null,
) {
    val platforms = state.snapshot?.platforms.orEmpty()
    var selected by remember {
        mutableStateOf(initialPlatformId?.let { id -> platforms.firstOrNull { it.id == id } })
    }
    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    val values = remember { mutableStateMapOf<String, String>() }
    var revealed by remember { mutableStateOf(setOf<String>()) }
    var setupExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(selected?.id) {
        val platform = selected ?: return@LaunchedEffect
        values.clear()
        platform.fields.forEach { field ->
            if (field.type == "select" && field.options.isNotEmpty()) {
                values[field.key] = field.options.first().value
            }
        }
    }

    val submitting = state.busyAction == "channel.create"

    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .imePadding(),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(start = Spacing.xxs, end = 12.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { if (selected == null) onBack() else selected = null }) {
                Icon(Icons.Rounded.ArrowBack, contentDescription = "返回")
            }
            Column(Modifier.weight(1f)) {
                Text(
                    if (selected == null) "添加渠道" else "接入 ${selected!!.label.zh}",
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    if (selected == null) "选择一个要接入的平台" else "填写平台凭据，之后可以随时修改",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (selected == null) {
            if (platforms.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("主机没有返回平台目录", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        start = 14.dp, end = 14.dp, top = 6.dp, bottom = 24.dp,
                    ),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(platforms, key = { it.id }) { platform ->
                        PlatformCard(platform) { selected = platform }
                    }
                }
            }
            return@Column
        }

        val platform = selected!!
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.md),
        ) {
            Spacer(Modifier.height(4.dp))
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                shape = RoundedCornerShape(Radius.md),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { setupExpanded = !setupExpanded },
            ) {
                Column(Modifier.padding(Spacing.sm)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "平台侧配置步骤",
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.weight(1f),
                        )
                        Icon(
                            Icons.Rounded.ExpandMore,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (setupExpanded) {
                        Spacer(Modifier.height(8.dp))
                        platform.steps(chinese = true).forEachIndexed { index, step ->
                            Row(Modifier.padding(bottom = 5.dp)) {
                                Text(
                                    "${index + 1}.",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = BrandBlue,
                                    modifier = Modifier.width(16.dp),
                                )
                                Text(
                                    step,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(14.dp))
            OutlinedTextField(
                value = name,
                onValueChange = { name = it.take(40); localError = null },
                label = { Text("渠道名称") },
                placeholder = { Text("例如：售后 WhatsApp") },
                singleLine = true,
                shape = RoundedCornerShape(Radius.md),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = description,
                onValueChange = { description = it.take(140) },
                label = { Text("备注（可选）") },
                singleLine = true,
                shape = RoundedCornerShape(Radius.md),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(14.dp))

            platform.fields.forEach { field ->
                FieldInput(
                    field = field,
                    value = values[field.key].orEmpty(),
                    revealed = revealed.contains(field.key),
                    onChange = { values[field.key] = it; localError = null },
                    onToggleReveal = {
                        revealed = if (revealed.contains(field.key)) revealed - field.key else revealed + field.key
                    },
                )
                Spacer(Modifier.height(10.dp))
            }

            localError?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
            }
            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
            }

            Button(
                onClick = {
                    val missing = platform.fields.firstOrNull { field ->
                        val effective = values[field.key].orEmpty().ifBlank {
                            field.options.firstOrNull()?.value.orEmpty()
                        }
                        field.required && !field.secret && effective.isBlank()
                    }
                    when {
                        name.isBlank() -> localError = "请填写渠道名称。"
                        missing != null -> localError = "请填写「${missing.label.zh}」。"
                        else -> onCreate(name, platform.id, description, values.toMap())
                    }
                },
                enabled = !submitting,
                shape = RoundedCornerShape(Radius.md),
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (submitting) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Text(if (submitting) "正在接入…" else "保存并接入")
            }
            Spacer(Modifier.height(28.dp))
        }
    }
}

@Composable
private fun PlatformCard(platform: Platform, onClick: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(Radius.lg),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Column(Modifier.padding(Spacing.sm)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PlatformBadge(platform.badge, platform.hue, size = 34.dp)
                Spacer(Modifier.weight(1f))
                if (platform.capabilities.contains("qr")) {
                    Pill("扫码", color = BrandTeal, background = BrandTeal.copy(alpha = 0.12f))
                } else if (platform.official) {
                    Pill("官方", color = BrandBlue, background = BrandBlue.copy(alpha = 0.12f))
                }
            }
            Spacer(Modifier.height(9.dp))
            Text(
                platform.label.zh,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(3.dp))
            Text(
                platform.caption.zh,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun FieldInput(
    field: PlatformField,
    value: String,
    revealed: Boolean,
    onChange: (String) -> Unit,
    onToggleReveal: () -> Unit,
) {
    if (field.type == "select" && field.options.isNotEmpty()) {
        var open by remember { mutableStateOf(false) }
        val current = field.options.firstOrNull { it.value == value } ?: field.options.first()
        Column {
            Text(
                "${field.label.zh}${if (field.required) " *" else ""}",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 2.dp, bottom = 6.dp),
            )
            // A read-only OutlinedTextField still consumes the tap, which is why
            // the dropdown never opened; a card makes the affordance honest too.
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                shape = RoundedCornerShape(Radius.md),
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { open = true },
            ) {
                Row(
                    Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        current.label.zh,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.weight(1f),
                    )
                    Icon(
                        Icons.Rounded.ExpandMore,
                        contentDescription = "展开",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
            if (field.hint.zh.isNotBlank()) {
                Text(
                    field.hint.zh,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 2.dp, top = 4.dp),
                )
            }
        }
        // The menu is anchored outside the card so it is not clipped by the
        // scroll container's measurement of the field.
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            field.options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label.zh) },
                    onClick = {
                        onChange(option.value)
                        open = false
                    },
                )
            }
        }
        return
    }

    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text("${field.label.zh}${if (field.required) " *" else ""}") },
        placeholder = { if (field.placeholder.isNotBlank()) Text(field.placeholder) },
        supportingText = {
            if (field.hint.zh.isNotBlank()) {
                Text(field.hint.zh, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else if (field.auto) {
                Text("留空由主机自动生成", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        singleLine = true,
        visualTransformation = if (field.secret && !revealed) {
            PasswordVisualTransformation()
        } else {
            VisualTransformation.None
        },
        keyboardOptions = KeyboardOptions(
            keyboardType = if (field.secret) KeyboardType.Password else KeyboardType.Text,
            imeAction = ImeAction.Next,
        ),
        trailingIcon = {
            if (field.secret) {
                IconButton(onClick = onToggleReveal) {
                    Icon(
                        if (revealed) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                        contentDescription = if (revealed) "隐藏" else "显示",
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        },
        shape = RoundedCornerShape(Radius.md),
        modifier = Modifier.fillMaxWidth(),
    )
}
