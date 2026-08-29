// sw.js - Versión 1.3.7 - SGCMED
const CACHE_NAME = 'sgcmed-cache-v1.3.7';

// LISTA DE ACTIVOS (Incluyendo librerías externas de Firebase)
const assets = [
  '/',
  '/index.html',
  '/expedientes.html',
  '/parametros.html',
  '/estilos/estilos.css',
  '/js/config.js',
  '/core-busqueda',
  '/gestion-medica',
  'imagenes/logo1.png',
  'imagenes/logo2.png',  
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  // LIBRERÍAS DE FIREBASE (Deben estar aquí para funcionar offline)
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js'
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
  // Solo interceptar peticiones GET (Firebase Realtime DB usa WebSockets, no chocará aquí)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(response => {
      // Si está en caché (incluyendo las librerías de Google), devolverlo
      if (response) return response;

      // Si no, intentar red
      return fetch(event.request).catch(() => {
        // Si falla todo, devolver respuesta vacía para evitar el error TypeError
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});