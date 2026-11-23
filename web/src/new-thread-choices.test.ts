import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultRunner, modelOptions, resolveChoices } from './new-thread-choices.ts';

const now = Date.parse('2026-11-23T12:00:00Z');
const runner = (runnerId: string, ago = 0, flags = {}) => ({
  runnerId, name: runnerId, lastSeenAt: new Date(now - ago * 1000).toISOString(), draining: false, ...flags,
});
const opus = { id: 'opus', title: 'Opus', effortLevels: ['high'] };
const astra = { id: 'astra', title: 'Astra', effortLevels: ['low', 'ultra', 'future'] };
const accounts = [
  { id: 'cx', runnerId: 'two', provider: 'codex', title: 'Codex', models: [astra] },
  { id: 'cc', runnerId: 'one', provider: 'claude', title: 'Claude', models: [opus] },
  { id: 'cursor', runnerId: 'two', provider: 'cursor', title: 'Cursor', models: [{ id: 'auto', title: 'Auto' }] },
  { id: 'cc', runnerId: 'two', provider: 'claude', title: 'Claude', models: [opus] },
  { id: 'alt', runnerId: 'two', provider: 'claude', title: 'Other Claude', models: [opus] },
  { id: 'legacy', runnerId: 'two' },
];

test('models follow the runner and duplicate models keep their logins', () => {
  assert.deepEqual(modelOptions(accounts, 'two').map((m) => [m.model, m.accountId, m.label]), [
    ['opus', 'cc', 'Opus · Claude'], ['opus', 'alt', 'Opus · Other Claude'], ['astra', 'cx', 'Astra · Codex'], ['auto', 'cursor', 'Auto · Cursor'],
  ]);
  assert.deepEqual(modelOptions(accounts, 'missing'), []);
  assert.deepEqual(modelOptions(accounts, undefined), []);
});

test('a model keeps only the efforts it supports', () => {
  const options = modelOptions(accounts, 'two');
  const codex = options.find((m) => m.model === 'astra');
  assert.ok(codex);
  assert.deepEqual(resolveChoices(options, { modelKey: codex.key, effort: 'ultra' }), {
    model: codex, efforts: ['low', 'ultra'], effort: 'ultra',
  });
  const cursor = options.find((m) => m.model === 'auto');
  assert.ok(cursor);
  assert.deepEqual(resolveChoices(options, { modelKey: cursor.key, effort: 'ultra' }), { model: cursor, efforts: [], effort: '' });
  assert.deepEqual(resolveChoices(options, { modelKey: '', effort: 'ultra' }), {
    model: undefined, efforts: ['low', 'medium', 'high', 'xhigh', 'max'], effort: '',
  });
});

test('a stale model key does not select the similarly named login on another runner', () => {
  const [model] = modelOptions(accounts, 'one');
  assert.ok(model);
  assert.equal(resolveChoices(modelOptions(accounts, 'two'), { modelKey: model.key, effort: '' }).model, undefined);
  assert.deepEqual(resolveChoices([], { modelKey: model.key, effort: 'high' }), { model: undefined, efforts: [], effort: '' });
});

test('automatic runner follows the configured order, then an eligible main runner', () => {
  const main = runner('main', 0, { main: true });
  const placed = runner('placed', 0, { placed: true });
  const other = runner('other');
  const draining = runner('draining', 0, { placed: true, draining: true });
  assert.equal(defaultRunner([main, draining, placed, other], now), 'placed');
  assert.equal(defaultRunner([main, draining, other], now), 'main');
  assert.equal(defaultRunner([runner('asleep', 600, { main: true }), draining, other], now), undefined);
});
