import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agents, defaultRunner, effortTitle, efforts, keeps, modelGroups, models, sameLogin, type AccountModels } from './new-thread-choices.ts';

const opus = { id: 'opus', title: 'Opus', effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] };
const gpt = { id: 'gpt', title: 'GPT', effortLevels: ['low', 'medium', 'high', 'ultra'] };

test('models: Claude first, each once, only the runner’s own logins', () => {
  const accounts = [
    { runnerId: 'a', provider: 'codex', models: [gpt] },
    { runnerId: 'a', provider: 'claude', models: [opus] },
    { runnerId: 'a', provider: 'claude', models: [opus] },
    { runnerId: 'b', provider: 'claude', models: [{ id: 'other', title: 'Other' }] },
  ];
  assert.deepEqual(models(accounts, 'a').map((m) => m.id), ['opus', 'gpt']);
  assert.deepEqual(models(accounts, 'b').map((m) => m.id), ['other']);
  assert.deepEqual(models(accounts).map((m) => m.id), ['opus', 'other', 'gpt']);
});

test('models: an account from before API 20 has none, not a broken list', () => {
  assert.deepEqual(models([{ runnerId: 'a', provider: 'claude' }], 'a'), []);
});

test('efforts follow the model, Claude’s levels with none picked', () => {
  assert.deepEqual(efforts(gpt), ['low', 'medium', 'high', 'ultra']);
  assert.deepEqual(efforts(undefined), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(keeps('ultra', opus), false);
  assert.equal(keeps('high', opus), true);
  assert.equal(keeps('', opus), true);
  assert.equal(effortTitle('xhigh'), 'Extra high');
});

test('efforts: a model with no levels has none, unless it is Claude’s', () => {
  const list = models([
    { runnerId: 'a', provider: 'claude', models: [{ id: 'haiku', title: 'Haiku' }] },
    { runnerId: 'a', provider: 'opencode', models: [{ id: 'gemini', title: 'Gemini' }] },
  ]);
  assert.deepEqual(efforts(list.find((m) => m.id === 'haiku')), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(efforts(list.find((m) => m.id === 'gemini')), []);
  assert.equal(keeps('high', list.find((m) => m.id === 'gemini')), false);
});

test('defaultRunner: first placed online, else the main one', () => {
  const rs = [
    { runnerId: 'x', placed: true },
    { runnerId: 'y', placed: true },
    { runnerId: 'm', main: true },
  ];
  assert.equal(defaultRunner(rs, (r) => r.runnerId === 'y')?.runnerId, 'y');
  assert.equal(defaultRunner(rs, (r) => r.runnerId === 'm')?.runnerId, 'm');
  // A sleeping main Mac isn't where it lands: no guess, so every runner's models.
  assert.equal(defaultRunner(rs, () => false), undefined);
  assert.equal(defaultRunner([{ runnerId: 'm', main: true, draining: true }], () => true), undefined);
});

test('models: malformed rows are passed over, not a crash', () => {
  const rows = [null, 'x', { runnerId: 'a', provider: 'claude', models: [null, { id: '', title: 'Blank' }, { id: 'ok', title: '' }, { id: 'odd', title: 'Odd', effortLevels: 'high' }] }] as unknown as AccountModels[];
  const list = models(rows, 'a');
  assert.deepEqual(list.map((m) => [m.id, m.title]), [['ok', 'ok'], ['odd', 'Odd']]);
  assert.deepEqual(efforts(list[1]), ['low', 'medium', 'high', 'xhigh', 'max']);
});

// This fork's agent picker (docs/my-fork.md).
const astra = { id: 'astra', title: 'Astra', effortLevels: ['low', 'ultra'] };
const sonnet = { id: 'claude/region/sonnet', title: 'Sonnet', effortLevels: ['medium'] };
const haikuSlash = { id: 'claude/haiku', title: 'Haiku' };
const logins: AccountModels[] = [
  { id: 'cx', runnerId: 'two', provider: 'codex', title: 'Codex', models: [astra] },
  { id: 'cc', runnerId: 'one', provider: 'claude', title: 'Claude', email: 'Same@example.test', models: [opus] },
  { id: 'cursor', runnerId: 'two', provider: 'cursor', title: 'Cursor', models: [{ id: 'auto', title: 'Auto' }] },
  { id: 'cc', runnerId: 'two', provider: 'claude', title: 'Claude', email: 'same@example.test', models: [opus, sonnet, haikuSlash] },
  { id: 'alt', runnerId: 'two', provider: 'claude', title: 'Other Claude', models: [opus] },
  { id: 'legacy', runnerId: 'two' },
  { id: 'unspecified-runner', models: [opus] },
];

test('agents: the runner’s own logins, Claude first, including ones without models', () => {
  assert.deepEqual(agents(logins, 'two').map((a) => [a.id, a.label]), [
    ['cc', 'Claude · cc'],
    ['alt', 'Claude · Other Claude'],
    ['cx', 'Codex'],
    ['cursor', 'Cursor'],
    ['legacy', 'legacy'],
  ]);
  assert.deepEqual(agents(logins, 'missing'), []);
  assert.deepEqual(agents(logins, undefined), []);
});

test('agents are named for their provider, with the login only when several share it', () => {
  const row = (id: string, provider: string, title: string) => ({ id, runnerId: 'one', provider, title });
  const labels = (...rows: AccountModels[]) => agents(rows, 'one').map((a) => a.label);
  assert.deepEqual(labels(row('cc', 'claude', 'me@example.test'), row('cx', 'codex', 'Codex · me@example.test'), row('oc', 'opencode', 'OpenCode account'), row('new', 'future', 'Future agent')), ['Claude', 'Codex', 'Future agent', 'OpenCode']);
  assert.deepEqual(labels(row('x', 'codex', 'Codex · x@example.test'), row('y', 'codex', 'Codex · y@example.test')), ['Codex · x@example.test', 'Codex · y@example.test']);
  assert.deepEqual(labels(row('main', 'claude', 'same@example.test'), row('spare', 'claude', 'same@example.test')), ['Claude · same@example.test (main)', 'Claude · same@example.test (spare)']);
});

test('models: a named login shows only its own', () => {
  assert.deepEqual(models(logins, 'two', 'cc').map((m) => m.id), ['opus', 'claude/region/sonnet', 'claude/haiku']);
  assert.deepEqual(models(logins, 'two', 'cx').map((m) => m.id), ['astra']);
  assert.deepEqual(models(logins, 'two', 'legacy'), []);
  assert.deepEqual(efforts(models(logins, 'two', 'cursor')[0]), []);
});

test('sameLogin: the same provider and email on the other runner, never another login with the model', () => {
  const one = agents(logins, 'one');
  const two = agents(logins, 'two');
  assert.equal(sameLogin(two, one, 'cc'), 'cc');
  assert.equal(sameLogin(two, one, 'alt'), '');
  const renamed = one.map((a) => ({ ...a, id: 'cc-2' }));
  assert.equal(sameLogin(two, renamed, 'cc'), 'cc-2');
  assert.equal(sameLogin(two, [...renamed, { ...renamed[0]!, id: 'other' }], 'cc'), '');
  assert.equal(sameLogin(two, one, ''), '');
});

test('modelGroups: slash ids group by the part before the first slash', () => {
  const { plain, groups } = modelGroups(models(logins, 'two', 'cc'));
  assert.deepEqual(plain.map((m) => m.id), ['opus']);
  assert.deepEqual(groups.map((g) => [g.label, g.models.map((m) => m.id)]), [['claude', ['claude/region/sonnet', 'claude/haiku']]]);
});
