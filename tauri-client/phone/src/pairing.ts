// What the pairing screen takes, as the Android app's Pairing.parse: the
// Mac's pairing text (Settings, Phone & browser: `TBPAIR1_` and the base64url
// of `url=…&code=…&key=…`, runner/src/devices.ts pairingText), or a website
// sign-in link (`<site>/#code=tbp_…`). Either holds a one-use code that
// tokens:claim trades for this app's token. An old `threadbear://pair` token
// link is refused (Daybreak finding 127). No React here, so the tests run it bare.

export type Pairing = {
  /** The Convex deployment's origin. */
  url: string;
  /** The one-use code to trade for the token. */
  code: string;
  /** Runner id to secret-box public key (base64), for answering secrets. */
  keys: Record<string, string>;
};

const PREFIX = 'TBPAIR1_';
const CODE = /^tbp_[0-9a-fA-F]{1,196}$/;

/**
 * The pairing in `text`, or undefined for anything else. A sign-in link has
 * no deployment in it, so it pairs with `defaultUrl`, the one this build was
 * made for, and not at all without one.
 */
export function readPairing(text: string, defaultUrl?: string): Pairing | undefined {
  const t = text.trim();
  if (t.startsWith(PREFIX)) return readPairingText(t.slice(PREFIX.length));
  return defaultUrl ? readSignInLink(t, defaultUrl) : undefined;
}

function readPairingText(body: string): Pairing | undefined {
  if (!body || body.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(body)) return undefined;
  let query: string;
  try {
    const padded = body.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (body.length % 4)) % 4);
    query = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
  } catch {
    return undefined;
  }
  const items = queryItems(query);
  // A code and a token both is no text the Mac makes.
  if (items.some(([name]) => name === 'token')) return undefined;
  const code = items.find(([name]) => name === 'code')?.[1];
  const raw = items.find(([name]) => name === 'url')?.[1];
  if (!code || !CODE.test(code) || !raw) return undefined;
  const url = deploymentOrigin(raw);
  return url ? { url, code, keys: runnerKeys(items) } : undefined;
}

function readSignInLink(text: string, defaultUrl: string): Pairing | undefined {
  let link: URL;
  try {
    link = new URL(text);
  } catch {
    return undefined;
  }
  if (link.protocol !== 'https:' || link.username || link.password) return undefined;
  const params = new URLSearchParams(link.hash.slice(1));
  const code = params.get('code');
  if (params.has('token') || !code || !CODE.test(code)) return undefined;
  return { url: defaultUrl, code, keys: {} };
}

/**
 * Convex cloud (a `.convex.site` address becomes its `.convex.cloud`), or a
 * self-hosted backend at any https origin but this phone's own loopback.
 */
export function deploymentOrigin(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !host || url.username || url.password) return undefined;
  if (host.endsWith('.convex.cloud') || host.endsWith('.convex.site')) return `https://${host.replace(/\.convex\.site$/, '.convex.cloud')}`;
  if (isLoopback(host) || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return undefined;
  return `https://${host}${url.port ? `:${url.port}` : ''}`;
}

function isLoopback(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || h.startsWith('127.') || h.endsWith('.localhost');
}

/** `<runnerId>:<base64 key>` items; the last colon splits them, and a key must be 32 bytes. */
function runnerKeys(items: [string, string][]): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const [name, raw] of items) {
    if (name !== 'key') continue;
    const colon = raw.lastIndexOf(':');
    if (colon <= 0) continue;
    // A "+" a link maker left unescaped reads as a space.
    const key = raw.slice(colon + 1).replace(/ /g, '+');
    if (isUsableKey(key)) keys[raw.slice(0, colon)] = key;
  }
  return keys;
}

function isUsableKey(key: string): boolean {
  try {
    return atob(key).length === 32;
  } catch {
    return false;
  }
}

/** Query items, percent-decoded, "+" left as it is (as the other apps read them). */
function queryItems(raw: string): [string, string][] {
  return raw
    .split('&')
    .filter(Boolean)
    .map((item) => {
      const eq = item.indexOf('=');
      return eq < 0 ? [decode(item), ''] : [decode(item.slice(0, eq)), decode(item.slice(eq + 1))];
    });
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
