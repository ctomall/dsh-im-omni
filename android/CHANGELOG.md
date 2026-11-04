# Changelog — DSH Omni Android

All notable changes to the Android companion app. The plugin itself is
versioned separately; this file tracks `com.ila3.dshomni`.

## 0.4.2 — 2024-11-04 (versionCode 9)

### Chat page redesign

- **Composer rebuilt as two decks.** The old single row packed five 48dp icon
  buttons next to the text field, which left it ~60dp wide on a 411dp screen and
  wrapped the placeholder one character per line. Secondary actions (备注 /
  快捷回复 / 附件 / AI) now sit on their own toolbar row; the field takes the
  full width with a 48dp circular send button beside it.
- **Bubbles hug their content** and cap at 82% of the pane instead of every
  message occupying 84% (short replies used to look like empty walls).
- **Day separators** (今天 / 昨天 / 11月3日) between calendar days, and bursts
  from one speaker are spaced tightly (4dp) while speaker changes get 12dp.
- The composer surfaces the note-mode hint (仅内部可见) and keeps every existing
  callback, so sending, notes, templates, attachments and AI drafts behave as
  before.

### Notes

- No business logic, API call or data model changed; only `ui/chat/ChatScreen.kt`
  layout and styling.

## 0.4.1 — 2024-11-04 (versionCode 8)

### Changed

- The strings added in 0.4.0 (theme card, bulk-read action, search hint, image
  preview) now live in `res/values/strings.xml` with an English
  `res/values-en/strings.xml`, instead of inline Kotlin literals. No visual
  change in Chinese; English devices stop falling back to Chinese for these.

### Fixed

- Pairing over the public Cloudflare entry: `/phone` was proxied unbuffered, so
  cloudflared stalled every `POST` to the pairing form and the app sat on
  「配对中…」. nginx now buffers that location (server-side fix, no app change).

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
- Pairing over the public Cloudflare entry: the `/phone` reverse proxy buffered
  nothing, so cloudflared stalled every `POST` to the pairing form (the app sat
  on 「配对中…」). nginx now buffers that location; `POST /phone/pair` answers
  again and a real device pairs.

### Known limitations

- Only the colour, spacing, radius and typography layers are tokenised; some
  component-specific dimensions (avatar sizes, thumbnail ceiling) still live in
  `Tokens.Sizes` only where more than one screen agrees.
- User-visible strings in the migrated screens remain inline Kotlin strings, as
  they were before this release; the resource migration is tracked separately.
- Chat composer layout at 1080×2340 (pre-existing squashed text field) is not
  addressed by this release.
