# Personal Google connections in 1.3

The public build contains **no configured Google API client, shared Cloud project, server or account**. Reviewed Gmail/Calendar web shortcuts and local reminders work immediately. Automatic Calendar and Gmail monitoring is optional and needs each user's own Google project. A publisher project would share project quotas even when each user signs in separately. Windows and Chrome have independent connections and caches; neither forwards its token to the other.

Chrome setup uses only a public client ID. A Google Desktop client may also require the optional secret supplied with that client; enter it only in the native app's masked local field. Never paste secrets, passwords, tokens or credentials JSON into chat, source, diagnostics, screenshots or public build settings. Keep Google passwords and consent on Google's pages.

## Windows companion: one-time personal setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project you control and enable Calendar API, Gmail API, or both.
2. Configure Google Auth Platform Branding and an External audience in Testing, then add your own account as a test user. Follow Google's current consent requirements; testing authorization can expire and require reconnection.
3. Create an OAuth client with application type **Desktop app**. A Chrome Extension or Web application client is not interchangeable.
4. Open Mochi's **Google connections**, enter that Desktop client ID and save it locally. If Google requires the client's secret, use the optional masked field on this PC. Do not enter a Google account password in Mochi.
5. Choose **Connect Calendar** and/or **Connect Gmail**. Each service has separate read-only consent. Mochi opens Google in the browser and receives the result through a short-lived loopback listener on this PC, using a state check and PKCE. Return to Mochi after consent; no permanent web server or shared backend is used.
6. Refresh, confirm the last successful check and selected filters, then use Reminders → **Test notification**. Choose checks every **1, 5 or 15 minutes**. Mochi must remain running and Windows awake; the browser can be closed after sign-in.

Native configuration, optional client secret, access/refresh tokens, synchronization cursor, generic Calendar cache and pending mail state are stored together under `%LOCALAPPDATA%\Mochi\Google`, protected with Windows DPAPI for the current user. They are runtime data outside the project and public ZIP. DPAPI is not protection against malicious software running as that user or a compromised computer. Ordinary native preferences/local reminders in state.json are separate and are not an encrypted vault.

After a successful refresh, cached Calendar events become native reminders. Those reminders can notify with all browsers closed while Mochi runs. Network access and future refreshes are needed to learn changed/cancelled events and new mail. Disconnect services independently; revoke Google account-side access separately when desired.

## Chrome extension: one-time personal setup

