package com.ila3.dshomni.ui.theme

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.dp

/**
 * Design tokens for the DSH Omni Android UI.
 *
 * This is the only file allowed to spell raw dimensions: screens must read
 * [Spacing], [Radius], [Elevation], [IconSize], [Sizes] and [Motion] instead of
 * writing `.dp` / `.sp` / duration literals inline. Colour tokens stay in
 * [Theme.kt] because Material 3 hands them to screens through `MaterialTheme`.
 *
 * Motion is opt-out through [LocalReduceMotion]: the theme flips it when the
 * system animation scale is 0 (developer options / accessibility), and every
 * animated call site degrades to the final state instead of running the
 * transition.
 */
object Spacing {
    /** 4dp — hairline gaps, dot spacing. */
    val xxs = 4.dp

    /** 8dp — inside a chip or between icons and labels. */
    val xs = 8.dp

    /** 12dp — dense list rows. */
    val sm = 12.dp

    /** 16dp — default horizontal screen inset. */
    val md = 16.dp

    /** 20dp — card padding on roomy screens. */
    val lg = 20.dp

    /** 24dp — section separation. */
    val xl = 24.dp

    /** 32dp — screen-level breathing room. */
    val xxl = 32.dp
}

/** Corner radii. Keep every rounded corner on one of these five values. */
object Radius {
    /** 10dp — chips, inputs. */
    val sm = 10.dp

    /** 14dp — list cards. */
    val md = 14.dp

    /** 18dp — sheets, hero cards. */
    val lg = 18.dp

    /** 24dp — full sheets and the composer. */
    val xl = 24.dp

    /** Pills and avatars. */
    val full = 999.dp
}

/** Shadow levels. Flat surfaces use [none] plus an outline instead of shadow. */
object Elevation {
    val none = 0.dp
    val low = 1.dp
    val medium = 3.dp
    val high = 6.dp
}

/** Icon sizes paired with the type scale. */
object IconSize {
    val sm = 16.dp
    val md = 20.dp
    val lg = 24.dp
    val xl = 32.dp
}

/** Fixed component sizes that more than one screen has to agree on. */
object Sizes {
    val avatarSm = 32.dp
    val avatarMd = 40.dp
    val avatarLg = 46.dp

    /** Minimum touch target, per Material accessibility guidance. */
    val touchTarget = 48.dp

    /** Attachment thumbnail ceiling inside a bubble. */
    val thumbMax = 220.dp
}

/** Transition durations, in milliseconds. */
object Motion {
    val fast = 150
    val base = 220
    val slow = 320
}

/**
 * Whether transitions should be skipped.
 *
 * Defaults to `false`; [DshOmniTheme] provides the real value from the system
 * animator duration scale so the UI can degrade without a settings screen.
 */
val LocalReduceMotion = staticCompositionLocalOf { false }
