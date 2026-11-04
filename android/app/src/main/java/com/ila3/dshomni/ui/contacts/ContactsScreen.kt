package com.ila3.dshomni.ui.contacts

import androidx.compose.foundation.ExperimentalFoundationApi
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ila3.dshomni.R
import com.ila3.dshomni.data.model.Contact
import com.ila3.dshomni.data.model.Snapshot
import com.ila3.dshomni.ui.UiState
import com.ila3.dshomni.ui.common.Avatar
import com.ila3.dshomni.ui.common.Banner
import com.ila3.dshomni.ui.common.PlatformBadge
import com.ila3.dshomni.ui.theme.Radius
import com.ila3.dshomni.ui.theme.Spacing

/** How the address book is bucketed. */
private enum class ContactGrouping { Channel, Company }

private const val UNGROUPED = "\u0000ungrouped"
private const val NO_COMPANY = "\u0000nocompany"

/**
 * Contacts tab: the address book behind the inbox.
 *
 * Contacts arrive with the workspace snapshot (the Host creates them on the
 * first inbound message), so this screen only reads, filters, groups and
 * navigates — it never invents a contact or calls a new endpoint.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ContactsScreen(
    state: UiState,
    onOpenConversation: (String) -> Unit,
    onRefresh: () -> Unit,
    onDismiss: () -> Unit,
) {
    val snapshot = state.snapshot
    var query by remember { mutableStateOf("") }
    var grouping by remember { mutableStateOf(ContactGrouping.Channel) }

    val groups: List<Pair<String, List<Contact>>> = remember(snapshot, query, grouping) {
        val matched = snapshot?.contacts.orEmpty().filter { contact ->
            if (query.isBlank()) return@filter true
            listOf(contact.name, contact.company, contact.handle, contact.phone, contact.email)
                .any { it.contains(query, ignoreCase = true) }
        }
        val buckets = linkedMapOf<String, MutableList<Contact>>()
        matched.sortedBy { it.name.lowercase() }.forEach { contact ->
            val key = when (grouping) {
                ContactGrouping.Channel ->
                    contact.identities
                        .mapNotNull { snapshot?.channel(it.channelId)?.name }
                        .firstOrNull()
                        ?: UNGROUPED
                ContactGrouping.Company -> contact.company.ifBlank { NO_COMPANY }
            }
            buckets.getOrPut(key) { mutableListOf() }.add(contact)
        }
        buckets.entries
            .sortedWith(compareBy({ it.key == UNGROUPED || it.key == NO_COMPANY }, { it.key }))
            .map { it.key to it.value.toList() }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Surface(color = MaterialTheme.colorScheme.surface) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(start = Spacing.md, end = Spacing.xxs, top = Spacing.xs, bottom = Spacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    stringResource(R.string.contacts_title),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                if (state.refreshing) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(17.dp),
                    )
                    Spacer(Modifier.width(Spacing.sm))
                } else {
                    IconButton(onClick = onRefresh) {
                        Icon(
                            Icons.Rounded.Refresh,
                            contentDescription = stringResource(R.string.contacts_refresh),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }
            }
        }

        Column(Modifier.padding(horizontal = Spacing.md)) {
            state.error?.let {
                Spacer(Modifier.height(Spacing.xxs))
                Banner(it, error = true, onDismiss = onDismiss)
            }
            Spacer(Modifier.height(Spacing.xs))
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = {
                    Text(
                        stringResource(R.string.contacts_search_hint),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                singleLine = true,
                leadingIcon = {
                    Icon(Icons.Rounded.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                },
                shape = RoundedCornerShape(Radius.xs),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    focusedBorderColor = Color.Transparent,
                    unfocusedBorderColor = Color.Transparent,
                ),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(Spacing.xxs))
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                GroupingTab(
                    label = stringResource(R.string.contacts_group_channel),
                    selected = grouping == ContactGrouping.Channel,
                    onClick = { grouping = ContactGrouping.Channel },
                )
                GroupingTab(
                    label = stringResource(R.string.contacts_group_company),
                    selected = grouping == ContactGrouping.Company,
                    onClick = { grouping = ContactGrouping.Company },
                )
            }
            Spacer(Modifier.height(Spacing.xxs))
        }

        when {
            snapshot == null && state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(strokeWidth = 2.dp)
            }
            // A failed first sync cannot say "empty": it offers a retry instead.
            snapshot == null && state.error != null -> Box(
                Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        stringResource(R.string.contacts_load_failed),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Spacer(Modifier.height(Spacing.xxs))
                    Text(
                        state.error,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = Spacing.xl),
                    )
                    Spacer(Modifier.height(Spacing.md))
                    OutlinedButton(onClick = onRefresh) {
                        Text(stringResource(R.string.contacts_retry))
                    }
                }
            }
            groups.isEmpty() -> EmptyContacts(hasQuery = query.isNotBlank())
            else -> LazyColumn(Modifier.fillMaxSize()) {
                groups.forEach { (title, members) ->
                    stickyHeader(key = "header:$title") {
                        val label = when (title) {
                            UNGROUPED -> stringResource(R.string.contacts_group_ungrouped)
                            NO_COMPANY -> stringResource(R.string.contacts_group_no_company)
                            else -> title
                        }
                        Text(
                            label,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MaterialTheme.colorScheme.background)
                                .padding(horizontal = Spacing.md, vertical = Spacing.xxs),
                        )
                    }
                    items(members, key = { it.id }) { contact ->
                        ContactRow(
                            contact = contact,
                            snapshot = snapshot,
                            onClick = {
                                latestConversationId(snapshot, contact.id)?.let(onOpenConversation)
                            },
                        )
                    }
                }
            }
        }
    }
}

/** Most recent conversation for a contact, so a tap lands somewhere useful. */
private fun latestConversationId(snapshot: Snapshot?, contactId: String): String? =
    snapshot?.conversations
        ?.filter { it.contactId == contactId }
        ?.maxByOrNull { it.updatedAt }
        ?.id

@Composable
private fun GroupingTab(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        fontSize = 13.sp,
        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        color = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
    )
}

@Composable
private fun ContactRow(contact: Contact, snapshot: Snapshot?, onClick: () -> Unit) {
    val channels = contact.identities
        .mapNotNull { snapshot?.channel(it.channelId) }
        .distinctBy { it.id }
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = Spacing.md, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(contact.name, contact.hue, size = 44.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                contact.name.ifBlank { stringResource(R.string.contacts_unnamed) },
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val secondary = listOf(contact.company, contact.phone, contact.handle, contact.email)
                .firstOrNull { it.isNotBlank() }
            if (secondary != null) {
                Spacer(Modifier.height(2.dp))
                Text(
                    secondary,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (channels.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    channels.take(3).forEach { channel ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            PlatformBadge(channel.badge, channel.hue, size = 12.dp)
                            Spacer(Modifier.width(4.dp))
                            Text(
                                channel.name,
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyContacts(hasQuery: Boolean) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(Spacing.xxl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            if (hasQuery) stringResource(R.string.contacts_no_match) else stringResource(R.string.contacts_empty),
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            if (hasQuery) stringResource(R.string.contacts_no_match_hint) else stringResource(R.string.contacts_empty_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
