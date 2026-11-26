// The reply box, as the Android app's Composer: Add a photo, a rounded grey
// field, the mic, and a round button that sends, or stops the turn while it
// runs with nothing typed. What's typed stays until the backend has it, and comes back if
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
import { dictation as canDictate, useDictation } from './dictation';
import { Icon } from './icon';
import { PhotoButton, PhotoStrip, pastePhotos, usePhotos, type Photo } from './photos';
import { IconButton, Spinner } from './parts';

export function Composer({ token, t, offline }: { token: string; t: { threadId: string; status: string }; offline?: string }) {
  const send = useMutation(api.phone.send);
  const interrupt = useMutation(api.phone.interrupt);
  const threadId = t.threadId;
  const [text, setText] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const photos = usePhotos(token);
  const mic = useDictation(field, text, setText);
  // The photos leave the box as they're sent, and come back if it fails.
  const sending = useCommand<{ text: string; photos: Photo[] }>(token, {
    onQueued: (sent) => {
      setText((cur) => withoutSent(cur, sent.text));
      photos.done(sent.photos);
    },
    onFailed: (_error, sent, queued) => {
      if (queued) setText((cur) => withFailed(cur, sent.text));
      photos.putBack(sent.photos);
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
  const has = typed !== '' || photos.photos.length > 0;
  // Not with a photo still on its way, which would be left behind, nor with
  // the mic's last words still to come.
  const canSend = has && photos.ready && !mic.holds && !holding;
  const submit = () => {
    if (!canSend) return;
    const images = photos.ids;
    const sent = photos.take();
    void sending.run(() => send({ token, threadId, text: typed, ...(images.length ? { images } : {}) }), { text, photos: sent }, { again: true });
  };
  const showStop = busy(t) && !has && !mic.listening;

  return (
    <div className="composer">
      {sending.watch}
      <CommandNote command={sending} />
      <CommandNote command={stopCmd} />
      <PhotoStrip box={photos} />
      {mic.problem ? <div className="dictation-note">{mic.problem}</div> : null}
      {mic.listening && text ? <div className="composer-heard">{text}</div> : null}
      <div className="composer-row">
        {mic.listening ? (
          <ListeningBar stop={mic.toggle} />
        ) : (
          <>
        <PhotoButton box={photos} disabled={holding} label="Add a photo" className="icon-button composer-tool">
          <Icon name="plusCircle" size={24} />
        </PhotoButton>
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
          onPaste={pastePhotos(photos)}
          autoCapitalize="sentences"
          aria-label="Reply"
        />
        {canDictate ? <IconButton name="mic" label="Dictate" className="composer-tool" onClick={mic.toggle} /> : null}
          </>
        )}
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
          ) : canSend || (has && holding) ? (
            <button className="send-button" disabled={!canSend} onClick={submit} aria-label={holding ? 'Sending' : 'Send'} title="Send">
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

/**
 * The box while the phone's hearing: a red pulse, the time so far and a stop
 * across the whole row, so it's plain the mic is on (ListeningBar).
 */
export function ListeningBar({ stop }: { stop: () => void }) {
  const [started] = useState(Date.now);
  const [now, setNow] = useState(started);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - started) / 1000));
  return (
    <button className="listening-bar" onClick={stop} aria-label="Stop dictating">
      <span className="listening-pulse" />
      <span className="listening-label">Listening</span>
      <span className="listening-time">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
      <span className="listening-stop">
        <Icon name="stop" size={11} />
      </span>
    </button>
  );
}
