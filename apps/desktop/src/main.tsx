// OPTIONAL SCAFFOLD: frontend and native window controls are not built or tested on this host.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Pet } from '../../extension/src/ui/Pet';
import type { Mood } from '../../extension/src/ui/Pet';
import { PET_SKINS, PET_SKIN_LABELS } from '@mochi/shared';
import type { Skin } from '@mochi/shared';
import '../../extension/src/ui/styles.css';
import './style.css';

function DesktopScaffold() {
  const native = isTauri();
  const [skin, setSkin] = useState<Skin>(() => {
    try {
      const saved = localStorage.getItem('mochi-desktop-skin');
      return PET_SKINS.includes(saved as Skin) ? (saved as Skin) : 'eevee';
    } catch {
      return 'eevee';
    }
  });
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [mood, setMood] = useState<Mood>('idle');
  const [onTop, setOnTop] = useState(true);
  const [message, setMessage] = useState(
    'Optional native prototype. No browser data is connected.',
  );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => {
      document.removeEventListener('visibilitychange', changed);
      clearTimeout(timer.current);
    };
  }, []);
  async function control(action: () => Promise<unknown>, success: string) {
    if (!native) {
      setMessage(
        'Native controls require running this scaffold through Tauri. This is only the frontend.',
      );
      return false;
    }
    try {
      await action();
      setMessage(success);
      return true;
    } catch {
      setMessage(
        'The operating system or native runtime refused this action. Check the development console.',
      );
      return false;
    }
  }
  function pet() {
    clearTimeout(timer.current);
    setMood('happy');
    timer.current = setTimeout(() => setMood('idle'), 1600);
  }
  return (
    <main className="desktop-shell">
      <div className="desktop-badge">OPTIONAL · UNTESTED NATIVE SCAFFOLD</div>
      <button
        className="desktop-drag"
        onPointerDown={(e) => {
          if (e.button === 0)
            void control(() => getCurrentWindow().startDragging(), 'Window moved.');
        }}
      >
        Drag Mochi from here
      </button>
      <button className="desktop-pet" aria-label="Pet Mochi" onClick={pet}>
        <Pet skin={skin} mood={paused ? 'sleeping' : mood} size={146} paused={paused || hidden} />
      </button>
      <section className="desktop-controls" aria-label="Desktop scaffold controls">
        <div className="desktop-row">
          <label>
            Companion
            <select
              value={skin}
              onChange={(e) => {
                const value = e.target.value as Skin;
                setSkin(value);
                try {
                  localStorage.setItem('mochi-desktop-skin', value);
                } catch {
                  setMessage('Your companion changed, but preferences could not be saved.');
                }
              }}
            >
              {PET_SKINS.map((species) => (
                <option key={species} value={species}>
                  {PET_SKIN_LABELS[species]}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setPaused(!paused)}>{paused ? 'Wake up' : 'Rest'}</button>
        </div>
        <label className="desktop-check">
          <input
            type="checkbox"
            checked={onTop}
            disabled={!native}
            onChange={(e) => {
              const checked = e.target.checked;
              void control(
                () => getCurrentWindow().setAlwaysOnTop(checked),
                'Window stacking updated.',
              ).then((ok) => {
                if (ok) setOnTop(checked);
              });
            }}
          />
          Always on top
        </label>
        <div className="desktop-row">
          <button
            disabled={!native}
            onClick={() =>
              void control(
                () => getCurrentWindow().hide(),
                'Hidden. Restore from the Mochi tray menu.',
              )
            }
          >
            Hide
          </button>
          <button
            disabled={!native}
            onClick={() =>
              void control(
                () => getCurrentWindow().setIgnoreCursorEvents(true),
                'Click-through enabled. Restore interaction from the Mochi tray menu.',
              )
            }
          >
            Click-through
          </button>
          <button
            disabled={!native}
            onClick={() => void control(() => invoke('quit'), 'Quitting Mochi.')}
          >
            Quit
          </button>
        </div>
        <p className="desktop-help">
          Use the tray menu to show Mochi and restore mouse interaction. Native behavior needs
          platform testing.
        </p>
        <p className="desktop-message" role="status">
          {message}
        </p>
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<DesktopScaffold />);
