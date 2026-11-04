package com.ila3.dshomni.data.auth

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Auth calls against the multi-tenant backend (the `/v1/auth` routes).
 *
 * Kept separate from the legacy pairing client: the old flow talks to
 * `/phone/pair` on the DSH plugin, this one talks to the SaaS server.
 */
class AuthApi(
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build(),
) {

    /** Normalize a typed address into a base URL with a trailing slash. */
    fun normalizeBase(raw: String): String {
        var value = raw.trim()
        if (value.isEmpty()) return ""
        if (!value.startsWith("http://") && !value.startsWith("https://")) value = "https://$value"
        if (!value.endsWith("/")) value += "/"
        return value
    }

    /** Sign in and return a session bound to the first tenant. */
    suspend fun login(baseUrl: String, email: String, password: String): AuthResult =
        request(baseUrl, "/v1/auth/login", JSONObject().put("email", email).put("password", password))

    /** Create an account plus its first tenant. */
    suspend fun register(baseUrl: String, email: String, password: String, name: String): AuthResult =
        request(
            baseUrl,
            "/v1/auth/register",
            JSONObject().put("email", email).put("password", password).put("name", name),
        )

    /** Exchange a refresh token for a new access token (rotates the refresh). */
    suspend fun refresh(baseUrl: String, refreshToken: String): AuthResult {
        val body = JSONObject().put("refreshToken", refreshToken)
        val result = call(baseUrl, "/v1/auth/refresh", body, null)
        return when (result) {
            is Raw.Failure -> AuthResult.Failure(result.message)
            is Raw.Success -> {
                val session = parseSession(baseUrl, result.json, null)
                if (session == null) AuthResult.Failure("刷新返回无法识别") else AuthResult.Success(session)
            }
        }
    }

    /** Issue a token for another tenant. */
    suspend fun switchTenant(session: AuthSession, tenantId: String): AuthResult {
        val body = JSONObject().put("tenantId", tenantId)
        val result = call(session.baseUrl, "/v1/auth/switch", body, session.accessToken)
        return when (result) {
            is Raw.Failure -> AuthResult.Failure(result.message)
            is Raw.Success -> {
                val merged = parseSession(session.baseUrl, result.json, session)
                if (merged == null) AuthResult.Failure("服务器返回无法识别") else AuthResult.Success(merged)
            }
        }
    }

    /** Register this phone as a device and adopt the returned token pair. */
    suspend fun registerDevice(session: AuthSession, deviceName: String): AuthResult {
        val body = JSONObject().put("deviceName", deviceName).put("platform", "android")
        val result = call(session.baseUrl, "/v1/devices/register", body, session.accessToken)
        return when (result) {
            is Raw.Failure -> AuthResult.Failure(result.message)
            is Raw.Success -> {
                val merged = parseSession(session.baseUrl, result.json, session)
                if (merged == null) AuthResult.Failure("设备注册返回无法识别") else AuthResult.Success(merged)
            }
        }
    }

    private suspend fun request(baseUrl: String, path: String, body: JSONObject): AuthResult {
        val result = call(baseUrl, path, body, null)
        return when (result) {
            is Raw.Failure -> AuthResult.Failure(result.message)
            is Raw.Success -> {
                val session = parseSession(baseUrl, result.json, null)
                if (session == null) AuthResult.Failure("服务器返回无法识别") else AuthResult.Success(session)
            }
        }
    }

    private sealed interface Raw {
        data class Success(val json: JSONObject) : Raw
        data class Failure(val message: String) : Raw
    }

    private suspend fun call(
        baseUrl: String,
        path: String,
        body: JSONObject,
        token: String?,
    ): Raw = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(baseUrl.trimEnd('/') + path)
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .apply { token?.let { header("authorization", "Bearer $it") } }
            .build()
        runCatching {
            http.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val json = runCatching { JSONObject(text) }.getOrNull()
                if (response.isSuccessful && json != null) return@use Raw.Success(json)
                val message = json?.optJSONObject("error")?.optString("message")?.takeIf { it.isNotBlank() }
                    ?: when (response.code) {
                        401 -> "邮箱或密码不正确，或登录已失效。"
                        403 -> "你不在这个团队中。"
                        409 -> "该邮箱已注册。"
                        422 -> "请检查填写的内容。"
                        else -> "服务器返回 ${response.code}"
                    }
                Raw.Failure(message)
            }
        }.getOrElse { error ->
            Raw.Failure("无法连接服务器：${error.message ?: "网络错误"}")
        }
    }

    /** Turn one auth response into a session, keeping prior context when given. */
    private fun parseSession(baseUrl: String, json: JSONObject, previous: AuthSession?): AuthSession? {
        val access = json.optString("accessToken")
        val refresh = json.optString("refreshToken")
        if (access.isBlank() || refresh.isBlank()) return null
        val tenantsJson = json.optJSONArray("tenants")
        val tenants = if (tenantsJson != null) {
            (0 until tenantsJson.length()).mapNotNull { index ->
                val item = tenantsJson.optJSONObject(index) ?: return@mapNotNull null
                TenantRef(
                    id = item.optString("tenant_id").ifBlank { item.optString("id") },
                    name = item.optString("name"),
                    role = item.optString("role", "agent"),
                )
            }
        } else {
            previous?.tenants.orEmpty()
        }
        val userJson = json.optJSONObject("user")
        val current = tenants.firstOrNull()
        return AuthSession(
            baseUrl = baseUrl,
            accessToken = access,
            refreshToken = refresh,
            tenantId = json.optString("tenantId").ifBlank { current?.id ?: previous?.tenantId.orEmpty() },
            role = current?.role ?: previous?.role ?: "agent",
            email = userJson?.optString("email").orEmpty().ifBlank { previous?.email.orEmpty() },
            name = userJson?.optString("name").orEmpty().ifBlank { previous?.name.orEmpty() },
            tenants = tenants,
        )
    }
}
