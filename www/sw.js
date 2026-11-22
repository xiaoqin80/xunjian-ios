/* 寻见 · Service Worker
 * 策略：
 *   - 页面/脚本/样式：预缓存（安装时取一次），之后 cache-first（忽略 ?v= 查询串）
 *   - 数据 JSON：首次请求走网络并写入缓存（不预缓存，避免第一次访问就下 7.4 MB）
 *   - 音频 mp3：完全不进缓存，直接走网络（要 Range 拖动进度）
 */
const VERSION = "xj-v4";
const SHELL = [
  "shell.html", "index.html", "经库.html", "乐库.html", "我的.html",
  "经页.html", "章页.html", "阅读页.html", "开屏.html",
  "music-mini.js", "favicon.svg", "favicon.ico", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // 逐个加，单个失败不影响整体（例如某页暂时 404）
    await Promise.all(SHELL.map(async (u) => {
      try { await c.add(new Request(u, { cache: "reload" })); } catch (_) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isAudio(url) {
  return /\.(mp3|m4a|ogg|wav)$/i.test(url.pathname);
}
function isData(url) {
  return /\/data\/.*\.json$/i.test(url.pathname) || /\/version\.json$/i.test(url.pathname);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  /* 整页导航：网络优先（改了页面必须立刻生效），失败再回缓存 */
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "reload" });
        const c = await caches.open(VERSION);
        try { await c.put(req, fresh.clone()); } catch (_) {}
        return fresh;
      } catch (err) {
        const c = await caches.open(VERSION);
        return (await c.match(req, { ignoreSearch: true })) ||
               (await c.match("shell.html", { ignoreSearch: true })) || Promise.reject(err);
      }
    })());
    return;
  }
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isAudio(url)) return;                       // 音频交给网络（Range）

  if (/\/data\//.test(url.pathname)) {               // 所有数据 JSON：网络优先（数据会随内容修订变化）
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        try { const c = await caches.open(VERSION); await c.put(req, fresh.clone()); } catch (_) {}
        return fresh;
      } catch (err) {
        const c = await caches.open(VERSION);
        return (await c.match(req)) || Promise.reject(err);
      }
    })());
    return;
  }

  if (isData(url)) {
    // 数据：先用缓存（忽略版本参数），没有就走网络并回填
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) { try { await c.put(req, res.clone()); } catch (_) {} }
      return res;
    })());
    return;
  }

  // 页面与静态资源：cache-first
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && (res.type === "basic" || res.type === "default")) {
        try { await c.put(req, res.clone()); } catch (_) {}
      }
      return res;
    } catch (err) {
      const fallback = await c.match("shell.html", { ignoreSearch: true });
      if (fallback) return fallback;
      throw err;
    }
  })());
});
