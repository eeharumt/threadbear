// The transcript's rows, as the Android app's ThreadParts draws them: Mike's
// words in a grey bubble on the right, the agent's full width, tool calls as
// small lines, a finished turn folded into "Worked for 4m 12s". What the
// words say (Markdown, links, drafts, reply buttons, plans) is the website's
// messages.tsx; which rows fold where is its turns.ts.
import type { ReactNode } from 'react';
import { EditedDrafts, MessageText, Pictures, PlanCard, type PageMessage, type Picture } from '../../../web/src/messages';
import { splitEdited } from '../../../web/src/draft';
import { sender } from '../../../web/src/format';
import { pastedOf } from '../../../web/src/picture-chips';
import { ReviewRow } from '../../../web/src/review-row';
import { gapLabel, workedTitle, type Item } from '../../../web/src/turns';
import type { LabReviewLedger } from '../../../web/src/lab-review';
import { Icon } from './icon';
import type { LineName } from './line-icons';
import { Spinner } from './parts';

/** What every row needs to draw itself: the thread's pictures and links. */
export type RowContext = {
  // Without the login notes: what links to steps and pictures look through.
  messages: PageMessage[];
  pictures: Picture[];
  // Pictures written into a message's Markdown, by their src.
  inText: Map<string, string>;
  // Pictures that go after a row, by its seq.
  after: Map<number, Picture[]>;
  linkTo: (threadId: string) => string;
  button: (m: PageMessage) => (id: string, title: ReactNode) => ReactNode;
  review?: LabReviewLedger;
  reviewAt?: number;
};

export function ItemView({ item, c, nested = false }: { item: Item<PageMessage>; c: RowContext; nested?: boolean }): ReactNode {
  switch (item.kind) {
    case 'worked':
      return <WorkedView title={workedTitle(item.ms)}>{item.items.map((w, i) => <ItemView key={i} item={w} c={c} nested />)}</WorkedView>;
    case 'tools':
      return (
        <div className="tool-block">
          <ToolLines lines={item.items} />
          <Pictures items={item.items.flatMap((m) => c.after.get(m.seq) ?? [])} />
        </div>
      );
    case 'gap':
      return (
        <div className="gap-line">
          <span>{gapLabel(item.gap)}</span>
        </div>
      );
    case 'note':
      return <div className="login-note">{item.m.text}</div>;
    case 'message': {
      const m = item.m;
      const row = <MessageView m={m} c={c} nested={nested} />;
      return m.seq === c.reviewAt && c.review ? (
        <div className="stack">
          <ReviewRow review={c.review} threadPath={c.linkTo} />
          {row}
        </div>
      ) : (
        row
      );
    }
  }
}

function MessageView({ m, c, nested }: { m: PageMessage; c: RowContext; nested: boolean }) {
  if (m.role === 'assistant') {
    if (m.plan) return <PlanCard m={m} pictures={c.inText} rows={c.messages} threadPath={c.linkTo} button={c.button(m)} />;
    const text = <MessageText text={m.text} pictures={c.inText} seq={m.seq} rows={c.messages} threadPath={c.linkTo} button={c.button(m)} />;
    if (nested) return <div className="step-text">{text}</div>;
    return (
      <div className="assistant">
        {text}
        <Pictures items={c.after.get(m.seq) ?? []} />
      </div>
    );
  }
  if (m.role === 'tool') return <ToolLines lines={[m]} />;
  if (m.role === 'note') return <div className="login-note">{m.text}</div>;
  const from = sender(m);
  if (from && from.who !== 'Scheduled') return <AgentCard who={from.who} body={from.body} m={m} c={c} />;
  return <UserBubble m={m} c={c} text={from ? from.body : m.text} />;
}

