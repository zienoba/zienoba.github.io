'use strict';

(() => {
  const storage = window.KSSStorage;
  const actionButtons = ['saveRecord', 'exportCSV', 'clearHistory'].map(id => document.getElementById(id));
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
  const descriptions = [
    '非常にはっきり目覚めている',
    'とても目覚めている',
    '目覚めている',
    'やや目覚めている',
    'どちらでもない',
    'やや眠い',
    '眠いが、我慢できる',
    '眠くて、頑張って目を覚ましている',
    '非常に眠い、眠気と闘っている、今にも寝てしまいそう'
  ];
  const grid = document.getElementById('kssgrid');
  const tbody = document.getElementById('tbody');
  const status = document.getElementById('status');
  const sid = document.getElementById('sid');
  const session = document.getElementById('session');
  let selectedKSS = null;

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

  descriptions.forEach((description, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kbtn';
    button.setAttribute('aria-pressed', 'false');
    const number = document.createElement('span');
    number.className = 'kbtn-number';
    number.textContent = String(index + 1);
    const text = document.createElement('span');
    text.className = 'kbtn-text';
    text.textContent = description;
    button.append(number, text);
    button.addEventListener('click', () => {
      grid.querySelectorAll('.kbtn').forEach(item => {
        item.classList.remove('selected');
        item.setAttribute('aria-pressed', 'false');
      });
      button.classList.add('selected');
      button.setAttribute('aria-pressed', 'true');
      selectedKSS = index + 1;
    });
    grid.appendChild(button);
  });

  document.getElementById('questionnaire').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const missing = [];
    if (!sid.value.trim()) missing.push('被験者ID');
    if (selectedKSS === null) missing.push('KSS');
    if (!session.value) missing.push('今の状況');
    if (missing.length) {
      message(`未入力の項目があります：\n${missing.map(item => `・${item}`).join('\n')}`, true);
      if (!sid.value.trim()) sid.focus();
      else if (selectedKSS === null) grid.querySelector('.kbtn').focus();
      else session.focus();
      return;
    }
    const record = {
      ID: sid.value.trim(),
      DateTime: new Date().toLocaleString('ja-JP'),
      Session: session.value,
      KSS: selectedKSS
    };
    setBusy(true);
    try {
      await storage.add(record);
      notifyChange();
      if (await loadTable()) {
        message(`保存しました。\n被験者ID: ${record.ID}\n日時: ${record.DateTime}\n今の状況: ${record.Session}\nKSS: ${record.KSS}`);
      } else {
        message('記録は保存しましたが、一覧を更新できませんでした。ページを再読み込みしてください。', true);
      }
    } catch (error) {
      message('保存できませんでした。ブラウザの保存設定や空き容量をご確認ください。', true);
    } finally {
      setBusy(false);
    }
  });

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

  if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => {
      document.getElementById('offlineNote').textContent = 'このページは次回からオフラインでも利用できます。';
    }).catch(() => {
      document.getElementById('offlineNote').textContent = 'オフライン用の準備ができませんでした。オンラインでご利用ください。';
    });
  } else if (location.protocol !== 'file:') {
    document.getElementById('offlineNote').textContent = 'Web上でのオフライン利用にはHTTPSでの配信が必要です。';
  }
})();
