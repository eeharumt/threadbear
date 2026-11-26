// Dictation into a field, as the native app's mic button: the words land
// where the cursor was, each new guess replacing the last, and it never
// sends by itself. A WebView has no speech recognition, so each app brings
// its own: on Android the phone's recognizer (android/Dictation.kt, on
// window.threadbearDictation), on Windows its own voice typing (Win+H, from
// lib.rs), which types into the field as a keyboard would.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';

type Bridge = { start(): void; stop(): void };
type Heard = { kind: 'words'; said: string; final: boolean } | { kind: 'end' } | { kind: 'problem'; text: string };

const bridge = (window as { threadbearDictation?: Bridge }).threadbearDictation;
const windows = isTauri() && /Windows/.test(navigator.userAgent);

/** How this app dictates, if it can. */
export const dictation: 'phone' | 'windows' | undefined = bridge ? 'phone' : windows ? 'windows' : undefined;

// Words run on with a space, except next to Japanese or Chinese, which has none.
const wide = /[　-鿿豈-﫿＀-￯]/;
export function joinWords(a: string, b: string): string {
  if (!a || !b || /\s$/.test(a) || /^\s/.test(b)) return a + b;
  return wide.test(a.at(-1)!) || wide.test(b[0]!) ? a + b : `${a} ${b}`;
}

// One field dictates at a time: the one whose mic was last tapped.
let owner = 0;

/**
 * The mic for one field: `text` and `setText` are its words, `field` the
 * element, so the words go in at its cursor.
 */
export function useDictation(field: RefObject<HTMLTextAreaElement | null>, text: string, setText: (text: string) => void) {
  const me = useRef(0);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string>();
  // Where it's putting words: what was either side of the cursor, and what
  // the sessions before this one said.
  const spot = useRef({ before: '', after: '', said: '' });

  useEffect(() => {
    if (dictation !== 'phone') return;
    const heard = (e: Event) => {
      if (owner !== me.current) return;
      const h = (e as CustomEvent<Heard>).detail;
      if (h.kind === 'words') {
        const s = spot.current;
        const said = joinWords(s.said, h.said.trim());
        if (h.final) s.said = said;
        setText(joinWords(joinWords(s.before, said), s.after));
      } else {
        setListening(false);
        if (h.kind === 'problem') setProblem(h.text);
      }
    };
    window.addEventListener('threadbear-dictation', heard);
    return () => window.removeEventListener('threadbear-dictation', heard);
  }, [setText]);
  // A field that goes away mid-sentence takes the mic with it.
  useEffect(
    () => () => {
      if (owner === me.current && me.current) bridge?.stop();
    },
    [],
  );

  return {
    listening,
    problem,
    /** Words still on their way: sending now would leave them behind. */
    holds: listening,
    toggle() {
      setProblem(undefined);
      if (dictation === 'windows') {
        field.current?.focus();
        invoke('voice_typing').catch(() => setProblem("Couldn't open Windows voice typing."));
        return;
      }
      if (!bridge) return;
      if (listening) {
        bridge.stop();
        return;
      }
      const el = field.current;
      const at = el ? el.selectionStart : text.length;
      spot.current = { before: text.slice(0, at), after: text.slice(at), said: '' };
      me.current = ++owner;
      setListening(true);
      bridge.start();
    },
  };
}
