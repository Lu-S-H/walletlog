// 離線快取。改版時把 VERSION 改掉（並同步修改 js/config.js），手機就會出現「有新版本」提示。
const VERSION = '0.3.1';
const CACHE = `walletlog-${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/main.js',
  'js/config.js',
  'js/util.js',
  'js/db.js',
  'js/store.js',
  'js/categories.js',
  'js/charts.js',
  'js/ledger.js',
  'js/legacy.js',
  'js/privacy.js',
  'js/salary.js',
  'js/salaryImport.js',
  'js/backup.js',
  'js/icons.js',
  'js/ui.js',
  'js/views/add.js',
  'js/views/common.js',
  'js/views/list.js',
  'js/views/more.js',
  'js/views/onboarding.js',
  'js/views/search.js',
  'js/views/salary.js',
  'js/views/settings.js',
  'js/views/slip.js',
  'js/views/stats.js',
  'js/views/tags.js',
  'js/views/txrow.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' 確保拿到伺服器上的最新檔案，而不是瀏覽器的舊快取
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
  // 不自動 skipWaiting：等使用者在 App 裡按「更新」
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('walletlog-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