1. Install/open **Google Chrome**. This adapter uses Chrome identity; Edge supports local Mochi features and web shortcuts but not this OAuth flow.
2. In [Google Cloud Console](https://console.cloud.google.com/), create a project you control. Enable **Google Calendar API**, **Gmail API**, or both.
3. In **Google Auth Platform**, configure Branding and an External audience in Testing. Enter support/contact details only on Google. Add your own Google account as a test user. Testing authorizations can expire and require reconnection; follow Google's current consent guidance.
4. Create an OAuth client of type **Chrome Extension**. Enter this Item/Extension ID: **`imachbdfmaljglbplhifpbogjckhnbkl`**. The supplied public extension key preserves that ID across unpacked installations. No private signing key is shipped.
5. Copy only the public Client ID ending `.apps.googleusercontent.com`.
6. In the extracted complete ZIP, run the helper below. It copies the included public extension to a new folder outside the project and adds only your public client ID there. No Node.js or source compilation is needed. The original Browser-Extension and public source remain unconfigured.

```powershell
powershell -NoProfile -File scripts/setup-personal-google.ps1 -ClientId YOUR_PUBLIC_CLIENT_ID.apps.googleusercontent.com
```

The helper prints a new personal folder under `%LOCALAPPDATA%\Mochi`. Keep that folder private; do not redistribute it. It refuses existing destinations and destinations inside this project.

7. Open `chrome://extensions`, enable Developer mode and **Load unpacked** that personal folder. If the public extension with the same fixed ID is already installed, remove it first; back up any local reminders you need because removal clears its storage. A personal OAuth build must not be packaged into the public download.
8. Open Mochi settings → **Connections**. Choose Calendar or Gmail → **Connect**. Review the separate host permission and Google consent yourself. Connect only the expected account/project/service.
9. Use **Check now**, then **Send test notification** in Reminders. Google permissions, Windows notification settings, quiet hours and the browser's running state affect delivery.

For developers, the alternative is to set `MOCHI_GOOGLE_CLIENT_ID` only in a local environment and run `npm run build --workspace @mochi/extension -- --personal-google`. Default builds reject a configured ID, and public packaging rejects any OAuth-configured extension. Do not change google-public.json.clientId; it must stay blank. A Chrome identity client does not use a fabricated redirect URL, a web-client secret or an implicit-token flow.

## Calendar events and reminders

Scope: `https://www.googleapis.com/auth/calendar.events.readonly`.

Calendar monitoring reads selected calendar IDs (primary by default) into a bounded, rolling **30-day snapshot**. Choose supported event types and an advance reminder of 0, 5, 10, 15, 30 or 60 minutes; 10 minutes is the default. Timed events get local reminders. All-day reminders are enabled by default at **9 AM**; change the hour or disable them in connection settings. Chrome evaluates the selected all-day hour in the calendar's timezone; the native reminder engine uses the documented Windows timezone behavior. Moved/cancelled events update at the next successful refresh. A failed or incomplete snapshot preserves the previous saved schedule rather than claiming a complete refresh. Event titles and descriptions are not requested: cached labels and notifications are generic, with dates/times and a link back to Google.

Commands such as `create calendar event Team catch-up tomorrow at 15:00 for 30 minutes` prepare a reviewed Calendar editor link. You finish **Save** in Google. The API connection cannot create, change or delete events. **Google Tasks is a separate API and is not connected.** Snooze, Dismiss and mute affect only Mochi's local reminder state.

## Gmail arrival alerts and filters

Scope: `https://www.googleapis.com/auth/gmail.metadata`.

The default is **All new inbox mail**. Choose **Important** (Gmail IMPORTANT label OR your sender list) or **Senders only** to narrow it deliberately. Enter exact sender email addresses when using a sender filter. The active mode is shown explicitly; older saved Important/Senders settings are retained for review rather than silently widened. The first successful check establishes a silent baseline, so old messages do not become new alerts. Later history checks queue eligible new inbox mail and deduplicate delivery. Native and Chrome keep their own baseline and filters. Chrome follows new INBOX arrivals even if a message was read before its next check; this is not restricted to the current unread count. A legacy-filter review banner offers **Enable all new inbox mail** without silently discarding an explicit saved choice.

Mochi never fetches message subjects or bodies. It requests the From header only when needed to match a nonempty sender list. Alerts show generic new-mail text and open Gmail for private details. Readable mail cards remain until acknowledged even if an OS notification is refused. Connection status records the last/expected next check, eligibility counters, filter outcome and queued work. Use **Check now** for a direct check without waiting for the alarm. Pause, quiet hours and mail mute defer the corresponding OS delivery; queued items survive restarts. A silent baseline or filtered message is not a promised notification. The metadata scope cannot send, delete or mark mail read; searches and compose commands open reviewed Google pages, and you finish Send yourself. This is a Google restricted scope; wider public OAuth distribution is subject to Google's verification requirements.

## Privacy, scheduling and quota ownership

Requests go directly from the chosen runtime to official Google APIs after consent. There is no Mochi proxy, service account, shared key, webhook server, remote AI call or publisher analytics. Chrome owns the extension token cache; native tokens use the separate DPAPI-protected store. Google state, sender addresses and event links are kept out of ordinary host-page broadcasts and exported extension backups. No credential or Google cache belongs in the public project. Browser/OS/profile access remains a security boundary.

Chrome normally checks enabled services on a **one-minute browser alarm**. The native app offers **1, 5 or 15 minutes**. Both use bounded requests/timeouts and retry backoff on errors; these are approximate check intervals, not instant push delivery. Paused/shut-down services stop nonessential sync. Google quotas belong to **your personal project**, not the publisher. Mochi does not request a quota increase. Google's current quotas, policy and any project charges remain the project owner's responsibility; GitHub hosting/download bandwidth also has limits.

In Chrome, Calendar pagination is bounded to five pages per selected calendar and 1,000 events. Gmail processes up to 50 messages or 20 seconds per batch, resuming a bounded backlog on a later check. Expired Gmail history triggers a safe baseline refresh. Unauthorized tokens are removed and require reconnecting. Provider errors show sanitized status without response bodies or account details.

For extension monitoring, Chrome must remain running, the extension enabled and Windows awake. Sleep, browser energy saving and OS Do not disturb can delay or suppress display. Due reminders request an OS notification even without a supported page; on a supported page Mochi returns to view with a readable pixel dialogue. Unread reminders remain in the inbox. The native store is independent and can use its own Desktop-client connection. The website demo never signs into or monitors Google accounts.

## Disconnect

Disconnect each service in the runtime where it was connected to stop sync and clear its service-specific local cache/reminders/notification claims. Unrelated local reminders remain. Revoke Google-side access separately in your Google Account when desired. Removing the extension clears its profile storage under normal browser behavior. Do not include personal account screens, tokens or backups in bug reports.

## Verification boundary

The historical personal Chrome consent/refresh check is recorded in release status. Live native Desktop OAuth, new-mail OS delivery and real Calendar due-event delivery require separate target-account acceptance. Do not infer those outcomes from mocked API tests, a Connected label alone, or the presence of this setup guide. Final 1.3 evidence is recorded only after integration checks complete.

## Official references

- [Google Desktop OAuth, PKCE and loopback flow](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Chrome OAuth integration](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth)
- [Chrome identity API](https://developer.chrome.com/docs/extensions/reference/api/identity)
- [Gmail API quotas](https://developers.google.com/workspace/gmail/api/reference/quota)
- [Calendar API quotas](https://developers.google.com/workspace/calendar/api/guides/quota)
- [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
