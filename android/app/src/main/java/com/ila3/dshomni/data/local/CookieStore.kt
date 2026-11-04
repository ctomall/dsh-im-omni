package com.ila3.dshomni.data.local

import android.content.Context
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persistent cookie jar.
 *
 * Pairing mints two cookies (`dsh_phone` from the gateway and DSH's own browser
 * session). Both must survive process death or every launch would need a new
 * pairing code, so the jar is a small JSON document in preferences.
 */
class CookieStore(context: Context) : CookieJar {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val cookies = linkedMapOf<String, MutableList<Cookie>>()

    init {
        load()
    }

    /** Cookies are keyed by `<domain><path><name>` so a re-pair overwrites, never duplicates. */
    private fun key(cookie: Cookie): String = "${cookie.domain}|${cookie.path}|${cookie.name}"

    private fun load() {
        val raw = prefs.getString(KEY_COOKIES, null) ?: return
        runCatching {
            val array = JSONArray(raw)
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val cookie = runCatching {
                    Cookie.Builder()
                        .domain(item.optString("domain"))
                        .path(item.optString("path", "/"))
                        .name(item.optString("name"))
                        .value(item.optString("value"))
                        .apply {
                            if (item.optBoolean("secure")) secure()
                            if (item.optBoolean("httpOnly")) httpOnly()
                            if (item.has("expiresAt") && item.optLong("expiresAt") > 0L) expiresAt(item.optLong("expiresAt"))
                        }
                        .build()
                }.getOrNull() ?: continue
                cookies.getOrPut(cookie.domain) { mutableListOf() }
                    .removeAll { it.name == cookie.name && it.path == cookie.path }
                cookies[cookie.domain]?.add(cookie)
            }
        }
    }

    private fun persist() {
        val array = JSONArray()
        val now = System.currentTimeMillis()
        for (list in cookies.values) {
            for (cookie in list) {
                if (cookie.expiresAt in 1 until now) continue
                array.put(JSONObject().apply {
                    put("domain", cookie.domain)
                    put("path", cookie.path)
                    put("name", cookie.name)
                    put("value", cookie.value)
                    put("secure", cookie.secure)
                    put("httpOnly", cookie.httpOnly)
                    put("expiresAt", cookie.expiresAt)
                })
            }
        }
        prefs.edit().putString(KEY_COOKIES, array.toString()).apply()
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return
        for (cookie in cookies) {
            val list = this.cookies.getOrPut(cookie.domain) { mutableListOf() }
            list.removeAll { it.name == cookie.name && it.path == cookie.path }
            list.add(cookie)
        }
        persist()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        return cookies.values.flatten().filter { cookie ->
            cookie.expiresAt > now && cookie.matches(url)
        }
    }

    /** Drop every stored cookie; used when the user unpairs a device. */
    fun clear() {
        cookies.clear()
        prefs.edit().remove(KEY_COOKIES).apply()
    }

    /** Whether any live cookie exists for the given host. */
    fun hasCookies(host: String): Boolean {
        val now = System.currentTimeMillis()
        return cookies.values.flatten().any { it.domain.trimStart('.').endsWith(host) && it.expiresAt > now }
    }

    private companion object {
        const val PREFS = "dsh_omni_cookies"
        const val KEY_COOKIES = "cookies"
    }
}
