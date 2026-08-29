// js/app-pruebas.js - Versión 1.6.3 - SGCMED
import { auth, db } from '/js/config.js'; 
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, get, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
const firestore = getFirestore(undefined, "historico-sgcem");
// --- 1. PERSISTENCIA DE SESIÓN ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("🔐 Sesión activa:", user.email);
    } else {
        console.warn("⛔ Usuario no autenticado");
        window.location.href = "login.html";
    }
});

// --- 🔑 PASO 3: FUNCIÓN CORE PARA EXTRAER CONSULTAS DESDE AMBAS BASES DE DATOS ---
async function obtenerDatosVisitaHibrida(pacienteId, visitaId) {
    console.log(`🔍 Buscando visita ${visitaId} para el paciente ${pacienteId}...`);
    
    // 1. Intentar primero en la Base Caliente (Realtime Database)
    try {
        const snapshotCaliente = await get(ref(db, `expedientes/${pacienteId}/visitas/${visitaId}`));
        if (snapshotCaliente.exists()) {
            console.log("🔥 Registro localizado en la Base Caliente (RTDB).");
            return snapshotCaliente.val();
        }
    } catch (err) {
        console.warn("Búsqueda en RTDB omitida o lenta:", err.message);
    }

    // 2. ❄️ Si no está en la caliente, la extraemos del archivo de 5 años en Firestore
    if (navigator.onLine) {
        try {
            console.log("❄️ Visita no encontrada en producción. Interrogando a la base fría de Firestore...");
            const docRef = doc(firestore, "historico_visitas", pacienteId, "visitas_archivadas", visitaId);
            const snapshotFria = await getDoc(docRef);

            if (snapshotFria.exists()) {
                console.log("✅ Registro localizado con éxito en la base de datos de Firestore.");
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'info',
                    title: 'Cargando consulta desde el archivo histórico (Lectura Protegida)',
                    showConfirmButton: false,
                    timer: 4000
                });
                return snapshotFria.data();
            }
        } catch (firestoreErr) {
            console.error("Falla crítica al leer en el archivo histórico:", firestoreErr);
        }
    }

    return null;
}

// --- 2. LÓGICA DE INTERFAZ (UI) ---
function initUI() {
    const buttons = document.querySelectorAll('.collapsible, .collapsible-inner');
    buttons.forEach(btn => {
        btn.onclick = function(e) {
            e.preventDefault();
            this.classList.toggle("active");
            const content = this.nextElementSibling;
            const span = this.querySelector('span');
            if (content.style.display === "block") {
                content.style.display = "none";
                if (span) span.innerText = "+";
            } else {
                content.style.display = "block";
                if (span) span.innerText = "-";
            }
        };
    });

    const fields = [
        { id: 'padecimiento', limit: 400 }, { id: 'receta', limit: 600 },
        { id: 'estudios', limit: 400 }, { id: 'diagnostico', limit: 200 },
        { id: 'tratamiento', limit: 400 }, { id: 'ant_heredofamiliares', limit: 200 },
        { id: 'ant_patologicos', limit: 200 }, { id: 'ant_no_patologicos', limit: 200 },
        { id: 'ant_gineco', limit: 200 }
    ];

    fields.forEach(field => {
        const area = document.getElementById(field.id);
        const counter = document.getElementById(`count-${field.id}`);
        if(!area || !counter) return;
        const updateCount = () => {
            const val = area.value.length;
            counter.innerText = val;
            if (val >= field.limit) counter.parentElement.classList.add('limit-reached');
            else counter.parentElement.classList.remove('limit-reached');
        };
        area.addEventListener('input', updateCount);
        updateCount(); 
    });

    // --- 🔑 MEJORA DE USABILIDAD: SINCRONIZACIÓN Y CÁLCULO AUTOMÁTICO ---
    const fiNombre = document.getElementById('fi_nombre');
    const nombreConsulta = document.getElementById('nombre');
    const fiNacimiento = document.getElementById('fi_nacimiento');
    const edadConsulta = document.getElementById('edad');

    // Función para calcular la edad
    const calcularEdad = (fechaNacimiento) => {
        if (!fechaNacimiento) return "";
        const hoy = new Date();
        // Aseguramos que la fecha se interprete en la zona horaria local
        const [year, month, day] = fechaNacimiento.split('-').map(Number);
        const nacimiento = new Date(year, month - 1, day);

        let edad = hoy.getFullYear() - nacimiento.getFullYear();
        const m = hoy.getMonth() - nacimiento.getMonth();

        if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
            edad--;
        }
        return edad >= 0 ? edad : "";
    };

    // Sincronizar nombre
    if (fiNombre && nombreConsulta) {
        fiNombre.addEventListener('input', () => {
            nombreConsulta.value = fiNombre.value;
        });
    }

    // Calcular y sincronizar edad
    if (fiNacimiento && edadConsulta) {
        fiNacimiento.addEventListener('change', () => {
            edadConsulta.value = calcularEdad(fiNacimiento.value);
        });
    }
}

// --- 3. LIMPIADO DE CAMPOS PARA NUEVA VISITA ---
function limpiarFormularioVisita() {
    document.getElementById('edit-id').value = "";
    window.visitaActualId = null;
    
    document.getElementById('fechaVisita').valueAsDate = new Date();
    document.getElementById('tipo').value = "Regular";

    document.getElementById('padecimiento').value = "MOTIVO: \nSÍNTOMAS: ";
    document.getElementById('receta').value = "PESO:    kg | TEMP:    °C\nP.ART:      | TALLA:   cm\nF.R:        | F.C:       ";
    document.getElementById('estudios').value = "";
    document.getElementById('diagnostico').value = "CIE-10: \nNOTAS: ";
    document.getElementById('tratamiento').value = "MEDICAMENTOS: \n";
    document.getElementById('pronostico').value = "Bueno";

    const event = new Event('input');
    ['padecimiento', 'receta', 'estudios', 'diagnostico', 'tratamiento'].forEach(id => {
        document.getElementById(id)?.dispatchEvent(event);
    });
}

