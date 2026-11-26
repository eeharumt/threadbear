// A screen over the list: New thread, Settings, and the runner order.
// Each is its own history entry, so Android's back gesture closes it.
import { useSyncExternalStore } from 'react';

export type Cover = 'new' | 'settings' | 'runners';

function read(): Cover | undefined {
  const state = history.state as { cover?: unknown } | null;
  const cover = state?.cover;
  return cover === 'new' || cover === 'settings' || cover === 'runners' ? cover : undefined;
}

const listeners = new Set<() => void>();
window.addEventListener('popstate', () => listeners.forEach((l) => l()));

export function useCover(): Cover | undefined {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
  );
}

/** Puts that screen on top of whatever is open, and on the back stack. */
export function openCover(cover: Cover): void {
  history.pushState({ cover }, '');
  listeners.forEach((l) => l());
}
