package com.ila3.dshomni.data.auth

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persists the signed-in account.
 *
 * Tokens live in the app-private preference file. That is adequate for an
 * internal deployment on a managed device; moving the file behind
 * EncryptedSharedPreferences or the Keystore is tracked as hardening work.
 */
class AuthStore(context: Context) {

    private val prefs = context.getSharedPreferences("dsh-omni-auth", Context.MODE_PRIVATE)

    /** @returns the stored session, or null when nobody is signed in. */
    fun load(): AuthSession? {
        val raw = prefs.getString(KEY_SESSION, null) ?: return null
        return runCatching {
            val json = JSONObject(raw)
            val tenants = json.optJSONArray("tenants").orEmpty().map { item ->
                TenantRef(
                    id = item.optString("id"),
                    name = item.optString("name"),
                    role = item.optString("role"),
                )
            }
            AuthSession(
                baseUrl = json.getString("baseUrl"),
                accessToken = json.getString("accessToken"),
                refreshToken = json.getString("refreshToken"),
                tenantId = json.getString("tenantId"),
                role = json.optString("role", "agent"),
                email = json.optString("email"),
                name = json.optString("name"),
                tenants = tenants,
            )
        }.getOrNull()
    }

    /** Save one session, replacing any previous one. */
    fun save(session: AuthSession) {
        val json = JSONObject()
            .put("baseUrl", session.baseUrl)
            .put("accessToken", session.accessToken)
            .put("refreshToken", session.refreshToken)
            .put("tenantId", session.tenantId)
            .put("role", session.role)
            .put("email", session.email)
            .put("name", session.name)
            .put("tenants", JSONArray().apply {
                session.tenants.forEach { tenant ->
                    put(JSONObject().put("id", tenant.id).put("name", tenant.name).put("role", tenant.role))
                }
            })
        prefs.edit().putString(KEY_SESSION, json.toString()).apply()
    }

    /** Sign out, dropping every token. */
    fun clear() {
        prefs.edit().remove(KEY_SESSION).apply()
    }

    /** @returns the server the last session pointed at, so the form can prefill. */
    fun rememberedBaseUrl(): String = prefs.getString(KEY_BASE_URL, null).orEmpty()

    /** Remember the server address independently of the session. */
    fun rememberBaseUrl(baseUrl: String) {
        prefs.edit().putString(KEY_BASE_URL, baseUrl).apply()
    }

    private fun JSONArray?.orEmpty(): List<JSONObject> {
        if (this == null) return emptyList()
        return (0 until length()).mapNotNull { optJSONObject(it) }
    }

    private companion object {
        const val KEY_SESSION = "session"
        const val KEY_BASE_URL = "baseUrl"
    }
}
