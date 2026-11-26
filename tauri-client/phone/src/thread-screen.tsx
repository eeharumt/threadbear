// A thread, as the Android app's ThreadScreen: a bar with its project and
// title and a menu, the transcript sitting on the newest message, the card
// it's waiting on Mike with (cards.tsx), and the reply box (composer.tsx).
// The transcript's loading is the website's (transcript.ts, turns.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { api } from '../../../convex/_generated/api';
import { useInbox } from '../../../web/src/inbox';
import { useLiveQuery } from '../../../web/src/live';
import { picturesByRow, type PageMessage } from '../../../web/src/messages';
import { ReplyButton } from '../../../web/src/reply-button';
import { reviewSeq, type LabReviewLedger } from '../../../web/src/lab-review';
import { threadPath } from '../../../web/src/route';
import { busy } from '../../../web/src/sidebar';
import { useTranscript, type Transcript } from '../../../web/src/transcript';
import { fold, isNote } from '../../../web/src/turns';
import { isOnline } from '../../../web/src/view-logic';
import { CommandNote, useCommand } from '../../../web/src/command-state';
import { StatusCard } from './cards';
import { Composer } from './composer';
import { IconButton, Menu, ProjectTile, Spinner, useNow, type MenuItem } from './parts';
import { placeText } from './row-status';
import { ItemView, WaitingBubble, type RowContext } from './transcript-view';

type Thread = FunctionReturnType<typeof api.phone.threadRow> & {};
type Waiting = FunctionReturnType<typeof api.phone.waiting>[number];
type Runner = FunctionReturnType<typeof api.phone.runners>[number];
type Project = FunctionReturnType<typeof api.phone.projects>[number];
type Change = FunctionArgs<typeof api.phone.update>['change'];

/** `back` is for a narrow window, where the thread has the whole screen. */
export function ThreadScreen({ token, threadId, back }: { token: string; threadId: string; back: () => void }) {
  const t = useLiveQuery(api.phone.threadRow, { token, threadId });
  const shown = useTranscript(token, threadId);
  const waiting = useLiveQuery(api.phone.waiting, { token, threadId });
  const runners = useLiveQuery(api.phone.runners, { token });
  const projects = useLiveQuery(api.phone.projects, { token });
  const inbox = useInbox();
  const update = useMutation(api.phone.update);

  // Opening a thread counts as reading it, as opening it on the Mac does.
  const seen = useRef(false);
  useEffect(() => {
    if (!t || seen.current) return;
    seen.current = true;
    if (t.unread || t.needsYou) void update({ token, threadId, change: { markSeen: true } });
  }, [t, token, threadId, update]);

  // For thread: links, as agents may give only the start of an id.
  const linkTo = (id: string) => threadPath(inbox?.find((r) => r.threadId.startsWith(id))?.threadId ?? id);
  return <ThreadView token={token} t={t} shown={shown} waiting={waiting ?? []} runners={runners ?? []} projects={projects ?? []} linkTo={linkTo} back={back} />;
}

export type ThreadViewProps = {
  token: string;
  t: Thread | undefined;
  shown: Transcript | undefined;
  waiting: Waiting[];
  runners: Pick<Runner, 'runnerId' | 'name' | 'lastSeenAt'>[];
  projects: Pick<Project, 'runnerId' | 'id' | 'title' | 'icon'>[];
  linkTo: (threadId: string) => string;
  back: () => void;
};

