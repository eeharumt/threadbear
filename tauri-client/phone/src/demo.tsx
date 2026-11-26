// The screens with sample rows and no server, for looking at them side by
// side with the Android app: npx vite tauri-client/phone, then /demo.html. ?thread
// opens one (narrow: on its own; wide: beside the list), and ?card=asks,
// approval or working picks what it waits on instead of the done card.
// Not built into the app (vite.config.mts builds index.html only).
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import type { PageMessage } from '../../../web/src/messages';
import type { SectionKey } from '../../../web/src/sections.ts';
import { InboxView, type Row } from './inbox-screen';
import { ThreadView, type ThreadViewProps } from './thread-screen';
import './styles.css';

const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();
const MIN = 60_000;

function row(id: string, fields: Partial<Row>): Row {
  const lastActivityAt = fields.lastActivityAt ?? ago(5 * MIN);
  return {
    threadId: id,
    runnerId: 'mac',
    title: id,
    cwd: '/Users/mike/dev/threadbear',
    accountId: 'claude-main',
    provider: 'claude',
    status: 'idle',
    needsYou: false,
    unread: false,
    preview: '',
    createdAt: ago(86_400_000),
    view: 'inbox',
    waitState: 'done',
    ...fields,
    lastActivityAt,
    lastActivityMs: Date.parse(lastActivityAt),
  } as Row;
}

const project = { id: 'p1', title: 'Threadbear Tauri' };
const rows: Row[] = [
  row('Pin the Android release', { starredAt: ago(86_400_000), waitState: 'done', lastActivityAt: ago(3 * 3600_000), projects: [project] }),
  row('Merge the inbox fix?', { waitState: 'card', status: 'idle', needsYou: true, unread: true, lastActivityAt: ago(2 * MIN), projects: [project] }),
  row('Check the deploy logs', { waitState: 'needsYou', needsYou: true, unread: false, lastActivityAt: ago(40 * MIN), cwd: '/Users/mike/dev/site' }),
  row('Write the release notes', { waitState: 'done', unread: true, lastActivityAt: ago(2 * 3600_000), startedBy: { kind: 'schedule', label: 'Morning check' } }),
  row('Rename the settings keys', { waitState: 'done', status: 'error', lastActivityAt: ago(26 * 3600_000), cwd: '/Users/mike/dev/app' }),
  row('Port the thread screen', { waitState: 'working', status: 'running', unread: true, working: '1 sub-agent', lastActivityAt: ago(38_000), projects: [project] }),
  row('Run the nightly evals', { waitState: 'job', status: 'idle', working: 'npm run evals', lastActivityAt: ago(14 * MIN) }),
];
const snoozed: Row[] = [row('Revisit the push keys', { waitState: 'hibernating', view: 'hibernating', snoozedUntil: new Date(now + 86_400_000).toISOString() })];
const den: Row[] = [row('Old migration', { waitState: 'archived', view: 'den', archivedAt: ago(3 * 86_400_000), lastActivityAt: ago(9 * 86_400_000) })];

const ask = new URLSearchParams(location.search);
const card = ask.get('card') ?? 'done';

let seq = 0;
const msg = (role: PageMessage['role'], text: string, more: Partial<PageMessage> = {}): PageMessage => ({ seq: ++seq, role, text, at: ago((60 - seq) * MIN), turn: 'turn0001', ...more });
const messages: PageMessage[] = [
  msg('user', 'Can the Tauri app look like the Android one? Same inbox, same thread screen.'),
  msg('tool', 'Read tauri-client/phone/src/main.tsx', { toolKind: 'read' }),
  msg('tool', "Search 'ThreadScreen' in android-native", { toolKind: 'search' }),
  msg('tool', 'npx tsc --noEmit -p tauri-client/phone', { toolKind: 'command' }),
  msg('tool', 'Edit tauri-client/phone/src/styles.css', { toolKind: 'edit' }),
  msg('assistant', 'Looking at how the Android app lays the thread out first.'),
  msg('tool', 'Write tauri-client/phone/src/thread-screen.tsx', { toolKind: 'write' }),
  msg('assistant', 'Done. The Tauri screens now follow the Android app:\n\n- **Inbox** with the same sections and rows\n- **Thread** with the transcript, the cards and the reply box\n- A wide window shows both side by side\n\nOpen demo.html to try it.'),
  msg('user', 'What about Windows?', { origin: 'phone', turn: 'turn0002' }),
  msg('tool', 'Read tauri-client/build.ps1', { toolKind: 'read', turn: 'turn0002' }),
  msg('assistant', 'One app for both: below 840px wide it shows one screen at a time, and wider it shows the list and the thread together.', { turn: 'turn0002' }),
];

