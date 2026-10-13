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
    this.children = []; this.events = {}; this.value = ''; this.textContent = ''; this.disabled = false;
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
function boot(page = 'index', indexedDB = new IDBFactory()) {
  const html = fs.readFileSync(path.join(root, `${page}.html`), 'utf8');
  const ids = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
  const state = { ids, confirm: true, blobs: [], notices: [], windowEvents: {} };
  const context = vm.createContext({
    window: { addEventListener: (name, fn) => { state.windowEvents[name] = fn; },
      confirm: () => state.confirm, BroadcastChannel: true },
    BroadcastChannel: class { constructor() { state.channel = this; } postMessage(value) { state.notices.push(value); } },
    document: { getElementById: id => ids[id], createElement: () => new Element(),
      body: new Element(), addEventListener() {} },
    indexedDB, localStorage: { getItem: () => null, removeItem() {} },
    location: { protocol: 'file:' }, navigator: {}, Blob,
    URL: { createObjectURL: blob => { state.blobs.push(blob); return 'blob:test'; }, revokeObjectURL() {} },
    setTimeout: () => {}
  });
  for (const file of ['storage.js', page === 'index' ? 'script.js' : 'admin.js', 'offline.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  state.context = context;
  return state;
}
async function waitReady(state) {
  for (let i = 0; i < 100 && state.ids.exportCSV.disabled; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.ids.exportCSV.disabled, false);
}
test('questionnaire saves and administrator page lists, exports and clears shared records', async () => {
  const db = new IDBFactory();
  const state = boot('index', db);
  const e = state.ids;
  assert.equal(e.tbody, undefined);
  assert.equal(e.exportCSV, undefined);
  assert.equal(e.clearHistory, undefined);
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
  assert.equal(state.notices.length, 1);
  const admin = boot('admin', db);
  await waitReady(admin);
  const a = admin.ids;
  assert.equal(a.questionnaire, undefined);
  assert.equal(a.tbody.children[0].children[0].textContent, e.sid.value);
  await a.exportCSV.click();
  const bytes = new Uint8Array(await admin.blobs[0].arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [239, 187, 191]);
  assert.match(await admin.blobs[0].text(), /"001,""test"""/);
  assert.match(await admin.blobs[0].text(), /ID,DateTime,Session,KSS/);
  admin.confirm = false; await a.clearHistory.click();
  assert.equal((await state.context.window.KSSStorage.getAll()).length, 1);
  admin.confirm = true; await a.clearHistory.click();
  assert.equal((await state.context.window.KSSStorage.getAll()).length, 0);
  assert.match(a.status.textContent, /履歴を消去しました/);
  await state.context.window.KSSStorage.add({ ID: 'other-tab', DateTime: 'date', Session: '夕食後', KSS: 1 });
  await admin.channel.onmessage();
  assert.equal(a.tbody.children[0].children[0].textContent, 'other-tab');
  state.context.window.KSSStorage.add = async () => { throw new Error('Quota'); };
  await submit();
  assert.match(e.status.textContent, /保存できません/);
  assert.equal(e.saveRecord.disabled, false);
});

test('offline cache includes the new storage script and HTML loads it before UI', async () => {
  for (const [page, script] of [['index', 'script'], ['admin', 'admin']]) {
    const html = fs.readFileSync(path.join(root, `${page}.html`), 'utf8');
    assert.ok(html.indexOf('src="storage.js"') < html.indexOf(`src="${script}.js"`));
    assert.ok(html.includes('src="offline.js"'));
  }
  const events = {};
  let assets;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), {
    self: { addEventListener: (name, fn) => { events[name] = fn; }, skipWaiting() {} },
    caches: { open: async () => ({ addAll: async files => { assets = files; } }) }
  });
  let done;
  events.install({ waitUntil: promise => { done = promise; } });
  await done;
  for (const asset of ['./storage.js', './admin.html', './admin.js', './offline.js']) assert.ok(assets.includes(asset));
  for (const file of assets) assert.ok(fs.existsSync(path.join(root, file)));
});