export function ThreadView({ token, t, shown, waiting, runners, projects, linkTo, back }: ThreadViewProps) {
  const update = useMutation(api.phone.update);
  const cancel = useMutation(api.phone.cancel);
  // The menu's Star, Hibernate, Wake and Archive, and the done card's Archive: one at a time.
  const change = useCommand(token);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const now = useNow(15_000);
  const list = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const keepFromBottom = useRef<number | null>(null);

  const rows = useMemo(() => (shown?.messages ?? []) as PageMessage[], [shown?.messages]);
  const working = t ? busy(t) : false;
  const items = useMemo(() => fold(rows, working), [rows, working]);
  const messages = useMemo(() => rows.filter((m) => !isNote(m)), [rows]);
  const lastSeq = rows.at(-1)?.seq;
  // Sends the runner has already put in the transcript aren't drawn twice.
  const pending = waiting.filter((w) => !messages.some((m) => m.role === 'user' && m.at && Date.parse(m.at) >= w.createdAt && m.text.trim() === w.text.trim()));

  // Sits on the newest message as they come, unless scrolled up to read.
  useEffect(() => {
    const el = list.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastSeq, pending.length, t?.status, t?.asksSeq, t?.pendingApproval?.approvalId]);
  // After loading earlier messages, stay where you were rather than jumping.
  useEffect(() => {
    const el = list.current;
    if (!el || keepFromBottom.current === null) return;
    el.scrollTop = el.scrollHeight - keepFromBottom.current;
    keepFromBottom.current = null;
  }, [rows.length]);

  if (t === undefined || !shown) {
    return (
      <div className="screen">
        <ThreadBar back={back} />
        <div className="progress-line" />
      </div>
    );
  }

  const act = (c: Change, leave = false) => {
    void change.run(() => update({ token, threadId: t.threadId, change: c }), undefined);
    if (leave) back();
  };
  const pictures = shown.images.filter((p) => (p as { mediaType?: string }).mediaType !== 'text/html');
  const review = t.review as LabReviewLedger | undefined;
  const c: RowContext = {
    messages,
    pictures,
    inText: new Map(pictures.filter((p) => p.src).map((p) => [p.src!, p.url])),
    after: picturesByRow(messages, pictures),
    linkTo,
    button: (m) => (id, title) => {
      const b = m.buttons?.find((x) => x.id === id);
      return b ? <ReplyButton key={id} token={token} threadId={t.threadId} button={b} title={title} threadPath={linkTo} /> : <>{title}</>;
    },
    review,
    reviewAt: review ? reviewSeq(messages, t.cardTurn) : undefined,
  };
  const runner = runners.find((r) => r.runnerId === t.runnerId);
  const offline = runner && !isOnline(runner, now) ? runner.name : undefined;
  const ref = t.projects?.[0];
  const project = ref ? projects.find((p) => p.runnerId === t.runnerId && p.id === ref.id) : undefined;
  const lastShown = [...messages].reverse().find((m) => m.role === 'user' || m.role === 'assistant');

  return (
    <div className="screen">
      <ThreadBar back={back} menu={(hibernate) => ({ main: menuFor(t, act, hibernate), hibernate: hibernateMenu(act) })}>
        <ProjectTile picture={project?.icon?.url} title={ref?.title ?? placeText(t)} size={26} />
        <div className="top-title-block">
          <div className="top-title small">{t.title || 'Untitled'}</div>
        </div>
      </ThreadBar>
      <div
        className="transcript"
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div className="transcript-column">
          {shown.hasMore ? (
            <button
              className="earlier"
              disabled={shown.loadingMore}
              onClick={() => {
                const el = list.current;
                keepFromBottom.current = el ? el.scrollHeight - el.scrollTop : null;
                shown.loadMore();
              }}
            >
              {shown.loadingMore ? <Spinner size={14} /> : null}
              {shown.loadingMore ? 'Loading…' : 'Load earlier messages'}
            </button>
          ) : null}
          {items.map((item, i) => (
            <ItemView key={itemKey(item, i)} item={item} c={c} />
          ))}
          {pending.map((w, i) => (
            <WaitingBubble
              key={w.commandId}
              text={w.text || `${w.photos} photo${w.photos === 1 ? '' : 's'}`}
              note={w.state === 'pending' && offline ? `${offline} is offline, sends when it's back` : 'Sending…'}
              says={i === pending.length - 1}
              cancelling={cancelling.has(w.commandId)}
              cancel={
                w.state === 'pending'
                  ? () => {
                      setCancelling(new Set(cancelling).add(w.commandId));
                      void cancel({ token, commandId: w.commandId }).finally(() =>
                        setCancelling((s) => {
                          const n = new Set(s);
                          n.delete(w.commandId);
                          return n;
                        }),
                      );
                    }
                  : undefined
              }
            />
          ))}
          <StatusCard token={token} t={t} quiet={pending.length === 0} lastRole={lastShown?.role} lastSeq={lastSeq} linkTo={linkTo} archive={() => act({ archive: true }, true)} />
          <CommandNote command={change} />
        </div>
      </div>
      <Composer token={token} t={t} offline={offline} />
    </div>
  );
}

