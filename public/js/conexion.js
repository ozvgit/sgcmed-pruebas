// conexion.js

import { dbGet } from "/js/db-crud.js"; // asegúrate de tenerlo importado

(function agregarEstilos() {
  const estilo = document.createElement("style");
  estilo.textContent = `
    .status {
      font-size: 10px;       /* 🔹 Letras más pequeñas */
      font-weight: normal;   /* menos énfasis */
      padding: 2px 6px;
      border-radius: 3px;
      display: inline-block;
      margin-top: 6px;
      font-family: Arial, sans-serif;
    }
    .status.verificando {
      background-color: #fff3cd; /* amarillo suave */
      color: #856404;
      border: 1px solid #ffeeba;
    }
    .status.online {
      background-color: #d4edda; /* verde suave */
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    .status.offline {
      background-color: #f8d7da; /* rojo suave */
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
  `;
  document.head.appendChild(estilo);
})();

// 🔹 Función principal con contador
export async function actualizarStatus() {
  const statusDiv = document.getElementById("status");
  if (!statusDiv) return;

  let segundos = 5;
  statusDiv.textContent = `⏳ Verificando conexión... (${segundos}s)`;
  statusDiv.className = "status verificando";

  const intervalo = setInterval(() => {
    segundos--;
    if (segundos > 0) {
      statusDiv.textContent = `⏳ Verificando conexión... (${segundos}s)`;
    } else {
      clearInterval(intervalo);
      verificarConexionReal(statusDiv);
    }
  }, 1000);
}

// 🔹 Verificación real con ping local
async function verificarConexionReal(statusDiv) {
  let online = navigator.onLine;

  if (online) {
    try {
      await fetch("/ping.txt?cb=" + Date.now(), { method: "GET", cache: "no-store" });
      online = true;
    } catch {
      console.warn("⚠️ Ping falló, marcamos como offline");
      online = false;
    }
  }

  if (online) {
    statusDiv.textContent = "🟢 Conectado - Modo Online";
    statusDiv.className = "status online";
  } else {
    statusDiv.textContent = "🔴 Sin conexión - Modo Offline";
    statusDiv.className = "status offline";
  }

  if (typeof window.gestionarBotonParametros === 'function') {
    window.gestionarBotonParametros();
  }
  
}

/*
async function verificarConexionReal(statusDiv) {
  let online = navigator.onLine;

  if (online) {
    try {
      await fetch("/ping.txt?cb=" + Date.now(), { method: "GET", cache: "no-store" });
      online = true;
    } catch {
      console.warn("⚠️ Ping falló, marcamos como offline");
      online = false;
    }
  }

  // 🔹 Revisar si hay sesión offline guardada
  const offlineUser = await dbGet("usuarios", "offlineUser");

  if (offlineUser) {
    if (online) {
      statusDiv.textContent = "🟢 Sesión online activa";
      statusDiv.className = "status online";
    } else {
      statusDiv.textContent = "🟠 Sesión offline activa";
      statusDiv.className = "status offline";
    }
  } else {
    if (online) {
      statusDiv.textContent = "🟢 Conectado - Modo Online";
      statusDiv.className = "status online";
    } else {
      statusDiv.textContent = "🔴 Sin conexión - Modo Offline";
      statusDiv.className = "status offline";
    }
  }

  if (typeof window.gestionarBotonParametros === 'function') {
    window.gestionarBotonParametros();
  }
}*/


// 🔹 Inicialización global
export function inicializarConexion() {
  actualizarStatus();
  window.addEventListener("online", actualizarStatus);
  window.addEventListener("offline", actualizarStatus);
  setInterval(actualizarStatus, 5000);
}
