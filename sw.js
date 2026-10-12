'use strict';

const CACHE_NAME = 'kss-questionnaire-web-v1';
const FILES = ['./', './index.html', './style.css', './script.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Cache only this application's files, so hosting beneath a subdirectory works.
  if (!FILES.some(file => new URL(file, self.registration.scope).pathname === url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() =>
    caches.open(CACHE_NAME).then(cache => cache.match(url.pathname))
  ));
});
