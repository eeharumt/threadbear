// Pairing, as the Android app's PairScreen: paste the code the Mac shows in
// Settings, Phone & browser, or a website sign-in link. Checked with
// phone:me before anything is kept.
import { useRef, useState } from 'react';
import logo from '../../../android-native/app/src/main/res/drawable-nodpi/ic_launcher_fg.png';
import { Icon } from './icon';
import { readPairing } from './pairing';
import { pair } from './session';

const DEFAULT_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;

export function PairScreen() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const field = useRef<HTMLInputElement>(null);

  const submit = async (value: string) => {
    const pairing = readPairing(value, DEFAULT_URL);
    if (!pairing) {
      setBusy(false);
      setNote("That isn't a Threadbear pairing code.");
      return;
    }
    setBusy(true);
    setNote(undefined);
    try {
      await pair(pairing);
    } catch (e) {
      setNote((e as Error).message);
      setBusy(false);
    }
  };

  // The WebView may not let a page read the clipboard: then the field takes
  // a long-press paste instead.
  const paste = async () => {
    setBusy(true);
    let clip: string;
    try {
      clip = (await navigator.clipboard.readText()).trim();
    } catch {
      setBusy(false);
      field.current?.focus();
      setNote('Long-press the box and paste the code there.');
      return;
    }
    if (!clip) {
      setBusy(false);
      setNote("There's no pairing code on the clipboard.");
      return;
    }
    setText(clip);
    await submit(clip);
  };

  return (
    <main className="pair">
      <div className="pair-column">
        <img className="pair-logo" src={logo} alt="" />
        <h1>Threadbear</h1>
        <p className="pair-lead">Pair with the code on your Mac, in Settings, Phone &amp; browser.</p>
        {busy ? (
          <div className="spinner" role="status" aria-label="Pairing" />
        ) : (
          <>
            <button className="filled-button" disabled={busy} onClick={() => void paste()}>
              <Icon name="paste" size={20} />
              Paste a pairing code
            </button>
            <form
              className="pair-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(text);
              }}
            >
              <input
                ref={field}
                type="password"
                autoComplete="off"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Or paste it here"
                aria-label="Pairing code"
              />
              <button className="outlined-button" type="submit" disabled={!text.trim()}>
                Pair
              </button>
            </form>
          </>
        )}
        {note ? <p className="pair-note">{note}</p> : null}
      </div>
    </main>
  );
}
