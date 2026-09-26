import { auth, db } from "/js/config.js";
import { initDB } from "/js/db-local.js";
import {
    signInWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { inicializarConexion, actualizarStatus } from "/js/conexion.js";
import { dbPut, dbGet, dbGetAll, dbDelete } from "/js/db-crud.js";
import {
  get,
  ref
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";


document.addEventListener("DOMContentLoaded", () => {
    inicializarConexion();
});


const btnLogin = document.getElementById("btn-login");

btnLogin.addEventListener("click", async () => {

    const correo = document.getElementById("correo").value.trim().toLowerCase();
    const password = document.getElementById("password").value.trim();
    const mensaje = document.getElementById("mensaje");

    mensaje.textContent = "";

    if (!correo || !password) {
        Swal.fire({
            icon: "warning",
            title: "Datos requeridos",
            text: "Capture correo y contraseña."
        });
        return;
    }

    try {
        btnLogin.disabled = true;
        btnLogin.innerHTML = "⏳ Validando...";

        // 🔹 Aquí usamos login híbrido
        const user = await login(correo, password);
        console.log("🔎 Resultado de login():", user);

        if (user) {
            console.log("🚀 Usuario recibido:", user);

            // 🔹 Usa tu verificación real en lugar de navigator.onLine
            let realmenteOnline = false;
            try {
                await fetch("/ping.txt?cb=" + Date.now(), { method: "GET", cache: "no-store" });
                realmenteOnline = true;
            } catch {
                console.warn("⚠️ Ping falló, marcamos como offline");
                realmenteOnline = false;
            }

            if (realmenteOnline) {
                console.log("🌐 Conexión real detectada, sincronizando expedientes...");
                try {
                    await sincronizarExpedientes();
                    console.log("✅ Expedientes sincronizados correctamente");
                } catch (e) {
                    console.error("❌ Error al sincronizar expedientes:", e);
                }
            } else {
                console.log("📴 Sin conexión real, trabajando en modo offline");
            }

            console.log("📢 Mostrando popup de acceso correcto...");
            Swal.fire({
                icon: "success",
                title: "Acceso correcto",
                text: "Bienvenido " + (user.email || "usuario offline")
            }).then(() => {
                console.log("➡️ Redirigiendo a index.html con usuario:", user);
                window.location.href = "index.html";
            });
        }

    } catch (error) {
        console.error(error);
        Swal.fire({
            icon: "error",
            title: "Acceso denegado",
            text: error.message
        });
    } finally {
        btnLogin.disabled = false;
        btnLogin.innerHTML = "🔐 Ingresar";
    }
});

const chkMostrarPassword = document.getElementById("mostrar-password");

if (chkMostrarPassword) {
    chkMostrarPassword.addEventListener("change", () => {
        const campoPassword = document.getElementById("password");
        campoPassword.type = chkMostrarPassword.checked ? "text" : "password";
    });
}

const linkRecuperar = document.getElementById("link-recuperar");

if (linkRecuperar) {
    linkRecuperar.addEventListener("click", async (e) => {
        e.preventDefault();

        const correo = document.getElementById("correo").value.trim();

        if (!correo) {
            Swal.fire({
                icon: "warning",
                title: "Correo requerido",
                text: "Capture primero el correo electrónico."
            });
            return;
        }

        try {
            await sendPasswordResetEmail(auth, correo);
            Swal.fire({
                icon: "success",
                title: "Correo enviado",
                text: "Revise su correo para restablecer la contraseña."
            });
        } catch (error) {
            console.error(error);
            Swal.fire({
                icon: "error",
                title: "Error al recuperar contraseña",
                text: error.message
            });
        }
    });
}

async function login(email, password) {
  if (navigator.onLine) {
    try {
      // 🔹 Intento online con Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("✅ Login online correcto");
      return userCredential.user;
    } catch (error) {
      console.error("⚠️ Error en login online:", error);

      if (error.code === "auth/network-request-failed") {
        console.log("🔄 Intentando login offline...");
        return await loginOffline(email, password);
      } else {
        // 🔹 Solo mostrar popup si es otro error (ejemplo: contraseña incorrecta)
        Swal.fire({
          icon: "error",
          title: "Acceso denegado",
          text: error.message
        });
        throw error;
      }
    }
  } else {
    // 🔹 Sin conexión → directo offline
    console.log("🔄 Sin conexión, usando login offline...");
    return await loginOffline(email, password);
  }
}
async function loginOffline(email, password) {
  const db = await initDB();

  // 🔹 Primero intenta con offlineUser
  const offlineUser = await dbGet("usuarios", "offlineUser");
  if (offlineUser && offlineUser.email.toLowerCase() === email.toLowerCase()) {
    console.log("👤 Sesión offline encontrada:", offlineUser);
    return { email: offlineUser.email, rol: offlineUser.rol };
  }

  // 🔹 Si no hay offlineUser, validar contra admin_local
  const admin = await dbGet("usuarios", "admin_local");
  if (
    admin &&
    admin.email.toLowerCase() === email.toLowerCase() &&
    admin.password === password
  ) {
    await dbPut("usuarios", { id: "offlineUser", email: admin.email, rol: "admin_local" });
    console.log("✅ Login offline correcto con admin_local");
    return { email: admin.email, rol: "admin_local" };
  }

  throw new Error("Login offline fallido");
}


/*
async function loginOffline(email, password) {
  console.log("🔌 Entrando a loginOffline con:", email, password);
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("usuarios", "readonly");
    const store = tx.objectStore("usuarios");
    const request = store.get("admin_local");

    request.onsuccess = async () => {
      const admin = request.result;
      console.log("👤 Usuario obtenido de IndexedDB:", admin);

      if (
        admin &&
        admin.email.toLowerCase().trim() === email.toLowerCase().trim() &&
        admin.password.trim() === password.trim()
      ) {
        console.log("✅ Login offline Antes de guardar sesión offline");

        // Guardar sesión en IndexedDB en lugar de localStorage
        await dbPut("usuarios", {
          id: "offlineUser",
          email: admin.email,
          rol: "admin_local"
        });
        console.log("✅ Login offline correcto");
        resolve(admin);
      } else {
        console.warn("❌ Login offline fallido");
        reject(new Error("Login offline fallido"));
      }
    };

    request.onerror = () => {
      console.error("❌ Error leyendo IndexedDB:", request.error);
      reject(request.error);
    };
  });
}*/

/*
async function loginOffline(email, password) {
  console.log("🔌 Entrando a loginOffline con:", email, password);
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("usuarios", "readonly");
    const store = tx.objectStore("usuarios");
    const request = store.get("admin_local");

    request.onsuccess = async () => {
      const admin = request.result;
      console.log("👤 Usuario obtenido de IndexedDB:", admin);

      if (
        admin &&
        admin.email.toLowerCase().trim() === email.toLowerCase().trim() &&
        admin.password.trim() === password.trim()
      ) {
        console.log("✅ Login offline correcto con admin_local");
        await dbPut("usuarios", {
          id: "offlineUser",
          email: admin.email,
          rol: "admin_local"
        });
        resolve({ email: admin.email, rol: "admin_local" });
      } else {
        const offlineReq = store.get("offlineUser");
        offlineReq.onsuccess = () => {
          const offlineUser = offlineReq.result;
          if (offlineUser) {
            console.log("👤 Sesión offline encontrada:", offlineUser);
            resolve({ email: offlineUser.email, rol: offlineUser.rol });
          } else {
            console.warn("❌ Login offline fallido");
            reject(new Error("Login offline fallido"));
          }
        };
        offlineReq.onerror = () => reject(new Error("Error leyendo offlineUser"));
      }
    };

    request.onerror = () => {
      console.error("❌ Error leyendo IndexedDB:", request.error);
      reject(request.error);
    };
  });
}*/









async function sincronizarExpedientes() {
  try {
    const snap = await get(ref(db, "expedientes"));
    if (snap.exists()) {
      const datos = snap.val();
      console.log("📥 Expedientes recibidos de Firebase:", datos);
      for (const id in datos) {
        await dbPut("expedientes", { id, ...datos[id] });
      }
      console.log("✅ Expedientes sincronizados en IndexedDB");
    } else {
      console.log("⚠️ No hay expedientes en Firebase");
    }
  } catch (e) {
    console.error("❌ Error al sincronizar expedientes:", e.code || e.message);
  }
}
