// A new thread, as the Android app's NewThreadScreen: what it should do, with
// photos or dictated, and which runner, agent, model and effort it starts on.
// It starts in the runner's default folder, as there. Which choices there are
// is the website's (new-thread-choices.ts); once the runner has made the
// thread, the thread opens in this screen's place.
import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { CommandNote, useCommand } from '../../../web/src/command-state';
import { useLiveQuery } from '../../../web/src/live';
import { agentOptions, defaultRunner, effortTitle, modelGroups, resolveChoices, type ThreadPick } from '../../../web/src/new-thread-choices';
import { threadPath } from '../../../web/src/route';
import { isOnline } from '../../../web/src/view-logic';
import { ListeningBar } from './composer';
import { dictation as canDictate, useDictation } from './dictation';
import { Icon } from './icon';
import { IconButton, Spinner, useNow } from './parts';
import { PhotoButton, PhotoStrip, pastePhotos, usePhotos } from './photos';

/** The thread in the new one's place, so Back goes to where New thread was opened from. */
function openInstead(threadId: string) {
  history.replaceState(null, '', threadPath(threadId));
  dispatchEvent(new PopStateEvent('popstate'));
}

export function NewThreadScreen({ token, close }: { token: string; close: () => void }) {
  const create = useMutation(api.phone.create);
  const runners = useLiveQuery(api.phone.runners, { token });
  const accounts = useLiveQuery(api.phone.accounts, { token });
  const now = useNow(15_000);
  const [text, setText] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const photos = usePhotos(token);
  const mic = useDictation(field, text, setText);
  // '' is automatic: the backend's choice, the first online in Mike's order.
  const [runnerId, setRunnerId] = useState('');
  const [pick, setPick] = useState<ThreadPick & { runnerId?: string }>({ accountId: '', modelId: '', effort: '' });
  const cmd = useCommand(token);
  const made = cmd.state.kind === 'waiting' || cmd.state.kind === 'slow' || cmd.state.kind === 'done' ? cmd.state.threadId : undefined;
  useEffect(() => {
    if (made) openInstead(made);
  }, [made]);

  const list = runners ?? [];
  const explicit = list.find((r) => r.runnerId === runnerId)?.runnerId;
  const automatic = defaultRunner(list, now) ?? list.find((r) => !r.draining && isOnline(r, now))?.runnerId ?? (list.length === 1 ? list[0]!.runnerId : undefined);
  const target = explicit ?? automatic;
  const agents = agentOptions(accounts, target);
  const previousAgents = pick.runnerId === target ? undefined : agentOptions(accounts, pick.runnerId);
  const { agent, efforts, pick: resolved } = resolveChoices(agents, pick, previousAgents);
  const { accountId, modelId, effort } = resolved;
  if (pick.runnerId !== target || pick.accountId !== accountId || pick.modelId !== modelId || pick.effort !== effort) {
    setPick({ runnerId: target, ...resolved });
  }
  const { plain, groups } = modelGroups(agent?.models ?? []);
  const chosen = list.find((r) => r.runnerId === target);
  const offline = list.length && !list.some((r) => isOnline(r, now)) ? (list.length === 1 ? `${list[0]!.name} is offline` : 'Every runner is offline') : chosen && !isOnline(chosen, now) ? `${chosen.name} is offline` : undefined;

  const busy = cmd.busy;
  const typed = text.trim();
  const canStart = (typed !== '' || photos.photos.length > 0) && photos.ready && !mic.holds && !busy;
  const start = () => {
    if (!canStart) return;
    // A runner picked, or the one whose agents the settings came from.
    const destination = explicit ?? (accountId || effort ? target : undefined);
    const images = photos.ids;
    void cmd.run(
      () =>
        create({
          token,
          text: typed,
          ...(destination ? { runnerId: destination } : {}),
          ...(accountId ? { accountId } : {}),
          ...(modelId ? { model: modelId } : {}),
          ...(effort ? { effort } : {}),
          ...(images.length ? { images } : {}),
        }),
      undefined,
    );
  };

  return (
    <div className="screen">
      <header className="top-bar">
        <IconButton name="close" label="Cancel" onClick={close} />
        <h1 className="top-title small grow">New thread</h1>
        {busy ? (
          <Spinner size={20} />
        ) : (
          <button className="text-button" disabled={!canStart} onClick={start}>
            Start
          </button>
        )}
      </header>
      <div className="scroll form">
        <CommandNote command={cmd} />
        <div className="form-card new-thread-box">
          <textarea
            ref={field}
            className="new-thread-field"
            autoFocus
            value={text}
            readOnly={busy}
            placeholder="What should it do?"
            aria-label="What should it do?"
            rows={4}
            onChange={(e) => setText(e.target.value)}
            onPaste={pastePhotos(photos)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                start();
              }
            }}
          />
          <div className="new-thread-tools">
            <PhotoButton box={photos} disabled={busy} label="Add a photo" className="label-button">
              <Icon name="photo" size={18} />
              Add a photo
            </PhotoButton>
            <span className="grow" />
            {mic.listening ? (
              <ListeningBar stop={mic.toggle} />
            ) : canDictate ? (
              <button className="label-button" onClick={mic.toggle} disabled={busy}>
                <Icon name="mic" size={18} />
                Dictate
              </button>
            ) : null}
          </div>
          {mic.problem ? <div className="dictation-note">{mic.problem}</div> : null}
          <PhotoStrip box={photos} disabled={busy} />
        </div>
        {list.length > 1 || agents.length ? (
          <div className="form-card">
            {list.length > 1 ? (
              <PickerRow
                label="Runner"
                value={explicit ?? ''}
                options={[{ value: '', title: 'Automatic' }, ...list.map((r) => ({ value: r.runnerId, title: isOnline(r, now) ? r.name : `${r.name}, offline` }))]}
                pick={setRunnerId}
              />
            ) : null}
            {agents.length ? (
              <>
                <PickerRow label="Agent" value={accountId} options={[{ value: '', title: 'Default' }, ...agents.map((a) => ({ value: a.id, title: a.label }))]} pick={(v) => setPick({ runnerId: target, accountId: v, modelId: '', effort })} />
                <PickerRow
                  label="Model"
                  value={modelId}
                  disabled={!agent?.models.length}
                  options={[{ value: '', title: 'Default' }, ...plain.map((m) => ({ value: m.id, title: m.label }))]}
                  groups={groups.map((g) => ({ label: g.label, options: g.models.map((m) => ({ value: m.id, title: m.label })) }))}
                  pick={(v) => setPick({ runnerId: target, accountId, modelId: v, effort })}
                />
                <PickerRow
                  label="Effort"
                  value={effort}
                  disabled={!efforts.length}
                  options={[{ value: '', title: 'Default' }, ...efforts.map((l) => ({ value: l, title: effortTitle(l) }))]}
                  pick={(v) => setPick({ runnerId: target, accountId, modelId, effort: v })}
                />
              </>
            ) : null}
          </div>
        ) : null}
        {offline ? (
          <div className="form-note">
            <Icon name="moon" size={16} />
            {offline}. It'll start when it's back.
          </div>
        ) : null}
      </div>
    </div>
  );
}

