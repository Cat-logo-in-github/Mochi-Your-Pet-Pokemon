import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { petClipMilliseconds, PET_SKINS, PET_SKIN_LABELS } from '@mochi/shared';
import type { PetAction, PetClip, PetSourceAction, Skin } from '@mochi/shared';
import { Pet, type Mood as PetMood } from '../../extension/src/ui/Pet';
import { loadPetManifest } from '../../extension/src/ui/petAssets';
import { DemoWorkspace } from './DemoWorkspace';
import { useDownloads } from './useDownloads';
import './style.css';

type Mood = 'idle' | 'happy' | 'sleeping' | 'eating';
const COMPANIONS = PET_SKINS;
const companionName = (skin: Skin) => PET_SKIN_LABELS[skin];

const ASSET_BASE = `${import.meta.env.BASE_URL}mochi/`;

function useStageSize(maximum: number, padding = 72) {
  const [size, setSize] = useState(() => Math.min(maximum, window.innerWidth - padding));
  useEffect(() => {
    const resize = () => setSize(Math.min(maximum, window.innerWidth - padding));
    window.addEventListener('resize', resize, { passive: true });
    return () => window.removeEventListener('resize', resize);
  }, [maximum, padding]);
  return Math.max(96, size);
}

function Character({
  skin,
  mood = 'idle',
  size = 280,
  paused = false,
  animated = true,
  direction = 'front',
  onComplete,
  onClipReady,
  actionOverride,
  actionLabel,
}: {
  skin: Skin;
  mood?: PetMood;
  size?: number;
  paused?: boolean;
  animated?: boolean;
  direction?: string;
  onComplete?: () => void;
  onClipReady?: (clip: PetClip) => void;
  actionOverride?: PetAction;
  actionLabel?: string;
}) {
  return (
    <span
      className="web-pet"
      role="img"
      aria-label={`${companionName(skin)}, ${actionOverride ? actionLabel || actionOverride.replace(/^pmd_/u, '').replaceAll('_', ' ') : mood}`}
      style={{ width: size, height: size }}
    >
      <Pet
        skin={skin}
        mood={mood}
        size={size}
        paused={paused}
        animated={animated}
        direction={direction}
        assetBase={ASSET_BASE}
        onComplete={onComplete}
        onClipReady={onClipReady}
        actionOverride={actionOverride}
      />
    </span>
  );
}

const SCENES: { action: string; mood: PetMood; title: string; note: string }[] = [
  {
    action: 'groom',
    mood: 'grooming',
    title: 'A little reset',
    note: 'A favorite pose. A quiet little pause.',
  },
  {
    action: 'stretch',
    mood: 'stretching',
    title: 'A small moment to move',
    note: 'A small break between the big things.',
  },
  {
    action: 'walk',
    mood: 'walking',
    title: 'Somewhere to be',
    note: 'Little paws, with a whole world ahead.',
  },
  {
    action: 'play',
    mood: 'play',
    title: 'One more minute',
    note: 'A tiny break becomes a little adventure.',
  },
  {
    action: 'turn',
    mood: 'turn',
    title: 'A curious hello',
    note: 'Looking around, taking everything in.',
  },
  {
    action: 'sleep',
    mood: 'sleeping',
    title: 'Off the clock',
    note: 'A quiet pause. Absolutely no hurry.',
  },
];
const VIEWS = [
  'front',
  'front-right',
  'right',
  'back-right',
  'back',
  'back-left',
  'left',
  'front-left',
];

