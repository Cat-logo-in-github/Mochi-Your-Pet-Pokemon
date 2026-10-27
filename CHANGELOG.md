# Changelog

## 1.3.0 - 2026-10-27

- Fixed GitHub packaging after Windows line-ending normalization: preserve pinned artwork bytes with required .gitattributes, retain strict checksums, and cover the actual Git add/checkout path.

- Durable Gmail alerts with visible filter/check results, cursor baselines, later Inbox-label handling and pet inbox recovery when system notifications fail.
- Calendar reminders expose a rolling 30-day schedule, default 9 AM all-day alerts and clear next-check/scheduled counts.
- Standalone Windows Google connections use a personal Desktop OAuth client, system-browser PKCE consent and an encrypted per-user credential/cache store.
- Refined real-player music controls in the browser and Windows companion, with accessible transport icons and clearer player state.
- Fixed the browser pet's Settings action to open the full options page through the background worker.
- Public release checks reject private Google cache files and personally configured OAuth extension builds.

## 1.2.0 - 2026-10-27

- Google web workflow commands for agenda, unread mail, sender search, reviewed email drafts and Calendar editor forms, with natural phrasing.
- Optional personal Google connection for private local Calendar reminders and important-mail alerts. No publisher API project is distributed.
- Important sender preferences remain in the browser profile; private Google data stays out of page messages and exported backups.
- Direct runnable Windows downloads, automatic GitHub release builds and a complete source/browser/desktop handoff ZIP.

## 1.1.1 - 2026-10-26

- Fixed short reminder units such as `10 min`, `20m` and `5 sec` across desktop, browser and demo.
- Added explicitly requested scheduled link opening alongside reminder notifications and readable dialogues, with durable occurrence claims preventing repeated navigation after restart.
- Kept snoozed and imported links available for manual opening; imported reminders require a fresh automatic-open opt-in.
- Added manual link scheduling fields, clear action feedback, and a visible executable version for troubleshooting.

## 1.1.0 - 2026-10-26

- Added actual Windows media-session playback controls and a player chooser, plus on-demand browser audio/video controls with verified player feedback.
- Added persistent readable pixel reminder dialogues, OS notifications, Snooze/Dismiss and an unread reminder inbox, including recovery when notifications are blocked or no page is open.
- Added notification status/test controls and clearer Calendar event setup.
- Added persisted cursor-follow frequency choices while preserving the prior default cadence.
- Added explicit saved-page reminder commands that keep the page title and link locally.

## Unified sprite-family project revision - 2026-10-26

- Consolidated the deliverable into one GitHub-ready `mochi-project.zip` with START-HERE, native/browser/web source, source sprite sheets and XML timing, credits, asset tools, and animation atlases.
- Added Eevee and all eight evolutions through a common manifest-driven 2D sprite player, with nine-companion website selectors, directional playback, and source animation previews.
- Preserved source frame holds and legitimate action aliases; adapted PNG/transparency/timing/coverage guards for pixel art.
- Kept application code licensing separate from third-party sprite credits and source Attribution-NonCommercial terms.
- Added GitHub Actions Pages base-path discovery and optional version-tag releases combining native and browser build artifacts.

## 1.0.0 - 2026-10-25

- Added the original Mochi browser pet, shared deterministic commands, local reminders, appearance/lifecycle settings, and settings backup/import.
- Added event-driven MV3 alarm reconstruction, notification occurrence claims, snooze/dismiss, missed-reminder policies, and quiet hours.
- Added safe website shortcuts, YouTube search/navigation, honest provider capabilities, and separate original local demo audio.
- Added optional Chrome Google Calendar/Gmail read-only adapters with configuration/consent boundaries, pagination, metadata-only Gmail history synchronization, and backoff.
- Added the static landing/demo/setup/privacy website, CI/Pages workflows, deterministic extension/source ZIP packaging, and release verification.
- Included an optional unbuilt desktop scaffold. No native installer, live Google acceptance, store approval, or remote Pages deployment is implied by this source release.
