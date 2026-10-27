# Mochi privacy policy

Effective date: 27 October 2026. This policy describes the code supplied in this repository. A distributor must add its actual operator identity and contact before a public store listing; no operator email is invented here.

## Default extension

Mochi works locally without an account, server, subscription, analytics service, or external AI model. It does not collect browsing history, inspect unrelated web-page content, scrape music services, or transmit reminder text to an application backend. Content-script access to ordinary HTTP/HTTPS pages is required to draw the browser-wide pet; page access is not used to build browsing profiles.

The extension saves preferences, lifecycle state, per-window pet positions, reminder definitions and occurrence state, recent user-issued navigation/music commands, a small diagnostic log, and notification deduplication records in `chrome.storage.local`. Optional personal Google integrations also save status, bounded generic agenda summaries, synchronization cursor/seen IDs, sender-filter preferences and durable unread mail/reminder cards locally. Chrome manages OAuth tokens in its identity cache; Mochi does not export or log them.

## Optional external requests

When you explicitly ask to open a website or search YouTube, your browser contacts that website under its own privacy policy. The YouTube search adapter constructs a normal search URL and does not verify an official song result. Explicit extension media requests read/control a supported tab player; native media requests use Windows media sessions. These controls do not send playback data to a Mochi server.

The public build has no Google API client or shared publisher project. An optional personal extension copy or native connection uses the user's own Cloud project and quotas; they use separate client types and stores. After separate consent, Calendar reads selected event times and links with generic labels; event titles and descriptions are not fetched. Gmail reads unread/importance labels and requests the From header only when a sender list needs matching. Subjects and bodies are never fetched; no mail sending, deletion or read-state change is possible through this API adapter. Users can disconnect either service at any time. Requests go directly to official Google APIs under Google's policies.

No personal data is sent to third-party AI services. No remote executable code, advertising library, or tracking pixel is included.

## Native Windows companion

The separate Windows application keeps its own settings, pet position, website shortcuts, and local reminder definitions/occurrence claims in `%LOCALAPPDATA%\Mochi\state.json` by default; settings display the exact local data directory. It has no browser messaging bridge, telemetry or application server. Optional Google monitoring is a separate native connection using the user's own Desktop OAuth client. Native reminders are independent of extension reminders. Explicit website/music-search commands open validated HTTP/HTTPS addresses in the user's normal browser.

Start at Windows sign-in is an opt-in setting and can be removed before deleting the portable application. Hide keeps the native process/reminders running; quit stops them. Quit before backing up or deleting the displayed data directory. Ordinary native state is not an encrypted vault. Optional native Google configuration, an optional Desktop client secret, access/refresh tokens, sync cursors, generic cached event records and pending mail state are stored together under `%LOCALAPPDATA%\Mochi\Google`, protected with Windows DPAPI for the current user. They are outside the project and excluded from public releases. The app opens Google's consent page and uses a temporary local loopback callback with state/PKCE validation. It does not receive a Google password.

Native Google requests contact official APIs directly. The public app has no configured client or shared publisher project. Calendar/Gmail use independent read-only consent, and no token moves between the Windows app and extension. DPAPI does not protect against malicious code running as the same Windows user or a compromised OS. Deleting native data does not affect extension data or revoke Google-side consent.

## Website demo

The static website uses no account connections, analytics, tracking cookies, remote fonts, or application data backend. Its interactive demo stores state only in memory for the open tab; its timers do not provide durable reminders. The web host may process ordinary request logs and network information under the host's policy. The website cannot independently display a pet across other browser tabs.

## Notifications and visibility

Local reminder notifications may display the personal text you entered. Optional Google notifications use generic event/mail labels and times; sender names, email subjects and event titles are not displayed. OS lock-screen and notification settings can expose that text to people nearby. Gmail defaults to All new inbox mail; Important and Senders only are explicit narrower filters. The first successful check creates a silent baseline. Quiet hours, pause and service mute can defer OS delivery while unread cards remain queued. Calendar keeps a rolling 30-day window; all-day reminders default to 9 AM unless changed. These settings control Mochi's alert behavior. The browser and OS can delay or suppress notifications.

## Retention, export, deletion

Local data remains until you reset/delete it, disconnect a service, or uninstall the extension under normal browser behavior. Recent command/diagnostic lists, cached agenda, seen IDs, and deduplication records are bounded by implementation limits. A local export can contain reminder titles, preferences, and command history; keep it private and delete it separately when no longer needed. Google tokens, sender preferences, Google event caches and Google-derived reminders are not included in the export. Review your own local reminder/command text before sharing a backup. A whole-folder native backup may include the encrypted private Google store; keep it private rather than adding it to source or public support files.

Use settings in each runtime to disconnect a service and clear its service-specific local data/cache. Native and browser stores are independent; disconnecting one does not disconnect the other. Revoking authorization entirely requires Google's account app-access controls. A local reset clears Mochi data; removing the extension clears extension storage under normal browser behavior. Removing source/build folders alone does not revoke Google consent or remove exported backups.

## Protection and limitations

Messages, imported settings, and navigation destinations are validated. API content is treated as untrusted data. Browser storage and ordinary native state are not encrypted against the operating system, a person with profile access or privileged software. Native Google data uses current-user DPAPI, with the same-user/compromised-PC limits described above. Mochi does not claim complete isolation from other browser extensions or the OS. No privacy or security guarantee can cover modifications made by a redistributor.

## Contact

A public release maintainer must publish a real privacy/security contact before store distribution. For this local source distribution, use the repository's private vulnerability reporting feature if the future maintainer enables it. Do not put tokens, mailbox contents, or personal reminder text in public bug reports.

## Optional timed link opening

A newly scheduled local reminder with one explicit safe HTTP/HTTPS URL can request opening that destination when due. The URL is saved with reminder text in the selected runtime's local store, and opening it contacts the destination through the normal browser. Snoozing keeps the link available for manual opening without repeating automatic navigation; imported reminders and Calendar-derived links do not silently grant this permission. The website demo stores its queue only in memory and may have its timed popup blocked, in which case it retains an explicit Open saved link action.
