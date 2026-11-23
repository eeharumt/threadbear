import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agentOptions,
  defaultRunner,
  modelGroups,
  resolveChoices,
} from './new-thread-choices.ts';

const now = Date.parse('2026-11-23T12:00:00Z');
const runner = (runnerId: string, ago = 0, flags = {}) => ({
  runnerId, name: runnerId, lastSeenAt: new Date(now - ago * 1000).toISOString(), draining: false, ...flags,
});
const opus = { id: 'opus', title: 'Opus', effortLevels: ['high'] };
const astra = { id: 'astra', title: 'Astra', effortLevels: ['low', 'ultra', 'future'] };
const sonnet = { id: 'claude/region/sonnet', title: 'Sonnet', effortLevels: ['medium'] };
const haiku = { id: 'claude/haiku', title: 'Haiku' };
const accounts = [
  { id: 'cx', runnerId: 'two', provider: 'codex', title: 'Codex', models: [astra] },
  { id: 'cc', runnerId: 'one', provider: 'claude', title: 'Claude', email: 'same@example.test', models: [opus] },
  { id: 'cursor', runnerId: 'two', provider: 'cursor', title: 'Cursor', models: [{ id: 'auto', title: 'Auto' }] },
  { id: 'cc', runnerId: 'two', provider: 'claude', title: 'Claude', email: 'same@example.test', models: [opus, sonnet, haiku] },
  { id: 'alt', runnerId: 'two', provider: 'claude', title: 'Other Claude', models: [opus] },
  { id: 'legacy', runnerId: 'two' },
  { id: 'unspecified-runner', models: [opus] },
  { id: 'plain', runnerId: 'two', provider: 'claude', title: 'Plain only', models: [{ id: 'solo', title: 'Solo' }] },
];

test('agents follow the runner and include accounts without models', () => {
  const agents = agentOptions(accounts, 'two');
  assert.deepEqual(
    agents.map((a) => [a.id, a.label, a.models.map((m) => m.id)]),
    [
      ['cc', 'Claude', ['opus', 'claude/region/sonnet', 'claude/haiku']],
      ['alt', 'Other Claude', ['opus']],
      ['plain', 'Plain only', ['solo']],
      ['cx', 'Codex', ['astra']],
      ['cursor', 'Cursor', ['auto']],
      ['legacy', 'legacy', []],
    ],
  );
  assert.deepEqual(agentOptions(accounts, 'missing'), []);
  assert.deepEqual(agentOptions(accounts, undefined), []);
});

test('models are scoped to the chosen agent', () => {
  const agents = agentOptions(accounts, 'two');
  const cc = agents.find((a) => a.id === 'cc');
  assert.ok(cc);
  assert.ok(!cc.models.some((m) => m.id === 'astra'));
  assert.equal(resolveChoices(agents, { accountId: 'cc', modelId: 'opus', effort: '' }).model?.id, 'opus');
  assert.equal(resolveChoices(agents, { accountId: 'cc', modelId: 'astra', effort: '' }).model, undefined);
});

test('slash-qualified models group by the prefix before the first slash', () => {
  const cc = agentOptions(accounts, 'two').find((a) => a.id === 'cc')!;
  assert.deepEqual(modelGroups(cc.models), {
    plain: [{ id: 'opus', label: 'Opus', effortLevels: ['high'] }],
    groups: [{
      label: 'claude',
      models: [
        { id: 'claude/region/sonnet', label: 'Sonnet', effortLevels: ['medium'] },
        { id: 'claude/haiku', label: 'Haiku', effortLevels: [] },
      ],
    }],
  });
  const plain = agentOptions(accounts, 'two').find((a) => a.id === 'plain')!;
  assert.deepEqual(modelGroups(plain.models), { plain: plain.models, groups: [] });
  assert.deepEqual(modelGroups([...cc.models, { id: 'strata/flash', label: 'Flash', effortLevels: [] }]).groups.map((group) => group.label), ['claude', 'strata']);
});

