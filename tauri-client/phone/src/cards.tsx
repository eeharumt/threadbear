// Below the newest message, as the Android app's StatusCard and Cards.kt:
// the card the thread is waiting on Mike with (a tool's permission, the
// agent's questions, a secret, the card of asks), else what it's doing,
// else the done card. What the answers send is the website's (decisions.ts).
import { useState, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../../convex/_generated/api';
import { CommandNote, useCommand } from '../../../web/src/command-state';
import { answerMessage, choices, followUpMessage } from '../../../web/src/decisions';
import { MessageText } from '../../../web/src/messages';
import { readLink } from '../../../web/src/thread-links';
import { OutLink } from '../../../web/src/link-confirm';
import { go } from '../../../web/src/route';
import { busy, type Row } from '../../../web/src/sidebar';
import { stillWorking } from '../../../web/src/sections';
import { Icon } from './icon';
import type { LineName } from './line-icons';
import { Spinner, useNow } from './parts';

type Approval = NonNullable<Row['pendingApproval']>;
type Ask = NonNullable<Row['asks']>[number];
type Thread = FunctionReturnType<typeof api.phone.threadRow> & {};

/**
 * `quiet`: nothing of Mike's is on its way (a message waiting to be taken
 * would answer the card itself). `lastRole`: who spoke last, as only an
 * agent's last word can be done.
 */
export function StatusCard({ token, t, quiet, lastRole, lastSeq, linkTo, archive }: { token: string; t: Thread; quiet: boolean; lastRole?: string; lastSeq?: number; linkTo: (id: string) => string; archive: () => void }) {
  const a = t.pendingApproval;
  if (a) return <ApprovalCard key={a.approvalId} token={token} threadId={t.threadId} approval={a} />;
  if (busy(t)) return <WorkingLine key={t.status} text={t.working} />;
  const asks = t.asks ?? [];
  if (asks.length && quiet) return <AsksCard key={t.asksSeq ?? 0} token={token} threadId={t.threadId} asks={asks} linkTo={linkTo} />;
  if (t.status === 'error') {
    return (
      <div className="status-line">
        <Icon name="alert" size={16} className="failed" />
        <span>{t.waitingForNetwork ? 'Lost the connection. It carries on by itself.' : 'The last turn failed. Send a message to try again.'}</span>
      </div>
    );
  }
  // Waiting on its own work isn't done, as on the Mac.
  const done = t.status === 'idle' && !t.needsYou && !t.archivedAt && !stillWorking(t) && lastRole === 'assistant' && quiet;
  if (done) return <DoneCard key={lastSeq ?? 0} token={token} t={t} linkTo={linkTo} archive={archive} />;
  return null;
}

/** "Bear with me · 12s" while a turn runs, or what it's doing, counted from when this screen first saw it. */
function WorkingLine({ text }: { text?: string }) {
  const [started] = useState(Date.now);
  const now = useNow(1000);
  const s = Math.max(0, Math.floor((now - started) / 1000));
  const elapsed = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  return (
    <div className="status-line">
      <span className="working-dot big" />
      <span className="ellipsis">{`${text && text !== 'Bear with me' ? text : 'Bear with me'} · ${elapsed}`}</span>
    </div>
  );
}

function CardFrame({ edge, children }: { edge?: boolean; children: ReactNode }) {
  return <section className={`card ${edge ? 'needs' : ''}`}>{children}</section>;
}

/** A pill to tap: filled for the main action or the one picked; spinning once tapped, until it lands. */
export function Pill({ children, onClick, filled, danger, spinning, disabled, icon, star, wide }: { children: ReactNode; onClick: () => void; filled?: boolean; danger?: boolean; spinning?: boolean; disabled?: boolean; icon?: LineName; star?: boolean; wide?: boolean }) {
  return (
    <button className={`pill ${filled ? 'filled' : ''} ${danger ? 'danger' : ''} ${wide ? 'wide' : ''}`} onClick={onClick} disabled={disabled || spinning}>
      {spinning ? <Spinner size={16} /> : icon ? <Icon name={icon} size={16} /> : null}
      {star && !filled ? <Icon name="starFilled" size={11} className="gold" label="Recommended" /> : null}
      <span>{children}</span>
    </button>
  );
}

function ApprovalCard({ token, threadId, approval }: { token: string; threadId: string; approval: Approval }) {
  const respond = useMutation(api.phone.respond);
  const answer = useMutation(api.phone.answer);
  const secret = useMutation(api.phone.secret);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const reply = useCommand<string>(token, { keepDone: true });
  const tapped = reply.spinning || reply.state.kind === 'done' ? (reply.state as { payload?: string }).payload : undefined;
  const note = <CommandNote command={reply} className="in-card" />;

  if (approval.kind === 'approval') {
    const label: Record<string, string> = { allow: 'Allow', allowAlways: 'Always', deny: 'Deny' };
    return (
      <CardFrame edge>
        <div className="card-title">{approval.title || approval.name}</div>
        {approval.inputSummary ? <pre className="approval-input">{approval.inputSummary}</pre> : approval.name ? <div className="muted small">{approval.name}</div> : null}
        <div className="pill-row even">
          {approval.options.map((o) => (
            <Pill key={o} filled={o === 'allow'} danger={o === 'deny'} spinning={tapped === o && reply.spinning} disabled={reply.busy} onClick={() => void reply.run(() => respond({ token, threadId, approvalId: approval.approvalId, decision: o as 'allow' | 'allowAlways' | 'deny' }), o)}>
              {label[o] ?? o}
            </Pill>
          ))}
        </div>
        {note}
      </CardFrame>
    );
  }

  if (approval.kind === 'secret') {
    // Sealed to the runner's key on the Mac's and the phones' own apps; this
    // app can't seal one yet, so it's answered there or declined here.
    return (
      <CardFrame edge>
        <div className="card-title with-icon">
          <Icon name="key" size={18} className="muted" />
          {approval.label}
        </div>
        {approval.reason.trim() ? <div className="muted">{approval.reason}</div> : null}
        <div className="needs-text small">Answer this on the Mac.</div>
        <div className="pill-row">
          <Pill spinning={reply.spinning} disabled={reply.busy} onClick={() => void reply.run(() => secret({ token, threadId, approvalId: approval.approvalId, decline: true }), 'decline')}>
            Decline
          </Pill>
        </div>
        {note}
      </CardFrame>
    );
  }

  const ready = approval.questions.every((q) => answers[q.question]?.length);
  return (
    <CardFrame edge>
      {approval.questions.map((q) => (
        <div key={q.question} className="question">
          <div className="card-title">{q.question}</div>
          {q.options.map((o) => {
            const on = answers[q.question]?.includes(o.label) ?? false;
            return (
              <button
                key={o.label}
                className="check-row"
                disabled={reply.busy}
                onClick={() =>
                  setAnswers((all) => {
                    const cur = all[q.question] ?? [];
                    const next = q.multiSelect ? (on ? cur.filter((x) => x !== o.label) : [...cur, o.label]) : on ? [] : [o.label];
                    return { ...all, [q.question]: next };
                  })
                }
              >
                <Tick on={on} square={q.multiSelect} />
                <span>
                  <span className="check-label">{o.label}</span>
                  {o.description ? <span className="check-note">{o.description}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      ))}
      <Pill
        wide
        filled={ready}
        disabled={!ready || reply.busy}
        spinning={reply.spinning}
        onClick={() => {
          // Several picks go in one comma-joined string, as the Mac app sends them.
          const flat = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.join(', ')]));
          void reply.run(() => answer({ token, threadId, approvalId: approval.approvalId, answers: flat }), 'answer');
        }}
      >
        Send answer
      </Pill>
      {note}
    </CardFrame>
  );
}

function Tick({ on, square }: { on: boolean; square?: boolean }) {
  return <span className={`tick ${on ? 'on' : ''} ${square ? 'square' : ''}`}>{on ? <Icon name="check" size={12} /> : null}</span>;
}

/**
 * The card of asks from the agent's end_turn. One ask sends as soon as an
 * answer's tapped; several are picked, then sent together.
 */
function AsksCard({ token, threadId, asks, linkTo }: { token: string; threadId: string; asks: Ask[]; linkTo: (id: string) => string }) {
  const send = useMutation(api.phone.send);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const cmd = useCommand<Record<number, number>>(token, { keepDone: true });
  const sending = cmd.busy;
  const submit = (by: Record<number, number>) => {
    const answers = asks.flatMap((a, i) => (by[i] !== undefined && choices(a)[by[i]!] !== undefined ? [{ index: i, action: a.action, answer: choices(a)[by[i]!]! }] : []));
    if (!answers.length) return;
    void cmd.run(() => send({ token, threadId, text: answerMessage(asks.length, answers, ''), answers: answers.map(({ action, answer }) => ({ action, answer })) }), by);
  };
  const choose = (i: number, choice: number) => {
    if (asks.length === 1) {
      setPicks({ [i]: choice });
      submit({ [i]: choice });
      return;
    }
    const next = { ...picks };
    if (next[i] === choice) delete next[i];
    else next[i] = choice;
    setPicks(next);
  };

  return (
    <CardFrame edge>
      {asks.map((a, i) => {
        const options = choices(a);
        const notes = a.options?.length && a.optionNotes?.length === a.options.length ? a.optionNotes : undefined;
        const hasNotes = !!notes?.some((n) => n.trim());
        return (
          <div key={i} className="ask">
            <div className={`ask-line ${a.ticked ? 'ticked' : ''}`}>
              {a.ticked ? <Icon name="check" size={16} className="muted" label="Done" /> : asks.length > 1 ? <span className="muted">{i + 1}.</span> : null}
              <div className="grow">
                <MessageText text={paragraph(a)} />
              </div>
            </div>
            {a.ticked ? null : (
              <>
                {a.links?.length ? (
                  <div className={hasNotes ? 'text-links' : 'pill-row'}>
                    {a.links.map((l) => (
                      <AskLink key={l.url} title={l.title} url={l.url} plain={hasNotes} linkTo={linkTo} />
                    ))}
                  </div>
                ) : null}
                {hasNotes ? (
                  <div className="answers">
                    {options.map((label, n) => {
                      const picked = picks[i] === n;
                      return (
                        <button key={n} className={`answer ${picked ? 'picked' : ''} ${sending && !picked ? 'faded' : ''}`} disabled={sending} onClick={() => choose(i, n)}>
                          <span className="grow">
                            <span className="answer-label">
                              {label}
                              {a.suggested === n && !picked ? (
                                <span className="recommended">
                                  <Icon name="starFilled" size={11} className="gold" /> Recommended
                                </span>
                              ) : null}
                            </span>
                            {notes?.[n]?.trim() ? <span className="answer-note">{notes[n]}</span> : null}
                          </span>
                          {picked && cmd.spinning && asks.length === 1 ? <Spinner size={16} /> : picked ? <Icon name="check" size={16} /> : <Icon name="chevronRight" size={16} className="faint" />}
                        </button>
                      );
                    })}
                  </div>
                ) : options.length ? (
                  <div className="pill-row">
                    {options.map((label, n) => (
                      <Pill key={n} filled={picks[i] === n} star={a.suggested === n} spinning={picks[i] === n && cmd.spinning && asks.length === 1} disabled={sending && picks[i] !== n} onClick={() => choose(i, n)}>
                        {label}
                      </Pill>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        );
      })}
      {asks.length > 1 && Object.keys(picks).length ? (
        <Pill wide filled spinning={cmd.spinning} disabled={sending} onClick={() => submit(picks)}>
          Send
        </Pill>
      ) : null}
      <CommandNote command={cmd} className="in-card" />
    </CardFrame>
  );
}

/** The action on one line, a full stop if it needs one, then the why. */
function paragraph(a: Ask): string {
  const line = a.action
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
  const why = (a.why ?? '').trim();
  if (!why) return line;
  return `${/[.!?:…]$/.test(line) ? line : `${line}.`} ${why}`;
}

/** An ask's link: a thread opens here, a review only on the Mac, a web page in the browser. */
function AskLink({ title, url, plain, linkTo }: { title: string; url: string; plain: boolean; linkTo: (id: string) => string }) {
  const target = readLink(url);
  const inner = (
    <>
      <Icon name={plain ? 'arrowUpRight' : 'external'} size={15} />
      <span>{title}</span>
    </>
  );
  const className = plain ? 'text-link' : 'pill';
  if (target?.kind === 'thread') {
    return (
      <button className={className} onClick={() => go(linkTo(target.id))}>
        {inner}
      </button>
    );
  }
  if (target?.kind === 'review') {
    return (
      <span className={`${className} inert`} title="This review opens in Threadbear on your Mac">
        {inner}
      </span>
    );
  }
  return (
    <OutLink className={className} href={url}>
      {inner}
    </OutLink>
  );
}

/**
 * A finished turn that needs nothing: archive it, or tick follow-ups to
 * carry on. What the runner found still open goes between, under "Still
 * open", or "Coming back" when it's only booked check-ins.
 */
function DoneCard({ token, t, linkTo, archive }: { token: string; t: Thread; linkTo: (id: string) => string; archive: () => void }) {
  const send = useMutation(api.phone.send);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const cmd = useCommand<undefined>(token, { keepDone: true });
  const next = t.next ?? [];
  const ends = [...(t.looseEnds ?? []).filter((e) => e.kind !== 'scheduled'), ...(t.looseEnds ?? []).filter((e) => e.kind === 'scheduled')];
  return (
    <CardFrame>
      <div className="done-head">
        <Icon name="checkCircle" size={18} />
        <span className="grow">Done</span>
        <Pill icon="archive" onClick={archive}>
          Archive
        </Pill>
      </div>
      {ends.length ? (
        <>
          <div className="card-label">{ends.some((e) => e.kind !== 'scheduled') ? 'Still open' : 'Coming back'}</div>
          {ends.map((e, i) => {
            const booked = e.kind === 'scheduled';
            const words = booked && e.at ? `${bookedWhen(e.at)}: ${e.text}` : e.text;
            const icon = <Icon name={booked ? 'clock' : 'alertCircle'} size={18} className={booked ? 'muted' : 'needs-text'} label={booked ? 'Booked' : 'Still open'} />;
            return e.threadId ? (
              <button key={i} className="check-row" onClick={() => go(linkTo(e.threadId!))}>
                {icon}
                <span className="accent">{words}</span>
              </button>
            ) : (
              <div key={i} className="check-row">
                {icon}
                <span>{words}</span>
              </div>
            );
          })}
        </>
      ) : null}
      {next.length ? (
        <>
          <div className="card-label">Or carry on</div>
          {next.map((step, i) => (
            <button
              key={i}
              className="check-row"
              disabled={cmd.busy}
              onClick={() => {
                const s = new Set(ticked);
                if (s.has(i)) s.delete(i);
                else s.add(i);
                setTicked(s);
              }}
            >
              <Tick on={ticked.has(i)} />
              <span className="check-label">{step}</span>
            </button>
          ))}
          {ticked.size ? (
            <Pill wide filled spinning={cmd.spinning} disabled={cmd.busy} onClick={() => void cmd.run(() => send({ token, threadId: t.threadId, text: followUpMessage([...ticked].sort((x, y) => x - y).map((i) => next[i]!), '') }), undefined)}>
              Send
            </Pill>
          ) : null}
        </>
      ) : null}
      <CommandNote command={cmd} className="in-card" />
    </CardFrame>
  );
}

/** "Fri 13 Nov, 9:30 am", for when a booked check-in comes back. */
function bookedWhen(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}