type Option = { value: string; title: string };

/** One choice: its name, what's chosen, and a menu of the rest, any groups under their names. */
function PickerRow({ label, value, options, groups = [], disabled, pick }: { label: string; value: string; options: Option[]; groups?: { label: string; options: Option[] }[]; disabled?: boolean; pick: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const all = [...options, ...groups.flatMap((g) => g.options)];
  const title = all.find((o) => o.value === value)?.title ?? options[0]?.title ?? '';
  const item = (o: Option) => (
    <button
      key={o.value}
      role="menuitemradio"
      aria-checked={o.value === value}
      onClick={() => {
        setOpen(false);
        pick(o.value);
      }}
    >
      <span className="grow">{o.title}</span>
      {o.value === value ? <Icon name="check" size={16} className="accent" /> : null}
    </button>
  );
  return (
    <div className="picker-row-anchor">
      <button className="picker-row" disabled={disabled} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <span>{label}</span>
        <span className="picker-value">{title}</span>
        <Icon name="chevronDown" size={14} className="faint" />
      </button>
      {open ? (
        <>
          <div className="scrim" onClick={() => setOpen(false)} />
          <div className="dropdown right picker-menu" role="menu">
            {options.map(item)}
            {groups.map((g) => (
              <div key={g.label}>
                <div className="dropdown-group">{g.label}</div>
                {g.options.map(item)}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
