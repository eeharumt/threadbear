// In the app, a link out of a thread (a web page, mailto:) opens in the
// system's browser or mail app, not inside the app's own window: there it
// would replace the app on Android, and open a bare window on Windows.
// Which links may open at all is still the website's rule (link-policy.ts,
// OutLink and LinkConfirm): this only changes where an allowed one goes.
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

function outside(a: HTMLAnchorElement): boolean {
  return a.target === '_blank' && /^(https?|mailto|tel):/i.test(a.href);
}

export function openOutside(): void {
  if (!isTauri()) return;
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || !outside(a)) return;
      e.preventDefault();
      void openUrl(a.href);
    },
    true,
  );
  // LinkConfirm's Open clicks an anchor that isn't in the page, so its
  // click never reaches the listener above.
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (!this.isConnected && outside(this)) void openUrl(this.href);
    else click.call(this);
  };
}
