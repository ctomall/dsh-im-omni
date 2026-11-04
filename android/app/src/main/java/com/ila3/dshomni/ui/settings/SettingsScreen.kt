package com.ila3.dshomni.ui.settings

import android.content.Context
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Lan
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ila3.dshomni.BuildConfig
import com.ila3.dshomni.data.model.EntryKind
import com.ila3.dshomni.ui.UiState
import com.ila3.dshomni.ui.UpdateState
import com.ila3.dshomni.R
import com.ila3.dshomni.ui.common.Banner
import com.ila3.dshomni.ui.common.FieldValue
import com.ila3.dshomni.ui.common.Pill
import com.ila3.dshomni.ui.common.SectionCard
import com.ila3.dshomni.ui.theme.BrandBlue
import com.ila3.dshomni.ui.theme.BrandTeal
import com.ila3.dshomni.ui.theme.ThemeMode
import com.ila3.dshomni.notify.NotificationService
import com.ila3.dshomni.notify.Notifications
import com.ila3.dshomni.util.Times
import com.ila3.dshomni.util.formatBytes
import com.ila3.dshomni.util.installApk
import org.json.JSONObject
import com.ila3.dshomni.ui.theme.Radius
import com.ila3.dshomni.ui.theme.Spacing
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow

/** Translation targets the Host accepts; the field itself is free-form. */
private val Languages = listOf(
    "zh-CN" to "简体中文",
    "zh-TW" to "繁體中文",
    "en" to "English",
    "ja" to "日本語",
    "ko" to "한국어",
    "es" to "Español",
    "fr" to "Français",
    "de" to "Deutsch",
    "pt" to "Português",
    "ru" to "Русский",
)

/**
 * Connection, workspace switches, and the in-app updater.
 *
 * The update is published by the Host itself (`/api/im-omni.app.version`), so
 * the phone upgrades over the same LAN or public entry it already uses.
 */
/**
 * Signed-in identity, shown in the 我 tab.
 *
 * @property email account email.
 * @property tenantId current tenant.
 * @property tenants every tenant the account may enter.
 * @property role role inside the current tenant.
 */