const base = rows[5];
const thread = {
  ...base,
  status: card === 'working' ? 'running' : 'idle',
  waitState: card === 'done' ? 'done' : card === 'working' ? 'working' : 'card',
  needsYou: card === 'asks' || card === 'approval',
  unread: false,
  working: undefined,
  cwd: 'C:/Users/mike/dev/threadbear',
  model: 'opus',
  costUsd: 3.42,
  next: ['Build the APK', 'Switch Windows to the bundled screens'],
  looseEnds: [{ kind: 'uncommitted', text: '14 files not committed' }],
  ...(card === 'asks'
    ? {
        asksSeq: seq,
        asks: [
          {
            action: 'Switch the Windows build to the bundled screens?',
            why: 'It then pairs with a code, as the phone does.',
            options: ['Switch now', 'Wait for the reply box'],
            optionNotes: ['Windows stops loading the website', 'Keeps the website until the thread screen is done'],
            suggested: 0,
          },
        ],
      }
    : {}),
  ...(card === 'approval'
    ? { pendingApproval: { approvalId: 'a1', kind: 'approval', name: 'Bash', title: 'Run npm run tauri android build', options: ['allow', 'allowAlways', 'deny'], inputSummary: 'npm run tauri android build -- --debug --target aarch64' } }
    : {}),
} as unknown as ThreadViewProps['t'];

// Never reached: the buttons' mutations just wait.
const client = new ConvexReactClient('https://demo.invalid', { skipConvexDeploymentUrlCheck: true });

function Demo() {
  const open = ask.has('thread');
  return (
    <ConvexProvider client={client}>
      <div className={`panes ${open ? 'has-thread' : ''}`}>
        <section className="pane-list">
          <Inbox selected={open ? base.threadId : undefined} />
        </section>
        <section className="pane-thread">
          {open ? (
            <ThreadView
              token="demo"
              t={thread}
              shown={{ messages, images: [], hasMore: true, loadingMore: false, loadMore: () => {} }}
              waiting={[]}
              runners={[{ runnerId: 'mac', name: 'Mac', lastSeenAt: new Date().toISOString() }]}
              projects={[]}
              linkTo={(id) => '/t/' + id}
              back={() => (location.search = '')}
            />
          ) : (
            <div className="pick">
              <span>Pick a thread.</span>
            </div>
          )}
        </section>
      </div>
    </ConvexProvider>
  );
}

function Inbox({ selected }: { selected?: string }) {
  const [folded, setFolded] = useState(new Set<SectionKey>(['archived']));
  const [query, setQuery] = useState('');
  return (
    <InboxView
      rows={rows}
      snoozed={snoozed}
      den={den}
      counted={{ hibernating: 1, den: 1 }}
      wakes={[]}
      projects={[]}
      runners={[{ runnerId: 'mac', name: 'Mac' }]}
      folded={folded}
      toggle={(s) => {
        const next = new Set(folded);
        if (next.has(s)) next.delete(s);
        else next.add(s);
        setFolded(next);
      }}
      query={query}
      setQuery={setQuery}
      now={now}
      selected={selected}
      open={() => (location.search = '?thread')}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
