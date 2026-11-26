// What an inbox row says, as the Android app's RowStatus, RelativeTime and
// ProjectMark (android-native/kit, Inbox.kt and Models.kt). Which section a
// row goes under and how much it wants Mike are the website's
// (web/src/sections.ts), which the shared cases keep in step with Android.
import { urgency, waitStateOf, type ThreadRow } from '../../../web/src/sections.ts';

export type StatusRow = ThreadRow & {
  lastActivityAt: string;
  woke?: { at: string; since?: string };
  waitingForNetwork?: { since: string };
};

export type RowKind = 'needsYou' | 'working' | 'failed' | 'waitingForConnection' | 'stopped' | 'time';

const isBusy = (t: StatusRow) => t.status === 'running' || t.status === 'starting';

/** What the row's trailing word is about: the status while it means something, else the time. */
export function rowKind(t: StatusRow): RowKind {
  const state = waitStateOf(t);
  if (state === undefined) {
    const reviewWaiting = (t.pendingReviews ?? 0) > 0 && !isBusy(t) && t.working === undefined;
    if (reviewWaiting || t.pendingApproval || t.status === 'waiting') return 'needsYou';
  } else {
    if (state === 'card' || state === 'review') return 'needsYou';
    if (state === 'sending') return 'working';
  }
  switch (t.status) {
    case 'running':
    case 'starting':
      return 'working';
    case 'error':
      return t.waitingForNetwork ? 'waitingForConnection' : 'failed';
    case 'stopped':
      return 'stopped';
    default:
      return 'time';
  }
}

/** The last turn ended asking Mike for something he hasn't done yet. */
function waitingOnMike(t: StatusRow): boolean {
  if (t.needs !== 'you') return false;
  const asks = t.asks ?? [];
  const open = asks.length === 0 || asks.some((a) => a.ticked !== true);
  const state = waitStateOf(t);
  return state === undefined ? !isBusy(t) && open : state === 'needsYou' && open;
}

/** In the Needs you count, and the title's badge. */
export const counts = (t: StatusRow) => urgency(t) <= 2;

/** The gutter's dot: it wants Mike. With a wait state, whatever the badge counts. */
export function wantsMike(t: StatusRow): boolean {
  if (waitStateOf(t) !== undefined) return counts(t);
  const kind = rowKind(t);
  return kind === 'needsYou' || (t.needsYou && kind !== 'working');
}

/** The row's working line ("1 sub-agent"), while a turn or a job is going and not held up on Mike. */
export function doing(t: StatusRow): string | undefined {
  if (t.working === undefined) return undefined;
  const state = waitStateOf(t);
  const going = state === undefined ? isBusy(t) || (!t.pendingApproval && !waitingOnMike(t)) : isBusy(t) || state === 'working' || state === 'job';
  return going ? t.working : undefined;
}

export function statusText(t: StatusRow, now: number): string {
  switch (rowKind(t)) {
    case 'needsYou':
      return 'Needs you';
    case 'working':
      return 'Working';
    case 'failed':
      return 'Failed';
    case 'waitingForConnection':
      return 'Waiting for connection';
    case 'stopped':
      return 'Stopped';
    case 'time':
      return t.woke ? 'Woke up' : shortTime(Date.parse(t.lastActivityAt), now);
  }
}

/** How long a running turn has been going: "53s", "4m", "1h 2m". */
export function workingLabel(since: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`;
}

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const CLOCK = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Short relative times, as on the Mac sidebar: "now", "5m", "3h", "Mon", "12 Oct". */
export function shortTime(at: number, now: number): string {
  if (!Number.isFinite(at)) return '';
  const seconds = (now - at) / 1000;
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  const d = new Date(at);
  if (seconds < 6 * 86_400) return WEEKDAY.format(d);
  return (d.getFullYear() === new Date(now).getFullYear() ? DAY_MONTH : DAY_MONTH_YEAR).format(d);
}

/** "10:42" today, "Mon 10:42" otherwise. */
export function clockTime(at: number, now: number): string {
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date(now).toDateString();
  return sameDay ? CLOCK.format(d) : `${WEEKDAY.format(d)} ${CLOCK.format(d)}`;
}

/** Line 2 of a row: the projects, or the folder. */
export function placeText(t: { projects?: { title: string }[]; cwd: string }): string {
  if (t.projects?.length) return t.projects.map((p) => p.title).join(', ');
  return t.cwd.split(/[\\/]/).filter(Boolean).pop() ?? t.cwd;
}

/** "C" for "Convex docs", "7" for "7 day plan", "?" for neither. */
export function projectLetter(title: string): string {
  const first = [...title].find((c) => /[\p{L}\p{N}]/u.test(c));
  return first ? first.toUpperCase() : '?';
}