data class AccountInfo(
    val email: String,
    val tenantId: String,
    val tenants: List<com.ila3.dshomni.data.auth.TenantRef>,
    val role: String,
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    state: UiState,
    account: AccountInfo? = null,
    onSwitchTenant: (String) -> Unit = {},
    onSignOut: () -> Unit = {},
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    onThemeMode: (ThemeMode) -> Unit = {},
    onSwitchServer: () -> Unit,
    onDisconnect: () -> Unit,
    onRefresh: () -> Unit,
    onUpdateSetting: (JSONObject, String) -> Unit,
    onCheckUpdate: () -> Unit,
    onDownloadUpdate: () -> Unit,
    onDismissUpdate: () -> Unit,
    onDismissNotice: () -> Unit,
) {
    val context = LocalContext.current
    val notifyPrefs = remember { context.getSharedPreferences("dsh_omni_notify", Context.MODE_PRIVATE) }
    var notificationsOn by remember { mutableStateOf(notifyPrefs.getBoolean("enabled", false)) }
    val permissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            notificationsOn = true
            notifyPrefs.edit().putBoolean("enabled", true).apply()
            NotificationService.start(context)
        } else {
            notificationsOn = false
            notifyPrefs.edit().putBoolean("enabled", false).apply()
        }
    }
    val snapshot = state.snapshot
    var languageOpen by remember { mutableStateOf(false) }
    val update = state.update

    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding(),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(start = 18.dp, end = 12.dp, top = 14.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("设置", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "连接、工作台与版本",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedButton(onClick = onRefresh, enabled = !state.refreshing, shape = RoundedCornerShape(Radius.sm)) {
                Icon(Icons.Rounded.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(5.dp))
                Text("同步")
            }
        }

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.md)
                .navigationBarsPadding(),
        ) {
            state.error?.let {
                Banner(it, error = true, onDismiss = onDismissNotice)
                Spacer(Modifier.height(10.dp))
            }
            state.notice?.let {
                Banner(it, error = false, onDismiss = onDismissNotice)
                Spacer(Modifier.height(10.dp))
            }

            if (account != null) {
                SectionCard(stringResource(R.string.account_title)) {
                    FieldValue(stringResource(R.string.login_email), account.email)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        stringResource(R.string.account_current),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(4.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        account.tenants.forEach { tenant ->
                            val active = tenant.id == account.tenantId
                            Text(
                                tenant.name.ifBlank { tenant.role },
                                style = MaterialTheme.typography.labelLarge,
                                color = if (active) MaterialTheme.colorScheme.onPrimary
                                else MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier
                                    .background(
                                        if (active) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.surfaceVariant,
                                        RoundedCornerShape(Radius.full),
                                    )
                                    .clickable(enabled = !active) { onSwitchTenant(tenant.id) }
                                    .padding(horizontal = 10.dp, vertical = 5.dp),
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        stringResource(R.string.account_switch_hint),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = onSignOut) {
                        Text(stringResource(R.string.account_sign_out))
                    }
                }
            }

            SectionCard("服务器") {
                Column {
                    val connection = state.connection
                    if (connection == null) {
                        FieldValue("状态", "未连接")
                    } else {
                        Row(
                            Modifier.padding(horizontal = Spacing.md, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                if (connection.isHttps) Icons.Rounded.Public else Icons.Rounded.Lan,
                                contentDescription = null,
                                tint = if (connection.isHttps) BrandBlue else BrandTeal,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(connection.label, style = MaterialTheme.typography.titleSmall)
                                Text(
                                    connection.baseUrl,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Pill(
                                when (connection.entry) {
                                    EntryKind.LAN -> "内网"
                                    EntryKind.PUBLIC -> "外网"
                                    EntryKind.CUSTOM -> "自定义"
                                },
                            )
                        }
                        FieldValue("上次同步", if (connection.lastSyncAt > 0) Times.relative(connection.lastSyncAt) else "—")
                        if (snapshot != null) {
                            FieldValue("工作台", snapshot.workspace.name)
                            FieldValue("数据版本", "rev ${snapshot.revision}")
                        }
                    }
                    Row(
                        Modifier.padding(horizontal = Spacing.md, vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Button(onClick = onSwitchServer, shape = RoundedCornerShape(Radius.sm)) {
                            Icon(Icons.Rounded.SwapHoriz, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("切换 / 新增配对")
                        }
                        OutlinedButton(onClick = onDisconnect, shape = RoundedCornerShape(Radius.sm)) {
                            Text("断开")
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            SectionCard("外观") {
                Column(Modifier.padding(horizontal = Spacing.md, vertical = 12.dp)) {
                    Text(stringResource(R.string.settings_theme_title), style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = themeMode == ThemeMode.SYSTEM,
                            onClick = { onThemeMode(ThemeMode.SYSTEM) },
                            label = { Text(stringResource(R.string.settings_theme_system)) },
                        )
                        FilterChip(
                            selected = themeMode == ThemeMode.LIGHT,
                            onClick = { onThemeMode(ThemeMode.LIGHT) },
                            label = { Text(stringResource(R.string.settings_theme_light)) },
                        )
                        FilterChip(
                            selected = themeMode == ThemeMode.DARK,
                            onClick = { onThemeMode(ThemeMode.DARK) },
                            label = { Text(stringResource(R.string.settings_theme_dark)) },
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        stringResource(R.string.settings_theme_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            SectionCard("工作台") {
                Column {
                    SwitchRow(
                        title = "自动翻译客户消息",
                        hint = "打开会话时把客户消息译为目标语言；译文由主机生成。",
                        checked = snapshot?.workspace?.autoTranslate == true,
                        enabled = snapshot != null,
                        onChange = { onUpdateSetting(JSONObject().put("autoTranslate", it), "翻译设置已更新") },
                    )
                    Divider()
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable(enabled = snapshot != null) { languageOpen = !languageOpen }
                            .padding(horizontal = Spacing.md, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("翻译目标语言", style = MaterialTheme.typography.titleSmall)
                            Text(
                                Languages.firstOrNull { it.first == snapshot?.workspace?.translationTarget }?.second
                                    ?: snapshot?.workspace?.translationTarget.orEmpty(),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text("更改", style = MaterialTheme.typography.labelSmall, color = BrandBlue)
                    }
                    if (languageOpen) {
                        Column(Modifier.padding(horizontal = Spacing.md)) {
                            Languages.chunked(2).forEach { row ->
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    row.forEach { (code, label) ->
                                        val selected = snapshot?.workspace?.translationTarget == code
                                        Surface(
                                            color = if (selected) BrandBlue.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surfaceVariant,
                                            shape = RoundedCornerShape(Radius.xs),
                                            modifier = Modifier
                                                .weight(1f)
                                                .padding(vertical = 3.dp)
                                                .clickable {
                                                    onUpdateSetting(JSONObject().put("translationTarget", code), "目标语言已更新")
                                                    languageOpen = false
                                                },
                                        ) {
                                            Text(
                                                label,
                                                fontSize = 12.sp,
                                                color = if (selected) BrandBlue else MaterialTheme.colorScheme.onSurface,
                                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                            )
                                        }
                                    }
                                }
                            }
                            Spacer(Modifier.height(6.dp))
                        }
                    }
                    Divider()
                    SwitchRow(
                        title = "AI 回复建议",
                        hint = "使用当前默认模型生成 3 条草稿，只在你点击时填入。",
                        checked = snapshot?.workspace?.aiSuggestions == true,
                        enabled = snapshot != null,
                        onChange = { onUpdateSetting(JSONObject().put("aiSuggestions", it), "AI 建议已更新") },
                    )
                    Divider()
                    SwitchRow(
                        title = "AI 自动接待",
                        hint = "新客户消息由模型自动回复；转人工后暂停。",
                        checked = snapshot?.workspace?.botEnabled == true,
                        enabled = snapshot != null,
                        onChange = {
                            onUpdateSetting(
                                JSONObject().put("bot", JSONObject().put("enabled", it)),
                                if (it) "AI 接待已开启" else "AI 接待已关闭",
                            )
                        },
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            SectionCard("后台通知") {
                Column {
                    SwitchRow(
                        title = "锁屏也能收到新消息",
                        hint = "前台服务每 30 秒同步一次；不走 FCM，内网/公网都可用。",
                        checked = notificationsOn,
                        enabled = true,
                        onChange = { want ->
                            if (!want) {
                                notificationsOn = false
                                notifyPrefs.edit().putBoolean("enabled", false).apply()
                                NotificationService.stop(context)
                                return@SwitchRow
                            }
                            if (Notifications.canPost(context)) {
                                notificationsOn = true
                                notifyPrefs.edit().putBoolean("enabled", true).apply()
                                NotificationService.start(context)
                            } else {
                                permissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                            }
                        },
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            SectionCard("客户端更新") {
                Column(Modifier.padding(Spacing.md)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("当前版本", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
                                style = MaterialTheme.typography.titleSmall,
                            )
                        }
                        Button(
                            onClick = onCheckUpdate,
                            enabled = !update.checking && !update.downloading,
                            shape = RoundedCornerShape(Radius.sm),
                        ) {
                            if (update.checking) {
                                CircularProgressIndicator(
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    modifier = Modifier.size(15.dp),
                                )
                            } else {
                                Icon(Icons.Rounded.CloudDownload, contentDescription = null, modifier = Modifier.size(16.dp))
                            }
                            Spacer(Modifier.width(6.dp))
                            Text(if (update.checking) "检查中…" else "检查更新")
                        }
                    }
                    update.error?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                    update.info?.let { info ->
                        Spacer(Modifier.height(10.dp))
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            shape = RoundedCornerShape(Radius.sm),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(Modifier.padding(Spacing.sm)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        "主机上有 ${info.versionName} (${info.versionCode})",
                                        style = MaterialTheme.typography.titleSmall,
                                        modifier = Modifier.weight(1f),
                                    )
                                    if (info.versionCode > BuildConfig.VERSION_CODE) {
                                        Pill("可升级", color = BrandTeal, background = BrandTeal.copy(alpha = 0.14f))
                                    } else {
                                        Pill("已是最新")
                                    }
                                }
                                if (info.notes.isNotBlank()) {
                                    Spacer(Modifier.height(6.dp))
                                    Text(info.notes, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "${formatBytes(info.size)} · SHA-256 校验",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Spacer(Modifier.height(10.dp))
                                when {
                                    update.ready != null -> {
                                        Button(
                                            onClick = { installApk(context, update.ready) },
                                            shape = RoundedCornerShape(Radius.sm),
                                            modifier = Modifier.fillMaxWidth(),
                                        ) {
                                            Text("安装 ${info.versionName}")
                                        }
                                        Spacer(Modifier.height(6.dp))
                                        Text(
                                            "如果系统拦截，请在设置里允许本应用安装未知来源应用。",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    update.downloading -> {
                                        LinearProgressIndicator(
                                            progress = { update.progress },
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                        Spacer(Modifier.height(6.dp))
                                        Text(
                                            "${formatBytes(update.received)} / ${formatBytes(update.total)}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    else -> {
                                        Button(
                                            onClick = onDownloadUpdate,
                                            enabled = info.versionCode > BuildConfig.VERSION_CODE,
                                            shape = RoundedCornerShape(Radius.sm),
                                            modifier = Modifier.fillMaxWidth(),
                                        ) {
                                            Text(if (info.versionCode > BuildConfig.VERSION_CODE) "下载并安装" else "无需更新")
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "安装包由你的 DSH 主机通过当前连接下发，不经过第三方应用商店。",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            SectionCard("关于") {
                Column {
                    FieldValue("应用", "DSH 全渠道 IM for Android")
                    FieldValue("包名", BuildConfig.APPLICATION_ID)
                    FieldValue("插件", "dsh-im-omni（左侧栏同一套数据）")
                    FieldValue("数据文件", snapshot?.dataFile.orEmpty().ifBlank { "—" })
                    FieldValue("服务端时间", snapshot?.serverTime?.let { Times.stamp(it) } ?: "—")
                }
            }

            Spacer(Modifier.height(14.dp))
            Row(Modifier.padding(horizontal = Spacing.xxs), verticalAlignment = Alignment.Top) {
                Icon(Icons.Rounded.Info, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    "翻译与 AI 建议会把消息文本发送给主机配置的提供方；对数据出境敏感的场景请在主机侧改用本地或企业模型。",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(30.dp))
        }
    }

    LaunchedEffect(state.update.ready) {
        // Nothing to do: installation is an explicit user action.
    }
}

@Composable
private fun SwitchRow(
    title: String,
    hint: String,
    checked: Boolean,
    enabled: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.md, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(
                hint,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(10.dp))
        Switch(checked = checked, enabled = enabled, onCheckedChange = onChange)
    }
}

@Composable
private fun Divider() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
    )
}
