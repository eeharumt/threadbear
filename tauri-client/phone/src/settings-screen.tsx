// Settings, as the Android app's SettingsScreen: what this device is paired
// with, the runners and their order, the app's version, and Unpair.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from '@tauri-apps/api/core';
import { api } from '../../../convex/_generated/api';
import { useLiveQuery } from '../../../web/src/live';
import { isOnline, sinceWords } from '../../../web/src/view-logic';
import { Icon } from './icon';
import { IconButton, useNow } from './parts';
import { unpair } from './session';

type Runner = { runnerId: string; name: string; lastSeenAt: string; draining?: boolean };

function status(r: Runner, now: number): string {
  return isOnline(r, now) ? 'Online' : `Last seen ${sinceWords(Date.parse(r.lastSeenAt), now)} ago`;
}

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function SettingsScreen({ token, server, back, runnerOrder }: { token: string; server: string; back: () => void; runnerOrder: () => void }) {
  const me = useLiveQuery(api.phone.me, { token });
  const runners = useLiveQuery(api.phone.runners, { token }) ?? [];
  const now = useNow(15_000);
  const [version, setVersion] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (isTauri()) void getVersion().then(setVersion, () => undefined);
  }, []);
  const choose = runners.length > 1;

  return (
    <div className="screen">
      <header className="top-bar">
        <IconButton name="back" label="Back" className="back-button" onClick={back} />
        <h1 className="top-title small">Settings</h1>
      </header>
      <div className="scroll form">
        <Group title="Paired with">
          {/* Breaks after its dots, not mid-word, when it needs two lines. */}
          <Field label="Server" value={new URL(server).host.replaceAll('.', '.​')} />
          {me ? (
            <>
              <Field label="Device" value={me.name} />
              <Field label="Token expires" value={day.format(new Date(me.expiresAt))} />
            </>
          ) : null}
          {choose ? null : runners.map((r) => <Field key={r.runnerId} label={r.name} value={status(r, now)} />)}
        </Group>
        {choose ? (
          <Group title="Runners" footer="New threads start on the first one that's online.">
            {runners.map((r) => (
              <Field key={r.runnerId} label={r.name} value={status(r, now)} />
            ))}
            <button className="form-row" onClick={runnerOrder}>
              <span className="grow">Change the order</span>
              <Icon name="chevronRight" size={16} className="faint" />
            </button>
          </Group>
        ) : null}
        <Group title="Notifications">
          <div className="form-text">
            <Icon name="bellOff" size={18} />
            <span>This app can't send notifications yet. Open it to see what needs you.</span>
          </div>
        </Group>
        <Group title="App">
          <Field label="Version" value={version ?? 'Development build'} />
        </Group>
        <Group footer="Forgets the token on this device. Revoke it on the Mac too if the device is lost.">
          <button className="form-row danger" onClick={() => setConfirming(true)}>
            Unpair this device
          </button>
        </Group>
      </div>
      {confirming ? (
        <div className="dialog-scrim" onClick={() => setConfirming(false)}>
          <div className="dialog" role="alertdialog" aria-label="Unpair this device?" onClick={(e) => e.stopPropagation()}>
            <h2>Unpair this device?</h2>
            <p>You'll need a new pairing code from your Mac to use it again.</p>
            <div className="dialog-buttons">
              <button className="text-button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button className="text-button danger" onClick={unpair}>
                Unpair
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A Form-like group: a heading, rows on a raised card, and a note under it. */
function Group({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <section className="form-group">
      {title ? <h2 className="form-heading">{title}</h2> : null}
      <div className="form-card">{children}</div>
      {footer ? <p className="form-footer">{footer}</p> : null}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="form-row">
      <span className="form-label">{label}</span>
      <span className="form-value">{value}</span>
    </div>
  );
}

/**
 * The runners in Mike's order, to drag about by their handles: new threads
 * start on the first one online (phone:setRunnerOrder).
 */
export function RunnerOrderScreen({ token, back }: { token: string; back: () => void }) {
  const runners = useLiveQuery(api.phone.runners, { token });
  const save = useMutation(api.phone.setRunnerOrder);
  const now = useNow(15_000);
  const [order, setOrder] = useState<Runner[]>([]);
  const [drag, setDrag] = useState<{ id: string; offset: number }>();
  const rowHeight = useRef(56);
  // The backend's list, except mid-drag, when the finger's order holds.
  if (!drag && runners && runners.map((r) => r.runnerId).join() !== order.map((r) => r.runnerId).join()) setOrder(runners);

  const move = (id: string, dy: number) => {
    let offset = dy;
    const next = [...order];
    let i = next.findIndex((r) => r.runnerId === id);
    const h = rowHeight.current;
    // Past half a row, the row swaps with its neighbour and the offset carries on from its new place.
    while (offset > h / 2 && i < next.length - 1) {
      next.splice(i + 1, 0, next.splice(i, 1)[0]!);
      i++;
      offset -= h;
    }
    while (offset < -h / 2 && i > 0) {
      next.splice(i - 1, 0, next.splice(i, 1)[0]!);
      i--;
      offset += h;
    }
    setOrder(next);
    return offset;
  };
  const drop = () => {
    setDrag(undefined);
    if (runners && order.map((r) => r.runnerId).join() !== runners.map((r) => r.runnerId).join()) {
      void save({ token, runnerIds: order.map((r) => r.runnerId) });
    }
  };

  return (
    <div className="screen">
      <header className="top-bar">
        <IconButton name="back" label="Back" className="back-button" onClick={back} />
        <h1 className="top-title small">Runner order</h1>
      </header>
      <div className="scroll form">
        <Group footer="New threads start on the first one that's online. Drag to change the order.">
          {order.map((r) => {
            const lifted = drag?.id === r.runnerId;
            return (
              <div key={r.runnerId} className={`form-row runner-row ${lifted ? 'lifted' : ''}`} style={lifted ? { transform: `translateY(${drag.offset}px)` } : undefined}>
                <span className="grow">{r.name}</span>
                <span className="form-value">{isOnline(r, now) ? 'Online' : 'Offline'}</span>
                <span
                  className="grip"
                  aria-label="Drag to reorder"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    rowHeight.current = e.currentTarget.parentElement?.offsetHeight ?? 56;
                    const startY = e.clientY;
                    let base = 0;
                    setDrag({ id: r.runnerId, offset: 0 });
                    const target = e.currentTarget;
                    const moved = (m: PointerEvent) => {
                      const left = move(r.runnerId, m.clientY - startY - base);
                      base = m.clientY - startY - left;
                      setDrag({ id: r.runnerId, offset: left });
                    };
                    const up = () => {
                      target.removeEventListener('pointermove', moved);
                      target.removeEventListener('pointerup', up);
                      target.removeEventListener('pointercancel', up);
                      drop();
                    };
                    target.addEventListener('pointermove', moved);
                    target.addEventListener('pointerup', up);
                    target.addEventListener('pointercancel', up);
                  }}
                >
                  <Icon name="grip" size={20} />
                </span>
              </div>
            );
          })}
        </Group>
      </div>
    </div>
  );
}
