# Mochi desktop: OPTIONAL, UNCOMPILED SCAFFOLD

**This folder is source scaffolding, not a finished desktop release.** It was added only after the browser extension, website, automated checks, and release ZIPs were complete. Rust and Cargo are absent from the build host. No native build, desktop runtime test, Cargo lockfile, signed binary, or installer was produced. Do not advertise desktop support as tested.

The main repository install, tests, builds, and extension ZIP do not depend on this folder. Desktop is deliberately excluded from the root npm workspaces. Its dependencies are installed separately only if you choose to develop it.

## Source included

- A Tauri 2 configuration for a small transparent, undecorated, always-on-top window.
- The same original `Pet` React component and animation styles as the extension.
- Explicit native window calls for dragging, hide, always-on-top, and click-through, with failure feedback.
- A Rust system-tray menu with **Show Mochi / restore interaction**, **Hide**, and **Quit**. The tray is created before the window UI can be used. Show restores pointer interaction before showing/focusing the window.
- A registered Rust `quit` command that exits the application.
- A capability restricted to the local `main` window and the four window operations the frontend uses. No shell, filesystem, remote-webview, browser-profile, account, or network plugin is enabled.
- Separate desktop color preference in the desktop webview's local storage. The extension's settings, reminders, OAuth consent, history, and tokens are not connected.
- Reduced-motion styling and animation suspension when the webview is hidden.

These are source implementations awaiting native compilation and runtime checks. Running the frontend alone does not create a desktop overlay; native controls are disabled in that case.

## Prerequisites and development commands

Follow [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/). For Windows, install the current stable Rust MSVC toolchain, Microsoft C++ Build Tools with the desktop C++ workload and Windows SDK, and Microsoft Edge WebView2. Linux requires the distribution-specific WebKitGTK/appindicator/build dependencies. macOS requires its documented Xcode command-line tooling. Cross-platform behavior has not been tested.

From the repository root, after installing the normal repository dependencies:

```sh
cd apps/desktop
npm install --workspaces=false
npm run typecheck
npm run dev
```

These developer commands were **not executed** on this host. `npm install` will create a separate desktop npm lockfile; Tauri/Cargo will resolve the native dependency graph and create `src-tauri/Cargo.lock`. Review and commit both lockfiles only after a successful native verification. Current direct JS package versions were verified against the Tauri publisher's npm pages; direct Rust versions were verified against docs.rs. Transitive dependencies remain unlocked in this optional scaffold.

For a local native executable, after verifying development mode:

```sh
npm run web:build
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
```

`bundle.active` is intentionally `false`: no platform installer is configured or implied. A successful native build would write its executable under `src-tauri/target/release/`; no such output exists in this release. Enable packaging, create platform icon variants, sign, and verify a real target build before distributing an installer.

## Native verification still required

1. Confirm the window is transparent and remains visible above ordinary applications on the target OS. Check full-screen applications separately; always-on-top is not guaranteed over every OS surface.
2. Drag from the marked strip across monitors with different scaling. Check keyboard access and visible focus for every control.
3. Hide, restore from the tray, and quit from both the UI and tray.
4. Confirm the tray icon is visible, then enable click-through. Restore via the tray and confirm mouse interaction returns. Do not use click-through on a platform where tray recovery has not been verified.
5. Check pause/wake, color persistence, hidden-window CPU behavior, and reduced-motion settings.
6. Test failure paths and OS display/compositor differences. Linux tray support depends on the desktop environment. No auto-start-at-login, window-position recovery, or native notifications have been implemented.

There is no extension/native bridge, shared live state, Calendar/Gmail integration, music controller, or reminder scheduler in this scaffold. Those features remain in the verified browser extension. This scaffold does not gain access to browser data merely by running.

## API references

The source uses the documented [Tauri window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/), [system-tray menu API](https://v2.tauri.app/learn/system-tray/), [configuration schema](https://v2.tauri.app/reference/config/), and [Rust Image API](https://docs.rs/tauri/latest/tauri/image/struct.Image.html). Package versions: [JS API](https://www.npmjs.com/package/@tauri-apps/api), [CLI](https://www.npmjs.com/package/@tauri-apps/cli), [Rust Tauri](https://docs.rs/tauri/latest/tauri/), and [Rust build helper](https://docs.rs/tauri-build/latest/tauri_build/).
