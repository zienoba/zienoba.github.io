'use strict';

(() => {
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
