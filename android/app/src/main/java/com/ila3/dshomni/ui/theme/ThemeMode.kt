package com.ila3.dshomni.ui.theme

import android.content.Context

/** How the app chooses between the light and dark colour schemes. */
enum class ThemeMode {
    /** Follow the system setting (default). */
    SYSTEM,

    /** Always use the light scheme. */
    LIGHT,

    /** Always use the dark scheme. */
    DARK,
}

/**
 * Persists the user's theme choice.
 *
 * Kept next to the other on-device preferences (`dsh_omni_notify`) rather than
 * in the Host workspace: the theme is a property of this phone, not of the
 * shared inbox state, so switching servers must not switch it.
 */
object ThemeStore {
    private const val PREFS = "dsh_omni_ui"
    private const val KEY = "theme_mode"

    /**
     * Read the stored mode.
     * @param context any context; the application context is used.
     * @returns the stored mode, or [ThemeMode.SYSTEM] when unset/unknown.
     */
    fun load(context: Context): ThemeMode {
        val raw = context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, null)
        return ThemeMode.entries.firstOrNull { it.name == raw } ?: ThemeMode.SYSTEM
    }

    /**
     * Store the chosen mode.
     * @param context any context; the application context is used.
     * @param mode the mode to persist.
     */
    fun save(context: Context, mode: ThemeMode) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, mode.name)
            .apply()
    }
}