function itemKey(item: ReturnType<typeof fold<PageMessage>>[number], i: number): string {
  switch (item.kind) {
    case 'message':
    case 'note':
      return `m${item.m.seq}`;
    case 'tools':
      return `t${item.items[0]?.seq ?? i}`;
    case 'worked':
      return `w${item.key}`;
    case 'gap':
      return `g${item.gap.seq}`;
  }
}

function ThreadBar({ back, menu, children }: { back: () => void; menu?: (hibernate: () => void) => { main: MenuItem[]; hibernate: MenuItem[] }; children?: ReactNode }) {
  const [open, setOpen] = useState<'main' | 'hibernate'>();
  const lists = menu?.(() => setOpen('hibernate'));
  return (
    <header className="top-bar">
      <IconButton name="back" label="Back" onClick={back} className="back-button" />
      <div className="bar-title">{children}</div>
      {menu ? (
        <div className="menu-anchor">
          <IconButton name="more" label="More" size={20} onClick={() => setOpen(open ? undefined : 'main')} />
          {open && lists ? <Menu items={lists[open]} close={() => setOpen((o) => (o === open ? undefined : o))} align="right" /> : null}
        </div>
      ) : null}
    </header>
  );
}

/** The bar's menu, as the Android app's: what to do with the thread, then what it is. */
function menuFor(t: Thread, act: (c: Change, leave?: boolean) => void, hibernate: () => void): MenuItem[] {
  const items: MenuItem[] = [];
  if (t.archivedAt) {
    items.push({ label: 'Back to the inbox', icon: 'inbox', run: () => act({ unarchive: true }) });
  } else {
    const asleep = !!t.snoozedUntil || t.view === 'hibernating';
    if (asleep) items.push({ label: 'Wake', icon: 'sun', run: () => act({ wake: true }) });
    else items.push({ label: 'Hibernate…', icon: 'moon', run: hibernate, keepOpen: true });
    items.push({ label: 'Archive', icon: 'archive', run: () => act({ archive: true }, true) });
    items.push(t.starredAt ? { label: 'Remove Star', icon: 'starFilled', run: () => act({ star: false }) } : { label: 'Star', icon: 'star', run: () => act({ star: true }) });
  }
  items.push('divider');
  // Pasted into a message here or on the Mac, it goes in as a link to the thread.
  items.push({ label: 'Copy Thread ID', icon: 'copy', run: () => void navigator.clipboard.writeText(t.threadId) });
  items.push('divider');
  items.push({ info: t.cwd, icon: 'folder' });
  const who = [t.accountId, t.model].filter(Boolean).join(' · ');
  if (who) items.push({ info: who, icon: 'paw' });
  if (t.costUsd) items.push({ info: `$${t.costUsd.toFixed(2)} so far`, icon: 'zap' });
  return items;
}

/** How long to hibernate for, as the Android app offers it (Hibernate.presets). */
function hibernateMenu(act: (c: Change, leave?: boolean) => void): MenuItem[] {
  const now = new Date();
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const presets: [string, Date][] = [['1 hour', new Date(now.getTime() + 3_600_000)]];
  const evening = at(0, 18);
  if (evening.getTime() - now.getTime() > 3_600_000) presets.push(['This evening, 6 pm', evening]);
  presets.push(['Tomorrow, 9 am', at(1, 9)]);
  for (let days = 1; days <= 7; days++) {
    if (at(days, 9).getDay() === 1) {
      presets.push(['Next Monday, 9 am', at(days, 9)]);
      break;
    }
  }
  return [
    ...presets.map(([label, until]): MenuItem => ({ label, icon: 'moon', run: () => act({ snooze: { until: until.toISOString() } }, true) })),
    { label: 'Until the runner restarts', icon: 'moon', run: () => act({ snooze: { untilRestart: true } }, true) },
  ];
}
