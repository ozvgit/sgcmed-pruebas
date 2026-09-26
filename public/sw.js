console.log("🚀 Service Worker cargado correctamente");

const CACHE_NAME = 'sgcmed-cache-v27';

// LISTA DE ACTIVOS (HTML + assets estáticos, SIN ping.txt)
const assets = [
  '/index.html',
  '/login.html',
  '/expedientes.html',
  '/parametros.html',
  '/expedientes_demo.html',
  '/js/login.js',
  '/js/db-local.js',
  '/js/db-crud.js',
  '/js/config.js',
  '/js/conexion.js',
  '/js/app-pruebas.js',
  '/js/busqueda.js',
  '/core-busqueda',
  '/gestion-medica',
  '/estilos/estilos.css',
  '/favicon.ico',
  'imagenes/logo1.png',
  'imagenes/logo2.png',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  // LIBRERÍAS DE FIREBASE (externas, con fallback)
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('📦 Guardando librerías y archivos para modo offline...');
      return cache.addAll(assets);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // 🔹 Excluir ping.txt: siempre desde red
  if (event.request.url.includes('ping.txt')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 🔹 Manejo especial para Firebase (gstatic)
  if (event.request.url.includes('firebasejs')) {
    event.respondWith(
      caches.match(event.request).then(response => {
        if (response) {
          console.log("📂 Firebase servido desde caché:", event.request.url);
          return response;
        }
        console.log("🌐 Pidiendo Firebase:", event.request.url);
        return fetch(event.request).catch(() => {
          console.warn("⚠️ Firebase no disponible offline:", event.request.url);
          // 🔹 Fallback: respuesta vacía con status 200 para evitar error fatal
          return new Response("", { status: 200, statusText: "Offline Firebase" });
        });
      })
    );
    return;
  }

  // 🔹 Documentos HTML: red primero, fallback a login.html
  if (event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request).catch(() => {
        console.warn("⚠️ No se pudo cargar documento, mostrando versión cacheada.");
        const url = new URL(event.request.url);
        if (event.request.url.endsWith('/index.html')) {
          return caches.match('/index.html');
        }
        return caches.match(url.pathname);
      })
    );
    return;
  }

  // 🔹 Recursos normales (CSS, JS, imágenes)
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        console.log("📂 Sirviendo desde caché:", event.request.url);
        return response;
      }
      console.log("🌐 Pidiendo al servidor:", event.request.url);
      return fetch(event.request).catch(() => {
        console.warn("⚠️ Recurso no disponible offline:", event.request.url);
        return new Response("Offline", { status: 503, statusText: "Offline" });
      });
    })
  );
});
