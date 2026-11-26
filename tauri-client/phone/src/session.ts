// Which server this app is paired with and its token, kept in the app's own
// WebView storage (no other site shares it: the app serves only its own pages).
// The Android app keeps the same in EncryptedSharedPreferences.
import { useSyncExternalStore } from 'react';
import { ConvexHttpClient } from 'convex/browser';
import { ConvexError } from 'convex/values';
import { api } from '../../../convex/_generated/api';
import type { Pairing } from './pairing';

export type Session = { url: string; token: string; keys: Record<string, string> };

const KEY = 'threadbear.phone.session';
const listeners = new Set<() => void>();
let cached: { raw: string | null; session: Session | null } = { raw: null, session: null };

function read(): Session | null {
  const raw = localStorage.getItem(KEY);
  if (raw !== cached.raw) {
    let session: Session | null = null;
    try {
      const s = raw ? (JSON.parse(raw) as Partial<Session>) : null;
      if (s && typeof s.url === 'string' && typeof s.token === 'string') session = { url: s.url, token: s.token, keys: s.keys ?? {} };
    } catch {
      session = null;
    }
    cached = { raw, session };
  }
  return cached.session;
}

function changed(): void {
  listeners.forEach((l) => l());
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
  );
}

/**
 * Trades the pairing's one-use code for this app's token (tokens:claim), and
 * checks the token works (phone:me) before keeping it. Throws a sentence to show.
 */
export async function pair(pairing: Pairing): Promise<void> {
  const client = new ConvexHttpClient(pairing.url);
  let token: string;
  try {
    token = (await client.mutation(api.tokens.claim, { code: pairing.code })).token;
    await client.query(api.phone.me, { token });
  } catch (e) {
    if (e instanceof ConvexError) throw new Error('That code has expired or was already used. Make a new one on your Mac.');
    throw new Error(`Couldn't reach ${new URL(pairing.url).host}. Check the connection and try again.`);
  }
  localStorage.setItem(KEY, JSON.stringify({ url: pairing.url, token, keys: pairing.keys } satisfies Session));
  changed();
}

export function unpair(): void {
  localStorage.removeItem(KEY);
  changed();
}
