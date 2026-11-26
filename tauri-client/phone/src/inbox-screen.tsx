// The inbox, as the Android app's InboxScreen: a bar with the menu (Settings),
// the title and its Needs you count, a new thread, an always-showing search, then Starred, Inbox,
// Running, Hibernating and Archived under headings that fold. Which rows go
// where is the website's sections.ts; what a row says is row-status.ts.
import { useState } from 'react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../../convex/_generated/api';
import { useInbox } from '../../../web/src/inbox';
import { useLiveQuery } from '../../../web/src/live';
import { build, hibernating, isSnoozed, matches, readFolded, wakeLine, wakesOf, type SectionKey } from '../../../web/src/sections.ts';
import { Icon } from './icon';
import type { LineName } from './line-icons';
import { Empty, IconButton, Menu, ProjectTile, useNow } from './parts';
import { clockTime, counts, doing, placeText, rowKind, shortTime, statusText, wantsMike, workingLabel } from './row-status';
import { unpair } from './session';

export type Row = FunctionReturnType<typeof api.phone.threads>[number];
type Project = FunctionReturnType<typeof api.phone.projects>[number];
type Runner = FunctionReturnType<typeof api.phone.runners>[number];

const FOLDED_KEY = 'threadbear.phone.folded';
const TITLES: Record<SectionKey, string> = { starred: 'Starred', inbox: 'Inbox', running: 'Running', hibernating: 'Hibernating', archived: 'Archived' };

export function InboxScreen({ token, open, selected, newThread, settings }: { token: string; open: (threadId: string) => void; selected?: string; newThread: () => void; settings: () => void }) {
  const inbox = useInbox();
  const counted = useLiveQuery(api.phone.counts, { token });
  const wakes = useLiveQuery(api.phone.wakes, { token });
  const projects = useLiveQuery(api.phone.projects, { token });
  const runners = useLiveQuery(api.phone.runners, { token });
  const [folded, setFolded] = useState(() => readFolded(localStorage.getItem(FOLDED_KEY)));
  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  // The put-away lists load once their heading opens, or for a search.
  const snoozed = useLiveQuery(api.phone.threads, searching || !folded.has('hibernating') ? { token, view: 'hibernating' } : 'skip');
  const den = useLiveQuery(api.phone.threads, searching || !folded.has('archived') ? { token, view: 'den' } : 'skip');
  const now = useNow();

  const toggle = (section: SectionKey) => {
    const next = new Set(folded);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    setFolded(next);
    localStorage.setItem(FOLDED_KEY, JSON.stringify([...next]));
  };

  return (
    <InboxView
      rows={inbox}
      snoozed={snoozed}
      den={den}
      counted={counted ?? undefined}
      wakes={wakes ?? []}
      projects={projects ?? []}
      runners={runners ?? []}
      folded={folded}
      toggle={toggle}
      query={query}
      setQuery={setQuery}
      now={now}
      open={open}
      selected={selected}
      newThread={newThread}
      settings={settings}
    />
  );
}

export type InboxViewProps = {
  rows: Row[] | undefined;
  snoozed: Row[] | undefined;
  den: Row[] | undefined;
  counted: { hibernating?: number; den?: number } | undefined;
  wakes: { threadId?: string; nextRunAt?: string; paused?: boolean; finishedAt?: string }[];
  projects: Pick<Project, 'runnerId' | 'id' | 'title' | 'icon'>[];
  runners: Pick<Runner, 'runnerId' | 'name'>[];
  folded: Set<SectionKey>;
  toggle: (section: SectionKey) => void;
  query: string;
  setQuery: (query: string) => void;
  now: number;
  open: (threadId: string) => void;
  // The thread open beside the list, in a wide window.
  selected?: string;
  // The bar's New thread, and Settings in the menu. The demo leaves them out.
  newThread?: () => void;
  settings?: () => void;
};

