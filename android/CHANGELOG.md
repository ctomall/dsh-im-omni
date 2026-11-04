# Changelog — DSH Omni Android

All notable changes to the Android companion app. The plugin itself is
versioned separately; this file tracks `com.ila3.dshomni`.

## 0.5.2 — 2024-11-04 (versionCode 12)

### P2 — contacts page

- Grouping switch: **按渠道 / 按公司**, with sticky section headers. Contacts that
  carry no channel identity fall into a human-readable 未分组 bucket; contacts
  without a company fall into 未填写公司 (both were raw sentinels before).
- Failures when no snapshot has ever loaded now show an explicit
  「联系人加载失败 + 原因 + 重试」 pane instead of pretending the address book is empty.
- Search covers name / company / phone / handle / email and distinguishes
  "no match" from "no contacts at all".

Version 0.5.2 (code 12). 39 tests, 0 failures; lint clean.

## 0.5.1 — 2024-11-04 (versionCode 11)

### P1 — IM information architecture

- Bottom navigation is now the four IM tabs: **会话 / 联系人 / 渠道 / 我**.
  Chat, channel detail and the add-channel wizard still stack on top of them.
- New **联系人** tab: every customer from the workspace snapshot, searchable by
  name / company / phone / handle / email, each row showing its channels.
  Tapping a contact opens that contact's newest conversation (falling back to
  the inbox when there is none yet).
- Pairing is the app's login: with no saved host the app opens the pairing gate,
  and a saved host still opens straight into 会话. Pairing failures are now
  classified instead of surfacing one generic sentence:
  `pair-code` (invalid/expired), `pair-rate` (too many attempts),
  `pair-tls` (certificate), `pair-dns` (unknown host), `pair-timeout`,
  `pair-network`, `pair-failed`.
- Tab labels, contacts copy and pairing messages moved to `strings.xml`
  (zh + en).

### Notes

- No `/api/im-omni.*` contract, data model or route semantics changed.
- Contacts grouping/empty-state polish lands with P2.

## 0.5.0 — 2024-11-04 (versionCode 10)

### WeChat-style visual direction

Replaces the Harbor look with the layout and palette conventions of WeChat,
used here as the reference the product owner picked after the WhatsApp sources
turned out to be unreachable from this host.

- **Palette**: accent `#07C160`, page background `#EDEDED` (`#111111` dark),
  list surface white (`#191919`), body text `#191919` (`#D6D6D6`), secondary
  `#888888`, divider `#E5E5E5`, unread badge `#FA5151`, link `#576B95`.
- **Bubbles**: outgoing `#95EC69` with `#191919` text (dark: `#3EB575` white),
  incoming white (dark `#2C2C2C`), 6-10dp radius, content-hugging width.
- **Chat list**: flat rows on a grey page — 48dp avatar, 16sp name, one-line
  preview, 12sp relative time, red count badge; the gradient hero header is
  replaced by a plain white bar with the title left and two icon actions.
  Search is a single-line grey pill; the status filters became quiet text tabs.
- **Chat page**: centred name in a white header, grey message pane, green send
  button, grey pill composer field without an outline.
- Filter tabs and the channel/agent metadata line are kept because they carry
  business data WeChat has no equivalent for; this is the only intentional
  deviation from the reference.

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
