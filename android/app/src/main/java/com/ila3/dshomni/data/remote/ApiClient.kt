package com.ila3.dshomni.data.remote

import com.ila3.dshomni.data.model.CommandResult
import com.ila3.dshomni.data.model.Snapshot
import com.ila3.dshomni.data.model.UpdateInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.CookieJar
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Transport for the omnichannel Host.
 *
 * The app never talks to a private Git host: pairing exchanges a one-time code
 * for the DSH device cookie, and every later call rides that cookie through the
 * phone-remote gateway (LAN or public). Endpoints are the plugin's own routes.
 */
class ApiClient(cookieJar: CookieJar) {

    private val http: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    /** Exchange a pairing code for device cookies. */
    suspend fun pair(base: String, code: String, deviceName: String): Unit = withContext(Dispatchers.IO) {
        val body = FormBody.Builder()
            .add("code", code.trim())
            .add("name", deviceName.take(48))
            .add("next", "")
            .build()
        val request = Request.Builder().url(base + "pair").post(body).build()
        http.newCall(request).execute().use { response ->
            when (response.code) {
                401 -> throw ApiException(
                    "pair-code-invalid",
                    "配对码无效或已过期。请在电脑端重新生成一个配对码，并在 5 分钟内完成配对。",
                    401,
                )
                403 -> throw ApiException(
                    "pair-origin",
                    "配对请求的来源被网关拒绝，请从同一个入口重新打开配对页。",
                    403,
                )
                429 -> throw ApiException(
                    "pair-too-many",
                    "尝试次数过多，请 10 分钟后再试。",
                    429,
                )
            }
            if (!response.isSuccessful) {
                throw ApiException("pair-http", "配对失败：HTTP ${response.code}", response.code)
            }
        }
    }

    /** Read the workspace snapshot. */
    suspend fun state(base: String): Snapshot = withContext(Dispatchers.IO) {
        val json = getJson(base + "api/im-omni.state")
        val state = json.optJSONObject("state")
            ?: throw ApiException("bad-state", "Host 返回的状态为空。", 0)
        DtoParser.parseSnapshot(state)
    }

    /** Run one serialized Host command. */
    suspend fun command(base: String, action: String, payload: JSONObject = JSONObject()): CommandResult =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("action", action).put("payload", payload).toString()
            val json = postJson(base + "api/im-omni.command", body)
            val snapshot = json.optJSONObject("state")?.let { DtoParser.parseSnapshot(it) }
            val receipt = json.optJSONObject("result")?.let { obj ->
                obj.keys().asSequence().associateWith { key -> obj.opt(key) }
            } ?: emptyMap()
            CommandResult(snapshot, receipt)
        }

    /** Call one translation or AI action; the newest snapshot may come back with it. */
    suspend fun intelligence(base: String, action: String, payload: JSONObject): Pair<JSONObject, Snapshot?> =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("action", action).put("payload", payload).toString()
            val json = postJson(base + "api/im-omni.ai", body)
            val result = json.optJSONObject("result") ?: JSONObject()
            val snapshot = json.optJSONObject("state")?.let { DtoParser.parseSnapshot(it) }
            result to snapshot
        }

    /** Read the published Android update manifest. */
    suspend fun update(base: String): UpdateInfo = withContext(Dispatchers.IO) {
        DtoParser.parseUpdate(getJson(base + "api/im-omni.app.version"))
    }

    /** Transfer the update APK with byte progress. */
    suspend fun download(
        base: String,
        apkPath: String,
        destination: File,
        onProgress: (received: Long, total: Long) -> Unit,
    ): File = withContext(Dispatchers.IO) {
        val url = if (apkPath.startsWith("http")) apkPath else base + apkPath.trimStart('/')
        val request = Request.Builder().url(url).get().build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw ApiException("download-http", "下载失败：HTTP ${response.code}", response.code)
            val total = response.body?.contentLength() ?: -1L
            destination.parentFile?.mkdirs()
            val buffer = ByteArray(64 * 1024)
            var received = 0L
            response.body!!.byteStream().use { input ->
                destination.outputStream().use { output ->
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        output.write(buffer, 0, read)
                        received += read
                        onProgress(received, total)
                    }
                }
            }
            destination
        }
    }

    private fun getJson(url: String): JSONObject {
        val request = Request.Builder().url(url).get().build()
        return execute(request)
    }

    private fun postJson(url: String, body: String): JSONObject {
        val request = Request.Builder()
            .url(url)
            .post(body.toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        return execute(request)
    }

    private fun execute(request: Request): JSONObject {
        val response: Response = try {
            http.newCall(request).execute()
        } catch (io: IOException) {
            throw ApiException("network", io.message ?: "无法连接服务器。", 0)
        }
        response.use {
            val text = it.body?.string().orEmpty()
            if (it.code == 401 || it.code == 403) {
                throw ApiException("unauthorized", "登录已失效，请重新配对这台设备。", it.code)
            }
            val json = runCatching { JSONObject(text) }.getOrNull()
            if (!it.isSuccessful) {
                val error = json?.optJSONObject("error")
                val code = error?.optString("code")?.takeIf(String::isNotBlank) ?: "http-${it.code}"
                val message = error?.optString("message")?.takeIf(String::isNotBlank) ?: "请求失败：HTTP ${it.code}"
                throw ApiException(code, message, it.code)
            }
            if (json == null) throw ApiException("bad-json", "Host 返回了无法解析的响应。", it.code)
            if (!json.optBoolean("ok", true)) {
                val error = json.optJSONObject("error")
                throw ApiException(
                    error?.optString("code")?.takeIf(String::isNotBlank) ?: "failed",
                    error?.optString("message")?.takeIf(String::isNotBlank) ?: "Host 拒绝了这次请求。",
                    it.code,
                )
            }
            return json
        }
    }
}
