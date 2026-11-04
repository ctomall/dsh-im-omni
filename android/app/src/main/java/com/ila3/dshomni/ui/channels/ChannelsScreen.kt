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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Hub
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ila3.dshomni.R
import com.ila3.dshomni.data.model.Channel
import com.ila3.dshomni.ui.UiState
import com.ila3.dshomni.ui.common.HealthDot
import com.ila3.dshomni.ui.common.Pill
import com.ila3.dshomni.ui.common.PlatformBadge
import com.ila3.dshomni.ui.theme.BrandBlue
import com.ila3.dshomni.ui.theme.Radius
import com.ila3.dshomni.ui.theme.Spacing
import com.ila3.dshomni.util.Labels

/**
 * Accounts tab: every messaging account the Host can send and receive on.
 *
 * This is the IM reading of what used to be a "channels" admin page: one row
 * per account, its access method, its health, and the actions an operator
 * actually needs (pause / resume, test the connection, open its settings).
 */
@Composable
fun ChannelsScreen(
    state: UiState,
    onOpen: (Channel) -> Unit,
    onAdd: () -> Unit,
    onToggleStatus: (Channel) -> Unit = {},
    onTest: (Channel) -> Unit = {},
) {
    val snapshot = state.snapshot
    val channels = snapshot?.channels.orEmpty().sortedBy { it.name }
    val connected = channels.count { it.isConnected }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Surface(color = MaterialTheme.colorScheme.surface) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(start = Spacing.md, end = Spacing.xxs, top = Spacing.xs, bottom = Spacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.accounts_title),
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        stringResource(R.string.accounts_summary, channels.size, connected),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Button(
                    onClick = onAdd,
                    shape = RoundedCornerShape(Radius.xs),
                    modifier = Modifier.padding(end = Spacing.xxs),
                ) {
                    Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(stringResource(R.string.accounts_add))
                }
            }
        }

        when {
            snapshot == null -> EmptyPane(
                title = stringResource(R.string.accounts_no_server),
                hint = stringResource(R.string.accounts_no_server_hint),
            )
            channels.isEmpty() -> Column(
                Modifier
                    .fillMaxSize()
                    .padding(horizontal = Spacing.lg),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                EmptyPane(
                    title = stringResource(R.string.accounts_empty_title),
                    hint = stringResource(R.string.accounts_empty_hint),
                )
                Button(onClick = onAdd, shape = RoundedCornerShape(Radius.xs)) {
                    Text(stringResource(R.string.accounts_empty_cta))
                }
            }
            else -> LazyColumn(Modifier.fillMaxSize()) {
                items(channels, key = { it.id }) { channel ->
                    AccountRow(
                        channel = channel,
                        onOpen = { onOpen(channel) },
                        onToggleStatus = { onToggleStatus(channel) },
                        onTest = { onTest(channel) },
                    )
                }
            }
        }
    }
}

@Composable
private fun AccountRow(
    channel: Channel,
    onOpen: () -> Unit,
    onToggleStatus: () -> Unit,
    onTest: () -> Unit,
) {
    var menuOpen by remember(channel.id) { mutableStateOf(false) }
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onOpen)
            .padding(start = Spacing.md, end = Spacing.xxs, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PlatformBadge(channel.badge, channel.hue, size = 44.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    channel.name,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Spacer(Modifier.width(6.dp))
                if (channel.isPaused) {
                    Pill(stringResource(R.string.accounts_paused))
                } else if (channel.official) {
                    Pill(
                        stringResource(R.string.accounts_official),
                        color = BrandBlue,
                        background = BrandBlue.copy(alpha = 0.12f),
                    )
                }
            }
            Spacer(Modifier.height(2.dp))
            // Access method: what the account is connected through, then health.
            Text(
                Labels.channelType(channel.type),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                HealthDot(channel.health, size = 7.dp)
                Spacer(Modifier.width(5.dp))
                Text(
                    Labels.health(channel.health),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    stringResource(R.string.accounts_traffic, channel.inbound, channel.outbound),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Box {
            IconButton(onClick = { menuOpen = true }) {
                Icon(
                    Icons.Rounded.MoreVert,
                    contentDescription = stringResource(R.string.accounts_config),
                    tint = MaterialTheme.colorScheme.outline,
                )
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = {
                        Text(
                            stringResource(
                                if (channel.isPaused) R.string.accounts_resume else R.string.accounts_pause,
                            ),
                        )
                    },
                    onClick = { menuOpen = false; onToggleStatus() },
                )
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.accounts_test)) },
                    onClick = { menuOpen = false; onTest() },
                )
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.accounts_config)) },
                    onClick = { menuOpen = false; onOpen() },
                )
            }
        }
    }
}

@Composable
private fun EmptyPane(title: String, hint: String) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(Spacing.xxl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Rounded.Hub,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.outline,
            modifier = Modifier.size(40.dp),
        )
        Spacer(Modifier.height(Spacing.xs))
        Text(title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(6.dp))
        Text(
            hint,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
