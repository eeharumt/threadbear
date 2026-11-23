import { isOnline, type RunnerRow } from './view-logic.ts';

type ModelOption = { key: string; accountId: string; model: string; label: string; effortLevels: string[] };

const providerOrder = ['claude', 'codex'];
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

export function modelOptions(rows: unknown[] | undefined, runnerId: string | undefined): ModelOption[] {
  if (!runnerId) return [];
  // phone:accounts also accepts older rows without a model list.
  const accounts = (rows ?? []).flatMap((row) => {
    if (!row || typeof row !== 'object' || !('id' in row) || typeof row.id !== 'string' || !row.id ||
        ('runnerId' in row && row.runnerId != null && row.runnerId !== runnerId) || !('models' in row) || !Array.isArray(row.models)) return [];
    const title = 'title' in row && typeof row.title === 'string' ? row.title : row.id;
    const provider = 'provider' in row && typeof row.provider === 'string' ? row.provider : 'claude';
    const rank = providerOrder.indexOf(provider);
    const models: unknown[] = row.models;
    return [{ id: row.id, title, rank: rank < 0 ? providerOrder.length : rank, models }];
  });
  return accounts.sort((a, b) => a.rank - b.rank).flatMap((account) =>
    account.models.flatMap((model) => {
      if (!model || typeof model !== 'object' || !('id' in model) || typeof model.id !== 'string' || !model.id) return [];
      const title = 'title' in model && typeof model.title === 'string' ? model.title : model.id;
      const levels: unknown[] = 'effortLevels' in model && Array.isArray(model.effortLevels) ? model.effortLevels : [];
      const effortLevels = levels.filter((level): level is string => typeof level === 'string' && levelTitles.has(level));
      return [{ key: JSON.stringify([runnerId, account.id, model.id]), accountId: account.id, model: model.id, label: `${title} · ${account.title}`, effortLevels }];
    }),
  );
}

export function resolveChoices(options: ModelOption[], pick: { modelKey: string; effort: string }) {
  const model = options.find((m) => m.key === pick.modelKey);
  const efforts = model?.effortLevels ?? (options.length ? defaultLevels : []);
  return { model, efforts, effort: efforts.includes(pick.effort) ? pick.effort : '' };
}
