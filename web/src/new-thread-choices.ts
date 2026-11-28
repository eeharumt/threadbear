// The new thread page's model and effort pickers, from the mirrored
// accounts (phone:accounts, API 20): the iPhone's NewThreadChoices, ported.
// Naming a model is enough for the runner to pick a login of its provider
// with room (runner.ts, pickForNew). This fork adds an agent picker on top
// (docs/my-fork.md): naming a login sends its accountId, and the models
// shown are that login's own.

export type ModelChoice = { id: string; title: string; effortLevels?: string[]; defaultEffort?: string; provider?: string };
export type AccountModels = { id?: string; runnerId?: string; provider?: string; title?: string; email?: string; models?: ModelChoice[] };
export type RunnerPick = { runnerId: string; placed?: boolean; main?: boolean; draining?: boolean };
export type AgentChoice = { id: string; label: string; provider: string; email?: string };

const ORDER = ['claude', 'codex'];
const ALL = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const CLAUDE_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const TITLES: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max', ultra: 'Ultra' };
// As runner/src/providers.ts names them.
const PROVIDER_NAMES: Record<string, string> = { claude: 'Claude', codex: 'Codex', cursor: 'Cursor', opencode: 'OpenCode', grok: 'Grok', antigravity: 'Gemini' };

const rank = (p?: string) => {
  const i = ORDER.indexOf(p ?? 'claude');
  return i < 0 ? ORDER.length : i;
};

// The runner a new thread with none named lands on, as phone:create picks
// it (mainRunner): the first online in Mike's order, else the main one if
// it's online. undefined when the backend would pick some other way, so the
// page lists every runner's models rather than a sleeping Mac's.
export function defaultRunner<R extends RunnerPick>(runners: R[], online: (r: R) => boolean): R | undefined {
  const up = (r: R) => online(r) && !r.draining;
  return runners.find((r) => r.placed && up(r)) ?? runners.find((r) => r.main && up(r));
}

// The models on offer on one runner: its own logins' (a row with no runner
// is anyone's), Claude's first, each once. With no runner known, every one.
// With a login named, only that login's.
export function models(accounts: AccountModels[], runnerId?: string, accountId?: string): ModelChoice[] {
  // phone:accounts is v.any(), so a row that isn't an object is passed over.
  const rows = accounts.filter((a) => a && typeof a === 'object');
  const mine = (runnerId ? rows.filter((a) => !a.runnerId || a.runnerId === runnerId) : rows).filter((a) => !accountId || a.id === accountId);
  const sorted = mine.map((a, i) => ({ a, i })).sort((x, y) => rank(x.a.provider) - rank(y.a.provider) || x.i - y.i);
  const seen = new Set<string>();
  const out: ModelChoice[] = [];
  for (const { a } of sorted) {
    for (const m of Array.isArray(a.models) ? a.models : []) {
      // '' is the page's Default, so a row with no id can't stand for a model.
      if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({ ...m, title: typeof m.title === 'string' && m.title ? m.title : m.id, provider: a.provider ?? 'claude' });
    }
  }
  return out;
}

// The efforts a model offers. With none picked, Claude's levels (the
// runner drops one the model it lands on doesn't offer); a Claude model
// that doesn't list its levels takes any of them (new-threads.ts,
// checkSettings). Other models that list none (OpenCode, Gemini, Grok)
// have no effort, so none.
export function efforts(model?: ModelChoice): string[] {
  if (!model) return CLAUDE_LEVELS;
  const levels = Array.isArray(model.effortLevels) ? model.effortLevels.filter((l) => ALL.includes(l)) : [];
  if (levels.length) return levels;
  return (model.provider ?? 'claude') === 'claude' ? CLAUDE_LEVELS : [];
}

export function effortTitle(level: string): string {
  return TITLES[level] ?? level.charAt(0).toUpperCase() + level.slice(1);
}

// Whether a picked effort still fits once the model changes.
export function keeps(effort: string, model?: ModelChoice): boolean {
  return !effort || efforts(model).includes(effort);
}

// The logins on one runner, as the agent picker lists them: named for
// their provider, with the login only when several share it. An account id
// belongs to one runner (docs/protocol/settings.md, shared pools), so with
// no runner known there are none.
export function agents(accounts: AccountModels[], runnerId?: string): AgentChoice[] {
  if (!runnerId) return [];
  const rows = accounts.filter((a) => a && typeof a === 'object' && typeof a.id === 'string' && a.id && a.runnerId === runnerId);
  const listed = rows.map((a) => ({
    id: a.id!,
    title: typeof a.title === 'string' && a.title ? a.title : a.id!,
    provider: typeof a.provider === 'string' ? a.provider : '',
    email: typeof a.email === 'string' ? a.email.trim().toLowerCase() : undefined,
  }));
  const label = (a: (typeof listed)[number]) => {
    const name = PROVIDER_NAMES[a.provider];
    if (!name) return a.title;
    const peers = listed.filter((b) => b.provider === a.provider);
    if (peers.length === 1) return name;
    if (a.title === name) return `${name} · ${a.id}`;
    // A Codex title already starts with its name (runner/src/accounts.ts, codexTitle).
    const login = a.title.startsWith(`${name} · `) ? a.title : `${name} · ${a.title}`;
    return peers.some((b) => b.id !== a.id && b.title === a.title) ? `${login} (${a.id})` : login;
  };
  return listed
    .map((a) => ({ id: a.id, label: label(a), provider: a.provider, ...(a.email ? { email: a.email } : {}) }))
    .sort((x, y) => rank(x.provider || undefined) - rank(y.provider || undefined) || x.label.localeCompare(y.label));
}

// The login on another runner that is the same one as `id` here: the same
// provider and email, and only one such. Never another login that happens
// to offer the same model.
export function sameLogin(before: AgentChoice[], after: AgentChoice[], id: string): string {
  if (!id) return '';
  if (after.some((a) => a.id === id)) return id;
  const was = before.find((a) => a.id === id);
  if (!was?.provider || !was.email) return '';
  const matches = after.filter((a) => a.provider === was.provider && a.email === was.email);
  return matches.length === 1 ? matches[0]!.id : '';
}

// Models whose ids have a slash (OpenCode's provider/model) grouped by the
// part before the first one, the rest left as they are.
export function modelGroups(list: ModelChoice[]) {
  const plain: ModelChoice[] = [];
  const byPrefix = new Map<string, ModelChoice[]>();
  for (const model of list) {
    const slash = model.id.indexOf('/');
    if (slash <= 0) {
      plain.push(model);
      continue;
    }
    const label = model.id.slice(0, slash);
    const group = byPrefix.get(label);
    if (group) group.push(model);
    else byPrefix.set(label, [model]);
  }
  return { plain, groups: Array.from(byPrefix, ([label, models]) => ({ label, models })) };
}
