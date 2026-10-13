'use strict';

(() => {
  const storage = window.KSSStorage;
  const actionButtons = ['exportCSV', 'clearHistory'].map(id => document.getElementById(id));
  let busy = false;
  let tableLoad = 0;
  let channel;
  try {
    if ('BroadcastChannel' in window) channel = new BroadcastChannel('kss-records');
  } catch (error) {
    // Focus and visibility changes also refresh the history.
  }

  function setBusy(value) {
    busy = value;
    actionButtons.forEach(button => { button.disabled = value; });
  }

  function notifyChange() {
    try { channel?.postMessage('changed'); } catch (error) {}
  }
  const tbody = document.getElementById('tbody');
  const status = document.getElementById('status');

  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
  }

  function renderTable(data) {
    tbody.replaceChildren();
    if (!data.length) {
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = 'まだ記録がありません。';
      const row = document.createElement('tr');
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }
    data.forEach(record => {
      const row = document.createElement('tr');
      [record.ID, record.DateTime, record.Session, record.KSS].forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.appendChild(cell);
      });
      tbody.appendChild(row);
    });
  }

  async function loadTable() {
    const load = ++tableLoad;
    try {
      const data = await storage.getAll();
      if (load === tableLoad) renderTable(data);
      return true;
    } catch (error) {
      message('保存済みの記録を読み込めませんでした。ブラウザの保存設定をご確認ください。', true);
      return false;
    }
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  document.getElementById('exportCSV').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    let url;
    try {
      const data = await storage.getAll();
      const rows = [['ID', 'DateTime', 'Session', 'KSS'],
        ...data.map(record => [record.ID, record.DateTime, record.Session, record.KSS])];
      const csv = '\ufeff' + rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
      url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'KSS_FinalProtocol_Data.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      message(`CSVを出力しました（${data.length}件）。`);
    } catch (error) {
      message('CSVを出力できませんでした。ブラウザの保存設定をご確認ください。', true);
    } finally {
      setBusy(false);
      if (url) setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  });

  document.getElementById('clearHistory').addEventListener('click', async () => {
    if (busy) return;
    if (!window.confirm('保存済みの履歴をすべて消去します。この操作は取り消せません。消去しますか？')) return;
    setBusy(true);
    try {
      await storage.clear();
      notifyChange();
      if (await loadTable()) message('履歴を消去しました。');
    } catch (error) {
      if (error.message === 'Legacy backup could not be cleared') {
        notifyChange();
        await loadTable();
        message('履歴は消去しましたが、移行前のバックアップを削除できませんでした。ブラウザの保存設定をご確認ください。', true);
      } else {
        message('履歴を消去できませんでした。もう一度お試しください。', true);
      }
    } finally {
      setBusy(false);
    }
  });

  if (channel) channel.onmessage = () => loadTable();
  window.addEventListener('focus', () => loadTable());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadTable();
  });
  setBusy(true);
  loadTable().finally(() => setBusy(false));

})();
