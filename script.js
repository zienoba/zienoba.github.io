'use strict';

(() => {
  const DATA_KEY = 'KSS_FINAL_DATA.json';
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

  function getData() {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw === null) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || !data.every(record => record &&
      typeof record.ID === 'string' && typeof record.DateTime === 'string' &&
      typeof record.Session === 'string' && Number.isInteger(record.KSS) &&
      record.KSS >= 1 && record.KSS <= 9)) {
      throw new Error('Invalid saved records');
    }
    return data;
  }

  function setData(data) {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
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

  function loadTable() {
    try {
      renderTable(getData());
    } catch (error) {
      message('保存済みの記録を読み込めませんでした。ブラウザの保存設定をご確認ください。', true);
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

  document.getElementById('questionnaire').addEventListener('submit', event => {
    event.preventDefault();
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
    try {
      const data = getData();
      data.push(record);
      setData(data);
      renderTable(data);
      message(`保存しました。\n被験者ID: ${record.ID}\n日時: ${record.DateTime}\n今の状況: ${record.Session}\nKSS: ${record.KSS}`);
    } catch (error) {
      message('保存できませんでした。ブラウザの保存設定や空き容量をご確認ください。', true);
    }
  });

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  document.getElementById('exportCSV').addEventListener('click', () => {
    let url;
    try {
      const data = getData();
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
      if (url) setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  });

  document.getElementById('clearHistory').addEventListener('click', () => {
    if (!window.confirm('保存済みの履歴をすべて消去します。この操作は取り消せません。消去しますか？')) return;
    try {
      setData([]);
      renderTable([]);
      message('履歴を消去しました。');
    } catch (error) {
      message('履歴を消去できませんでした。もう一度お試しください。', true);
    }
  });

  window.addEventListener('storage', event => {
    if (event.key === DATA_KEY || event.key === null) loadTable();
  });
  loadTable();

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
