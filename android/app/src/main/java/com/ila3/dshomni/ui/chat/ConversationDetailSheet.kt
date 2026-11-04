package com.ila3.dshomni.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ila3.dshomni.R
import com.ila3.dshomni.data.model.Conversation
import com.ila3.dshomni.data.model.Snapshot
import com.ila3.dshomni.ui.theme.HealthWarn
import com.ila3.dshomni.ui.theme.Radius
import com.ila3.dshomni.ui.theme.Spacing
import java.util.concurrent.TimeUnit

/**
 * Conversation details as a bottom sheet.
 *
 * The IM surface (list + chat) stays clean; the support-specific fields — status,
 * assignee, priority, tags, SLA — live here. Every control maps onto the
 * existing `conversation.update` / `conversation.bot` commands, so no endpoint
 * or data shape changes.
 */
@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun ConversationDetailSheet(
    conversation: Conversation,
    snapshot: Snapshot,
    channelName: String,
    onDismiss: () -> Unit,
    onSetStatus: (String) -> Unit,
    onAssign: (String) -> Unit,
    onSetPriority: (String) -> Unit,
    onSetBotPaused: (Boolean) -> Unit,
    onMarkRead: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.md)
                .padding(bottom = Spacing.xl),
        ) {
            Text(
                stringResource(R.string.detail_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(Spacing.xs))

            Section(stringResource(R.string.detail_status)) {
                ChipRow(
                    options = listOf(
                        "open" to stringResource(R.string.detail_status_open),
                        "pending" to stringResource(R.string.detail_status_pending),
                        "solved" to stringResource(R.string.detail_status_solved),
                        "snoozed" to stringResource(R.string.detail_status_snoozed),
                    ),
                    selected = conversation.status,
                    onSelect = onSetStatus,
                )
            }

            Section(stringResource(R.string.detail_assignee)) {
                ChipRow(
                    options = buildList {
                        add("" to stringResource(R.string.detail_unassigned))
                        snapshot.agents.forEach { add(it.id to it.name) }
                    },
                    selected = conversation.assigneeId,
                    onSelect = onAssign,
                )
            }

            Section(stringResource(R.string.detail_priority)) {
                ChipRow(
                    options = listOf(
                        "low" to stringResource(R.string.detail_priority_low),
                        "normal" to stringResource(R.string.detail_priority_normal),
                        "high" to stringResource(R.string.detail_priority_high),
                        "urgent" to stringResource(R.string.detail_priority_urgent),
                    ),
                    selected = conversation.priority,
                    onSelect = onSetPriority,
                )
            }

            Section(stringResource(R.string.detail_tags)) {
                if (conversation.tags.isEmpty()) {
                    Text(
                        stringResource(R.string.detail_no_tags),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        conversation.tags.forEach { tag ->
                            Text(
                                "#$tag",
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier
                                    .background(
                                        MaterialTheme.colorScheme.surfaceVariant,
                                        RoundedCornerShape(Radius.full),
                                    )
                                    .padding(horizontal = 8.dp, vertical = 3.dp),
                            )
                        }
                    }
                }
            }

            Section(stringResource(R.string.detail_sla)) {
                val sla = slaLine(conversation, snapshot.workspace.defaultSlaMinutes)
                Text(
                    sla.first,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (sla.second) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    stringResource(R.string.detail_sla_target, snapshot.workspace.defaultSlaMinutes),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Section(stringResource(R.string.detail_channel)) {
                Text(
                    channelName.ifBlank { stringResource(R.string.detail_channel_unknown) },
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            Spacer(Modifier.height(Spacing.xs))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.detail_bot_paused),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                Switch(checked = conversation.botPaused, onCheckedChange = onSetBotPaused)
            }
            Spacer(Modifier.height(Spacing.xs))
            OutlinedButton(
                onClick = onMarkRead,
                enabled = conversation.unread > 0,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.detail_mark_read))
            }
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column(Modifier.padding(vertical = Spacing.xs)) {
        Text(
            title,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(6.dp))
        content()
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun ChipRow(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        options.forEach { (key, label) ->
            val active = key == selected
            Text(
                label,
                style = MaterialTheme.typography.labelLarge,
                color = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                modifier = Modifier
                    .background(
                        if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                        RoundedCornerShape(Radius.full),
                    )
                    .clickable { onSelect(key) }
                    .padding(horizontal = 10.dp, vertical = 5.dp),
            )
        }
    }
}

/**
 * One line describing where the thread stands against its first-response goal.
 *
 * @returns the sentence plus whether it is overdue (so the caller can tint it).
 */
private fun slaLine(conversation: Conversation, targetMinutes: Int): Pair<String, Boolean> {
    val first = conversation.firstResponseAt
    if (first != null) {
        val minutes = TimeUnit.MILLISECONDS.toMinutes(
            (first - (conversation.lastInboundAt ?: first)).coerceAtLeast(0L),
        )
        return "首响用时 ${minutes} 分钟" to (minutes > targetMinutes)
    }
    val waitingSince = conversation.lastInboundAt ?: conversation.updatedAt
    val waiting = TimeUnit.MILLISECONDS.toMinutes((System.currentTimeMillis() - waitingSince).coerceAtLeast(0L))
    val overdue = waiting > targetMinutes
    return (if (overdue) "已等待 $waiting 分钟，超出目标" else "等待首响，已 $waiting 分钟") to overdue
}
