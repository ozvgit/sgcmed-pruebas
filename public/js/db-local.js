// db-local.js
const DB_NAME = "SGCMED_DB";
const DB_VERSION = 4; // súbelo si cambias estructura

export function initDB() {
  return new Promise((resolve, reject) => {
    console.log("📂 Abriendo IndexedDB:", DB_NAME, "v", DB_VERSION);
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      console.log("⚙️ onupgradeneeded disparado");
      const db = event.target.result;

      // Usuarios
      if (!db.objectStoreNames.contains("usuarios")) {
        db.createObjectStore("usuarios", { keyPath: "id" });
        console.log("✅ Store 'usuarios' creado");
      }

      // Configuración
      if (!db.objectStoreNames.contains("configuracion")) {
        db.createObjectStore("configuracion", { keyPath: "clave" });
        console.log("✅ Store 'configuracion' creado");
      }

      // Pacientes
      if (!db.objectStoreNames.contains("pacientes")) {
        db.createObjectStore("pacientes", { keyPath: "id" });
        console.log("✅ Store 'pacientes' creado");
      }

      // Expedientes
      if (!db.objectStoreNames.contains("expedientes")) {
        db.createObjectStore("expedientes", { keyPath: "id" });
        console.log("✅ Store 'expedientes' creado");
      }

      // Cola de sincronización
      if (!db.objectStoreNames.contains("cola_sincronizacion")) {
        db.createObjectStore("cola_sincronizacion", {
        keyPath: "id"
        });
        console.log("✅ Store 'cola_sincronizacion' creado");
      }

      // Semilla: usuario admin local
      const tx = event.target.transaction;
      const store = tx.objectStore("usuarios");
      store.put({ id: "admin_local", email: "admin@local", password: "1234" });
      console.log("👤 Usuario admin_local insertado");
    };

    request.onsuccess = () => {
      console.log("✅ IndexedDB abierto correctamente");
      resolve(request.result);
    };

    request.onerror = () => {
      console.error("❌ Error al abrir IndexedDB:", request.error);
      reject(request.error);
    };
  });
}
