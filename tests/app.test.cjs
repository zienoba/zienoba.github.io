'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { IDBFactory } = require('fake-indexeddb');
const root = path.join(__dirname, '..');
class Element {
  constructor() {
    this.children = []; this.events = {}; this.value = ''; this.textContent = '';
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  addEventListener(name, callback) { this.events[name] = callback; }
  querySelectorAll() { return this.children; }
  querySelector() { return this.children[0]; }
  focus() {}
  click() { return this.events.click?.(); }
  remove() {}
}
function boot() {
  const ids = Object.fromEntries(['saveRecord', 'kssgrid', 'tbody', 'status', 'sid', 'session',
    'questionnaire', 'exportCSV', 'clearHistory', 'offlineNote'].map(id => [id, new Element()]));
  const state = { ids, confirm: true, blobs: [], notices: [], windowEvents: {} };
  const context = vm.createContext({
    window: { addEventListener: (name, fn) => { state.windowEvents[name] = fn; },
      confirm: () => state.confirm, BroadcastChannel: true },
    BroadcastChannel: class { constructor() { state.channel = this; } postMessage(value) { state.notices.push(value); } },
    document: { getElementById: id => ids[id], createElement: () => new Element(),
      body: new Element(), addEventListener() {} },
    indexedDB: new IDBFactory(), localStorage: { getItem: () => null, removeItem() {} },
    location: { protocol: 'file:' }, navigator: {}, Blob,
    URL: { createObjectURL: blob => { state.blobs.push(blob); return 'blob:test'; }, revokeObjectURL() {} },
    setTimeout: () => {}
  });
  for (const file of ['storage.js', 'script.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  state.context = context;
  return state;
}
async function waitReady(state) {
  for (let i = 0; i < 100 && state.ids.saveRecord.disabled; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.ids.saveRecord.disabled, false);
}
test('UI validates input, saves once during double submission, exports escaped CSV and clears', async () => {
  const state = boot();
  const e = state.ids;
  assert.equal(e.saveRecord.disabled, true);
  await waitReady(state);
  const submit = () => e.questionnaire.events.submit({ preventDefault() {} });
  await submit();
  assert.match(e.status.textContent, /未入力/);
  e.sid.value = '001,"test"'; e.session.value = '夕食後';
  e.kssgrid.children[4].click();
  const first = submit();
  assert.equal(e.saveRecord.disabled, true);
  await submit(); await first;
  assert.equal((await state.context.window.KSSStorage.getAll()).length, 1);
  assert.match(e.status.textContent, /保存しました/);
  assert.equal(e.tbody.children[0].children[0].textContent, e.sid.value);
  assert.equal(state.notices.length, 1);
  await e.exportCSV.click();
  const bytes = new Uint8Array(await state.blobs[0].arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [239, 187, 191]);
  assert.match(await state.blobs[0].text(), /"001,""test"""/);
  assert.match(await state.blobs[0].text(), /ID,DateTime,Session,KSS/);
  state.confirm = false; await e.clearHistory.click();
  assert.equal((await state.context.window.KSSStorage.getAll()).length, 1);
  state.confirm = true; await e.clearHistory.click();
  assert.equal((await state.context.window.KSSStorage.getAll()).length, 0);
  assert.match(e.status.textContent, /履歴を消去しました/);
  await state.context.window.KSSStorage.add({ ID: 'other-tab', DateTime: 'date', Session: '夕食後', KSS: 1 });
  await state.channel.onmessage();
  assert.equal(e.tbody.children[0].children[0].textContent, 'other-tab');
  state.context.window.KSSStorage.add = async () => { throw new Error('Quota'); };
  await submit();
  assert.match(e.status.textContent, /保存できません/);
  assert.equal(e.saveRecord.disabled, false);
});

test('offline cache includes the new storage script and HTML loads it before UI', async () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.indexOf('src="storage.js"') < html.indexOf('src="script.js"'));
  const events = {};
  let assets;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), {
    self: { addEventListener: (name, fn) => { events[name] = fn; }, skipWaiting() {} },
    caches: { open: async () => ({ addAll: async files => { assets = files; } }) }
  });
  let done;
  events.install({ waitUntil: promise => { done = promise; } });
  await done;
  assert.ok(assets.includes('./storage.js'));
  for (const file of assets) assert.ok(fs.existsSync(path.join(root, file)));
});
