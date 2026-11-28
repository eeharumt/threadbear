import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ACP_AGENTS, acpAccounts, isCursorBinary, miseUpdate, opencodeEnv } from '../../src/adapters/acp/agents.ts';
import { loadConfig } from '../../src/config.ts';

test('Windows Cursor uses the newest complete version, passing the script to Node', { skip: process.platform !== 'win32' }, (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-cursor-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const localAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = home;
  t.after(() => {
    if (localAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = localAppData;
  });
  const install = (version: string, complete = true) => {
    const dir = path.join(home, 'cursor-agent', 'versions', version);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'node.exe'), '');
    if (complete) fs.writeFileSync(path.join(dir, 'index.js'), '');
    return dir;
  };
  install('2026.9.30-aaaa');
  const latest = install('2026.10.1-03-15-00-bbbb');
  install('2026.11.01-cccc', false);
  install('pending-launchers');
  fs.mkdirSync(path.join(home, '.cursor'));
  fs.writeFileSync(path.join(home, '.cursor', 'cli-config.json'), '');

  const cursor = ACP_AGENTS.cursor;
  const binary = cursor.findBinary({ home, pathEnv: '' });
  assert.equal(binary, path.join(latest, 'node.exe'));
  assert.equal(isCursorBinary(binary), true);
  assert.deepEqual(cursor.args({ binary }), [path.join(latest, 'index.js'), 'acp']);
  assert.deepEqual(cursor.commandArgs?.(binary, ['--version']), [path.join(latest, 'index.js'), '--version']);
  assert.deepEqual(cursor.commandArgs?.(binary, cursor.updateArgs), [path.join(latest, 'index.js'), 'update']);
  assert.ok(acpAccounts({ home, pathEnv: '' }).some((a) => a.id === 'cursor-main'));
  const native = path.join(home, 'cursor-agent.exe');
  fs.writeFileSync(native, '');
  assert.equal(cursor.findBinary({ home, pathEnv: home }), native);
  assert.deepEqual(cursor.args({ binary: native }), ['acp']);
});

test('OpenCode user config is opt-in and never applies to small jobs', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-oc-launch-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const read = (value?: unknown) => {
    fs.writeFileSync(path.join(home, 'runner.json'), JSON.stringify({ opencodeUserConfig: value }));
    return loadConfig({ HOME: home, PATH: '', THREADBEAR_HOME: home, THREADBEAR_CONNECTORS_URL: 'off' }).opencodeUserConfig;
  };
  assert.equal(read(), false);
  assert.equal(read('true'), false);
  assert.equal(read(false), false);
  assert.equal(read(true), true);

  const isolated = opencodeEnv();
  assert.deepEqual(opencodeEnv({ opencodeUserConfig: false }), isolated);
  assert.match(path.basename(isolated.OPENCODE_CONFIG_DIR), /^threadbear-opencode-config-/);
  const optedIn = opencodeEnv({ opencodeUserConfig: true });
  assert.equal(Object.hasOwn(optedIn, 'OPENCODE_CONFIG_DIR'), false);
  assert.equal(optedIn.OPENCODE_CONFIG_PROJECT_DISABLE, '1');
  assert.equal(optedIn.OPENCODE_DISABLE_PROJECT_CONFIG, '1');
  assert.equal(optedIn.OPENCODE_CONFIG, '');
  const rules = JSON.parse(optedIn.OPENCODE_CONFIG_CONTENT);
  assert.equal(rules.permission['*'], 'ask');
  assert.equal(rules.agent.build.permission['*'], 'ask');
  assert.equal(Object.hasOwn(rules, 'plugins'), false);
  assert.deepEqual(opencodeEnv({ opencodeUserConfig: true, noTools: true }), opencodeEnv({ noTools: true }));
  assert.deepEqual(ACP_AGENTS.opencode.args({ opencodeUserConfig: true }), ['acp']);
  assert.ok(ACP_AGENTS.opencode.args({ opencodeUserConfig: true, noTools: true }).includes('--pure'));
});

test('a copy mise installed is upgraded by mise, and any other by its own updater', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-mise-'));
  const mise = path.join(dir, process.platform === 'win32' ? 'mise.exe' : 'mise');
  fs.writeFileSync(mise, '');
  fs.chmodSync(mise, 0o755);
  const shim = path.join(os.homedir(), '.local', 'share', 'mise', 'shims', 'opencode');
  assert.deepEqual(miseUpdate('opencode', shim, dir), { command: mise, args: ['upgrade', 'opencode'] });
  const installed = path.win32.join('C:', 'Users', 'me', 'AppData', 'Local', 'mise', 'installs', 'opencode', 'latest', 'node_modules', '.bin', 'opencode.cmd');
  assert.deepEqual(miseUpdate('opencode', installed, dir), { command: mise, args: ['upgrade', 'opencode'] });
  assert.equal(miseUpdate('opencode', path.join(os.homedir(), '.opencode', 'bin', 'opencode'), dir), undefined);
  // No mise to run it with: the tool's own updater, which says what's wrong.
  assert.equal(miseUpdate('opencode', shim, path.join(dir, 'none')), undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});
