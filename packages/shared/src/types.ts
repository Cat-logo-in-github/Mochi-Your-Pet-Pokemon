export type Lifecycle = 'running' | 'paused' | 'hidden' | 'disabled';
export type FollowCursorFrequency = 'off' | 'rarely' | 'sometimes' | 'often';
export type MissedPolicy = 'notify' | 'skip' | 'catch-up';
export const PET_SKINS = [
  'eevee',
  'vaporeon',
  'jolteon',
  'flareon',
  'espeon',
  'umbreon',
  'leafeon',
  'glaceon',
  'sylveon',
] as const;
export type Skin = (typeof PET_SKINS)[number];
export const PET_SKIN_LABELS: Readonly<Record<Skin, string>> = Object.freeze({
  eevee: 'Eevee',
  vaporeon: 'Vaporeon',
  jolteon: 'Jolteon',
  flareon: 'Flareon',
  espeon: 'Espeon',
  umbreon: 'Umbreon',
  leafeon: 'Leafeon',
  glaceon: 'Glaceon',
  sylveon: 'Sylveon',
});

export interface Settings {
  version: 1;
  lifecycle: Lifecycle;
  skin: Skin;
  size: number;
  opacity: number;
  wandering: boolean;
  following: boolean;
  followCursorFrequency: FollowCursorFrequency;
  bubble: boolean;
  sound: boolean;
  compact: boolean;
  quietHours: { enabled: boolean; start: string; end: string };
  remindersEnabled: boolean;
  missedPolicy: MissedPolicy;
  shortcuts: Record<string, string>;
}

export interface Reminder {
  id: string;
  title: string;
  dueAt: number;
  timeZone: string;
  recurrence: 'none' | 'daily' | 'weekly';
  recurrenceTime?: string;
  paused: boolean;
  completed: boolean;
  lastDeliveredAt?: number;
  source?: 'local' | 'calendar';
  eventId?: string;
  url?: string;
  openUrlOnDue?: boolean;
}

export interface HistoryEntry {
  id: string;
  command: string;
  url: string;
  at: number;
}

export interface AppData {
  settings: Settings;
  reminders: Reminder[];
  history: HistoryEntry[];
  positions: Record<string, { x: number; y: number }>;
  diagnostics: { at: number; message: string }[];
  catchUp: Reminder[];
}

export type Intent =
  | { kind: 'summon' }
  | { kind: 'navigate'; url: string; label: string }
  | {
      kind: 'music';
      action: 'pause' | 'resume' | 'next' | 'previous' | 'loop' | 'volume' | 'seek';
      value?: number | boolean;
    }
  | {
      kind: 'reminder';
      title: string;
      dueAt: number;
      timeZone?: string;
      url?: string;
      openUrlOnDue?: boolean;
    }
  | { kind: 'page-reminder'; dueAt: number; title: string }
  | { kind: 'lifecycle'; value: Lifecycle }
  | { kind: 'preference'; key: 'following' | 'wandering'; value: boolean }
  | { kind: 'calendar'; message: string; window?: 'next' | 'today' | 'tomorrow' | 'week' }
  | { kind: 'google-workflow'; plan: GoogleWorkflowPlan }
  | { kind: 'email' | 'help' | 'clarify'; message: string };

export interface MusicCapabilities {
  canPause: boolean;
  canSeek: boolean;
  canLoop: boolean;
  canChangeTrack: boolean;
  canReadMetadata: boolean;
  canVolume: boolean;
}

export interface MusicProvider {
  id: string;
  name: string;
  capabilities: Readonly<MusicCapabilities>;
  search(query: string, artist?: string): string;
}

export interface ReminderNotice {
  deliveryId: string;
  reminderId: string;
  title: string;
  dueAt: number;
  timeZone: string;
  url?: string;
  urlOpenStatus?: 'opened' | 'blocked';
}
export type MediaAction =
  'status' | 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'seek' | 'volume' | 'loop';
export interface MediaCommand {
  action: MediaAction;
  value?: number | boolean;
}
export interface MediaState {
  title: string;
  paused: boolean;
  currentTime: number;
  duration: number | null;
  volume: number;
  loop: boolean;
  canSeek: boolean;
  canNext: boolean;
  canPrevious: boolean;
}
export type MediaResult =
  { ok: true; state: MediaState; message: string } | { ok: false; error: string };

export interface GoogleWorkflowPlan {
  service: 'calendar' | 'gmail';
  action: 'search-mail' | 'compose-mail' | 'create-event' | 'open-agenda';
  title: string;
  description: string;
  url: string;
}