/** Mike's message: his pasted pictures over his words, the drafts he changed under, and where it came from. */
function UserBubble({ m, c, text }: { m: PageMessage; c: RowContext; text: string }) {
  const edited = splitEdited(text);
  const words = edited ? edited.words : text;
  const pasted = pastedOf(c.pictures, m.seq, words);
  return (
    <div className="mine">
      <Pictures items={[...pasted.unplaced, ...(c.after.get(m.seq) ?? [])]} />
      {words.trim() ? (
        <div className="bubble">
          <MessageText text={words} pictures={c.inText} seq={m.seq} rows={c.messages} threadPath={c.linkTo} pictureChips pasted={pasted.byNumber} />
        </div>
      ) : null}
      {edited ? <EditedDrafts drafts={edited.drafts} /> : null}
      <Origin origin={m.origin} />
    </div>
  );
}

function Origin({ origin }: { origin?: string }) {
  if (origin === 'phone') return <Icon name="phone" size={12} className="faint origin-mark" label="Sent from the phone app" />;
  if (origin === 'schedule') return <span className="origin-mark">Scheduled</span>;
  if (origin === 'runner') return <span className="origin-mark">From the runner</span>;
  return null;
}

/** A message an agent wrote, not Mike: full width in a quiet card, who sent it on top. */
function AgentCard({ who, body, m, c }: { who: string; body: string; m: PageMessage; c: RowContext }) {
  return (
    <div className="agent-card">
      <div className="agent-card-head">
        <Icon name="cornerDownRight" size={14} />
        <span>{who}</span>
      </div>
      {body.trim() ? <MessageText text={body.trim()} pictures={c.inText} seq={m.seq} rows={c.messages} threadPath={c.linkTo} /> : null}
    </div>
  );
}

const TOOL_ICONS: Record<string, LineName> = { command: 'terminal', read: 'file', edit: 'pencil', write: 'pencil', search: 'search', web: 'globe', fetch: 'globe' };

/**
 * Tool calls between two messages: up to three as small lines, more folded
 * into "12 tool calls". Folds are <details>, so a work: link's step opens
 * the folds it's in (messages.tsx, showStep).
 */
function ToolLines({ lines }: { lines: PageMessage[] }) {
  const list = (
    <div className="tool-lines">
      {lines.map((m) => (
        <div key={m.seq} className="tool-line" id={`step-${m.seq}`} title={m.text}>
          <Icon name={TOOL_ICONS[m.toolKind ?? ''] ?? 'wrench'} size={13} />
          <span>{middle(m.text)}</span>
        </div>
      ))}
    </div>
  );
  if (lines.length <= 3) return list;
  return <Fold title={`${lines.length} tool calls`}>{list}</Fold>;
}

/** A long line cut in the middle, so its end shows. */
function middle(text: string, limit = 90): string {
  const line = text.split('\n')[0] ?? '';
  if (line.length <= limit) return line;
  return `${line.slice(0, limit / 2)}…${line.slice(-(limit / 2 - 1))}`;
}

function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="fold">
      <summary>
        <span>{title}</span>
        <Icon name="chevronRight" size={14} className="turn" />
      </summary>
      {children}
    </details>
  );
}

/** A finished turn's work, folded into one line that opens to it, a thin rule down its side. */
function WorkedView({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Fold title={title}>
      <div className="worked-items">{children}</div>
    </Fold>
  );
}

/**
 * A message the runner hasn't taken yet: the bubble dimmed, and under it
 * why it's waiting and a Cancel while it can still be taken back. Why goes
 * under the last one only, not down the column.
 */
export function WaitingBubble({ text, note, says, cancel, cancelling }: { text: string; note: string; says: boolean; cancel?: () => void; cancelling: boolean }) {
  return (
    <div className="mine">
      <div className="bubble waiting">{text}</div>
      <div className="waiting-note">
        {says || !cancel ? (
          <>
            <Icon name={note.endsWith('back') ? 'clock' : 'arrowUpCircle'} size={12} />
            <span>{note}</span>
            {cancel ? <span> · </span> : null}
          </>
        ) : null}
        {cancel ? (
          cancelling ? (
            <Spinner size={12} />
          ) : (
            <button className="text-button" onClick={cancel} title="Takes this message back before it's sent">
              Cancel
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
