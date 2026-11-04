# Changelog — DSH Omni Android

All notable changes to the Android companion app. The plugin itself is
versioned separately; this file tracks `com.ila3.dshomni`.

## 0.4.0 — 2024-11-04 (versionCode 7)

### Visual refresh (Harbor)

- New colour scheme: deep-navy surfaces with the brand blue/teal accents, in
  both light and dark. Chosen from rendered proposals; every text pair meets
  WCAG AA (light `secondary` moved `#0E9E8D` → `#0B8574` for 4.54:1).
- Design tokens are centralised: `ui/theme/Tokens.kt` owns spacing, radii,
  elevation, icon sizes and motion durations; `ui/theme/Type.kt` owns the type
  scale. Screens no longer spell `Color(0x…)`, and padding/radius literals that
  matched a token were routed through it.
- Transitions can be turned off: `DshOmniTheme` reads the system animator
  duration scale and provides `LocalReduceMotion`.

### Features

- **Theme mode** — Settings → 外观 offers 跟随系统 / 浅色 / 深色, stored on the
  device (`dsh_omni_ui`), so switching servers does not change it.
- **Mark all read** — the inbox header shows `全部标为已读（n）` when anything is
  unread. It reuses `conversation.read` per unread row; a partial failure keeps
  what succeeded and reports how many remain.
- **Full-thread search** — inbox search now scans the last 200 message bodies
  per conversation, not just the newest bubble.
- **Attachment preview** — tapping an image attachment opens a full-screen,
  fit-to-window preview; tapping anywhere dismisses. No new permission.

### Fixes

- Lint: `MissingPermission` on notification posting is now guarded explicitly
  (`canPost`) and documented; `./gradlew lintDebug` passes.

### Known limitations

- Only the colour, spacing, radius and typography layers are tokenised; some
  component-specific dimensions (avatar sizes, thumbnail ceiling) still live in
  `Tokens.Sizes` only where more than one screen agrees.
- User-visible strings in the migrated screens remain inline Kotlin strings, as
  they were before this release; the resource migration is tracked separately.
- Chat composer layout at 1080×2340 (pre-existing squashed text field) is not
  addressed by this release.
