import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairingText } from '../../../runner/src/devices.ts';
import { readPairing } from './pairing.ts';

const code = 'tbp_0123456789abcdef0123456789abcdef';
const key = Buffer.alloc(32, 7).toString('base64');

test('takes the Mac’s pairing text, with its server and runner keys', () => {
  const text = pairingText('https://gen-ws.example.ts.net:3210', code, [{ runnerId: 'r1', key }]);
  assert.deepEqual(readPairing(text), { url: 'https://gen-ws.example.ts.net:3210', code, keys: { r1: key } });
});

test('a convex.site address pairs with its convex.cloud', () => {
  assert.equal(readPairing(pairingText('https://happy-bear-123.convex.site', code))?.url, 'https://happy-bear-123.convex.cloud');
});

test('refuses a server that isn’t a plain https origin, or is this phone', () => {
  for (const url of ['http://gen-ws.example.ts.net:3210', 'https://127.0.0.1:3210', 'https://localhost', 'https://host.example/path', 'https://user:pw@host.example']) {
    assert.equal(readPairing(pairingText(url, code)), undefined, url);
  }
});

test('refuses pairing text with a token, a bad code or bad base64', () => {
  const withToken = 'TBPAIR1_' + Buffer.from(`url=https%3A%2F%2Fh.example&code=${code}&token=tb_x`).toString('base64url');
  assert.equal(readPairing(withToken), undefined);
  assert.equal(readPairing(pairingText('https://h.example', 'tbp_nothex!')), undefined);
  assert.equal(readPairing('TBPAIR1_***'), undefined);
});

test('a website sign-in link pairs with the build’s own server, and only with one', () => {
  const link = `https://threadbear.example.com/#code=${code}`;
  assert.deepEqual(readPairing(link, 'https://gen-ws.example.ts.net:3210'), { url: 'https://gen-ws.example.ts.net:3210', code, keys: {} });
  assert.equal(readPairing(link), undefined);
  assert.equal(readPairing(`http://threadbear.example.com/#code=${code}`, 'https://h.example'), undefined);
});

test('refuses the old token links', () => {
  assert.equal(readPairing('threadbear://pair?url=https%3A%2F%2Fh.example&token=tb_abc', 'https://h.example'), undefined);
  assert.equal(readPairing('https://threadbear.example.com/#token=tb_abc', 'https://h.example'), undefined);
});
