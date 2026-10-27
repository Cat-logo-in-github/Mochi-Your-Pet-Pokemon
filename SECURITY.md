# Security policy

## Scope and supported version

This source release supports Mochi 1.x. The extension is local-first and uses packaged local code and attributed third-party sprite assets. No server, telemetry, external AI model, dynamic code execution, or page-to-worker command bridge is part of the default design.

## Report a vulnerability

**Distributor action required before public distribution:** replace this paragraph with a real security contact or enable GitHub private vulnerability reporting for the published repository. No real address is invented for this local source package. If private vulnerability reporting is enabled, use the repository's Security tab; otherwise contact the maintainer through a channel they actually publish. Never post bearer tokens, account contents, personal reminders, or credentials in a public issue.

Include the affected version, browser/OS, reproduction steps using harmless fixtures, impact, and an appropriate fix suggestion. Redact secrets from logs and screenshots.

## Threat model

Untrusted inputs include webpage text, imported JSON, commands, runtime message payloads, URL strings, and Google API display data. The implementation validates discriminated message types, sender/context expectations, bounded imported data, URL schemes/credentials, provider API hosts, and notification links. Only packaged local code executes. Shadow DOM prevents style leakage; it does not create isolation from the browser, OS, profile access, or equally privileged software.

Privileged settings/import/reset/Google actions are limited to expected extension pages. Content scripts can request their permitted pet/command operations but do not expose a web-page messaging bridge. API results are never parsed as commands. No `eval`, dynamic `Function`, arbitrary command execution, unsafe HTML injection or remote JavaScript loading is used.

The native Windows companion is a separate WPF process with independent local state, explicit opt-in sign-in startup and no browser/native Google token bridge. Its optional Google connection uses its own Desktop OAuth client, a temporary loopback callback, PKCE and state validation, and allowlisted official provider endpoints. Its website commands validate HTTP/HTTPS destinations before using Windows URL associations; command text is never interpreted as shell code. The native build and runtime checks are separate from browser mocks and bundle checks.

## Credentials and data

Public OAuth client IDs identify a project and are not secrets. The default public download ships with none configured, so it does not share a publisher project's API quota. Personal Chrome copies remain outside the project and are rejected by public packaging. The native app accepts a user's own Desktop client ID at runtime; a Chrome Extension client is not interchangeable. An optional Desktop client secret belongs only in the masked local field when required by Google. Never ask users to paste it, passwords, tokens or credentials JSON into chat or support logs.

Client secrets, access/refresh tokens, private signing keys, real mailbox fixtures and user backups must never be committed or included in a public ZIP. Chrome's identity cache owns extension Google tokens. Native Google configuration and the entire private cache are DPAPI-protected for the current user under `%LOCALAPPDATA%\Mochi\Google`; ordinary state.json and browser local storage are not encrypted vaults. DPAPI does not isolate data from malware running as that user or a compromised OS. Do not place runtime cache folders in the portable source tree. Export files may contain reminder and command text; store them privately. Disconnect and revoke Google-side consent separately when appropriate.

## Release review

Run typecheck, tests, lint, builds, manifest validation, packaging, and release verification. Packaging rejects secret-like paths and known private-key/token patterns, with deterministic ZIP timestamps and checksums. This does not prove absence of every possible secret or vulnerability. Review dependencies, permissions, changed account scopes, CSP, and the manual acceptance checklist before public distribution.

## Google data and delivery review

Only read-only Calendar event timing/IDs and Gmail metadata are requested; event titles/descriptions and mail subjects/bodies are not fetched. Sender headers are requested only for configured sender matching. API display data is never interpreted as commands. Web compose/event shortcuts open a reviewed Google page where the user chooses Send/Save; they do not invoke write APIs.

Calendar caches and durable mail/reminder queues survive ordinary restarts. OS notifications and readable cards are separate delivery surfaces, affected by quiet hours, pause, mute, permissions and provider availability. Use harmless controlled fixtures for delivery tests. Publish live OAuth or real-account delivery acceptance only when directly observed and recorded; a mocked test or connection status alone is insufficient.
