'use strict';

window.KSSStorage = (() => {
  const LEGACY_KEY = 'KSS_FINAL_DATA.json';
  const MIGRATION_KEY = 'localStorageMigrated';
  let databasePromise;

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      transaction.onerror = () => {}; // Abort reports the final transaction failure.
    });
  }

  function readLegacyRecords() {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw === null) return [];
    const records = JSON.parse(raw);
    if (!Array.isArray(records) || !records.every(record => record &&
      typeof record.ID === 'string' && typeof record.DateTime === 'string' &&
      typeof record.Session === 'string' && Number.isInteger(record.KSS) &&
      record.KSS >= 1 && record.KSS <= 9)) {
      throw new Error('Invalid saved records');
    }
    return records;
  }

  async function migrate(database) {
    // The marker and records commit together. Concurrent tabs cannot import twice.
    const transaction = database.transaction(['records', 'metadata'], 'readwrite');
    const done = transactionDone(transaction);
    const metadata = transaction.objectStore('metadata');
    let migrationError;
    metadata.get(MIGRATION_KEY).onsuccess = event => {
      if (event.target.result) return;
      try {
        const records = transaction.objectStore('records');
        readLegacyRecords().forEach(record => records.add({
          ID: record.ID, DateTime: record.DateTime, Session: record.Session, KSS: record.KSS
        }));
        metadata.put(true, MIGRATION_KEY);
      } catch (error) {
        migrationError = error;
        transaction.abort();
      }
    };
    try {
      await done;
    } catch (error) {
      throw migrationError || error;
    }
    // Keep the original data as a migration backup; the marker prevents reimport.
  }

  function open() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('kss-questionnaire', 1);
        let blocked = false;
        request.onupgradeneeded = () => {
          request.result.createObjectStore('records', { keyPath: 'recordId', autoIncrement: true });
          request.result.createObjectStore('metadata');
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
          blocked = true;
          reject(new Error('Database upgrade blocked by another tab'));
        };
        request.onsuccess = async () => {
          const database = request.result;
          if (blocked) {
            database.close();
            return;
          }
          database.onversionchange = () => {
            database.close();
            databasePromise = undefined;
          };
          try {
            await migrate(database);
            resolve(database);
          } catch (error) {
            database.close();
            reject(error);
          }
        };
      }).catch(error => {
        databasePromise = undefined;
        throw error;
      });
    }
    return databasePromise;
  }

  async function getAll() {
    const database = await open();
    const transaction = database.transaction('records', 'readonly');
    const done = transactionDone(transaction);
    const request = transaction.objectStore('records').getAll();
    await done;
    return request.result;
  }

  async function add(record) {
    const database = await open();
    const transaction = database.transaction('records', 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('records').add(record);
    await done;
  }

  async function clear() {
    const database = await open();
    // Keep the migration marker so cleared legacy records never reappear.
    const transaction = database.transaction('records', 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('records').clear();
    await done;
    // Explicit history deletion also removes the legacy migration backup.
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch (error) {
      throw new Error('Legacy backup could not be cleared', { cause: error });
    }
  }

  return { getAll, add, clear };
})();
