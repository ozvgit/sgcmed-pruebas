import { ref, get, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { db } from "./config.js"; // tu archivo de configuración con initializeApp

// 🔑 Configura aquí el paciente que quieres migrar (modo individual)
const PACIENTE_ID = "carlos reyes castro";  // cambia este valor

// --- Migrar un paciente específico ---
async function migrarUnPaciente() {
  const refPaciente = ref(db, `expedientes/${PACIENTE_ID}`);
  const snap = await get(refPaciente);

  if (!snap.exists()) {
    printLog(`❌ El paciente ${PACIENTE_ID} no existe en la BD`, "#ff0055");
    return;
  }

  const exp = snap.val();

  // Mostrar estado ANTES
  printLog("📋 Estado ANTES de la migración:", "#00d4ff");
  printLog(JSON.stringify(exp, null, 2), "#888");

  // Verificar visitas y actualizar
  if (exp.visitas && Object.keys(exp.visitas).length > 0) {
    const ultimaId = Object.keys(exp.visitas).pop();
    exp.esRegistroHistorico = false;
    exp.ultimaVisitaId = ultimaId;
    exp.ultimaVisita = exp.visitas[ultimaId]?.fechaVisita || "Sin Fecha";
  } else {
    exp.esRegistroHistorico = true;
  }

  await set(refPaciente, exp);

  // Mostrar estado DESPUÉS
  printLog("📋 Estado DESPUÉS de la migración:", "#39ff14");
  printLog(JSON.stringify(exp, null, 2), "#39ff14");

  printLog(`✅ Migrado paciente: ${PACIENTE_ID}`, "#39ff14");
}

// --- Migrar todos los pacientes ---
async function migrarTodosPacientes() {
  const refExp = ref(db, "expedientes");
  const snap = await get(refExp);

  if (!snap.exists()) {
    printLog("❌ No hay expedientes en la BD", "#ff0055");
    return;
  }

  const expedientes = snap.val();
  for (const id in expedientes) {
    const exp = expedientes[id];

    if (exp.visitas && Object.keys(exp.visitas).length > 0) {
      const ultimaId = Object.keys(exp.visitas).pop();
      exp.esRegistroHistorico = false;
      exp.ultimaVisitaId = ultimaId;
      exp.ultimaVisita = exp.visitas[ultimaId]?.fechaVisita || "Sin Fecha";
    } else {
      exp.esRegistroHistorico = true;
    }

    await set(ref(db, `expedientes/${id}`), exp);
    printLog(`✅ Migrado: ${id}`, "#39ff14");
  }

  printLog("🎉 Migración masiva completada", "#00ffea");
}

// --- Helper para imprimir mensajes en la consola visual ---
function printLog(mensaje, color = "#39ff14") {
  const consola = document.getElementById("consola-logs");
  if (!consola) return;
  const entrada = document.createElement("div");
  entrada.className = "log-entry";
  entrada.style.color = color;
  entrada.innerText = `[${new Date().toLocaleTimeString()}] ${mensaje}`;
  consola.appendChild(entrada);
  consola.scrollTop = consola.scrollHeight;
}

// --- Vincular a botones ---
document.addEventListener("DOMContentLoaded", () => {
  const btnUno = document.getElementById("btn-migrar-paciente");
  if (btnUno) {
    btnUno.addEventListener("click", () => {
      printLog("🚀 Iniciando migración de paciente único...", "#ffea00");
      migrarUnPaciente();
    });
  }

  const btnTodos = document.getElementById("btn-migrar-todos");
  if (btnTodos) {
    btnTodos.addEventListener("click", () => {
      printLog("🚀 Iniciando migración masiva de todos los pacientes...", "#ffea00");
      migrarTodosPacientes();
    });
  }
});