export function InboxView(p: InboxViewProps) {
  const [menu, setMenu] = useState(false);
  const q = p.query.trim();
  const searching = q !== '';
  const wakes = wakesOf(p.wakes);
  const split = build(p.rows ?? [], p.now, wakes, 'needsYou');
  // A thread can sit in two lists for a moment while the runner moves it.
  const seen = new Set<string>();
  const keep = (rows: Row[]) => rows.filter((r) => matches(r, q) && !seen.has(r.threadId) && seen.add(r.threadId));
  const starred = keep(split.starred);
  const inbox = keep(split.inbox);
  const running = keep(split.running);
  const asleep = hibernating(keep(split.scheduled), keep(p.snoozed ?? []), wakes);
  const archived = keep(p.den ?? []);
  const awakeStarred = split.starred.filter((r) => r.waitState !== undefined || !isSnoozed(r, p.now));
  const needsYou = [...awakeStarred, ...split.inbox].filter(counts).length;

  const count: Record<SectionKey, number | undefined> = {
    starred: starred.length,
    inbox: inbox.length,
    running: running.length,
    hibernating: p.snoozed ? asleep.length : p.counted?.hibernating !== undefined ? p.counted.hibernating + asleep.length : undefined,
    archived: searching ? archived.length : (p.counted?.den ?? p.den?.length),
  };
  const rows: Record<SectionKey, Row[]> = { starred, inbox, running, hibernating: asleep, archived };
  const loading: Partial<Record<SectionKey, boolean>> = { hibernating: !p.snoozed, archived: !p.den };
  const isOpen = (s: SectionKey) => searching || !p.folded.has(s);
  const projectOf = (r: Row) => {
    const first = r.projects?.[0];
    return first ? p.projects.find((x) => x.runnerId === r.runnerId && x.id === first.id) : undefined;
  };
  const runnerName = (r: Row) => (p.runners.length > 1 ? p.runners.find((x) => x.runnerId === r.runnerId)?.name : undefined);

  const section = (key: SectionKey) => {
    const n = count[key];
    // Empty ones are left out, Inbox aside, which has the empty view instead.
    if (key !== 'inbox' && n === 0) return null;
    if (key === 'inbox' && n === 0) return searching ? null : <InboxZero key="zero" />;
    const foldable = key !== 'inbox' && !searching;
    return (
      <section key={key}>
        <Heading title={TITLES[key]} count={foldable ? n : undefined} folded={!isOpen(key)} toggle={foldable ? () => p.toggle(key) : undefined} />
        {isOpen(key) ? (
          <>
            {rows[key].map((r) => (
              <ThreadRow key={r.threadId} row={r} under={key} now={p.now} project={projectOf(r)} runner={runnerName(r)} wake={key === 'hibernating' ? wakes.get(r.threadId) : undefined} open={p.open} selected={r.threadId === p.selected} />
            ))}
            {loading[key] ? <LoadingRows /> : null}
          </>
        ) : null}
      </section>
    );
  };

  const nothingFound = searching && p.rows && ['starred', 'inbox', 'running', 'hibernating', 'archived'].every((k) => rows[k as SectionKey].length === 0) && !loading.hibernating && !loading.archived;

  return (
    <div className="screen">
      <header className="top-bar">
        <div className="menu-anchor">
          <IconButton name="menu" label="Menu" onClick={() => setMenu(!menu)} />
          {menu ? (
            <Menu
              close={() => setMenu(false)}
              items={
                p.settings
                  ? [{ label: 'Settings', icon: 'settings', run: p.settings }]
                  : [
                      {
                        label: 'Unpair',
                        icon: 'logOut',
                        run: () => {
                          if (confirm('Unpair this device? You will need a new code from your Mac to pair again.')) unpair();
                        },
                      },
                    ]
              }
            />
          ) : null}
        </div>
        <h1 className="top-title grow">
          Threadbear
          {needsYou > 0 ? <span className="count-badge">{needsYou}</span> : null}
        </h1>
        {p.newThread ? <IconButton name="squarePen" label="New thread" onClick={p.newThread} /> : null}
      </header>
      <SearchField query={p.query} change={p.setQuery} />
      <div className="scroll">
        {!p.rows ? (
          <div className="progress-line" />
        ) : (
          <>
            {nothingFound ? (
              <Empty icon="search" title={`No results for “${q}”`} text="Check the spelling or try a new search." />
            ) : null}
            {section('starred')}
            {section('inbox')}
            {section('running')}
            {section('hibernating')}
            {section('archived')}
          </>
        )}
      </div>
    </div>
  );
}

function SearchField({ query, change }: { query: string; change: (q: string) => void }) {
  return (
    <div className="search-field">
      <Icon name="search" size={17} className="faint" />
      <input type="search" value={query} onChange={(e) => change(e.target.value)} placeholder="Search" enterKeyHint="search" aria-label="Search" />
      {query ? (
        <button className="search-clear" onClick={() => change('')} aria-label="Clear">
          <Icon name="close" size={18} />
        </button>
      ) : null}
    </div>
  );
}

