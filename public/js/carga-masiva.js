// js/carga-masiva.js - HERRAMIENTA DE PRUEBAS DE CARGA - SGCMED
import { db, auth } from '/js/config.js';
import { ref, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Asegurar sesión activa antes de operar para no violar las reglas de seguridad
onAuthStateChanged(auth, (user) => {
    if (user) {
        printLog("🔐 Sesión de desarrollo autenticada correctamente.");
    } else if (navigator.onLine) {
        signInAnonymously(auth).catch(e => printLog("❌ Error de autenticación offline: " + e.message));
    }
});

// Listas de datos para combinaciones aleatorias de nombres hispanos
const nombres = ["Oscar300", "Miriam300", "Alejandro", "Sofia", "Carlos", "Diana", "Juan", "Laura", "Pedro", "Elena", "Ricardo", "Saray", "Miguel", "Michelle", "Gabriel", "Patricia", "Fernando", "Guadalupe", "Eduardo", "Letizia"];
const apellidos = ["Zarza", "Gomez", "Rodriguez", "Martinez", "Lopez", "Perez", "Sanchez", "Ramirez", "Flores", "Torres", "Diaz", "Vargas", "Reyes", "Morales", "Jimenez", "Ortiz", "Castro", "Rios", "Alvarez", "Mendoza"];

// Helper para imprimir mensajes en la caja de consola de la UI
function printLog(mensaje, color = "#39ff14") {
    const consola = document.getElementById('consola-logs');
    if (!consola) return;
    const entrada = document.createElement('div');
    entrada.className = "log-entry";
    entrada.style.color = color;
    entrada.innerText = `[${new Date().toLocaleTimeString()}] ${mensaje}`;
    consola.appendChild(entrada);
    consola.scrollTop = consola.scrollHeight;
}

// Helper para generar claves tipo Push ID de Firebase de forma matemática
function generarPushIdSimulado() {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    let resultado = '-';
    for (let i = 0; i < 19; i++) {
        resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return resultado;
}

// Helper para generar strings de fechas ISO aleatorias
function generarFechaAleatoria(mesEspecifico = null) {
    const año = 2025;
    const mes = mesEspecifico !== null ? mesEspecifico : Math.floor(Math.random() * 12);
    const dia = Math.floor(Math.random() * 28) + 1;
    const mm = String(mes + 1).padStart(2, '0');
    const dd = String(dia).padStart(2, '0');
    return `${año}-${mm}-${dd}`;
}

async function ejecutarCargaMasivaPacientes() {
    const btn = document.getElementById('btn-ejecutar-carga');
    if (btn) btn.disabled = true;

    printLog("⏳ Preparando asignación y empaquetado de 400 pacientes estructurales...", "#ffea00");
    
    const objetoActualizacionMasiva = {};
    const totalPacientes = 400;

    for (let i = 1; i <= totalPacientes; i++) {
        // Generación de nombres combinados
        const primerNombre = nombres[Math.floor(Math.random() * nombres.length)];
        const segundoNombre = Math.random() > 0.6 ? " " + nombres[Math.floor(Math.random() * nombres.length)] : "";
        const apellidoPaterno = apellidos[Math.floor(Math.random() * apellidos.length)];
        const apellidoMaterno = apellidos[Math.floor(Math.random() * apellidos.length)];
        
        const nombreCompleto = `${primerNombre}${segundoNombre} ${apellidoPaterno} ${apellidoMaterno}`.toLowerCase().trim();
        const idLimpio = nombreCompleto;

        // Distribución en el año calendario
        const mesAlta = Math.floor(Math.random() * 12);
        const fechaAlta = generarFechaAleatoria(mesAlta);
        const fechaNacimiento = `${Math.floor(Math.random() * (2002 - 1955)) + 1955}-03-22`;
        const edadCalculada = String(2026 - parseInt(fechaNacimiento.split('-')[0]));

        const historiaClinica = {
            nombre: nombreCompleto,
            edad: edadCalculada,
            fechaFicha: fechaAlta,
            fechaNacimiento: fechaNacimiento,
            domicilio: `Avenida Tecnológica No. ${i}, Sección Pruebas`,
            telefono: `555${String(Math.floor(1000000 + Math.random() * 9000000))}`,
            escolaridad: "Preparatoria",
            ocupacion: "Comerciante",
            estadoCivil: Math.random() > 0.4 ? "Soltero" : "Casado",
            religion: Math.random() > 0.5 ? "Católico" : "Ninguna",
            informante: "Paciente directo",
            parentesco: "Ninguno",
            heredofamiliares: "Carga genética para enfermedades crónico degenerativas controladas.",
            patologicos: "Procedimientos quirúrgicos previos negados por el paciente.",
            noPatologicos: "Hábitos higiénico-dietéticos regulares dentro de los parámetros normales.",
            gineco: "Sin incidencias relevantes reportadas."
        };

        const visitas = {};
        const numeroDeVisitas = Math.floor(Math.random() * 3) + 1; // 1, 2 o 3 consultas por paciente

        for (let j = 0; j < numeroDeVisitas; j++) {
            const pushIdVisita = generarPushIdSimulado();
            const mesVisita = Math.min(mesAlta + j, 11);
            const fechaVisita = generarFechaAleatoria(mesVisita);

            visitas[pushIdVisita] = {
                fechaVisita: fechaVisita,
                tipo: "Regular",
                padecimiento: `MOTIVO: Control sintomático periódico ordinario número ${j + 1}.\nSÍNTOMAS: Paciente asintomático estable al momento del examen.`,
                signosVitales: `PESO: ${Math.floor(55 + Math.random() * 35)} kg | TEMP: 36.6 °C\nP.ART: 115/75    | TALLA: 168 cm\nF.R: 16        | F.C: 72`,
                estudios: "Estudios anteriores archivados en el expediente base.",
                diagnostico: `CIE-10: Z00.0 (Consulta preventiva general)\nNOTAS: Continuar monitoreo periódico de control.`,
                tratamiento: "Mantener indicaciones previas, dieta balanceada y estilo de vida activo.",
                pronostico: "Bueno",
                fecha: Date.now() - (5000 * j),
                entorno: "PRUEBAS_V2.1"
            };
        }

        // Mapear al árbol JSON exacto de expedientes
        objetoActualizacionMasiva[`expedientes/${idLimpio}/historiaClinica`] = historiaClinica;
        objetoActualizacionMasiva[`expedientes/${idLimpio}/visitas`] = visitas;
        objetoActualizacionMasiva[`expedientes/${idLimpio}/id`] = idLimpio;
        objetoActualizacionMasiva[`expedientes/${idLimpio}/ultimaModificacion`] = Date.now();
    }

    printLog("📡 Transmitiendo payload masivo a Firebase Realtime Database...", "#00d4ff");

    try {
        await update(ref(db), objetoActualizacionMasiva);
        printLog("✅ ¡Inyección masiva completada con éxito rotundo!", "#39ff14");
        Swal.fire('Carga Exitosa', 'Se han registrado los 400 expedientes distribuidos dinámicamente en el año.', 'success');
    } catch (error) {
        printLog("❌ Error durante la inserción atómica: " + error.message, "#ff0055");
        Swal.fire('Error de Inserción', error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "🚀 Iniciar Carga de 400 Pacientes Simulados";
        }
    }
}

// Enlazar evento del botón al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-ejecutar-carga');
    if (btn) btn.addEventListener('click', ejecutarCargaMasivaPacientes);
});