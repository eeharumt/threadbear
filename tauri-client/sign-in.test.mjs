import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('src-tauri/src/sign-in.js', import.meta.url), 'utf8');
const origin = 'https://threadbear.example.com';
const code = 'tbp_0123456789abcdef';

function tryLink(link, pageOrigin = origin, isAndroid = false) {
  let submit;
  let reloaded = false;
  const elements = {};
  const location = {
    origin: pageOrigin, hash: '',
    reload() { reloaded = true; },
  };
  const history = { replaceState(_state, _unused, hash) { location.hash = hash; } };
  const page = { append() {}, style: {} };
  const document = {
    querySelector: (selector) => selector === 'main.signin' ? page : null,
    createElement(tag) {
      const element = {
        append() {},
        style: {},
        addEventListener(name, callback) { if (name === 'submit') submit = callback; },
        setAttribute() {},
        setCustomValidity(message) { element.error = message; },
        reportValidity() {},
      };
      elements[tag] = element;
      return element;
    },
  };
  const install = runInNewContext(`(${source})`, {
    document, history, location, URL, URLSearchParams,
    MutationObserver: class { observe() {} },
  });
  install(origin, isAndroid);
  if (submit) {
    elements.input.value = link;
    submit({ preventDefault() {} });
  }
  return {
    hash: location.hash, reloaded, error: elements.input?.error,
    ...(isAndroid && { inputStyle: elements.input.style, buttonStyle: elements.button.style }),
  };
}

test('a same-origin one-use link is handed to the normal web sign-in', () => {
  assert.deepEqual(tryLink(`${origin}/#code=${code}`), {
    hash: `#code=${code}`, reloaded: true, error: undefined,
  });
});

test('an insecure, foreign, or legacy sign-in link cannot trigger navigation', () => {
  for (const link of [
    `http://threadbear.example.com/#code=${code}`,
    `https://foreign.example.com/#code=${code}`,
    `blob:${origin}/example#code=${code}`,
    `${origin}/#token=old`,
  ]) {
    const result = tryLink(link);
    assert.equal(result.reloaded, false);
    assert.equal(result.hash, '');
    assert.ok(result.error);
  }
});

test('the form is never added to a page on another origin', () => {
  assert.deepEqual(tryLink(`${origin}/#code=${code}`, 'https://foreign.example.com'), {
    hash: '', reloaded: false, error: undefined,
  });
});

test('Android uses full-width sign-in controls large enough to tap', () => {
  const result = tryLink(`${origin}/#code=${code}`, origin, true);
  assert.equal(result.inputStyle.width, '100%');
  assert.equal(result.inputStyle.minHeight, '48px');
  assert.equal(result.buttonStyle.minHeight, '48px');
});