function Heading({ title, count, folded, toggle }: { title: string; count?: number; folded: boolean; toggle?: () => void }) {
  const inner = (
    <>
      <span className="heading-title">{title}</span>
      {count ? <span className="heading-count">{count}</span> : null}
      <span className="grow" />
      {toggle ? <Icon name="chevronDown" size={16} className={`faint chevron ${folded ? 'folded' : ''}`} label={folded ? 'Open' : 'Fold'} /> : null}
    </>
  );
  return toggle ? (
    <button className="heading" onClick={toggle} aria-expanded={!folded}>
      {inner}
    </button>
  ) : (
    <div className="heading">{inner}</div>
  );
}

function ThreadRow({ row: t, under, now, project, runner, wake, open, selected }: { row: Row; under: SectionKey; now: number; project?: InboxViewProps['projects'][number]; runner?: string; wake?: number; open: (id: string) => void; selected: boolean }) {
  const kind = rowKind(t);
  // The gutter: a dot when it needs Mike, a tick when it finished unread with nothing needed.
  const done = kind === 'time' && t.unread && !t.needsYou;
  const needs = wantsMike(t);
  const asleep = under === 'starred' && isSnoozed(t, now);
  const line = [wakeLine(t, [], now), placeText(t), runner, doing(t)].filter(Boolean).join(' · ');
  const [text, tone] = trailing(t, kind, under, now, wake);
  return (
    <button className={`thread-row ${selected ? 'selected' : ''}`} onClick={() => open(t.threadId)} aria-current={selected || undefined}>
      <span className="gutter">{done ? <Icon name="check" size={10} className="accent" label="Done, unread" /> : needs ? <span className="dot" /> : null}</span>
      <ProjectTile picture={project?.icon?.url} title={t.projects?.[0]?.title ?? placeText(t)} />
      <span className="row-text">
        <span className="row-line">
          <span className={`row-title ${t.needsYou || needs || done ? 'strong' : ''}`}>{t.title || 'Untitled'}</span>
          {t.starredAt ? <Icon name="starFilled" size={12} className="faint" label="Starred" /> : null}
        </span>
        <span className="row-line">
          {t.startedBy ? <Icon name={startedByIcon(t.startedBy.kind)} size={12} className="muted" /> : null}
          <span className="row-sub">{line}</span>
          {asleep ? <Icon name="moon" size={12} className="faint" label="Hibernating" /> : null}
          {kind === 'working' ? <span className="working-dot" /> : null}
          <span className={`row-status ${tone}`}>{text}</span>
        </span>
      </span>
    </button>
  );
}


function trailing(t: Row, kind: ReturnType<typeof rowKind>, under: SectionKey, now: number, wake?: number): [string, string] {
  switch (kind) {
    case 'needsYou':
      // The gutter dot says it; the time stays.
      return [shortTime(Date.parse(t.lastActivityAt), now), 'faint'];
    case 'working': {
      const label = workingLabel(Date.parse(t.lastActivityAt), now);
      return [under === 'running' ? label : `Working ${label}`, 'accent'];
    }
    case 'failed':
      return ['Failed', 'failed'];
    case 'waitingForConnection':
      return [statusText(t, now), 'faint'];
    case 'stopped':
      return ['Stopped', 'muted'];
    case 'time':
      if (t.woke) return [statusText(t, now), 'accent'];
      if (wake !== undefined) return [clockTime(wake, now), 'faint'];
      return [statusText(t, now), 'faint'];
  }
}

function startedByIcon(kind: string): LineName {
  switch (kind) {
    case 'schedule':
      return 'clock';
    case 'thread':
      return 'paw';
    case 'librarian':
      return 'books';
    case 'runner':
      return 'bell';
    default:
      return 'wrench';
  }
}

function InboxZero() {
  return <Empty icon="check" title="Nothing in the inbox" text="Threads that finish or need you turn up here." />;
}

/** Grey stand-ins while a list waits for its first answer, so it doesn't look empty. */
function LoadingRows() {
  return (
    <div className="loading-rows" aria-label="Loading">
      {[
        [190, 110],
        [150, 90],
        [220, 130],
      ].map(([a, b], i) => (
        <div className="loading-row" key={i}>
          <span className="loading-tile" />
          <span className="loading-lines">
            <span style={{ width: a }} />
            <span style={{ width: b }} />
          </span>
        </div>
      ))}
    </div>
  );
}