test('a model keeps only the efforts it supports', () => {
  const agents = agentOptions(accounts, 'two');
  assert.deepEqual(resolveChoices(agents, { accountId: 'cx', modelId: 'astra', effort: 'ultra' }), {
    agent: agents.find((a) => a.id === 'cx'),
    model: agents.find((a) => a.id === 'cx')!.models[0],
    efforts: ['low', 'ultra'],
    pick: { accountId: 'cx', modelId: 'astra', effort: 'ultra' },
  });
  assert.deepEqual(resolveChoices(agents, { accountId: 'cursor', modelId: 'auto', effort: 'ultra' }), {
    agent: agents.find((a) => a.id === 'cursor'),
    model: agents.find((a) => a.id === 'cursor')!.models[0],
    efforts: [],
    pick: { accountId: 'cursor', modelId: 'auto', effort: '' },
  });
  assert.deepEqual(resolveChoices(agents, { accountId: '', modelId: '', effort: 'ultra' }), {
    agent: undefined,
    model: undefined,
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    pick: { accountId: '', modelId: '', effort: '' },
  });
  assert.deepEqual(resolveChoices(agents, { accountId: '', modelId: '', effort: 'high' }).pick, {
    accountId: '', modelId: '', effort: 'high',
  });
  const agentOnly = resolveChoices(agents, { accountId: 'cc', modelId: '', effort: 'high' });
  assert.deepEqual(agentOnly.efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(agentOnly.model, undefined);
  assert.equal(agentOnly.pick.effort, 'high');
});

test('runner change keeps the agent and drops a model missing on that runner', () => {
  const onOne = agentOptions(accounts, 'one');
  const onTwo = agentOptions(accounts, 'two');
  assert.deepEqual(resolveChoices(onTwo, { accountId: 'cc', modelId: 'opus', effort: 'high' }, onOne).pick, {
    accountId: 'cc', modelId: 'opus', effort: 'high',
  });
  assert.deepEqual(resolveChoices(onOne, { accountId: 'cc', modelId: sonnet.id, effort: 'medium' }, onTwo).pick, {
    accountId: 'cc', modelId: '', effort: 'medium',
  });
  const renamed = onTwo.map((a) => a.id === 'cc' ? { ...a, id: 'cc-2' } : a);
  assert.equal(resolveChoices(renamed, { accountId: 'cc', modelId: 'opus', effort: 'high' }, onOne).pick.accountId, 'cc-2');
});

test('runner change never moves the same model id to another login', () => {
  const onTwo = agentOptions(accounts, 'two');
  const onOne = agentOptions(accounts, 'one');
  const { pick } = resolveChoices(onTwo, { accountId: 'alt', modelId: 'opus', effort: 'high' });
  assert.equal(pick.accountId, 'alt');
  const cleared = resolveChoices(onOne, pick, onTwo).pick;
  assert.deepEqual(cleared, { accountId: '', modelId: '', effort: '' });
  assert.deepEqual(resolveChoices(onTwo, cleared).pick, cleared);
  const replaced = onOne.map((a) => ({ ...a, email: 'different@example.test' }));
  const original = resolveChoices(onTwo, { accountId: 'cc', modelId: 'opus', effort: 'high' }).pick;
  assert.deepEqual(resolveChoices(replaced, original, onTwo).pick, cleared);
  const ambiguous = [...onOne, { ...onOne[0]!, id: 'other' }];
  assert.deepEqual(resolveChoices(ambiguous, original, onTwo).pick, cleared);
});

test('invalid ids clear without resurrecting a replacement pick', () => {
  const agents = agentOptions(accounts, 'two');
  assert.deepEqual(resolveChoices(agents, { accountId: 'nope', modelId: 'opus', effort: 'high' }), {
    agent: undefined,
    model: undefined,
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    pick: { accountId: '', modelId: '', effort: '' },
  });
  assert.deepEqual(resolveChoices([], { accountId: 'cc', modelId: 'opus', effort: 'high' }), {
    agent: undefined,
    model: undefined,
    efforts: [],
    pick: { accountId: '', modelId: '', effort: '' },
  });
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
