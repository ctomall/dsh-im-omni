package com.ila3.dshomni.util

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap

/** Decode the `data:image/png;base64,…` payload the QR bridge returns. */
fun decodeDataUrlImage(dataUrl: String): ImageBitmap? {
    if (!dataUrl.startsWith("data:")) return null
    val comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    return try {
        val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    } catch (_: IllegalArgumentException) {
        null
    }
}