// --- 4. GUARDADO INTEGRAL ---
function initForm() {
    const form = document.getElementById('form-expediente');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-main');
        const pId = document.getElementById('edit-id').value || document.getElementById('nombre').value;
        
        if(!pId) return Swal.fire('Atención', 'Nombre del paciente es obligatorio', 'warning');

        btn.disabled = true;
        btn.innerHTML = '⏳ Guardando...';

        const idLimpio = pId.toLowerCase().trim();
        const vKey = window.visitaActualId || `v_${Date.now()}`;

        const hcData = {
            nombre: document.getElementById('nombre').value || document.getElementById('fi_nombre').value,
            edad: document.getElementById('edad').value,
            fechaFicha: document.getElementById('fi_fecha').value,
            domicilio: document.getElementById('fi_domicilio').value,
            telefono: document.getElementById('fi_telefono').value,
            fechaNacimiento: document.getElementById('fi_nacimiento').value,
            escolaridad: document.getElementById('fi_escolaridad').value,
            ocupacion: document.getElementById('fi_ocupacion').value,
            estadoCivil: document.getElementById('fi_estado_civil').value,
            religion: document.getElementById('fi_religion').value,
            informante: document.getElementById('fi_informante').value,
            parentesco: document.getElementById('fi_parentesco').value,
            heredofamiliares: document.getElementById('ant_heredofamiliares').value,
            patologicos: document.getElementById('ant_patologicos').value,
            noPatologicos: document.getElementById('ant_no_patologicos').value,
            gineco: document.getElementById('ant_gineco').value
        };

        const visitaData = {
            fechaVisita: document.getElementById('fechaVisita').value,
            tipo: document.getElementById('tipo').value,
            padecimiento: document.getElementById('padecimiento').value,
            signosVitales: document.getElementById('receta').value, 
            estudios: document.getElementById('estudios').value,
            diagnostico: document.getElementById('diagnostico').value,
            tratamiento: document.getElementById('tratamiento').value,
            pronostico: document.getElementById('pronostico').value,
            fecha: Date.now()
        };

        let backup = JSON.parse(localStorage.getItem('sgcmed_expedientes_backup') || '{}');
        if (!backup[idLimpio]) backup[idLimpio] = { visitas: {} };
        backup[idLimpio].historiaClinica = hcData;
        backup[idLimpio].id = idLimpio;
        backup[idLimpio].visitas[vKey] = visitaData;
        localStorage.setItem('sgcmed_expedientes_backup', JSON.stringify(backup));

        const updates = {};
        updates[`expedientes/${idLimpio}/historiaClinica`] = hcData;
        updates[`expedientes/${idLimpio}/visitas/${vKey}`] = visitaData;
        updates[`expedientes/${idLimpio}/id`] = idLimpio;
        updates[`expedientes/${idLimpio}/ultimaModificacion`] = serverTimestamp();

        try {
            await update(ref(db), updates);
            Swal.fire('¡Éxito!', 'Expediente y consulta guardados correctamente en la nube.', 'success');
            
            const snap = await get(ref(db, `expedientes/${idLimpio}/visitas`));
            if(snap.exists()) cargarHistorialVisitas(idLimpio, snap.val());
            
        } catch (error) {
            console.error("Error al sincronizar:", error);
            Swal.fire('Guardado Local', 'Datos protegidos localmente en el dispositivo (Modo Offline).', 'info');
        } finally {
            btn.disabled = false;
            btn.innerText = "💾 Guardar Expediente";
        }
    });
}

// --- 5. CARGAR HISTORIAL DE VISITAS ---
function cargarHistorialVisitas(pacienteId, visitas) {
    const contenedor = document.getElementById('expediente-lista');
    if (!contenedor || !visitas) return;
    contenedor.innerHTML = "";

    const ordenadas = Object.keys(visitas).sort((a,b) => new Date(visitas[b].fechaVisita) - new Date(visitas[a].fechaVisita));
    
    ordenadas.forEach(key => {
        const v = visitas[key];
        const item = document.createElement('div');
        item.className = 'visita-item';
        item.innerHTML = `
            <button type="button" class="collapsible-inner">📅 ${v.fechaVisita} - ${v.tipo} <span>+</span></button>
            <div class="content-inner" style="display:none; padding:10px; border:1px solid #eee;">
                <p><strong>Diagnóstico:</strong> ${v.diagnostico || 'N/A'}</p>
                <button type="button" class="btn" style="padding:5px; font-size:0.8rem; background:var(--primary); color:white;" 
                    onclick="window.cargarVisitaEspecifica('${pacienteId}', '${key}')">✏️ Editar esta consulta</button>
            </div>`;
        item.querySelector('.collapsible-inner').onclick = function() {
            this.classList.toggle("active");
            const c = this.nextElementSibling;
            c.style.display = c.style.display === "block" ? "none" : "block";
            this.querySelector('span').innerText = c.style.display === "block" ? "-" : "+";
        };
        contenedor.appendChild(item);
    });
}

window.cargarVisitaEspecifica = function(pacienteId, visitaId) {
    const backup = JSON.parse(localStorage.getItem('sgcmed_expedientes_backup') || '{}');
    const data = backup[pacienteId];
    if (data && data.visitas?.[visitaId]) {
        const v = data.visitas[visitaId];
        document.getElementById('fechaVisita').value = v.fechaVisita || "";
        document.getElementById('tipo').value = v.tipo || "Regular";
        document.getElementById('padecimiento').value = v.padecimiento || "";
        document.getElementById('receta').value = v.signosVitales || ""; 
        document.getElementById('estudios').value = v.estudios || "";
        document.getElementById('diagnostico').value = v.diagnostico || "";
        document.getElementById('tratamiento').value = v.tratamiento || "";
        document.getElementById('pronostico').value = v.pronostico || "Bueno";
        window.visitaActualId = visitaId;
        
        document.getElementById('form-expediente').scrollIntoView({ behavior: 'smooth' });
        
        const event = new Event('input');
        ['padecimiento', 'receta', 'estudios', 'diagnostico', 'tratamiento'].forEach(id => {
            document.getElementById(id)?.dispatchEvent(event);
        });
    }
};

