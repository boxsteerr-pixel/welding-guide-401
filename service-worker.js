const CACHE_NAME = "welding-guide-401-v25";
const CACHE_PREFIX = "welding-guide-401-";
const APP_ROOT = new URL("./", self.location.href);
const MEDIA_SOURCES = [
  "./assets/images/focus-adjustment-entry.png",
  "./assets/images/focus-adjustment-parameters.png",
  "./assets/images/focus-adjustment-accept.png",
  "./assets/images/focus-check-overview.png",
  "./assets/images/focus-check-adjustment.png",
  "./assets/images/gas-nozzle-damaged.webp",
  "./assets/images/gas-nozzle-normal.webp",
  "./assets/images/cooling-water-valve-location.png",
  "./assets/images/cooling-water-stop-selectors.png",
  "./assets/images/cooling-water-location.png",
  "./assets/images/cooling-water-selectors.png",
  "./assets/images/cooling-water-valves.png",
  "./assets/images/laser-source-query-step-1-baohan.webp",
  "./assets/images/laser-source-query-step-2.jpg",
  "./assets/images/laser-source-query-step-3.jpg",
  "./assets/images/laser-source-query-step-4.jpg",
  "./assets/images/laser-source-query-step-5.jpg",
  "./assets/images/laser-source-query-step-6.jpg",
  "./assets/images/clamp-platform-step-1-baohan.webp",
  "./assets/images/clamp-platform-step-2-baohan.webp",
  "./assets/images/clamp-platform-step-3-baohan.webp",
  "./assets/images/clamp-platform-step-4-baohan.webp",
  "./assets/images/clamp-platform-step-5-baohan.webp",
  "./assets/images/clamp-platform-step-6-baohan.webp",
  "./assets/images/circulation-pump-filter-location.png",
  "./assets/images/circulation-pump-filter-switch.png",
  "./assets/images/scrap-belt-location.png",
  "./assets/images/scrap-belt-unlock-v2.png",
  "./assets/images/scrap-belt-adjust.png",
  "./assets/images/scrap-belt-lock.png",
];
const MEDIA_ASSETS = MEDIA_SOURCES.map(function (path) { return new URL(path.replace(/assets\/images\/([^/]+)\.png$/, "assets/images/optimized/$1.webp"), APP_ROOT).toString(); });
const CORE_ASSETS = [
  "./css/mobile-header.css?v=2",
  "./js/system-time.js?v=1",
  "./",
  "./index.html",
  "./css/home-link.css?v=5",
  "./css/style.css",
  "./css/style.css?v=12",
  "./js/app.js",
  "./js/app.js?v=18",
  "./js/update-state.js?v=2",
  "./data/manual.json",
  "./manifest.json",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
].map(function (path) { return new URL(path, APP_ROOT).toString(); });

function isCacheable(response) {
  return response && response.ok && response.type !== "opaque";
}

let foregroundImages = 0;
let mediaCacheJob;
const pause = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };

async function fetchImage(request) {
  let error;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 15000);
    try {
      const response = await fetch(request, { signal: controller.signal, cache: attempt ? "reload" : "default", priority: foregroundImages ? "high" : "low" });
      if (!isCacheable(response)) throw new Error("Image HTTP " + response.status);
      return response;
    } catch (failure) { error = failure; }
    finally { clearTimeout(timer); }
  }
  throw error;
}

async function mediaProgress(client) {
  const cache = await caches.open(CACHE_NAME);
  let completed = 0;
  for (const url of MEDIA_ASSETS) if (await cache.match(url)) completed++;
  if (client) client.postMessage({ type: "MEDIA_PROGRESS", completed: completed, total: MEDIA_ASSETS.length });
  return completed;
}

async function cacheMedia(client) {
  const cache = await caches.open(CACHE_NAME);
  for (const url of MEDIA_ASSETS) {
    if (await cache.match(url)) continue;
    while (foregroundImages) await pause(250);
    try {
      const response = await fetchImage(url);
      await cache.put(url, response);
    } catch (_) { /* Preserve successful files; retry missing files on the next request. */ }
    await mediaProgress(client);
    await pause(300);
  }
  if (await mediaProgress(client) === MEDIA_ASSETS.length) await removeOldCaches();
}

async function removeOldCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter(function (name) { return name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME; }).map(function (name) { return caches.delete(name); }));
}

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "CACHE_STATUS") event.waitUntil(mediaProgress(event.source));
  if (event.data && event.data.type === "CACHE_MEDIA") {
    if (!mediaCacheJob) mediaCacheJob = cacheMedia(event.source).finally(function () { mediaCacheJob = null; });
    event.waitUntil(mediaCacheJob);
  }
});

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(CORE_ASSETS); }));
});

self.addEventListener("activate", function (event) {
  // Keep old resources until this version has successfully cached all new images.
  event.waitUntil(self.clients.claim());
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const cache = await caches.open(CACHE_NAME);
      try { await cache.put(request, response.clone()); } catch (_) { /* Storage limits must not hide a successful network response. */ }
    }
    return response;
  } catch (error) {
    const cached = await (await caches.open(CACHE_NAME)).match(request);
    if (cached) return cached;
    if (request.mode === "navigate") return (await caches.open(CACHE_NAME)).match(new URL("./index.html", APP_ROOT).toString());
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  foregroundImages++;
  try {
    const response = await fetchImage(request);
    const cache = await caches.open(CACHE_NAME);
    try { await cache.put(request, response.clone()); } catch (_) { /* Allow viewing even when device storage is full. */ }
    return response;
  } finally { foregroundImages--; }
}

self.addEventListener("fetch", function (event) {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(APP_ROOT.pathname)) return;
  if (request.mode === "navigate" || ["document", "script", "style", "manifest"].includes(request.destination) || url.pathname.endsWith("/data/manual.json")) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (["image", "font", "video", "audio"].includes(request.destination) || /\.(webp|png|jpe?g)$/.test(url.pathname)) event.respondWith(cacheFirst(request));
});