function CharacterGallery({ skin, setSkin }: { skin: Skin; setSkin: (skin: Skin) => void }) {
  const [scene, setScene] = useState(SCENES[0]);
  const [direction, setDirection] = useState('front');
  const [paused, setPaused] = useState(false);
  const [replay, setReplay] = useState(0);
  const [clip, setClip] = useState<PetClip | null>(null);
  const [sourceActions, setSourceActions] = useState<PetSourceAction[]>([]);
  const [sourceDirections, setSourceDirections] = useState<Record<string, string[]>>({});
  const [sourceAction, setSourceAction] = useState<PetAction | undefined>();
  useEffect(() => {
    let active = true;
    loadPetManifest(ASSET_BASE)
      .then((manifest) => {
        if (active) {
          const catalog = manifest.sourceActionsCatalog || [];
          setSourceActions(catalog);
          setSourceDirections(
            Object.fromEntries(
              catalog.flatMap((entry) =>
                entry.skins.map((species) => [
                  `${entry.action}_${species}`,
                  VIEWS.filter((view) =>
                    Boolean(manifest.clips[`${entry.action}_${species}_${view}`]),
                  ),
                ]),
              ),
            ),
          );
        }
      })
      .catch(() => {
        /* The shared player displays its own loading fallback. */
      });
    return () => {
      active = false;
    };
  }, []);
  const availableActions = sourceActions.filter((item) => item.skins.includes(skin));
  const selectedSource = availableActions.find((item) => item.action === sourceAction);
  const availableDirections = selectedSource
    ? sourceDirections[`${selectedSource.action}_${skin}`] || ['front']
    : VIEWS;
  const previewDirection = availableDirections.includes(direction) ? direction : 'front';
  const size = useStageSize(370, 100);
  return (
    <section className="character-film section-space" id="in-motion" aria-labelledby="motion-title">
      <div className="wrap">
        <div className="film-heading">
          <div>
            <p className="eyebrow">A LITTLE LIFE, IN MOTION</p>
            <h2 id="motion-title">
              More than
              <br />
              <em>a pretty face.</em>
            </h2>
          </div>
          <p>
            Nine familiar friends. Full of little rituals.
            <br />
            The same Mochi, from desktop to browser.
          </p>
        </div>
        <div className="film-grid">
          <div className="film-view">
            <div className="film-view-top">
              <span>THE CHARACTER STUDY</span>
              <span>{skin.toUpperCase()}</span>
            </div>
            <div className="film-art">
              <Character
                key={`${selectedSource?.action || scene.action}-${previewDirection}-${skin}-${replay}`}
                skin={skin}
                mood={scene.mood}
                direction={selectedSource || scene.action === 'walk' ? previewDirection : 'front'}
                actionOverride={selectedSource?.action}
                actionLabel={selectedSource?.label}
                size={size}
                paused={paused}
                onClipReady={setClip}
              />
            </div>
            <div className="film-caption">
              <span>
                {selectedSource?.label || scene.title}
                {clip?.sourceAnimation && (
                  <small className="source-pose-label">Source pose: {clip.sourceAnimation}</small>
                )}
              </span>
              <span>
                {clip
                  ? `${(petClipMilliseconds(clip) / 1000).toFixed(1)} seconds · ${clip.frameCount} frames`
                  : 'Animated pixel sprites'}
              </span>
            </div>
            <div className="film-transport">
              <button onClick={() => setPaused((value) => !value)} aria-pressed={paused}>
                {paused ? '▶ Play' : 'Ⅱ Pause'}
              </button>
              <button
                onClick={() => {
                  setReplay((value) => value + 1);
                  setPaused(false);
                }}
              >
                ↻ Replay scene
              </button>
              <span>Transparent sprites · Frame-by-frame animation</span>
            </div>
          </div>
          <div className="film-notes">
            <p className="eyebrow">A FEW FAVORITE MOMENTS</p>
            <div className="scene-list" role="group" aria-label="Animation scene">
              {SCENES.map((item, index) => (
                <button
                  key={item.action}
                  onClick={() => {
                    setScene(item);
                    setSourceAction(undefined);
                    setClip(null);
                    setPaused(false);
                  }}
                  aria-pressed={!selectedSource && scene.action === item.action}
                >
                  <span>0{index + 1}</span>
                  <span>{item.title}</span>
                  <span aria-hidden="true">
                    {!selectedSource && scene.action === item.action ? '↗' : '+'}
                  </span>
                </button>
              ))}
            </div>
            <p className="scene-note-copy">
              {selectedSource
                ? `From the source sheets: ${selectedSource.sourceName || selectedSource.label}.`
                : scene.note}
            </p>
            {availableActions.length > 0 && (
              <label className="view-select source-action-select">
                Explore every source animation
                <select
                  value={selectedSource?.action || ''}
                  onChange={(event) => {
                    setSourceAction(
                      event.target.value ? (event.target.value as PetAction) : undefined,
                    );
                    setClip(null);
                    setPaused(false);
                  }}
                >
                  <option value="">Favorite moments</option>
                  {availableActions.map((item) => (
                    <option key={item.action} value={item.action}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="film-skins" role="group" aria-label="Choose your companion">
              {COMPANIONS.map((coat) => (
                <button
                  key={coat}
                  aria-label={companionName(coat)}
                  aria-pressed={skin === coat}
                  onClick={() => setSkin(coat)}
                >
                  <Character skin={coat} size={66} animated={false} />
                  <span>{companionName(coat)}</span>
                </button>
              ))}
            </div>
            {(selectedSource || scene.action === 'walk') && (
              <label className="view-select">
                A different point of view
                <select
                  value={previewDirection}
                  onChange={(event) => setDirection(event.target.value)}
                >
                  {VIEWS.map((view) => (
                    <option key={view} value={view} disabled={!availableDirections.includes(view)}>
                      {view.replaceAll('-', ' ')}
                      {availableDirections.includes(view) ? '' : ' — not in source'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="film-footnote">
              Source sprite sheets, animation timing, artist credits, and all three apps live
              together in one project. The same pixel companions follow you from desktop to browser.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function App() {
  const downloads = useDownloads();
  const buildVersion =
    typeof __MOCHI_BUILD_VERSION__ === 'string' ? __MOCHI_BUILD_VERSION__ : '1.2.0';
  const [skin, setSkin] = useState<Skin>('eevee');
  const [mood, setMood] = useState<Mood>('idle');
  const [reply, setReply] = useState('A small companion. A little less alone.');
  const heroSize = useStageSize(390, 64);
  const finishReaction = useCallback(
    () => setMood((previous) => (previous === 'sleeping' ? previous : 'idle')),
    [],
  );
  function openPrivacy() {
    const details = document.querySelector<HTMLDetailsElement>('#privacy-details');
    if (details) details.open = true;
  }

  function interact(next: Mood) {
    setMood(next);
    setReply(
      next === 'happy'
        ? 'Purrr. That made my day.'
        : next === 'eating'
          ? 'A tiny snack? For me? ♡'
          : next === 'sleeping'
            ? 'Just resting my eyes…'
            : 'Hello again, friend.',
    );
  }

  return (
    <div className={`site skin-${skin}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar wrap">
        <a href="#" className="brand" aria-label="Mochi home">
          <img
            className="brand-cat-logo"
            src={`${import.meta.env.BASE_URL}favicon.png`}
            alt=""
            aria-hidden="true"
          />{' '}
          mochi<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#little-things">The little things</a>
          <a href="#playground">Meet Mochi</a>
          <a href="#in-motion">In motion</a>
          <a href="#install">Get started</a>
        </nav>
        <a href={downloads.windows?.href || '#install'} className="button button-small">
          {downloads.windows ? 'Download Windows' : 'Get Mochi'} <span aria-hidden="true">↗</span>
        </a>
      </header>
      <main id="main">
        <section className="hero wrap" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span /> A LITTLE COMPANY, WHEREVER YOU WORK
            </p>
            <h1 id="hero-title">
              A little life,
              <br />
              <em>by your side.</em>
            </h1>
            <p className="hero-description">
              Meet Mochi. A little pixel companion that roams your desktop, remembers the small
              things, and makes a workday feel a little more human.
            </p>
            <div className="hero-actions">
              <a className="button" href={downloads.windows?.href || '#install'}>
                {downloads.windows ? 'Download for Windows' : 'Bring Mochi home'}{' '}
                <span aria-hidden="true">↗</span>
              </a>
              <a href="#playground" className="text-link">
                Say hello first <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="hero-note">
              <span aria-hidden="true">✧</span> Free fan project <span aria-hidden="true">·</span>{' '}
              Local-first <span aria-hidden="true">·</span> No account needed
            </p>
          </div>
          <div className="hero-scene cinematic-scene">
            <p className="scene-kicker">MOCHI / YOUR PIXEL COMPANION</p>
            <span className="orbit-mark orbit-one" aria-hidden="true">
              ✧
            </span>
            <span className="orbit-mark orbit-two" aria-hidden="true">
              ✦
            </span>
            <div className="hero-ground" />
            <button
              className="hero-pet hero-pet-sprite"
              onClick={() => interact('happy')}
              aria-label={`Pet ${companionName(skin)}`}
            >
              <Character
                skin={skin}
                mood={mood === 'eating' ? 'feed' : mood}
                size={heroSize}
                onComplete={finishReaction}
              />
            </button>
            <div className="hero-whisper" aria-live="polite">
              {reply}
            </div>
            <div className="scene-bottom scene-bottom-sprite">
              <span>
                <i /> a little life of its own
              </span>
              <a href="#in-motion">Watch the character study ↗</a>
            </div>
          </div>
        </section>
        <div className="intro-strip">
          <div className="wrap">
            <span>Roams your desktop.</span>
            <span>Remembers the little things.</span>
            <span>Stays out of your way.</span>
            <span>Always happy to see you.</span>
          </div>
        </div>
        <section
          id="little-things"
          className="features wrap section-space"
          aria-labelledby="features-title"
        >
          <div className="section-heading">
            <p className="eyebrow">SMALL FRIEND. THOUGHTFUL FEATURES.</p>
            <h2 id="features-title">
              A softer side of
              <br />
              screen time.
            </h2>
            <p>
              Mochi keeps you company without taking over. Here for the little moments between all
              the big things.
            </p>
          </div>
          <div className="feature-grid">
            <article className="feature">
              <span className="feature-icon lilac" aria-hidden="true">
                ♡
              </span>
              <h3>A little life on your screen</h3>
              <p>
                Pet, feed, drag, or let Mochi wander. Choose a companion and a pace that feels like
                you. Quiet mode is always one click away.
              </p>
              <span className="feature-footnote">Nine companions · Gentle motion</span>
            </article>
            <article className="feature">
              <span className="feature-icon peach" aria-hidden="true">
                ◷
              </span>
              <h3>Remember, gently</h3>
              <p>
                “Remind me in 10 minutes to stretch.” Save one-off, daily, or weekly reminders, with
                snooze when life needs a moment.
              </p>
              <span className="feature-footnote">Local reminders · Browser alarms</span>
            </article>
            <article className="feature">
              <span className="feature-icon sage" aria-hidden="true">
                ♫
              </span>
              <h3>A shortcut to your happy place</h3>
              <p>
                Open favorite websites or find a song on YouTube with a simple command. Your music
                plays openly in its own tab.
              </p>
              <span className="feature-footnote">Safe commands · No AI key</span>
            </article>
          </div>
        </section>
        <section id="playground" className="playground section-space" aria-labelledby="play-title">
          <div className="wrap playground-grid">
            <div className="play-copy">
              <p className="eyebrow">THE LITTLE HELLO</p>
              <h2 id="play-title">
                Go on.
                <br />
                <em>Make a friend.</em>
              </h2>
              <p>
                This is Mochi’s little practice desk. Try a snack, a new look, or a simple command.
              </p>
              <p className="demo-disclosure">
                Website demo only. Reminders here need this tab open. The installed extension brings
                Mochi to supported browser pages.
              </p>
              <div
                className="skin-picker companion-picker"
                role="group"
                aria-label="Choose your companion"
              >
                {COMPANIONS.map((color) => (
                  <button
                    key={color}
                    className={`companion-choice ${skin === color ? 'selected' : ''}`}
                    aria-label={companionName(color)}
                    aria-pressed={skin === color}
                    onClick={() => setSkin(color)}
                  >
                    <Character skin={color} size={48} animated={false} />
                    <span>{companionName(color)}</span>
                  </button>
                ))}
              </div>
            </div>
            <DemoWorkspace skin={skin} />
          </div>
        </section>
        <CharacterGallery skin={skin} setSkin={setSkin} />
        <section
          className="privacy-section wrap section-space"
          id="privacy"
          aria-labelledby="privacy-title"
        >
          <div className="privacy-seal" aria-hidden="true">
            <span>⌂</span>
            <small>HAPPY AT HOME</small>
          </div>
          <div>
            <p className="eyebrow">YOUR CORNER. YOUR CONTROL.</p>
            <h2 id="privacy-title">
              A companion,
              <br />
              with boundaries.
            </h2>
            <p>
              Mochi’s default experience lives on your device. No account, no analytics, no
              browsing-history collection, and no external AI service.
            </p>
            <p className="muted">
              The extension needs access to supported web pages to display its pet. Google Calendar
              and Gmail are separate, optional connections. They contact Google only after your
              consent; no email is ever sent or changed by Mochi.
            </p>
            <a className="text-link" href="#privacy-details" onClick={openPrivacy}>
              Read the privacy details <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
        <section
          id="install"
          className="install-section section-space"
          aria-labelledby="install-title"
        >
          <div className="wrap">
            <div className="install-heading">
              <p className="eyebrow">A NEW HOME IN THREE LITTLE STEPS</p>
              <h2 id="install-title">
                A tiny friend.
                <br />
                <em>Ready to come home.</em>
              </h2>
              <p>
                Download the ready-to-run Windows companion. Your little friend does not need a
                developer toolchain.
              </p>
              <div className="download-actions">
                {downloads.windows ? (
                  <a
                    className="button"
                    href={downloads.windows.href}
                    download={
                      downloads.windows.origin === 'website'
                        ? 'mochi-windows-companion.zip'
                        : undefined
                    }
                  >
                    Download for Windows <span aria-hidden="true">↓</span>
                  </a>
                ) : (
                  <button className="button" disabled>
                    {downloads.status === 'loading'
                      ? 'Checking the download…'
                      : 'Windows download unavailable'}
                  </button>
                )}
                {downloads.browser && (
                  <a className="button button-secondary" href={downloads.browser.href}>
                    Chrome / Edge extension ↓
                  </a>
                )}
              </div>
              <p className="download-note" role="status">
                {downloads.message}
              </p>
              {downloads.windows && (
                <p className="download-meta">
                  Windows 10/11 · .NET Framework 4.8 · Portable ZIP ·{' '}
                  {downloads.windows.version || buildVersion} ·{' '}
                  {(downloads.windows.bytes / 1024 / 1024).toFixed(1)} MB
                </p>
              )}
              {downloads.releasePage && (
                <a
                  className="download-release-link"
                  href={downloads.releasePage}
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub releases ↗
                </a>
              )}
              {downloads.windows?.sha256 && (
                <details className="download-checksum">
                  <summary>Download checksum</summary>
                  <code>SHA-256 {downloads.windows.sha256}</code>
                </details>
              )}
            </div>
            <ol className="install-steps">
              <li>
                <span>01</span>
                <h3>Download Mochi</h3>
                <p>
                  Choose the Windows companion ZIP above. It contains the actual application and its
                  complete sprite library.
                </p>
              </li>
              <li>
                <span>02</span>
                <h3>Unpack a little home</h3>
                <p>
                  Extract the ZIP into a permanent folder. Keep <strong>Mochi.exe</strong>, its
                  configuration, and the <strong>assets</strong> folder together.
                </p>
              </li>
              <li>
                <span>03</span>
                <h3>Open. Meet. Wander.</h3>
                <p>
                  Double-click <strong>Mochi.exe</strong>. Click the companion for reminders and
                  music controls. The taskbar/tray entry brings it back whenever you need it.
                </p>
              </li>
            </ol>
            <details className="developer-download" id="developer-setup">
              <summary>Browser setup and source code</summary>
              <p>
                For Chrome/Edge, download and extract the extension ZIP, open the browser’s
                extension manager, enable Developer mode, and choose Load unpacked. Select the
                folder containing manifest.json.
              </p>
              {downloads.source && (
                <a className="text-link" href={downloads.source.href}>
                  Download GitHub-ready source ZIP ↓
                </a>
              )}
              <p>
                The complete handoff includes Run-Windows/Mochi.exe and an unpacked
                Browser-Extension folder. Developers can push the project root to GitHub; the
                supplied Actions build fresh Windows/browser downloads and the website. Ready-made
                folders stay out of Git.
              </p>
            </details>
            <p className="install-limitation">
              The website is a demo. The native app roams outside the browser; the installed
              extension lives on permitted web pages. Local reminders follow the runtime you chose.
            </p>
          </div>
        </section>
        <section className="faq wrap section-space" aria-labelledby="faq-title">
          <div className="section-heading">
            <p className="eyebrow">A FEW THINGS YOU MAY BE WONDERING</p>
            <h2 id="faq-title">Little questions.</h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>Does the website put Mochi on all my tabs?</summary>
              <p>
                The website is a demo and setup guide. Only the installed extension can show Mochi
                across supported web pages. A static site, including GitHub Pages, cannot
                independently run a browser-wide pet.
              </p>
            </details>
            <details>
              <summary>Can Mochi remind me when my browser is closed?</summary>
              <p>
                Native Windows reminders can run with browsers closed while Mochi stays open and the
                computer is awake. Extension reminders use browser alarms and require the browser.
                The stores are independent; sleep, shutdown, and notification settings can delay or
                suppress alerts.
              </p>
            </details>
            <details>
              <summary>Can a reminder open a saved link?</summary>
              <p>
                Yes: try “remind me in 20 min to check https://example.com”. The installed companion
                opens the explicitly saved safe link when due and keeps its reminder dialogue.
                Snoozing keeps the link without opening it automatically again. In this website
                preview, your browser may block the timed tab; the dialogue shows that outcome and
                keeps an Open saved link button. Keep this demo tab open.
              </p>
            </details>
            <details>
              <summary>Can Mochi control YouTube playback?</summary>
              <p>
                Song searches open YouTube so you can choose a recording. The installed extension
                controls standard audio/video in supported tabs, including play/pause, volume,
                seeking and looping. Next/previous depend on the site. The Windows app controls
                active Windows media sessions. Protected players can refuse requests; this website
                controls only its demo audio.
              </p>
            </details>
            <details>
              <summary>What about my calendar and email?</summary>
              <p>
                Both are optional. Automatic monitoring needs your own Google project and a personal
                extension before connection is available. Calendar uses read-only access; Gmail
                reads metadata for notifications. No sending or modifying permission is requested.
                Connect Calendar in extension settings, enable reminders, and send a test
                notification. Timed events are supported; Google Tasks and API event writes are not
                connected. Google identity is supported in Chrome; it is unavailable in Edge in this
                build.
              </p>
            </details>
            <details>
              <summary>Can Mochi float over my other apps?</summary>
              <p>
                Yes. The separate Windows companion places a transparent roaming companion over
                desktop applications. Extract its native release ZIP and run Mochi.exe. Its local
                reminders can continue with browsers closed while Mochi remains running. The browser
                extension works across permitted web pages; a separate Tauri cross-platform port
                remains a scaffold rather than a released macOS or Linux application.
              </p>
            </details>
            <details>
              <summary>Mochi hasn’t appeared. What should I try?</summary>
              <p>
                Open a regular HTTP or HTTPS page and refresh it. Check that the extension is
                enabled, the pet is running, and access to that site is allowed. Browser internal
                pages and extension stores are restricted. If a reminder is silent, check extension
                notification settings and the operating system’s notification permissions.
              </p>
            </details>
            <details id="privacy-details">
              <summary>Privacy policy: what is saved, and how can I remove it?</summary>
              <p>
                Effective 25 October 2026. Mochi's default experience uses no account, analytics,
                tracking cookies, application backend, or external AI service. Cross-site
                content-script access draws the pet on supported pages; it is not used to collect
                browsing history or inspect unrelated page content.
              </p>
              <p>
                When you request a website or YouTube search, your browser contacts that
                destination. Optional Google Calendar and Gmail connections contact official Google
                APIs only after separate consent. Calendar reads event summaries and times; Gmail
                reads metadata for notifications. Mochi does not retrieve email bodies, send mail,
                or modify messages. Notification titles and subjects can be visible to others
                through your operating system's notification settings.
              </p>
              <p>
                Extension settings, pet positions, reminder definitions, recent commands,
                diagnostics, and optional integration summaries are stored in browser extension
                storage. OAuth access tokens stay in the browser identity cache. Exported backups
                may contain personal reminder text; keep them private. Disconnect each Google
                service in settings to clear its local data and revoke account access in your Google
                account if needed. Reset local Mochi data or remove the extension to clear its
                browser storage. This website demo keeps its interactions only in memory and makes
                no account requests.
              </p>
              <p>
                The website host may process ordinary request logs under its own policy. Local
                browser data is not encrypted against operating-system or profile access, and
                downloaded backups must be deleted separately. A public distributor must supply its
                real privacy/security contact; the source package includes the full policy and
                contact requirements in its documentation.
              </p>
            </details>
            <details id="sprite-credits">
              <summary>Who made the sprite artwork?</summary>
              <p>
                This is a noncommercial fan project featuring Eevee and its eight evolutions. Sprite
                sheets and artist records come from SpriteCollab. The project preserves source
                sheets, timing, credits, and the repository’s Attribution-NonCommercial terms.
                Pokémon characters and sprite artwork are separate from the MIT code license.
              </p>
              <p>
                <a href={`${ASSET_BASE}CREDITS.md`} target="_blank" rel="noreferrer">
                  Included artist credits ↗
                </a>
                {' · '}
                <a
                  href="https://github.com/PMDCollab/SpriteCollab"
                  target="_blank"
                  rel="noreferrer"
                >
                  SpriteCollab source and credits ↗
                </a>
              </p>
            </details>
            <details>
              <summary>Is Mochi accessible and open source?</summary>
              <p>
                Controls have keyboard labels, animation respects reduced motion, and the pet can be
                paused or hidden. Source code is provided under the MIT license. The repository
                includes setup, security, testing, publishing, and GitHub Pages instructions.
              </p>
            </details>
          </div>
        </section>
        <section className="closing wrap">
          <span aria-hidden="true">✧</span>
          <p>
            A tiny friend.
            <br />
            <em>A gentler day.</em>
          </p>
          <a href="#install" className="button">
            Bring Mochi home <span aria-hidden="true">↗</span>
          </a>
        </section>
      </main>
      <footer className="footer wrap">
        <a className="brand" href="#">
          mochi<span className="brand-dot">.</span>
        </a>
        <p>Made for the little moments.</p>
        <nav aria-label="Footer navigation">
          <a href="#privacy-details" onClick={openPrivacy}>
            Privacy
          </a>
          <a
            href="#sprite-credits"
            onClick={() => {
              const details = document.querySelector<HTMLDetailsElement>('#sprite-credits');
              if (details) details.open = true;
            }}
          >
            Art credits
          </a>
          <a href="#install">Setup</a>
          <a href="#faq-title">Help</a>
          <a href={downloads.windows?.href || '#install'}>Download Windows ↗</a>
        </nav>
        <span>MIT code · Credited fan sprites · v{buildVersion}</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
