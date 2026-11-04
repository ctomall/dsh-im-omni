package com.ila3.dshomni.data.remote

import com.ila3.dshomni.data.model.EntryKind
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Pairing input handling.
 *
 * The DSH phone-remote gateway accepts a one-time code at `{base}pair`; the QR
 * it renders encodes the whole link (`https://host/phone/pair?code=123456`).
 * A user can also type just a server address, so every shape is normalized to
 * a trailing-slash base URL plus an optional code.
 */
data class PairingTarget(val baseUrl: String, val code: String) {
    /** Where the pairing form is posted. */
    val pairUrl: String get() = "${baseUrl}pair"

    /** Which entry family this address most likely belongs to. */
    val guess: EntryKind
        get() = when {
            !baseUrl.startsWith("https://") -> EntryKind.LAN
            baseUrl.startsWith("https://") && HOST_IP.containsMatchIn(baseUrl) -> EntryKind.CUSTOM
            else -> EntryKind.PUBLIC
        }

    /** A short label for the connection list. */
    fun suggestedLabel(): String {
        val host = baseUrl.removePrefix("https://").removePrefix("http://").trimEnd('/')
        return when (guess) {
            EntryKind.LAN -> "内网 · $host"
            EntryKind.PUBLIC -> "外网 · $host"
            EntryKind.CUSTOM -> host
        }
    }

    companion object {
        private val HOST_IP = Regex("""//\d{1,3}(\.\d{1,3}){3}""")
        private val CODE = Regex("""code=([A-Za-z0-9-]{3,32})""")

        /**
         * Parse whatever the user typed or scanned.
         *
         * Accepted: a full pairing link, a bare host, a host with a base path,
         * with or without a scheme. A missing scheme defaults to `http://`,
         * which is what a LAN entry looks like.
         */
        fun parse(raw: String): PairingTarget? {
            val trimmed = raw.trim()
            if (trimmed.isEmpty()) return null
            val withScheme = when {
                trimmed.startsWith("http://") || trimmed.startsWith("https://") -> trimmed
                else -> "http://$trimmed"
            }
            val code = CODE.find(withScheme)?.groupValues?.get(1)?.takeIf { it.isNotBlank() } ?: ""
            val withoutQuery = withScheme.substringBefore('?').substringBefore('#')
            // A pasted link points at the pairing page itself; strip it back to the mount.
            val base = when {
                withoutQuery.endsWith("/pair/") -> withoutQuery.dropLast("/pair/".length + 1)
                withoutQuery.endsWith("/pair") -> withoutQuery.dropLast("/pair".length)
                else -> withoutQuery
            }
            val normalized = if (base.endsWith("/")) base else "$base/"
            val candidate = normalize(normalized) ?: return null
            return PairingTarget(candidate, code)
        }

        /** Validate a normalized base URL. */
        private fun normalize(value: String): String? {
            val url = value.toHttpUrlOrNull() ?: return null
            if (url.scheme != "http" && url.scheme != "https") return null
            if (url.host.isBlank()) return null
            return url.toString().let { if (it.endsWith("/")) it else "$it/" }
        }

        /** Normalize a stored base URL, returning null when it is unusable. */
        fun normalizeBase(raw: String): String? {
            val trimmed = raw.trim()
            if (trimmed.isEmpty()) return null
            val withScheme = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else "http://$trimmed"
            return normalize(withScheme)
        }
    }
}
