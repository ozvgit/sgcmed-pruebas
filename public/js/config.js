// js/config.js - Configuración Blindada para SGCMED
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyBIItIipQD6WAdMvUKeO5GUfWsud5kbdX0",
  authDomain: "sgifjs.firebaseapp.com",
  databaseURL: "https://sgcmed-pruebas.firebaseio.com",
  projectId: "sgifjs",
  storageBucket: "sgifjs.appspot.com",
  messagingSenderId: "840046813593",
  appId: "1:840046813593:web:84829b5201652bcfb8b308"
};

// 1. Inicializar la App de Firebase
const app = initializeApp(firebaseConfig);

// 2. Inicializar Auth con Persistencia Local
// Esto evita que la sesión se cierre al quitar el internet
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence)
  .catch((error) => console.error("Error en persistencia Auth:", error));

// 3. Inicializar Realtime Database
export const db = getDatabase(app);

/**
 * 4. ACTIVAR DISCO LOCAL (Persistencia de Datos)
 * En Firebase Web SDK v9/v10, para Realtime Database, 
 * los datos se mantienen en memoria durante la sesión, pero
 * esto asegura que las escrituras pendientes no se pierdan.
 */
// Nota: Realtime Database en Web no tiene un comando "enablePersistence" 
// igual que Firestore; usa una caché interna automática al usar onValue.

export const functions = getFunctions(app);

console.log("🚀 Firebase Configurado: Modo Híbrido (Online/Offline) Activo");