// --- 6. ENGINE DE IMPRESIÓN CON TELEMETRÍA DE DEBUG EN CONSOLA (F12) ---
/*function configurarImpresionRecetaOld() {
    const btnPrint = document.getElementById('btn-imprimir-receta');
    if (!btnPrint) {
        console.error("❌ DEBUG: No se encontró el botón '#btn-imprimir-receta' en el DOM.");
        return;
    }

    btnPrint.addEventListener('click', async () => {
        console.log("🚀 DEBUG: Click detectado en botón de impresión. Iniciando diagnóstico...");

        const nombreVal = document.getElementById('nombre').value.trim();
        const tratamientoVal = document.getElementById('tratamiento').value.trim();
        const diagnosticoRaw = document.getElementById('diagnostico').value.trim();

        // Validaciones preventivas
        if (!nombreVal || !tratamientoVal || !diagnosticoRaw || diagnosticoRaw === "CIE-10: \nNOTAS:") {
            console.warn("⚠️ DEBUG: Validación fallida. Campos obligatorios vacíos.");
            return Swal.fire('Campos Incompletos', 'Asegúrese de llenar Nombre, Diagnóstico y Tratamiento antes de imprimir.', 'warning');
        }

        // --- DIAGNÓSTICO EN VIVO DE LAS RUTAS DE LOGOS ---
        const imgUnamOriginal = "imagenes/logo2.png"; 
        const imgFesiOriginal = "imagenes/logo1.png"; 

        console.log(`🔍 DEBUG [Ruta 1]: Buscando Escudo UNAM en: "${window.location.origin}/${imgUnamOriginal}"`);
        console.log(`🔍 DEBUG [Ruta 2]: Buscando Escudo FESI en: "${window.location.origin}/${imgFesiOriginal}"`);

        // Crear elementos de prueba invisibles para forzar su pre-carga y medir dimensiones reales
        const testImg1 = new Image();
        const testImg2 = new Image();

        testImg1.src = imgUnamOriginal;
        testImg2.src = imgFesiOriginal;

        // Monitorear carga del Escudo UNAM
        testImg1.onload = () => {
            console.log(`✅ DEBUG [Logo 1 UNAM]: ¡Cargado con ÉXITO! Tamaño real: ${testImg1.naturalWidth}x${testImg1.naturalHeight}px`);
        };
        testImg1.onerror = (err) => {
            console.error("❌ DEBUG [Logo 1 UNAM]: Error crítico al cargar el archivo. Posibles causas: El archivo no existe en esa ruta, tiene mal las mayúsculas/minúsculas, o el Service Worker (sw.js) bloqueó la petición.");
        };

        // Monitorear carga del Escudo FESI
        testImg2.onload = () => {
            console.log(`✅ DEBUG [Logo 2 FESI]: ¡Cargado con ÉXITO! Tamaño real: ${testImg2.naturalWidth}x${testImg2.naturalHeight}px`);
        };
        testImg2.onerror = (err) => {
            console.error("❌ DEBUG [Logo 2 FESI]: Error crítico al cargar el archivo. Posibles causas: El archivo no existe en esa ruta, tiene mal las mayúsculas/minúsculas, o el Service Worker (sw.js) bloqueó la petición.");
        };

        const edadVal = document.getElementById('edad').value || "0";
        const fechaVisitaRaw = document.getElementById('fechaVisita').value;
        
        let fechaFormateada = "Fecha no disponible";
        let fechaProximaCita = "A indicación médica";
        if (fechaVisitaRaw) {
            const dateObj = new Date(fechaVisitaRaw + "T00:00:00");
            const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            fechaFormateada = `${dateObj.getDate()} de ${meses[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
            
            const proximaCitaObj = new Date(fechaVisitaRaw + "T00:00:00");
            proximaCitaObj.setMonth(proximaCitaObj.getMonth() + 1);
            fechaProximaCita = `${proximaCitaObj.getDate()} de ${meses[proximaCitaObj.getMonth()]} ${proximaCitaObj.getFullYear()}`;
        }

        const signosRaw = document.getElementById('receta').value;
        const extraerDato = (regex, defaultVal = "N/A") => {
            const match = signosRaw.match(regex);
            return match ? match[1].trim() : defaultVal;
        };

        const peso = extraerDato(/PESO:\s*([^\s|kg]+)/i, "test6");
        const temp = extraerDato(/TEMP:\s*([^\s|°C]+)/i, "test6");
        const part = extraerDato(/P\.ART:\s*([^\s|]+)/i, "test6");
        const talla = extraerDato(/TALLA:\s*([^\s|cm]+)/i, "test6");
        const fr = extraerDato(/F\.R:\s*([^\s|]+)/i, "test6");
        const fc = extraerDato(/F\.C:\s*([^\s|]+)/i, "test6");

        const diagnosticoVal = diagnosticoRaw.replace("CIE-10:", "").replace("NOTAS:", "").trim() || "Sin observaciones específicas.";

        // Generar contenedor interno usando etiquetas IMG nativas estándar
        const printContainer = document.getElementById('print-prescription-container');
        if (!printContainer) {
            console.error("❌ DEBUG: Error fatal. No existe el contenedor '#print-prescription-container' en tu archivo HTML.");
            return;
        }

        printContainer.innerHTML = `
            <div class="rx-header">
                <div style="width: 15%; text-align: left;">
                    <img src="${imgUnamOriginal}" alt="UNAM" style="height: 70px; max-height: 75px; width: auto; object-fit: contain;">
                </div>
                <div style="width: 70%; text-align: center; font-family: 'Georgia', serif; color: #143a60;">
                    <h2 style="margin: 0; font-size: 1.35rem; font-weight: bold; color: #111;">DR. RAUL ALBERTO VILLALOBOS HERNÁNDEZ</h2>
                    <p style="margin: 3px 0 0 0; font-size: 0.85rem; font-weight: bold; font-style: italic;">Médico Cirujano</p>
                    <p style="margin: 1px 0 0 0; font-size: 0.8rem; font-weight: 500; color: #333;">Universidad Nacional Autónoma de México</p>
                    <p style="margin: 2px 0 0 0; font-size: 0.8rem; font-weight: bold; color: #000;">CED. PROF. 9678858</p>
                </div>
                <div style="width: 15%; text-align: right;">
                    <img src="${imgFesiOriginal}" alt="FESI UNAM" style="height: 52px; max-height: 55px; width: auto; object-fit: contain;">
                </div>
            </div>
            <div class="rx-twin-blocks">
                <div class="rx-box-container">
                    <div class="rx-box-title">Datos del Paciente</div>
                    <div class="rx-box-body">
                        <strong>PACIENTE:</strong> ${nombreVal}<br>
                        <strong>EDAD:</strong> ${edadVal} años <span style="float: right;"><strong>FECHA:</strong> ${fechaFormateada}</span><br>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; margin-top:5px; border-top: 1px dashed #ddd; padding-top: 4px;">
                            <div><strong>PESO:</strong> ${peso} kg</div>
                            <div><strong>TALLA:</strong> ${talla} cm</div>
                            <div><strong>TEMP:</strong> ${temp} °C</div>
                            <div><strong>F.C.:</strong> ${fc}</div>
                            <div><strong>F.R.:</strong> ${fr}</div>
                            <div><strong>P.A.:</strong> ${part}</div>
                        </div>
                    </div>
                </div>
                <div class="rx-box-container">
                    <div class="rx-box-title">Diagnóstico Médico</div>
                    <div class="rx-box-body">${diagnosticoVal.replace(/\n/g, '<br>')}</div>
                </div>
            </div>
            <div class="rx-box-container" style="margin-bottom: 10px;">
                <div class="rx-box-title">Receta y Prescripción</div>
                <div style="background-color: #f2f2f2; text-align:center; font-weight:bold; font-size:0.75rem; padding:3px; border-bottom:1.5px solid #000000; text-transform:uppercase;">
                    Indicaciones Médicas
                </div>
                <table class="rx-prescription-table">
                    <thead>
                        <tr>
                            <th class="rx-border-right" style="width: 55%;">Medicamento / Dosis / Frecuencia / Duración</th>
                            <th style="width: 45%;">Indicaciones Adicionales y Recomendaciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="rx-border-right" style="white-space: pre-line;">${tratamientoVal}</td>
                            <td style="color:#333333;">
                                - Dieta equilibrada e hidratación constante.<br>
                                - Evitar suspender el tratamiento antes del tiempo indicado.<br>
                                - En caso de presentar efectos adversos, comunicarse de inmediato.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <!--div class="rx-box-container" style="width: 40%; margin-bottom: 12px;">
                <div class="rx-box-body" style="padding: 4px 8px; font-size: 0.8rem;">
                    <strong>PRÓXIMA CITA:</strong> ${fechaProximaCita}
                </div>
            </div-->
            <div class="rx-footer-area">
                <div class="rx-signature-line"></div>
                <div class="rx-signature-caption">
                    <strong>DR. RAUL ALBERTO VILLALOBOS HERNÁNDEZ</strong><br>
                    Médico Cirujano - Cel:55-6785-6651
                </div>
            </div>
            <div class="rx-slogan-bottom">
                SGCmed - Soluciones Integrales de Salud | UNAM - Facultad de Medicina - FES Iztacala
            </div>
        `;

        console.log("⚡ DEBUG: HTML inyectado en el nodo oculto. Disparando ventana de impresión native...");
        
        // Retraso controlado de 250ms para permitir que las promesas de carga del hilo de imágenes finalicen antes de congelar la ventana
        setTimeout(() => {
            window.print();
        }, 250);
    });
}

function configurarImpresionReceta() {
    const btnPrint = document.getElementById('btn-imprimir-receta');
    if (!btnPrint) {
        console.error("❌ DEBUG: No se encontró el botón '#btn-imprimir-receta' en el DOM.");
        return;
    }

    btnPrint.addEventListener('click', async () => {
        console.log("🚀 DEBUG: Click detectado en botón de impresión. Iniciando diagnóstico...");

        const nombreVal = document.getElementById('nombre').value.trim();
        const tratamientoVal = document.getElementById('tratamiento').value.trim();
        const diagnosticoRaw = document.getElementById('diagnostico').value.trim();

        // Validaciones preventivas
        if (!nombreVal || !tratamientoVal || !diagnosticoRaw || diagnosticoRaw === "CIE-10: \nNOTAS:") {
            console.warn("⚠️ DEBUG: Validación fallida. Campos obligatorios vacíos.");
            return Swal.fire('Campos Incompletos', 'Asegúrese de llenar Nombre, Diagnóstico y Tratamiento antes de imprimir.', 'warning');
        }

        // --- DIAGNÓSTICO EN VIVO DE LAS RUTAS DE LOGOS ---
        const imgUnamOriginal = "imagenes/logo2.png"; 
        const imgFesiOriginal = "imagenes/logo1.png"; 

        console.log(`🔍 DEBUG [Ruta 1]: Buscando Escudo UNAM en: "${window.location.origin}/${imgUnamOriginal}"`);
        console.log(`🔍 DEBUG [Ruta 2]: Buscando Escudo FESI en: "${window.location.origin}/${imgFesiOriginal}"`);

        // Crear elementos de prueba invisibles para forzar su pre-carga y medir dimensiones reales
        const testImg1 = new Image();
        const testImg2 = new Image();

        testImg1.src = imgUnamOriginal;
        testImg2.src = imgFesiOriginal;

        // Monitorear carga del Escudo UNAM
        testImg1.onload = () => {
            console.log(`✅ DEBUG [Logo 1 UNAM]: ¡Cargado con ÉXITO! Tamaño real: ${testImg1.naturalWidth}x${testImg1.naturalHeight}px`);
        };
        testImg1.onerror = (err) => {
            console.error("❌ DEBUG [Logo 1 UNAM]: Error crítico al cargar el archivo. Posibles causas: El archivo no existe en esa ruta, tiene mal las mayúsculas/minúsculas, o el Service Worker (sw.js) bloqueó la petición.");
        };

        // Monitorear carga del Escudo FESI
        testImg2.onload = () => {
            console.log(`✅ DEBUG [Logo 2 FESI]: ¡Cargado con ÉXITO! Tamaño real: ${testImg2.naturalWidth}x${testImg2.naturalHeight}px`);
        };
        testImg2.onerror = (err) => {
            console.error("❌ DEBUG [Logo 2 FESI]: Error crítico al cargar el archivo. Posibles causas: El archivo no existe en esa ruta, tiene mal las mayúsculas/minúsculas, o el Service Worker (sw.js) bloqueó la petición.");
        };

        const edadVal = document.getElementById('edad').value || "0";
        const fechaVisitaRaw = document.getElementById('fechaVisita').value;
        
        let fechaFormateada = "Fecha no disponible";
        let fechaProximaCita = "A indicación médica";
        if (fechaVisitaRaw) {
            const dateObj = new Date(fechaVisitaRaw + "T00:00:00");
            const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            fechaFormateada = `${dateObj.getDate()} de ${meses[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
            
            const proximaCitaObj = new Date(fechaVisitaRaw + "T00:00:00");
            proximaCitaObj.setMonth(proximaCitaObj.getMonth() + 1);
            fechaProximaCita = `${proximaCitaObj.getDate()} de ${meses[proximaCitaObj.getMonth()]} ${proximaCitaObj.getFullYear()}`;
        }

        const signosRaw = document.getElementById('receta').value;
        const extraerDato = (regex, defaultVal = "N/A") => {
            const match = signosRaw.match(regex);
            return match ? match[1].trim() : defaultVal;
        };

        const peso = extraerDato(/PESO:\s*([^\s|kg]+)/i, "test6");
        const temp = extraerDato(/TEMP:\s*([^\s|°C]+)/i, "test6");
        const part = extraerDato(/P\.ART:\s*([^\s|]+)/i, "test6");
        const talla = extraerDato(/TALLA:\s*([^\s|cm]+)/i, "test6");
        const fr = extraerDato(/F\.R:\s*([^\s|]+)/i, "test6");
        const fc = extraerDato(/F\.C:\s*([^\s|]+)/i, "test6");

        const diagnosticoVal = diagnosticoRaw.replace("CIE-10:", "").replace("NOTAS:", "").trim() || "Sin observaciones específicas.";

        // Generar contenedor interno usando etiquetas IMG nativas estándar
        const printContainer = document.getElementById('print-prescription-container');
        if (!printContainer) {
            console.error("❌ DEBUG: Error fatal. No existe el contenedor '#print-prescription-container' en tu archivo HTML.");
            return;
        }

        printContainer.innerHTML = `
            <div class="rx-header">
                <div style="width: 15%; text-align: left;">
                    <img src="${imgUnamOriginal}" alt="UNAM" style="height: 70px; max-height: 75px; width: auto; object-fit: contain;">
                </div>
                <div style="width: 70%; text-align: center; font-family: 'Georgia', serif; color: #143a60;">
                    <h2 style="margin: 0; font-size: 1.35rem; font-weight: bold; color: #111;">DR. RAUL ALBERTO VILLALOBOS HERNÁNDEZ</h2>
                    <p style="margin: 3px 0 0 0; font-size: 0.85rem; font-weight: bold; font-style: italic;">Médico Cirujano</p>
                    <p style="margin: 1px 0 0 0; font-size: 0.8rem; font-weight: 500; color: #333;">Universidad Nacional Autónoma de México</p>
                    <p style="margin: 2px 0 0 0; font-size: 0.8rem; font-weight: bold; color: #000;">CED. PROF. 9678858</p>
                </div>
                <div style="width: 15%; text-align: right;">
                    <img src="${imgFesiOriginal}" alt="FESI UNAM" style="height: 52px; max-height: 55px; width: auto; object-fit: contain;">
                </div>
            </div>
            <div class="rx-twin-blocks">
                <div class="rx-box-container">
                    <div class="rx-box-title">Datos del Paciente</div>
                    <div class="rx-box-body">
                        <strong>PACIENTE:</strong> ${nombreVal}<br>
                        <strong>EDAD:</strong> ${edadVal} años <span style="float: right;"><strong>FECHA:</strong> ${fechaFormateada}</span><br>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; margin-top:5px; border-top: 1px dashed #ddd; padding-top: 4px;">
                            <div><strong>PESO:</strong> ${peso} kg</div>
                            <div><strong>TALLA:</strong> ${talla} cm</div>
                            <div><strong>TEMP:</strong> ${temp} °C</div>
                            <div><strong>F.C.:</strong> ${fc}</div>
                            <div><strong>F.R.:</strong> ${fr}</div>
                            <div><strong>P.A.:</strong> ${part}</div>
                        </div>
                    </div>
                </div>
                <div class="rx-box-container">
                    <div class="rx-box-title">Diagnóstico Médico</div>
                    <div class="rx-box-body">${diagnosticoVal.replace(/\n/g, '<br>')}</div>
                </div>
            </div>
            <div class="rx-box-container" style="margin-bottom: 10px;">
                <div class="rx-box-title">Receta y Prescripción</div>
                <div style="background-color: #f2f2f2; text-align:center; font-weight:bold; font-size:0.75rem; padding:3px; border-bottom:1.5px solid #000000; text-transform:uppercase;">
                    Indicaciones Médicas
                </div>
                <table class="rx-prescription-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="width: 100%; text-align: left; padding: 6px 10px; background: #f8fafc; border-bottom: 1px solid #ddd;">Medicamento / Dosis / Frecuencia / Duración</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="white-space: pre-line; padding: 10px; min-height: 80px; vertical-align: top;">${tratamientoVal}</td>
                        </tr>
                        <tr>
                            <th style="width: 100%; text-align: left; padding: 6px 10px; background: #f8fafc; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd;">Indicaciones Adicionales y Recomendaciones</th>
                        </tr>
                        <tr>
                            <td style="color:#333333; padding: 10px; vertical-align: top;">
                                - Dieta equilibrada e hidratación constante.<br>
                                - Evitar suspender el tratamiento antes del tiempo indicado.<br>
                                - En caso de presentar efectos adversos, comunicarse de inmediato.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="rx-box-container" style="width: 40%; margin-bottom: 12px;">
                <div class="rx-box-body" style="padding: 4px 8px; font-size: 0.8rem;">
                    <strong>PRÓXIMA CITA:</strong> ${fechaProximaCita}
                </div>
            </div>
            <div class="rx-footer-area">
                <div class="rx-signature-line"></div>
                <div class="rx-signature-caption">
                    <strong>DR. RAUL ALBERTO VILLALOBOS HERNÁNDEZ</strong><br>
                    Médico Cirujano - Cel:55-6785-6651
                </div>
            </div>
            <div class="rx-slogan-bottom">
                SGCmed - Soluciones Integrales de Salud | UNAM - Facultad de Medicina - FES Iztacala
            </div>
        `;

        console.log("⚡ DEBUG: HTML inyectado en el nodo oculto. Disparando ventana de impresión native...");
        
        // Retraso controlado de 250ms para permitir que las promesas de carga del hilo de imágenes finalicen antes de congelar la ventana
        setTimeout(() => {
            window.print();
        }, 250);
    });
}*/

