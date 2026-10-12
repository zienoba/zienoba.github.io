'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { IDBFactory } = require('fake-indexeddb');
const source = fs.readFileSync(require('node:path').join(__dirname, '../storage.js'), 'utf8');
const key = 'KSS_FINAL_DATA.json';
const record = { ID: '001', DateTime: '2026/10/12 12:00:00', Session: '夕食後', KSS: 5 };
function boot(indexedDB = new IDBFactory(), values = new Map()) {
  const context = { window: {}, indexedDB, localStorage: {
    getItem: name => values.get(name) ?? null,
    removeItem: name => values.delete(name)
  }};
  vm.runInNewContext(source, context);
  return context.window.KSSStorage;
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

test('fresh database saves records individually and preserves order on reload', async () => {
  const db = new IDBFactory();
  const store = boot(db);
  assert.deepEqual(plain(await store.getAll()), []);
  await store.add(record);
  await store.add({ ...record, ID: '002' });
  assert.deepEqual((await boot(db).getAll()).map(r => r.ID), ['001', '002']);
});

test('concurrent tabs migrate once and concurrent writes retain every record', async () => {
  const db = new IDBFactory();
  const values = new Map([[key, JSON.stringify([record, record])]]);
  const first = boot(db, values), second = boot(db, values);
  await Promise.all([first.getAll(), second.getAll()]);
  assert.equal((await first.getAll()).length, 2); // Identical legacy entries are valid.
  await Promise.all([first.add({ ...record, ID: 'A' }), second.add({ ...record, ID: 'B' })]);
  assert.equal((await first.getAll()).length, 4);
  assert.ok(values.has(key));
  await first.clear();
  assert.equal(values.has(key), false);
  // Even if an old copy exists, the persistent marker prevents resurrection.
  values.set(key, JSON.stringify([record]));
  assert.equal((await boot(db, values).getAll()).length, 0);
});

test('invalid legacy data aborts migration, preserves backup and allows retry', async () => {
  const values = new Map([[key, '{broken']]);
  const store = boot(new IDBFactory(), values);
  await assert.rejects(store.getAll());
  assert.equal(values.get(key), '{broken');
  values.set(key, JSON.stringify([record, { ...record, KSS: 10 }]));
  await assert.rejects(store.getAll(), /Invalid saved records/);
  values.set(key, JSON.stringify([record]));
  assert.equal((await store.getAll()).length, 1);
});

test('failed migration rolls back both records and marker', async () => {
  const db = new IDBFactory();
  const open = db.open.bind(db);
  let fail = true;
  db.open = (...args) => {
    const request = open(...args);
    request.addEventListener('success', () => {
      const database = request.result;
      const transaction = database.transaction.bind(database);
      database.transaction = (...args) => {
        const tx = transaction(...args);
        if (Array.isArray(args[0]) && fail) {
          const objectStore = tx.objectStore.bind(tx);
          tx.objectStore = name => {
            const store = objectStore(name);
            if (name === 'records') {
              const add = store.add.bind(store);
              store.add = value => { add(value); throw new Error('Simulated quota failure'); };
            }
            return store;
          };
        }
        return tx;
      };
    });
    return request;
  };
  const values = new Map([[key, JSON.stringify([record])]]);
  const store = boot(db, values);
  await assert.rejects(store.getAll(), /Simulated quota failure/);
  assert.ok(values.has(key));
  fail = false;
  assert.equal((await store.getAll()).length, 1);
});

test('unavailable IndexedDB reports failure and retains legacy data', async () => {
  const values = new Map([[key, JSON.stringify([record])]]);
  await assert.rejects(boot(null, values).getAll());
});
