import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export interface Submission {
  userId: string;
  day: number;
  trackUri: string;
  trackName: string;
  addedAt: string; // ISO
}

export interface State {
  totalDays: number;
  startDate: string | null; // YYYY-MM-DD (dzień 1)
  reminderChannelId: string | null;
  feedChannelId: string | null; // gdzie lecą powiadomienia o dodanych piosenkach (null = kanał przypomnień)
  feedEnabled: boolean;
  reminderTime: string; // HH:mm
  playlistId: string | null;
  title: string;
  themes: string[]; // index 0 = dzień 1
  markers: Record<string, string>; // dzień -> spotify:track:URI
  submissions: Submission[];
  lastReminderDay: number;
}

const defaults: State = {
  totalDays: 50,
  startDate: null,
  reminderChannelId: null,
  feedChannelId: null,
  feedEnabled: true,
  reminderTime: '09:00',
  playlistId: null,
  title: '50 DAYS SONG CHALLENGE',
  themes: [],
  markers: {},
  submissions: [],
  lastReminderDay: 0,
};

let state: State = load();

function load(): State {
  try {
    const raw = fs.readFileSync(config.dataFile, 'utf8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return structuredClone(defaults);
  }
}

export function getState(): State {
  return state;
}

export function save(): void {
  fs.mkdirSync(path.dirname(config.dataFile), { recursive: true });
  const tmp = config.dataFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, config.dataFile); // atomowy zapis
}

export function update(fn: (s: State) => void): void {
  fn(state);
  save();
}

/** Jedna piosenka na osobę na dzień — ponowne dodanie podmienia poprzednią. */
export function upsertSubmission(sub: Submission): 'added' | 'replaced' {
  const i = state.submissions.findIndex((s) => s.userId === sub.userId && s.day === sub.day);
  if (i >= 0) {
    state.submissions[i] = sub;
    return 'replaced';
  }
  state.submissions.push(sub);
  return 'added';
}

export function removeSubmission(userId: string, day: number): boolean {
  const before = state.submissions.length;
  state.submissions = state.submissions.filter((s) => !(s.userId === userId && s.day === day));
  return state.submissions.length !== before;
}