function configurarImpresionReceta() {
    const btnPrint = document.getElementById('btn-imprimir-receta');
    if (!btnPrint) {
        console.error("❌ DEBUG: No se encontró el botón '#btn-imprimir-receta' en el DOM.");
        return;
    }

    btnPrint.addEventListener('click', async () => {
        console.log("🚀 DEBUG: Click detectado en botón de impresión. Iniciando diagnóstico...");

        const nombreVal = document.getElementById('nombre').value.trim();
        const tratamientoRaw = document.getElementById('tratamiento').value.trim();
        const diagnosticoRaw = document.getElementById('diagnostico').value.trim();

        if (!nombreVal || !tratamientoRaw || !diagnosticoRaw || diagnosticoRaw === "CIE-10: \nNOTAS:") {
            console.warn("⚠️ DEBUG: Validación fallida. Campos obligatorios vacíos.");
            return Swal.fire('Campos Incompletos', 'Asegúrese de llenar Nombre, Diagnóstico y Tratamiento antes de imprimir.', 'warning');
        }

        const imgUnamOriginal = "imagenes/logo2.png"; 
        const imgFesiOriginal = "imagenes/logo1.png"; 

        const edadVal = document.getElementById('edad').value || "0";
        const fechaVisitaRaw = document.getElementById('fechaVisita').value;
        
        let fechaFormateada = "Fecha no disponible";
        let fechaProximaCita = "A indicación médica";
        if (fechaVisitaRaw) {
            const dateObj = new Date(fechaVisitaRaw + "T00:00:00");
            const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            fechaFormateada = `${dateObj.getDate()} de ${meses[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
            
            const proximaCitaObj = new Date(fechaVisitaRaw + "T00:00:00");
            proximaCitaObj.setMonth(proximaCitaObj.getMonth() + 1);
            fechaProximaCita = `${proximaCitaObj.getDate()} de ${meses[proximaCitaObj.getMonth()]} ${proximaCitaObj.getFullYear()}`;
        }

        const signosRaw = document.getElementById('receta').value;
        const extraerDato = (regex, defaultVal = "N/A") => {
            const match = signosRaw.match(regex);
            return match ? match[1].trim() : defaultVal;
        };

        const peso = extraerDato(/PESO:\s*([^\s|kg]+)/i, "test6");
        const temp = extraerDato(/TEMP:\s*([^\s|°C]+)/i, "test6");
        const part = extraerDato(/P\.ART:\s*([^\s|]+)/i, "test6");
        const talla = extraerDato(/TALLA:\s*([^\s|cm]+)/i, "test6");
        const fr = extraerDato(/F\.R:\s*([^\s|]+)/i, "test6");
        const fc = extraerDato(/F\.C:\s*([^\s|]+)/i, "test6");

        // 1. Extraer CIE-10 para el diagnóstico
        const cie10Match = diagnosticoRaw.match(/CIE-10:\s*([\s\S]*?)(?=NOTAS:|$)/i);
        const diagnosticoVal = cie10Match ? cie10Match[1].trim() : "Sin diagnóstico específico.";

        // 2. Extraer Notas para las indicaciones adicionales
        const notasMatch = diagnosticoRaw.match(/NOTAS:\s*([\s\S]*?)$/i);
        const indicacionesAdicionales = notasMatch ? notasMatch[1].trim() : "Sin indicaciones adicionales.";

        // 3. El contenido de "tratamiento" va a medicamentos
        const medicamentosVal = tratamientoRaw || "Según indicaciones.";

        const printContainer = document.getElementById('print-prescription-container');
        if (!printContainer) {
            console.error("❌ DEBUG: Error fatal. No existe el contenedor '#print-prescription-container' en tu archivo HTML.");
            return;
        }

        printContainer.innerHTML = `
            <div class="rx-header">
                <div style="width: 15%; text-align: left;">
                    <img src="${imgUnamOriginal}" alt="UNAM" style="height: 70px; max-height: 75px; width: auto; object-fit: contain;">
                </div>
                <div style="width: 70%; text-align: center; font-family: 'Georgia', serif; color: #143a60;">
                    <h2 style="margin: 0; font-size: 1.35rem; font-weight: bold; color: #111;">DR. RAUL ALBERTO VILLALOBOS HERNÁNDEZ</h2>
                    <p style="margin: 3px 0 0 0; font-size: 0.85rem; font-weight: bold; font-style: italic;">Médico Cirujano</p>
                    <p style="margin: 1px 0 0 0; font-size: 0.8rem; font-weight: 500; color: #333;">Universidad Nacional Autónoma de México</p>
                    <p style="margin: 2px 0 0 0; font-size: 0.8rem; font-weight: bold; color: #000;">CED. PROF. 9678858</p>
                </div>
                <div style="width: 15%; text-align: right;">
                    <img src="${imgFesiOriginal}" alt="FESI UNAM" style="height: 52px; max-height: 55px; width: auto; object-fit: contain;">
                </div>
            </div>
            <div class="rx-twin-blocks">
                <div class="rx-box-container">
                    <div class="rx-box-title">Datos del Paciente</div>
                    <div class="rx-box-body">
                        <strong>PACIENTE:</strong> ${nombreVal}<br>
                        <strong>EDAD:</strong> ${edadVal} años <span style="float: right;"><strong>FECHA:</strong> ${fechaFormateada}</span><br>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; margin-top:5px; border-top: 1px dashed #ddd; padding-top: 4px;">
                            <div><strong>PESO:</strong> ${peso} kg</div>
                            <div><strong>TALLA:</strong> ${talla} cm</div>
                            <div><strong>TEMP:</strong> ${temp} °C</div>
                            <div><strong>F.C.:</strong> ${fc}</div>
                            <div><strong>F.R.:</strong> ${fr}</div>
                            <div><strong>P.A.:</strong> ${part}</div>
                        </div>
                    </div>
                </div>
                <div class="rx-box-container">
                    <div class="rx-box-title">Diagnóstico Médico</div>
                    <div class="rx-box-body">${diagnosticoVal.replace(/\n/g, '<br>')}</div>
                </div>
            </div>
            <div class="rx-box-container" style="margin-bottom: 10px;">
                <div class="rx-box-title">Receta y Prescripción</div>
                <div style="background-color: #f2f2f2; text-align:center; font-weight:bold; font-size:0.75rem; padding:3px; border-bottom:1.5px solid #000000; text-transform:uppercase;">
                    Indicaciones Médicas
                </div>
                <table class="rx-prescription-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="width: 100%; text-align: left; padding: 6px 10px; background: #f8fafc; border-bottom: 1px solid #ddd;">Medicamento / Dosis / Frecuencia / Duración</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="white-space: pre-line; padding: 10px; min-height: 80px; vertical-align: top;">${medicamentosVal}</td>
                        </tr>
                        <tr>
                            <th style="width: 100%; text-align: left; padding: 6px 10px; background: #f8fafc; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd;">Indicaciones Adicionales y Recomendaciones</th>
                        </tr>
                        <tr>
                            <td style="white-space: pre-line; padding: 10px; vertical-align: top; color: #333333;">${indicacionesAdicionales}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <!--div class="rx-box-container" style="width: 40%; margin-bottom: 12px;">
                <div class="rx-box-body" style="padding: 4px 8px; font-size: 0.8rem;">
                    <strong>PRÓXIMA CITA:</strong> ${fechaProximaCita}
                </div>
            </div-->
            <div class="rx-footer-area">
                <div class="rx-signature-line"></div>
                <div class="rx-signature-caption">
                    <strong>DR. RAUL ALBERTO VILLALOBOS HERNÁNDEZ</strong><br>
                    Médico Cirujano - Cel:55-6785-6651
                </div>
            </div>
            <div class="rx-slogan-bottom">
                SGCmed - Soluciones Integrales de Salud | UNAM - Facultad de Medicina - FES Iztacala
            </div>
            <div class="rx-slogan-bottom">
                Avenida Juaréz s/n, San Jerónimo Xonacahuacan, Técamac, Estado de México.
            </div>            
        `;

        console.log("⚡ DEBUG: HTML inyectado en el nodo oculto. Disparando ventana de impresión native...");
        setTimeout(() => { window.print(); }, 250);
    });
}

function configurarImpresionExpediente(datosPaciente = {}) {
    const btnPrintExp = document.getElementById('btn-imprimir-expediente');
    if (!btnPrintExp) return;

    // Removemos listeners anteriores clonando el botón para evitar duplicidad de eventos
    const nuevoBtn = btnPrintExp.cloneNode(true);
    btnPrintExp.parentNode.replaceChild(nuevoBtn, btnPrintExp);

    nuevoBtn.addEventListener('click', () => {
        console.log("🚀 [LOG] Iniciando impresión de Expediente Clínico...");

        // 1. Extraer datos de la Ficha de Identificación
        const hc = datosPaciente.historiaClinica || {};
        const nombre = hc.nombre || document.getElementById('fi_nombre')?.value || document.getElementById('nombre')?.value || "No especificado";
        const edad = hc.edad || document.getElementById('edad')?.value || "N/A";
        const fechaNac = hc.fechaNacimiento || document.getElementById('fi_nacimiento')?.value || "N/A";
        const domicilio = hc.domicilio || document.getElementById('fi_domicilio')?.value || "N/A";
        const telefono = hc.telefono || document.getElementById('fi_telefono')?.value || "N/A";
        const ocupacion = hc.ocupacion || document.getElementById('fi_ocupacion')?.value || "N/A";
        const estadoCivil = hc.estadoCivil || document.getElementById('fi_estado_civil')?.value || "N/A";

        // 2. Extraer Antecedentes
        const heredofamiliares = hc.heredofamiliares || document.getElementById('ant_heredofamiliares')?.value || "Sin registros.";
        const patologicos = hc.patologicos || document.getElementById('ant_patologicos')?.value || "Sin registros.";
        const noPatologicos = hc.noPatologicos || document.getElementById('ant_no_patologicos')?.value || "Sin registros.";
        const gineco = hc.gineco || document.getElementById('ant_gineco')?.value || "N/A / No aplicable.";

        // 3. Procesar el objeto de visitas
        const visitasObj = datosPaciente.visitas || {};
        let todasLasConsultas = Object.values(visitasObj);

        // Ordenar consultas por fecha (de más antigua a más reciente)
        todasLasConsultas.sort((a, b) => new Date(a.fechaVisita || a.fecha || 0) - new Date(b.fechaVisita || b.fecha || 0));

        // Respaldo por si el objeto de visitas está vacío pero hay texto actual en pantalla
        const padecimientoActual = document.getElementById('padecimiento')?.value || "";
        const diagnosticoActual = document.getElementById('diagnostico')?.value || "";
        const tratamientoActual = document.getElementById('tratamiento')?.value || "";

        if (todasLasConsultas.length === 0 && (padecimientoActual || diagnosticoActual || tratamientoActual)) {
            todasLasConsultas.push({
                fechaVisita: document.getElementById('fechaVisita')?.value || new Date().toISOString().split('T')[0],
                padecimiento: padecimientoActual,
                diagnostico: diagnosticoActual,
                tratamiento: tratamientoActual
            });
        }

        // Generar HTML de las consultas iteradas
        let htmlConsultas = "";
        if (todasLasConsultas.length > 0) {
            htmlConsultas = todasLasConsultas.map((c, index) => {
                const fechaVisitaFinal = c.fechaVisita || (c.fecha ? new Date(c.fecha).toISOString().split('T')[0] : 'N/A');
                return `
                    <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #ddd; page-break-inside: avoid;">
                        <p style="margin: 2px 0; color: #143a60; font-weight: bold;">Consulta #${index + 1} — Fecha: ${fechaVisitaFinal} (${c.tipo || 'Regular'})</p>
                        <p style="margin: 4px 0 2px 0;"><strong>Padecimiento:</strong><br>${(c.padecimiento || 'Sin registrar').replace(/\n/g, '<br>')}</p>
                        <p style="margin: 4px 0 2px 0;"><strong>Diagnóstico:</strong><br>${(c.diagnostico || 'Sin registrar').replace(/\n/g, '<br>')}</p>
                        <p style="margin: 4px 0 2px 0;"><strong>Tratamiento / Plan:</strong><br>${(c.tratamiento || c.signosVitales || 'Sin registrar').replace(/\n/g, '<br>')}</p>
                    </div>
                `;
            }).join('');
        } else {
            htmlConsultas = `<p style="margin: 2px 0; font-style: italic;">Sin consultas registradas en este expediente.</p>`;
        }

        const imgUnam = "imagenes/logo2.png"; 
        const imgFesi = "imagenes/logo1.png"; 

        const printContainer = document.getElementById('print-prescription-container');
        if (!printContainer) return;

        printContainer.innerHTML = `
            <div class="rx-header">
                <div style="width: 15%; text-align: left;">
                    <img src="${imgUnam}" alt="UNAM" style="height: 70px; object-fit: contain;">
                </div>
                <div style="width: 70%; text-align: center; font-family: 'Georgia', serif; color: #143a60;">
                    <h2 style="margin: 0; font-size: 1.2rem; font-weight: bold; color: #111;">EXPEDIENTE CLÍNICO INTEGRAL</h2>
                    <p style="margin: 3px 0 0 0; font-size: 0.85rem; font-weight: bold;">DR. RAUL ALBERTO VILLALOBOS HERNÁNDEZ</p>
                    <p style="margin: 1px 0 0 0; font-size: 0.75rem; color: #333;">SGCmed - Sistema de Gestión de Consultorio Médico</p>
                </div>
                <div style="width: 15%; text-align: right;">
                    <img src="${imgFesi}" alt="FESI" style="height: 52px; object-fit: contain;">
                </div>
            </div>

            <div class="rx-box-container" style="margin-top: 15px;">
                <div class="rx-box-title">I. Ficha de Identificación</div>
                <div class="rx-box-body" style="font-size: 0.85rem; line-height: 1.4;">
                    <strong>NOMBRE:</strong> ${nombre.toUpperCase()}<br>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; margin-top: 4px;">
                        <div><strong>EDAD:</strong> ${edad} años</div>
                        <div><strong>NACIMIENTO:</strong> ${fechaNac}</div>
                        <div><strong>TELÉFONO:</strong> ${telefono}</div>
                    </div>
                    <div style="display: grid; grid-template-columns: 2fr 1fr; margin-top: 4px;">
                        <div><strong>DOMICILIO:</strong> ${domicilio}</div>
                        <div><strong>ESTADO CIVIL:</strong> ${estadoCivil}</div>
                    </div>
                    <div style="margin-top: 4px;"><strong>OCUPACIÓN:</strong> ${ocupacion}</div>
                </div>
            </div>

            <div class="rx-box-container">
                <div class="rx-box-title">II. Antecedentes Clínicos (Permanentes)</div>
                <div class="rx-box-body" style="font-size: 0.85rem; line-height: 1.4;">
                    <p style="margin: 2px 0;"><strong>Heredofamiliares:</strong><br>${heredofamiliares.replace(/\n/g, '<br>')}</p>
                    <p style="margin: 6px 0 2px 0;"><strong>Personales Patológicos:</strong><br>${patologicos.replace(/\n/g, '<br>')}</p>
                    <p style="margin: 6px 0 2px 0;"><strong>Personales No Patológicos:</strong><br>${noPatologicos.replace(/\n/g, '<br>')}</p>
                    <p style="margin: 6px 0 2px 0;"><strong>Ginecoobstétricos:</strong><br>${gineco.replace(/\n/g, '<br>')}</p>
                </div>
            </div>

            <div class="rx-box-container">
                <div class="rx-box-title">III. Historial de Consultas Médicas (${todasLasConsultas.length})</div>
                <div class="rx-box-body" style="font-size: 0.85rem; line-height: 1.4;">
                    ${htmlConsultas}
                </div>
            </div>

            <div class="rx-footer-area" style="margin-top: 30px;">
                <div class="rx-signature-line"></div>
                <div class="rx-signature-caption">
                    <strong>DR. RAUL ALBERTO VILLALOBOS HERNÁNDEZ</strong><br>
                    Firma del Médico Tratante
                </div>
            </div>
        `;

        setTimeout(() => { window.print(); }, 250);
    });
}

// --- 🔑 FUNCIÓN RENDERIZAR DATOS CON ADAPTACIÓN HÍBRIDA ASÍNCRONA (RTDB + FIRESTORE) ---
async function renderizarDatos(data, idLimpio, modo, vIdUrl) {
    const hc = data.historiaClinica || {};
    if(document.getElementById('edit-id')) document.getElementById('edit-id').value = idLimpio;
    if(document.getElementById('nombre')) document.getElementById('nombre').value = hc.nombre || idLimpio;
    if(document.getElementById('fi_nombre')) document.getElementById('fi_nombre').value = hc.nombre || idLimpio;
    if(document.getElementById('edad')) document.getElementById('edad').value = hc.edad || "";
    if(document.getElementById('fi_fecha')) document.getElementById('fi_fecha').value = hc.fechaFicha || "";
    if(document.getElementById('fi_domicilio')) document.getElementById('fi_domicilio').value = hc.domicilio || "";
    if(document.getElementById('fi_telefono')) document.getElementById('fi_telefono').value = hc.telefono || "";
    if(document.getElementById('fi_nacimiento')) document.getElementById('fi_nacimiento').value = hc.fechaNacimiento || "";
    if(document.getElementById('fi_escolaridad')) document.getElementById('fi_escolaridad').value = hc.escolaridad || "";
    if(document.getElementById('fi_ocupacion')) document.getElementById('fi_ocupacion').value = hc.ocupacion || "";
    if(document.getElementById('fi_estado_civil')) document.getElementById('fi_estado_civil').value = hc.estadoCivil || "Soltero";
    if(document.getElementById('fi_religion')) document.getElementById('fi_religion').value = hc.religion || "";
    if(document.getElementById('fi_informante')) document.getElementById('fi_informante').value = hc.informante || "";
    if(document.getElementById('fi_parentesco')) document.getElementById('fi_parentesco').value = hc.parentesco || "";
    
    document.getElementById('ant_heredofamiliares').value = hc.heredofamiliares || "";
    document.getElementById('ant_patologicos').value = hc.patologicos || "";
    document.getElementById('ant_no_patologicos').value = hc.noPatologicos || "";
    document.getElementById('ant_gineco').value = hc.gineco || "";

    if (data.visitas) cargarHistorialVisitas(idLimpio, data.visitas);

    // --- 🔑 INTERSECCIÓN HÍBRIDA: CARGA DE LA VISITA SOLICITADA ---
    if (modo === 'editar' && vIdUrl) {
        let v = null;

        // 1. Intentar primero con la base caliente local (Realtime Database)
        if (data.visitas?.[vIdUrl]) {
            console.log("🔥 Visita localizada en la Base Caliente (RTDB).");
            v = data.visitas[vIdUrl];
        } 
        // 2. ❄️ Si no está ahí, interrogar a la base fría (Firestore) apuntando a tu ID nativo
        else if (navigator.onLine) {
            try {
                console.log("❄️ Visita no encontrada en producción. Rastreando en la base fría 'historico-sgcem'...");
                const docRef = doc(firestore, "historico_visitas", idLimpio, "visitas_archivadas", vIdUrl);
                const snapshotFria = await getDoc(docRef);

                if (snapshotFria.exists()) {
                    console.log("✅ Registro recuperado con éxito desde Firestore.");
                    v = snapshotFria.data();
                    
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'info',
                        title: 'Modo Histórico: Datos extraídos del archivo de 5 años.',
                        showConfirmButton: false,
                        timer: 3500
                    });
                }
            } catch (firestoreErr) {
                console.error("Falla crítica al leer en Firestore:", firestoreErr);
            }
        }

        // 3. Si se localizó el objeto en cualquiera de las dos bases, pintamos sus campos
        if (v) {
            document.getElementById('fechaVisita').value = v.fechaVisita || "";
            document.getElementById('tipo').value = v.tipo || "Regular";
            document.getElementById('padecimiento').value = v.padecimiento || "";
            document.getElementById('receta').value = v.signosVitales || v.receta || ""; // Respaldo cruzado por compatibilidad
            document.getElementById('estudios').value = v.estudios || "";
            document.getElementById('diagnostico').value = v.diagnostico || "";
            document.getElementById('tratamiento').value = v.tratamiento || "";
            document.getElementById('pronostico').value = v.pronostico || "Bueno";
            window.visitaActualId = vIdUrl;
        } else {
            Swal.fire('No encontrado', 'El identificador de la consulta no existe en el registro actual ni en el archivo muerto.', 'error');
            document.getElementById('fechaVisita').valueAsDate = new Date();
        }
    } else {
        // Comportamiento ordinario si es una consulta de primera vez o limpia
        document.getElementById('fechaVisita').valueAsDate = new Date();
    }

    // Disparador de eventos input para recalcular textareas dinámicos si usas auto-expand
    const event = new Event('input');
    ['padecimiento', 'receta', 'estudios', 'diagnostico', 'tratamiento', 'ant_heredofamiliares', 'ant_patologicos', 'ant_no_patologicos', 'ant_gineco'].forEach(id => {
        document.getElementById(id)?.dispatchEvent(event);
    });
    configurarImpresionExpediente(data);
}

// --- 7. VERIFICAR EDICIÓN GENERAL ---
async function verificarEdicion() {
    const params = new URLSearchParams(window.location.search);
    const idUrl = params.get('id');
    const modo = params.get('modo');
    const vIdUrl = params.get('visitaId');

    if (!idUrl) {
        limpiarFormularioVisita();
        // 🔑 Como no hay ID en la URL, es un paciente completamente nuevo
        reordenarSeccionesFormulario('nuevo_expediente');
        return;
    }
    
    const idLimpio = idUrl.toLowerCase().trim();
    const backup = JSON.parse(localStorage.getItem('sgcmed_expedientes_backup') || '{}');
    let data = backup[idLimpio];

    if (data) {
        // 🔑 Si hay ID, es edición o nueva consulta, se asegura el orden con consulta primero
        reordenarSeccionesFormulario('consulta_primero');
        await renderizarDatos(data, idLimpio, modo, vIdUrl);
    }

    if (navigator.onLine) {
        try {
            const snap = await get(ref(db, `expedientes/${idLimpio}`));
            if (snap.exists()) {
                const newData = snap.val();
                reordenarSeccionesFormulario('consulta_primero'); // Reasegura el flujo visual online
                await renderizarDatos(newData, idLimpio, modo, vIdUrl);
                backup[idLimpio] = newData;
                localStorage.setItem('sgcmed_expedientes_backup', JSON.stringify(backup));
            }
        } catch(e) { console.warn("Modo offline o retraso de red al sincronizar lectura."); }
    }
}

// --- 🔑 FUNCIÓN PARA INTERCAMBIAR EL ORDEN Y EXPANDIR/COLAPSAR SECCIONES ---
function reordenarSeccionesFormulario(modo) {
    const contenedor = document.getElementById('contenedor-secciones');
    if (!contenedor) return;

    const macroSecciones = contenedor.querySelectorAll('.macro-section');
    if (macroSecciones.length < 2) return;

    const seccionConsulta = macroSecciones[0]; // Consulta Actual
    const seccionHistoria = macroSecciones[1]; // Historia Clínica

    // Localizamos los contenedores de contenido colapsable internos de cada sección
    const contenidoConsulta = seccionConsulta.querySelector('.content');
    const contenidoHistoria = seccionHistoria.querySelector('.content');
    
    // Localizamos los indicadores de texto del botón (+ o -)
    const spanConsulta = seccionConsulta.querySelector('.collapsible span');
    const spanHistoria = seccionHistoria.querySelector('.collapsible span');

    if (modo === 'nuevo_expediente') {
        console.log("🔄 Reordenando: Historia Clínica va primero y EXPANDIDA (Expediente Nuevo).");
        // 1. Intercambio físico de posiciones
        contenedor.insertBefore(seccionHistoria, seccionConsulta);

        // 2. 🔑 Forzar la apertura visual de Historia Clínica
        if (contenidoHistoria) contenidoHistoria.style.display = "block";
        if (spanHistoria) spanHistoria.innerText = "-";

        // 3. 🔑 Forzar el cierre visual de Consulta Actual
        if (contenidoConsulta) contenidoConsulta.style.display = "none";
        if (spanConsulta) spanConsulta.innerText = "+";
        
        // Quitar o poner clases activas si tus estilos CSS las usan para los bordes
        seccionHistoria.querySelector('.collapsible')?.classList.add('active');
        seccionConsulta.querySelector('.collapsible')?.classList.remove('active');
    } else {
        console.log("🔄 Reordenando: Consulta Actual va primero y EXPANDIDA (Edición / Reingreso).");
        // 1. Restablecer el orden por defecto
        contenedor.insertBefore(seccionConsulta, seccionHistoria);

        // 2. Forzar la apertura visual de Consulta Actual
        if (contenidoConsulta) contenidoConsulta.style.display = "block";
        if (spanConsulta) spanConsulta.innerText = "-";

        // 3. Forzar el cierre visual de Historia Clínica
        if (contenidoHistoria) contenidoHistoria.style.display = "none";
        if (spanHistoria) spanHistoria.innerText = "+";

        seccionConsulta.querySelector('.collapsible')?.classList.add('active');
        seccionHistoria.querySelector('.collapsible')?.classList.remove('active');
    }
}

// --- 8. INICIO ---
document.addEventListener('DOMContentLoaded', () => {
    initUI();
    initForm();
    verificarEdicion();
    configurarImpresionReceta();
    
    // Pasar un objeto base o los datos locales actuales para evitar que llegue vacío
    const params = new URLSearchParams(window.location.search);
        const idUrl = params.get('id');
        if (idUrl) {
            const backup = JSON.parse(localStorage.getItem('sgcmed_expedientes_backup') || '{}');
            const pacienteData = backup[idUrl.toLowerCase().trim()] || {};
            configurarImpresionExpediente(pacienteData);
        } else {
            configurarImpresionExpediente({});
        }

        const btnLogout =
    document.getElementById('btn-logout');

    if (btnLogout) {

        btnLogout.addEventListener('click', async () => {

            const respuesta = await Swal.fire({
                title: 'Cerrar sesión',
                text: '¿Desea salir de SGCMED?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Salir',
                cancelButtonText: 'Cancelar'
            });

            if (!respuesta.isConfirmed) {
                return;
            }

            try {

                await signOut(auth);

                window.location.href =
                    'login.html';

            } catch (error) {

                console.error(error);

                Swal.fire(
                    'Error',
                    'No fue posible cerrar la sesión.',
                    'error'
                );
            }
        });
    }
});