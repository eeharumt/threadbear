import { isOnline, type RunnerRow } from './view-logic.ts';

type ModelOption = { id: string; label: string; effortLevels: string[] };
type AgentOption = { id: string; label: string; provider: string; email?: string; models: ModelOption[] };
export type ThreadPick = { accountId: string; modelId: string; effort: string };

const providerOrder = ['claude', 'codex'];
// As runner/src/providers.ts names them.
const providerNames = new Map([
  ['claude', 'Claude'], ['codex', 'Codex'], ['cursor', 'Cursor'], ['opencode', 'OpenCode'], ['grok', 'Grok'], ['antigravity', 'Gemini'],
]);
const levelTitles = new Map([
  ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'Extra high'], ['max', 'Max'], ['ultra', 'Ultra'],
]);
const defaultLevels = [...levelTitles.keys()].filter((level) => level !== 'ultra');

export function effortTitle(level: string) {
  return levelTitles.get(level) ?? level;
}

export function defaultRunner(runners: (RunnerRow & { placed?: boolean; main?: boolean })[], now: number) {
  const available = runners.filter((r) => !r.draining && isOnline(r, now));
  return (available.find((r) => r.placed) ?? available.find((r) => r.main))?.runnerId;
}

function modelFromRow(model: unknown): ModelOption | undefined {
  if (!model || typeof model !== 'object' || !('id' in model) || typeof model.id !== 'string' || !model.id) return undefined;
  const title = 'title' in model && typeof model.title === 'string' ? model.title : model.id;
  const levels: unknown[] = 'effortLevels' in model && Array.isArray(model.effortLevels) ? model.effortLevels : [];
  const effortLevels = levels.filter((level): level is string => typeof level === 'string' && levelTitles.has(level));
  return { id: model.id, label: title, effortLevels };
}

function agentLabel(agent: AgentOption, agents: AgentOption[]) {
  const name = providerNames.get(agent.provider);
  if (!name) return agent.label;
  const peers = agents.filter((a) => a.provider === agent.provider);
  if (peers.length === 1) return name;
  if (agent.label === name) return `${name} · ${agent.id}`;
  // A Codex title already starts with its name (runner/src/accounts.ts, codexTitle).
  const login = agent.label.startsWith(`${name} · `) ? agent.label : `${name} · ${agent.label}`;
  return peers.some((a) => a.id !== agent.id && a.label === agent.label) ? `${login} (${agent.id})` : login;
}

export function agentOptions(rows: unknown[] | undefined, runnerId: string | undefined): AgentOption[] {
  if (!runnerId) return [];
  const accounts = (rows ?? []).flatMap((row) => {
    if (!row || typeof row !== 'object' || !('id' in row) || typeof row.id !== 'string' || !row.id) return [];
    if (!('runnerId' in row) || row.runnerId !== runnerId) return [];
    const label = 'title' in row && typeof row.title === 'string' ? row.title : row.id;
    const provider = 'provider' in row && typeof row.provider === 'string' ? row.provider : '';
    const email = 'email' in row && typeof row.email === 'string' ? row.email.trim().toLowerCase() : undefined;
    const rank = providerOrder.indexOf(provider);
    const models: unknown[] = 'models' in row && Array.isArray(row.models) ? row.models : [];
    const parsed = models.flatMap((m) => {
      const option = modelFromRow(m);
      return option ? [option] : [];
    });
    return [{ agent: { id: row.id, label, provider, email, models: parsed }, rank: rank < 0 ? providerOrder.length : rank }];
  });
  const agents = accounts.map(({ agent }) => agent);
  return accounts
    .map(({ agent, rank }) => ({ agent: { ...agent, label: agentLabel(agent, agents) }, rank }))
    .sort((a, b) => a.rank - b.rank || a.agent.label.localeCompare(b.agent.label))
    .map(({ agent }) => agent);
}

export function modelGroups(models: ModelOption[]) {
  const plain: ModelOption[] = [];
  const byPrefix = new Map<string, ModelOption[]>();
  for (const model of models) {
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

function sameLogin(agents: AgentOption[], previous: AgentOption | undefined) {
  if (!previous?.provider || !previous.email) return undefined;
  // Account IDs belong to one runner (docs/protocol/settings.md, shared pools).
  const matches = agents.filter((a) => a.provider === previous.provider && a.email === previous.email);
  return matches.length === 1 ? matches[0] : undefined;
}

export function resolveChoices(agents: AgentOption[], pick: ThreadPick, previousAgents?: AgentOption[]) {
  const previous = (previousAgents ?? agents).find((a) => a.id === pick.accountId);
  const agent = previousAgents ? sameLogin(agents, previous) : previous;
  const model = agent?.models.find((m) => m.id === pick.modelId);
  const efforts = model?.effortLevels ?? (agents.some((a) => a.models.length) ? defaultLevels : []);
  const effort = (!pick.accountId || agent) && efforts.includes(pick.effort) ? pick.effort : '';
  return { agent, model, efforts, pick: { accountId: agent?.id ?? '', modelId: model?.id ?? '', effort } };
}
