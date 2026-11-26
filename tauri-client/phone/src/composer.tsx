// The reply box, as the Android app's Composer: a rounded grey field and a
// round button that sends, or stops the turn while it runs with nothing
// typed. What's typed stays until the backend has it, and comes back if
// it fails (the website's composer-draft.ts); Stop holds until the turn
// has ended (its stop-hold.ts), so a second press can't send a second one.
import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { STOP_HOLD_MS, unqueued } from '../../../web/src/command';
import { CommandNote, useCommand } from '../../../web/src/command-state';
import { withFailed, withoutSent } from '../../../web/src/composer-draft';
import { holdStop, releaseStop, stopHeldFor } from '../../../web/src/stop-hold';
import { busy } from '../../../web/src/sidebar';
import { Icon } from './icon';
import { Spinner } from './parts';

export function Composer({ token, t, offline }: { token: string; t: { threadId: string; status: string }; offline?: string }) {
  const send = useMutation(api.phone.send);
  const interrupt = useMutation(api.phone.interrupt);
  const threadId = t.threadId;
  const [text, setText] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const sending = useCommand<string>(token, {
    onQueued: (sent) => setText((cur) => withoutSent(cur, sent)),
    onFailed: (_error, sent, queued) => {
      if (queued) setText((cur) => withFailed(cur, sent));
    },
  });
  const holding = unqueued(sending.state);

  const stopCmd = useCommand(token, { settleMs: STOP_HOLD_MS });
  // A Stop pressed before this screen was made still holds, for what's left of it.
  const [carried, setCarried] = useState(() => stopHeldFor(threadId, Date.now()));
  useEffect(() => {
    if (!carried) return;
    const timer = setTimeout(() => setCarried(0), carried);
    return () => clearTimeout(timer);
  }, [carried]);
  const stopDone = stopCmd.state.kind === 'done';
  useEffect(() => {
    if (stopDone) holdStop(threadId, Date.now());
  }, [stopDone, threadId]);
  // Over once the turn has ended, not while it waits on a card.
  const turnOn = busy(t) || t.status === 'waiting';
  const stopOver = stopCmd.over;
  useEffect(() => {
    if (turnOn) return;
    stopOver();
    releaseStop(threadId);
  }, [turnOn, stopOver, threadId]);
  const held = turnOn && carried > 0 && stopCmd.state.kind === 'idle';
  const stopping = stopCmd.spinning || stopDone || held;
  const stopLocked = stopCmd.busy || held;

  // The field grows with what's typed, up to six lines, as on the phone.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 6 * 24 + 22)}px`;
  }, [text]);

  const typed = text.trim();
  const submit = () => {
    if (!typed || holding) return;
    void sending.run(() => send({ token, threadId, text: typed }), text, { again: true });
  };
  const showStop = busy(t) && !typed;

  return (
    <div className="composer">
      {sending.watch}
      <CommandNote command={sending} />
      <CommandNote command={stopCmd} />
      <div className="composer-row">
        <textarea
          ref={field}
          className="composer-field"
          rows={1}
          value={text}
          readOnly={holding}
          placeholder={offline ? `${offline} is offline, this will wait` : busy(t) ? 'Steer the agent' : 'Reply'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Return sends with a keyboard, Shift-Return is a new line; on a
            // touch keyboard Return is a new line and the button sends.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !matchMedia('(pointer: coarse)').matches) {
              e.preventDefault();
              submit();
            }
          }}
          autoCapitalize="sentences"
          aria-label="Reply"
        />
        <span className="send-slot">
          {showStop ? (
            stopping ? (
              <Spinner size={22} />
            ) : (
              <button
                className="stop-button"
                disabled={stopLocked}
                onClick={() => {
                  holdStop(threadId, Date.now());
                  void stopCmd.run(() => interrupt({ token, threadId }), undefined);
                }}
                aria-label="Stop"
                title="Stop"
              >
                <Icon name="stop" size={16} />
              </button>
            )
          ) : typed ? (
            <button className="send-button" disabled={holding} onClick={submit} aria-label={holding ? 'Sending' : 'Send'} title="Send">
              {sending.state.kind === 'sending' ? <Spinner size={18} /> : <Icon name="arrowUp" size={20} />}
            </button>
          ) : (
            <Icon name="arrowUp" size={20} className="faint" />
          )}
        </span>
      </div>
    </div>
  );
}
