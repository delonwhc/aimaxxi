import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = await readFile(path.join(root, 'assets/js/site.js'), 'utf8');
const { mint: canonicalMint } = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// A narrow DOM boundary for running the actual production script, not a second
// implementation of its behavior. Native dialog layout/focus trapping belongs
// to browser QA; these tests cover the event handlers and async state changes.
function harness(clipboard) {
  const document = { activeElement: null };
  class Element {
    constructor(name, attributes = {}) {
      this.name = name;
      this.attributes = new Map(Object.entries(attributes));
      this.listeners = new Map();
      this.parentElement = null;
      this.textContent = '';
      this.hidden = false;
      this.disabled = false;
      this.open = false;
      this.selectionCount = 0;
      this.classes = new Set();
      this.classList = {
        add: (...names) => names.forEach((name) => this.classes.add(name)),
        remove: (...names) => names.forEach((name) => this.classes.delete(name)),
        contains: (name) => this.classes.has(name),
      };
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(type, callback, options = {}) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push({ callback, once: options.once });
      this.listeners.set(type, listeners);
    }
    dispatch(type, details = {}) {
      const event = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...details };
      const results = [];
      for (const listener of [...(this.listeners.get(type) ?? [])]) {
        if (listener.once) this.listeners.set(type, this.listeners.get(type).filter((candidate) => candidate !== listener));
        results.push(listener.callback(event));
      }
      return { event, settled: Promise.all(results) };
    }
    focus(options) {
      if (document.activeElement !== this) document.activeElement?.dispatch('blur');
      document.activeElement = this;
      this.lastFocusOptions = options;
    }
    select() { this.selectionCount++; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    closest(selector) {
      for (let element = this; element; element = element.parentElement) {
        if (selector === '.site-header' && element.name === 'header') return element;
        if (selector === 'a[href^="#"]' && element.name === 'a' && element.getAttribute('href')?.startsWith('#')) return element;
      }
      return null;
    }
  }
  const header = new Element('header');
  const body = new Element('body');
  const toggle = new Element('button', { 'aria-expanded': 'false', 'aria-label': 'Open navigation' });
  toggle.parentElement = header;
  const menu = new Element('dialog');
  const close = new Element('button');
  const mint = new Element('input');
  mint.value = canonicalMint;
  const copy = new Element('button');
  copy.textContent = 'COPY ↗';
  copy.hidden = true;
  const status = new Element('p');
  status.textContent = 'Select the address to copy it.';
  const destination = new Element('section');
  const anchor = new Element('a', { href: '#join' });
  const anchorChild = new Element('span');
  anchorChild.parentElement = anchor;
  const media = new Element('media-query');
  const selectors = new Map([
    ['.menu-toggle', toggle], ['#mobile-menu', menu], ['.menu-close', close],
    ['#mint-address', mint], ['#copy-mint', copy], ['#copy-status', status], ['#join', destination],
  ]);
  document.body = body;
  document.querySelector = (selector) => selectors.get(selector) ?? null;
  const timers = new Map();
  let timerID = 0;
  vm.runInNewContext(script, {
    document,
    navigator: clipboard === undefined ? {} : { clipboard },
    window: { matchMedia: () => media },
    setTimeout: (callback) => { const id = ++timerID; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
  }, { filename: 'assets/js/site.js' });
  return {
    document, header, body, toggle, menu, close, mint, copy, status, destination, anchorChild,
    runTimers() { for (const [id, callback] of timers) { timers.delete(id); callback(); } },
  };
}

test('copy reports success only after the exact-case mint reaches the clipboard', async () => {
  const pending = deferred();
  const writes = [];
  const page = harness({ writeText(value) { writes.push(value); return pending.promise; } });
  assert.equal(page.copy.hidden, false, 'enhancement exposes the copy control');
  const click = page.copy.dispatch('click');
  assert.deepEqual(writes, [canonicalMint]);
  assert.equal(page.copy.disabled, true, 'pending clipboard request prevents another click');
  assert.equal(page.copy.textContent, 'COPY ↗');
  assert.equal(page.status.textContent, 'Select the address to copy it.', 'no premature success announcement');
  pending.resolve();
  await click.settled;
  assert.equal(page.copy.disabled, false);
  assert.equal(page.copy.textContent, 'COPIED ↗');
  assert.equal(page.status.textContent, 'Exact mint address copied.');
  assert.equal(page.mint.selectionCount, 0);
  page.runTimers();
  assert.equal(page.copy.textContent, 'COPY ↗', 'button returns to its reusable state');
});

test('clipboard permission rejection selects the address and reports manual copying', async () => {
  const pending = deferred();
  const page = harness({ writeText: () => pending.promise });
  const click = page.copy.dispatch('click');
  pending.reject(new Error('NotAllowedError'));
  await click.settled;
  assert.equal(page.document.activeElement, page.mint);
  assert.equal(page.mint.selectionCount, 1);
  assert.equal(page.mint.value, canonicalMint);
  assert.equal(page.copy.disabled, false);
  assert.equal(page.copy.textContent, 'TRY AGAIN ↗');
  assert.match(page.status.textContent, /selected—copy it manually/);
  assert.doesNotMatch(page.status.textContent, /address copied/);
});

test('a browser without Clipboard API still provides a usable manual copy fallback', async () => {
  const page = harness();
  await page.copy.dispatch('click').settled;
  assert.equal(page.document.activeElement, page.mint);
  assert.equal(page.mint.selectionCount, 1);
  assert.equal(page.copy.disabled, false);
  assert.equal(page.copy.textContent, 'TRY AGAIN ↗');
  assert.match(page.status.textContent, /Copy unavailable/);
});

test('opening navigation exposes its state and Escape restores focus to its trigger', async () => {
  const page = harness();
  page.toggle.focus();
  await page.toggle.dispatch('click').settled;
  assert.equal(page.menu.open, true);
  assert.equal(page.document.activeElement, page.close);
  assert.equal(page.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(page.toggle.getAttribute('aria-label'), 'Close navigation');
  assert.equal(page.body.classList.contains('menu-open'), true);
  // Browsers dispatch cancel on a modal dialog in response to Escape.
  const escape = page.menu.dispatch('cancel');
  await escape.settled;
  assert.equal(escape.event.defaultPrevented, true);
  assert.equal(page.menu.open, false);
  assert.equal(page.body.classList.contains('menu-open'), false);
  assert.equal(page.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(page.toggle.getAttribute('aria-label'), 'Open navigation');
  assert.equal(page.document.activeElement, page.toggle);
});

test('the close control restores focus as well as clearing modal state', async () => {
  const page = harness();
  await page.toggle.dispatch('click').settled;
  await page.close.dispatch('click').settled;
  assert.equal(page.menu.open, false);
  assert.equal(page.document.activeElement, page.toggle);
  assert.equal(page.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(page.body.classList.contains('menu-open'), false);
});

test('following a nested menu-link target closes navigation and focuses the destination', async () => {
  const page = harness();
  await page.toggle.dispatch('click').settled;
  const navigation = page.menu.dispatch('click', { target: page.anchorChild });
  await navigation.settled;
  assert.equal(navigation.event.defaultPrevented, false, 'native anchor scrolling remains enabled');
  assert.equal(page.menu.open, false);
  assert.equal(page.body.classList.contains('menu-open'), false);
  assert.equal(page.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(page.document.activeElement, page.destination, 'focus follows content rather than returning to menu trigger');
  assert.equal(page.destination.getAttribute('tabindex'), '-1');
  assert.equal(page.destination.lastFocusOptions?.preventScroll, true);
  page.toggle.focus();
  assert.equal(page.destination.getAttribute('tabindex'), null, 'temporary focusability is removed on blur');
});
