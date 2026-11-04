package com.ila3.dshomni.data.local

import android.content.Context
import com.ila3.dshomni.data.model.Connection
import com.ila3.dshomni.data.model.EntryKind
import org.json.JSONArray
import org.json.JSONObject

/** Saved server entries (LAN, public, custom) plus which one is active. */
class ConnectionStore(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun load(): List<Connection> {
        val raw = prefs.getString(KEY_LIST, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { index ->
                val item = array.optJSONObject(index) ?: return@mapNotNull null
                val id = item.optString("id")
                val base = item.optString("baseUrl")
                if (id.isBlank() || base.isBlank()) return@mapNotNull null
                Connection(
                    id = id,
                    label = item.optString("label").ifBlank { base },
                    baseUrl = base,
                    entry = runCatching { EntryKind.valueOf(item.optString("entry", EntryKind.CUSTOM.name)) }
                        .getOrDefault(EntryKind.CUSTOM),
                    pairedAt = item.optLong("pairedAt"),
                    lastVersion = item.optString("lastVersion"),
                    lastSyncAt = item.optLong("lastSyncAt"),
                )
            }
        }.getOrDefault(emptyList())
    }

    fun save(connections: List<Connection>) {
        val array = JSONArray()
        for (connection in connections) {
            array.put(JSONObject().apply {
                put("id", connection.id)
                put("label", connection.label)
                put("baseUrl", connection.baseUrl)
                put("entry", connection.entry.name)
                put("pairedAt", connection.pairedAt)
                put("lastVersion", connection.lastVersion)
                put("lastSyncAt", connection.lastSyncAt)
            })
        }
        prefs.edit().putString(KEY_LIST, array.toString()).apply()
    }

    fun currentId(): String? = prefs.getString(KEY_CURRENT, null)?.takeIf { it.isNotBlank() }

    fun setCurrent(id: String?) {
        prefs.edit().apply {
            if (id == null) remove(KEY_CURRENT) else putString(KEY_CURRENT, id)
        }.apply()
    }

    /** Read one saved connection by id. */
    fun find(id: String?): Connection? = load().firstOrNull { it.id == id }

    /** Insert or replace one connection, preserving its position. */
    fun upsert(connection: Connection) {
        val list = load().toMutableList()
        val index = list.indexOfFirst { it.id == connection.id }
        if (index >= 0) list[index] = connection else list.add(connection)
        save(list)
    }

    fun remove(id: String) {
        save(load().filterNot { it.id == id })
        if (currentId() == id) setCurrent(null)
    }

    private companion object {
        const val PREFS = "dsh_omni_connections"
        const val KEY_LIST = "list"
        const val KEY_CURRENT = "current"
    }
}
