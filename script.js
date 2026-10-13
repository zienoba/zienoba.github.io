'use strict';

(() => {
  const storage = window.KSSStorage;
  const actionButtons = ['saveRecord'].map(id => document.getElementById(id));
  let busy = false;
  let channel;
  try {
    if ('BroadcastChannel' in window) channel = new BroadcastChannel('kss-records');
  } catch (error) {
    // The administrator page also refreshes when focused.
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
  const status = document.getElementById('status');
  const sid = document.getElementById('sid');
  const session = document.getElementById('session');
  let selectedKSS = null;

  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
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
      message(`保存しました。\n被験者ID: ${record.ID}\n日時: ${record.DateTime}\n今の状況: ${record.Session}\nKSS: ${record.KSS}`);
    } catch (error) {
      message('保存できませんでした。ブラウザの保存設定や空き容量をご確認ください。', true);
    } finally {
      setBusy(false);
    }
  });
})();
