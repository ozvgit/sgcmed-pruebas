// js/busqueda.js - Versión 1.6.4 - SGCMED (Corrección Híbrida Unificada)
import { db, functions, auth } from '/js/config.js';
import { ref, get, update, push, set, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js"; 
import { dbPut, dbGet, dbGetAll, dbDelete } from "/js/db-crud.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { inicializarConexion, actualizarStatus } from "/js/conexion.js";

let expedientesFiltrados = []; 
let paginaActual = 1;
let registrosPorPagina = 5; 
let estiloBotones = 'completo';

// Sincronizar parámetros
async function sincronizarParametros() {
    const cfgLocal = await dbGet("configuracion", "global");
    if (cfgLocal) {
        registrosPorPagina = cfgLocal.paginacion;
        estiloBotones = cfgLocal.estiloBotones;
    }
    if (!navigator.onLine) return;

    try {
        const administrarConfig = httpsCallable(functions, 'administrarConfiguracionPruebas');
        const resultado = await administrarConfig({ accion: 'obtener' });
        if (resultado.data) {
            registrosPorPagina = Number(resultado.data.paginacion) || 5;
            estiloBotones = String(resultado.data.estiloBotones).trim() || 'completo';
            await dbPut("configuracion", {
                clave: "global",
                paginacion: registrosPorPagina,
                estiloBotones: estiloBotones
            });            
            renderizarTablaPaginada();
        }
    } catch (e) { console.warn("Usando config local."); }
}

// Búsqueda Blindada Avanzada con Criterios de Fecha de Visitas
async function filtrarExpedientes() {
    const nombreBusqueda = document.getElementById('busqueda-nombre').value.toLowerCase().trim();
    const fechaInicioStr = document.getElementById('fecha-inicio').value;
    const fechaFinStr = document.getElementById('fecha-fin').value;
    const listaUI = document.getElementById('lista-pacientes');
    
    if (!listaUI) return;

    const tieneNombre = nombreBusqueda.length > 0;
    const tieneRangoFechas = fechaInicioStr.length > 0 && fechaFinStr.length > 0;

    if (!tieneNombre && !tieneRangoFechas) {
        return Swal.fire('Criterios Insuficientes', 'Debe ingresar el Nombre del Paciente o un Rango de Fechas completo.', 'warning');
    }

    if ((fechaInicioStr && !fechaFinStr) || (!fechaInicioStr && fechaFinStr)) {
        return Swal.fire('Rango Incompleto', 'Para buscar por fechas debe definir tanto el inicio (Desde) como el fin (Hasta).', 'warning');
    }

    if (tieneRangoFechas) {
        const dateInicio = new Date(fechaInicioStr);
        const dateFin = new Date(fechaFinStr);

        if (dateFin < dateInicio) {
            return Swal.fire('Error de Rango', 'La fecha "Hasta" no puede ser anterior a la fecha "Desde".', 'warning');
        }

        const diferenciaDias = (dateFin - dateInicio) / (1000 * 3600 * 24);
        if (diferenciaDias > 365) {
            return Swal.fire('Rango Excedido', 'El período de búsqueda por rango de fechas no puede superar 1 año (365 días).', 'error');
        }
    }

    listaUI.innerHTML = "<tr><td colspan='3' style='text-align:center;'>🔍 Buscando...</td></tr>";

    const procesarDatos = (datos) => {
        if (!datos) return;
        expedientesFiltrados = [];

        // ✅ Ajuste: siempre fijar hora al mediodía local
        function parseFecha(fechaStr) {
            if (!fechaStr) return null;

            // Formato DD/MM/YYYY
            if (fechaStr.includes('/')) {
                const [dia, mes, anio] = fechaStr.split('/').map(Number);
                return new Date(anio, mes - 1, dia, 12, 0, 0);
            }

            // Formato ISO YYYY-MM-DD
            const partes = fechaStr.split("-");
            if (partes.length === 3) {
                const [anio, mes, dia] = partes.map(Number);
                return new Date(anio, mes - 1, dia, 12, 0, 0);
            }

            // Otros formatos
            return new Date(fechaStr);
        }

        const fInicio = parseFecha(fechaInicioStr);
        const fFin = parseFecha(fechaFinStr);

        console.log("📅 Rango de búsqueda:", tieneRangoFechas ? `${fInicio} → ${fFin}` : "Sin rango");

        Object.keys(datos).forEach(id => {
            const exp = datos[id];
            const nombre = (exp.historiaClinica?.nombre || id).toLowerCase();

            const cumpleNombre = !tieneNombre || nombre.includes(nombreBusqueda);
            let cumpleFechas = !tieneRangoFechas;
            let ultimaVisita = "Sin visitas";
            let ultimaVisitaId = null;

            if (exp.visitas) {
                const todasVisitas = Object.entries(exp.visitas);
                const todasFechas = todasVisitas
                    .map(([vid, v]) => ({ id: vid, fecha: parseFecha(v.fechaVisita) }))
                    .filter(f => f.fecha instanceof Date && !isNaN(f.fecha));

                console.log("👤 Paciente:", nombre, "→ Todas las fechas:", todasFechas);

                if (tieneRangoFechas) {
                    const fechasFiltradas = todasFechas.filter(f => f.fecha >= fInicio && f.fecha <= fFin);
                    console.log("✅ Fechas dentro del rango:", fechasFiltradas);

                    if (fechasFiltradas.length > 0) {
                        const ultima = fechasFiltradas.reduce((a, b) => a.fecha > b.fecha ? a : b);
                        ultimaVisita = ultima.fecha.toLocaleDateString("es-MX");
                        ultimaVisitaId = ultima.id;
                        cumpleFechas = true;
                        console.log("📌 Última visita en rango:", ultimaVisita, "ID:", ultimaVisitaId);
                    } else {
                        cumpleFechas = false;
                        console.log("❌ No hay visitas en rango");
                    }
                } else {
                    if (todasFechas.length > 0) {
                        const ultima = todasFechas.reduce((a, b) => a.fecha > b.fecha ? a : b);
                        ultimaVisita = ultima.fecha.toLocaleDateString("es-MX");
                        ultimaVisitaId = ultima.id;
                        console.log("📌 Última visita (sin rango):", ultimaVisita, "ID:", ultimaVisitaId);
                    }
                    cumpleFechas = true;
                }
            }

            if (cumpleNombre && cumpleFechas) {
                const visitasFiltradas = tieneRangoFechas
                    ? Object.entries(exp.visitas).filter(([vid, v]) => {
                        const f = parseFecha(v.fechaVisita);
                        return f && f >= fInicio && f <= fFin;
                    }).reduce((acc, [vid, v]) => { acc[vid] = v; return acc; }, {})
                    : exp.visitas || {};

                expedientesFiltrados.push({ 
                    id, 
                    nombre: exp.historiaClinica?.nombre || id, 
                    historiaClinica: exp.historiaClinica || {},
                    visitas: visitasFiltradas,
                    ultimaVisita,
                    ultimaVisitaId
                });
            }
        });

        expedientesFiltrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
        paginaActual = 1;
        renderizarTablaPaginada();
    };

    // 🔹 Modo offline
    if (!navigator.onLine) {
        const backup = await dbGetAll("expedientes");
        if (backup && backup.length > 0) {
            const datos = {};
            backup.forEach(exp => datos[exp.id] = exp);
            procesarDatos(datos);
        } else {
            listaUI.innerHTML = "<tr><td colspan='3' style='text-align:center;'>Sin datos offline disponibles.</td></tr>";
        }
        return;
    }

    // 🔹 Modo online con fallback
    try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500));
        const firebasePromise = get(ref(db, 'expedientes'));

        const snapshot = await Promise.race([firebasePromise, timeoutPromise]);
        if (snapshot.exists()) {
            procesarDatos(snapshot.val());
        }
    } catch (error) {
        console.log("⏱️ Firebase lento o sin red en búsqueda. Extrayendo respaldo local...");
        const backup = await dbGetAll("expedientes");
        if (backup && backup.length > 0) {
            const datos = {};
            backup.forEach(exp => datos[exp.id] = exp);
            procesarDatos(datos);
        } else {
            listaUI.innerHTML = "<tr><td colspan='3' style='text-align:center;'>Sin datos offline disponibles.</td></tr>";
        }
    }
}


async function filtrarHistoricoFirestore() {
    const nombreBusqueda = document.getElementById('busqueda-nombre').value.toLowerCase().trim();
    const listaUI = document.getElementById('lista-pacientes');
    
    if (!listaUI) return;

    if (nombreBusqueda.length < 3) {
        return Swal.fire('Búsqueda muy corta', 'Por seguridad y velocidad, ingrese al menos 3 letras del nombre del paciente.', 'warning');
    }

    listaUI.innerHTML = "<tr><td colspan='3' style='text-align:center;'>⏳ Rastreando de forma segura en el archivo histórico (Cloud Function)...</td></tr>";

    if (!navigator.onLine) {
        listaUI.innerHTML = "<tr><td colspan='3' style='text-align:center;'>❌ La consulta al histórico requiere conexión a internet activa.</td></tr>";
        return;
    }

    try {
        document.getElementById('fecha-inicio').value = "";
        document.getElementById('fecha-fin').value = "";
        expedientesFiltrados = [];

        const administrarExpedientePruebas = httpsCallable(functions, 'administrarExpedientePruebas');
        const resultado = await administrarExpedientePruebas({
            accion: 'consultarHistorico',
            datos: { id: nombreBusqueda }
        });

        if (resultado.data && resultado.data.success) {
            const visitasBackend = resultado.data.visitas;

            if (!visitasBackend || visitasBackend.length === 0) {
                listaUI.innerHTML = "<tr><td colspan='3' style='text-align:center;'>📭 No se encontraron registros archivados viejos con ese nombre.</td></tr>";
                actualizarControlesPaginacion(0);
                return;
            }

            // 🔹 Ordenar visitas por fecha y tomar la última
            visitasBackend.sort((a, b) => {
                const fechaA = a.fechaVisita ? new Date(a.fechaVisita) : new Date(0);
                const fechaB = b.fechaVisita ? new Date(b.fechaVisita) : new Date(0);
                return fechaA - fechaB;
            });
            const ultimaVisita = visitasBackend[visitasBackend.length - 1];

            const idReal = ultimaVisita.pacienteIdOriginal || ultimaVisita.pacienteId || nombreBusqueda;
            const nombreEnMinusculas = idReal.toLowerCase().replace(/_/g, ' ').trim();
            const edadRescate = ultimaVisita.edad || ultimaVisita.textEdad || "N/A";
            const fechaAltaRescate = ultimaVisita.fechaFicha || ultimaVisita.fechaAlta || ultimaVisita.fechaVisita || "Sin Fecha";

            // 🔹 Guardar solo la última visita en la tabla, pero todas en visitas
            const visitasEstructuradas = {};
            visitasBackend.forEach(v => {
                visitasEstructuradas[v.visitaId] = { ...v };
            });

            expedientesFiltrados.push({
                id: idReal.toLowerCase().trim(),
                nombre: nombreEnMinusculas, 
                historiaClinica: { 
                    nombre: nombreEnMinusculas, 
                    fechaFicha: fechaAltaRescate, 
                    edad: edadRescate             
                },
                visitas: visitasEstructuradas, // 🔹 todas las visitas para el popup
                ultimaVisita: ultimaVisita.fechaVisita || "Sin Fecha",
                esRegistroHistorico: true
            });

            expedientesFiltrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
            paginaActual = 1;
            renderizarTablaPaginada();
            
            Swal.fire('Archivo Cargado', resultado.data.mensaje, 'success');
        } else {
            listaUI.innerHTML = `<tr><td colspan='3' style='text-align:center;'>📭 ${resultado.data.mensaje || "Sin respuesta del servidor."}</td></tr>`;
            actualizarControlesPaginacion(0);
        }

    } catch (error) {
        console.error("Error al invocar la consulta de histórico:", error);
        const backup = await dbGetAll("expedientes");
        if (backup && backup.length > 0) {
            expedientesFiltrados = backup.map(exp => ({
                id: exp.id,
                nombre: exp.historiaClinica?.nombre || exp.id,
                historiaClinica: exp.historiaClinica || {},
                visitas: exp.visitas || {},
                ultimaVisita: exp.historiaClinica?.fechaFicha || "Sin Fecha",
                esRegistroHistorico: true
            }));
            expedientesFiltrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
            paginaActual = 1;
            renderizarTablaPaginada();
        } else {
            listaUI.innerHTML = "<tr><td colspan='3' style='text-align:center;'>❌ Error de comunicación segura con el servidor y sin respaldo local disponible.</td></tr>";
        }
    }
}

// --- FUNCIÓN PARA LIMPIAR CRITERIOS ---
function limpiarCriterios() {
    document.getElementById('busqueda-nombre').value = "";
    document.getElementById('fecha-inicio').value = "";
    document.getElementById('fecha-fin').value = "";
    
    expedientesFiltrados = [];
    paginaActual = 1;

    const listaUI = document.getElementById('lista-pacientes');
    if (listaUI) listaUI.innerHTML = "";
    
    const contadorTexto = document.getElementById('contador-resultados');
    if (contadorTexto) contadorTexto.innerText = "Listo para buscar";
    
    const contenedorPaginacion = document.querySelector('.pagination');
    if (contenedorPaginacion) contenedorPaginacion.innerHTML = "";
}

function exportarExcel() {
    if (expedientesFiltrados.length === 0) {
        return Swal.fire('Sin Datos', 'No hay resultados cargados en la tabla para exportar.', 'info');
    }

    let csvContent = "Nombre,Fecha Alta,Edad,Fecha Visita,Diagnóstico\n";

    expedientesFiltrados.forEach(exp => {
        const nombreLimpio = (exp.nombre || "").toLowerCase().replace(/_/g, ' ').trim();
        
        // 🎯 CAJA NEGRA: Imprimimos el objeto completo del expediente en la consola para auditarlo
        console.log("--- AUDITORÍA DE EXPEDIENTE ---");
        console.log("Paciente:", nombreLimpio);
        console.log("Objeto completo recibido:", exp);

        let fechaAlta = "Sin Fecha";
        let edad = "N/A";
        let fechaVisita = "Sin visitas";
        let diagnosticoLimpio = "";

        // Intentamos extraer directo de la estructura unificada (Historia Clínica)
        if (exp.historiaClinica) {
            fechaAlta = exp.historiaClinica.fechaFicha || exp.historiaClinica.fechaAlta || "Sin Fecha";
            edad = exp.historiaClinica.edad || exp.historiaClinica.textEdad || "N/A";
        }

        if (exp.visitas && Object.keys(exp.visitas).length > 0) {
            const arregloVisitas = Object.keys(exp.visitas).map(key => exp.visitas[key]);

            // 🎯 CAJA NEGRA SUBCOLECCIÓN: Imprimimos la primera visita para revisar qué propiedades trae dentro
            console.log("Estructura interna de su primera visita:", arregloVisitas[0]);

            arregloVisitas.sort((a, b) => {
                const fechaA = a.fechaVisita ? new Date(a.fechaVisita + "T00:00:00") : new Date(0);
                const fechaB = b.fechaVisita ? new Date(b.fechaVisita + "T00:00:00") : new Date(0);
                return fechaA - fechaB;
            });

            const ultimaVisita = arregloVisitas[arregloVisitas.length - 1];

            fechaVisita = ultimaVisita.fechaVisita ? new Date(ultimaVisita.fechaVisita + "T00:00:00").toLocaleDateString() : "Sin fecha";
            diagnosticoLimpio = (ultimaVisita.diagnostico || "").replace(/[\r\n]+/g, ' ').replace(/,/g, ';').trim();
            
            // Plan B de rescate por si la estructura del paginador movió la historia clínica de lugar
            if (fechaAlta === "Sin Fecha") {
                fechaAlta = ultimaVisita.fechaFicha || ultimaVisita.fechaAlta || "Sin Fecha";
            }
            if (edad === "N/A") {
                edad = ultimaVisita.edad || ultimaVisita.textEdad || "N/A";
            }
        }

        csvContent += `"${nombreLimpio}","${fechaAlta}","${edad}","${fechaVisita}","${diagnosticoLimpio}"\n`;
    });

    const blob = new Blob([String.fromCharCode(0xFEFF) + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Reporte_Ultimas_Visitas_SGCMED_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function renderizarTablaPaginada() {
    console.log("▶️ renderizarTablaPaginada() iniciada");
    const listaUI = document.getElementById('lista-pacientes');
    if (!listaUI) {
        console.warn("⚠️ No se encontró lista-pacientes en el DOM");
        return;
    }
    listaUI.innerHTML = "";
    
    const inicio = (paginaActual - 1) * registrosPorPagina;
    const fin = inicio + registrosPorPagina;
    const bloquePagina = expedientesFiltrados.slice(inicio, fin);
    console.log(`📊 Mostrando expedientes del ${inicio} al ${fin}`, bloquePagina);

    if (bloquePagina.length === 0) {
        listaUI.innerHTML = "<tr><td colspan='3' style='text-align:center;'>No se encontraron resultados con los criterios especificados.</td></tr>";
        actualizarControlesPaginacion(0);
        return;
    }

    bloquePagina.forEach(exp => {
        console.log("🔍 Procesando expediente:", exp.id, exp.nombre);

        let ultimaVisitaId = exp.ultimaVisitaId || null;
        let fechaMostrar = exp.ultimaVisita || "Sin visitas";

        console.log(`🕒 Última visita de ${exp.id}:`, fechaMostrar, "ID:", ultimaVisitaId);

        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid var(--border)";
        
        let botonesHtml = "";

        if (exp.esRegistroHistorico) {
            // 🔹 Solo botón Ver para históricos
            botonesHtml = `<button class="btn-action" style="background:#6c757d; color:white; border:none; padding:5px 10px; border-radius:4px; font-weight:600; cursor:pointer;" onclick="verHistoricoPaciente('${exp.id}')">👁️ VER</button>`;
        } else {
            const urlNueva = `expedientes.html?id=${encodeURIComponent(exp.id)}&modo=nueva`;
            const urlEditar = `expedientes.html?id=${encodeURIComponent(exp.id)}&modo=editar&visitaId=${ultimaVisitaId}`;
            console.log(`🔗 URL Nueva: ${urlNueva}`);
            console.log(`🔗 URL Editar: ${urlEditar}`);

            botonesHtml = estiloBotones === 'minimal' 
                ? `<button class="btn-mini-round" style="background:#28a745;" onclick="location.href='${urlNueva}'">➕</button>
                   <button class="btn-mini-round" style="background:#007bff;" onclick="location.href='${urlEditar}'" ${!ultimaVisitaId ? 'disabled style="opacity:0.5;"' : ''}>✏️</button>`
                : `<button class="btn-action" style="background:#28a745; color:white; border:none; padding:5px 10px; border-radius:4px; font-weight:600; cursor:pointer;" onclick="location.href='${urlNueva}'">➕ NUEVA</button>
                   <button class="btn-action edit" style="background:#007bff; color:white; border:none; padding:5px 10px; border-radius:4px; font-weight:600; cursor:pointer; margin-left:5px;" onclick="location.href='${urlEditar}'" ${!ultimaVisitaId ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>✏️ EDITAR</button>`;
        }
        
        tr.innerHTML = `
            <td style="padding:15px;"><strong>${exp.nombre}</strong></td>
            <td style="padding:15px;">${fechaMostrar}</td>
            <td style="padding:15px; display:flex; gap:8px; justify-content:center; align-items:center;">${botonesHtml}</td>
        `;
        listaUI.appendChild(tr);
    });

    actualizarControlesPaginacion(expedientesFiltrados.length);
    console.log("🏁 renderizarTablaPaginada() terminada");
}


// --- CONTROLES DE PAGINACIÓN ADAPTABLE CON ELIPSIS ---
function actualizarControlesPaginacion(totalRegistros) {
    const contenedor = document.querySelector('.pagination');
    const contadorTexto = document.getElementById('contador-resultados');
    if (!contenedor) return;
    
    const totalPaginas = Math.ceil(totalRegistros / registrosPorPagina);
    
    if (contadorTexto) {
        const r_inicio = totalRegistros > 0 ? (paginaActual - 1) * registrosPorPagina + 1 : 0;
        const r_fin = Math.min(paginaActual * registrosPorPagina, totalRegistros);
        contadorTexto.innerText = `Mostrando ${r_inicio} - ${r_fin} de ${totalRegistros}`;
    }
    
    contenedor.innerHTML = "";
    if (totalPaginas <= 1 && totalRegistros > 0) return;
    
    const btnAnt = document.createElement('button'); 
    btnAnt.innerHTML = "&laquo;"; 
    btnAnt.className = "btn-pag"; 
    btnAnt.disabled = (paginaActual === 1);
    btnAnt.onclick = () => { paginaActual--; renderizarTablaPaginada(); };
    contenedor.appendChild(btnAnt);
    
    const rangoMaximoVisibles = 1; 
    
    for (let i = 1; i <= totalPaginas; i++) {
        if (i === 1 || i === totalPaginas || (i >= paginaActual - rangoMaximoVisibles && i <= paginaActual + rangoMaximoVisibles)) {
            const btnNum = document.createElement('button'); 
            btnNum.innerText = i; 
            btnNum.className = `btn-pag ${i === paginaActual ? 'active-pag' : ''}`;
            btnNum.onclick = () => { paginaActual = i; renderizarTablaPaginada(); };
            contenedor.appendChild(btnNum);
        } 
        else if (i === 2 && paginaActual > rangoMaximoVisibles + 2) {
            const spanEllipsis = document.createElement('span');
            spanEllipsis.className = "pag-ellipsis";
            spanEllipsis.innerText = "...";
            contenedor.appendChild(spanEllipsis);
            i = paginaActual - rangoMaximoVisibles - 1; 
        } 
        else if (i === paginaActual + rangoMaximoVisibles + 1 && i < totalPaginas) {
            const spanEllipsis = document.createElement('span');
            spanEllipsis.className = "pag-ellipsis";
            spanEllipsis.innerText = "...";
            contenedor.appendChild(spanEllipsis);
            i = totalPaginas - 1; 
        }
    }
    
    const btnSig = document.createElement('button'); 
    btnSig.innerHTML = "&raquo;"; 
    btnSig.className = "btn-pag"; 
    btnSig.disabled = (paginaActual === totalPaginas || totalPaginas === 0);
    btnSig.onclick = () => { paginaActual++; renderizarTablaPaginada(); };
    contenedor.appendChild(btnSig);
}


function verHistoricoPaciente(pacienteId) {
    const paciente = expedientesFiltrados.find(exp => exp.id === pacienteId);
    if (!paciente || !paciente.visitas) {
        return Swal.fire('Sin datos', 'No se encontraron visitas históricas para este paciente.', 'info');
    }

    // 🔹 Encabezado dinámico (solo si hay edad/fechaFicha)
    let encabezado = `<h3 style="margin:0; color:#2c3e50;">${paciente.nombre}</h3>`;
    /*
    if (paciente.historiaClinica?.edad || paciente.historiaClinica?.fechaFicha) {
        encabezado += `<p style="margin:4px 0; font-size:14px; color:#555;">`;
        if (paciente.historiaClinica?.edad) encabezado += `Edad: ${paciente.historiaClinica.edad}<br>`;
        if (paciente.historiaClinica?.fechaFicha) encabezado += `Fecha de ficha: ${paciente.historiaClinica.fechaFicha}`;
        encabezado += `</p>`;
    }*/

    let contenido = `
        <div class="historico-header">${encabezado}</div>
        <div class="historico-cards">
    `;

    // 🔹 Cada visita como tarjeta con scroll interno, usando Object.entries para conservar el ID
    Object.entries(paciente.visitas).forEach(([id, v]) => {
        contenido += `
            <div class="historico-card">
                <div class="card-scroll">
                    <h4>Visita del ${v.fechaVisita || "Sin Fecha"}</h4>
                    <p><strong>ID de visita:</strong> ${id}</p>
                    <p><strong>Diagnóstico:</strong> ${v.diagnostico || "N/A"}</p>
                    <p><strong>Padecimiento:</strong> ${v.padecimiento || "N/A"}</p>
                    <p><strong>Pronóstico:</strong> ${v.pronostico || "N/A"}</p>
                    <p><strong>Tratamiento:</strong> ${v.tratamiento || "N/A"}</p>
                    <p><strong>Signos Vitales:</strong> ${v.signosVitales || "N/A"}</p>
                </div>
            </div>
        `;
    });

    contenido += "</div>";

    Swal.fire({
        title: `Histórico de ${paciente.nombre}`,
        html: contenido,
        width: '95%',
        confirmButtonText: "Cerrar",
        customClass: {
            popup: 'popup-historico'
        }
    });
}

window.verHistoricoPaciente = verHistoricoPaciente;

// 🔹 Verificación real de conexión a Internet
async function verificarInternetReal() {
  try {
    const resp = await fetch('/ping.txt', { cache: 'no-store' });
    return resp.ok;
  } catch {
    return false;
  }
}

// 🔹 Renderizado del panel de diagnóstico
/*async function renderizarPanelDiagnostico() {
  try {

    // ==========================================
    // 1. INTERNET REAL
    // ==========================================
    const internetOk = await verificarInternetReal();
    const internet = internetOk
      ? "🟢 Online"
      : "🔴 Offline";

    // ==========================================
    // 2. FIREBASE
    // ==========================================
    let firebase = "🔴 Sin conexión";

    if (internetOk) {
      try {

        const snap = await get(ref(db, "ping"));

        if (snap.exists() && snap.val() === "ok") {
          firebase = "🟢 Conectado";
        } else {
          firebase = "🟡 Error (ping inválido)";
        }

      } catch (e) {

        firebase = `🟡 Error (${e.code || e.message})`;

      }
    }

    // ==========================================
    // 3. INDEXEDDB + COLA
    // ==========================================
    let indexeddb = "🟢 Disponible";

    let totalExpedientes = 0;
    let expedientesSincronizados = 0;
    let expedientesPendientes = 0;
    let pendientes = 0;

    try {

      const expedientes =
        await dbGetAll("expedientes") || [];

      const cola =
        await dbGetAll("cola_sincronizacion") || [];

      totalExpedientes = expedientes.length;
      pendientes = cola.length;

      // IDs únicos de expedientes realmente pendientes
      const idsPendientes = new Set(
        cola
          .map(item => item.datos?.id)
          .filter(Boolean)
      );

      expedientesPendientes = expedientes.filter(
        exp => idsPendientes.has(exp.id)
      ).length;

      expedientesSincronizados =
        totalExpedientes - expedientesPendientes;

    } catch (error) {

      console.error(
        "❌ Error leyendo IndexedDB / cola:",
        error
      );

      indexeddb = "🔴 Error";
      pendientes = "?";
    }

    // ==========================================
    // 4. ACTUALIZAR PANEL
    // ==========================================

    const estadoInternet =
      document.getElementById("estado-internet");

    const estadoFirebase =
      document.getElementById("estado-firebase");

    const estadoIndexedDB =
      document.getElementById("estado-indexeddb");

    const estadoCola =
      document.getElementById("estado-cola");

    if (estadoInternet) {
      estadoInternet.innerText =
        `Internet: ${internet}`;
    }

    if (estadoFirebase) {
      estadoFirebase.innerText =
        `Firebase: ${firebase}`;
    }

    if (estadoIndexedDB) {
      estadoIndexedDB.innerText =
        `IndexedDB: ${indexeddb} | Total: ${totalExpedientes} | Sincronizados: ${expedientesSincronizados} | Pendientes: ${expedientesPendientes}`;
    }

    if (estadoCola) {
      estadoCola.innerText =
        `Cola pendientes: ${pendientes}`;
    }

    console.log(
      "📊 Estado de sincronización:",
      {
        totalExpedientes,
        expedientesSincronizados,
        expedientesPendientes,
        operacionesPendientes: pendientes
      }
    );

  } catch (e) {

    console.warn(
      "⚠️ Error en renderizarPanelDiagnostico:",
      e
    );

    const estadoInternet =
      document.getElementById("estado-internet");

    const estadoFirebase =
      document.getElementById("estado-firebase");

    if (estadoInternet) {
      estadoInternet.innerText =
        "Internet: 🔴 Offline";
    }

    if (estadoFirebase) {
      estadoFirebase.innerText =
        "Firebase: 🔴 Sin conexión";
    }
  }
}*/

async function renderizarPanelDiagnostico() {
  try {

    // =====================================================
    // 1. INTERNET REAL
    // =====================================================

    const internetOk =
      await verificarInternetReal();

    const internet =
      internetOk
        ? "🟢 Online"
        : "🔴 Offline";


    // =====================================================
    // 2. FIREBASE
    // =====================================================

    let firebase =
      "🔴 Sin conexión";


    if (internetOk) {

      try {

        const snap =
          await get(
            ref(db, "ping")
          );


        if (
          snap.exists() &&
          snap.val() === "ok"
        ) {

          firebase =
            "🟢 Conectado";

        } else {

          firebase =
            "🟡 Error (ping inválido)";

        }


      } catch (e) {

        firebase =
          `🟡 Error (${e.code || e.message})`;

      }

    }


    // =====================================================
    // 3. VARIABLES DE INDEXEDDB
    // =====================================================

    let indexeddb =
      "🟢 Disponible";


    // Expedientes
    let totalExpedientes = 0;
    let expedientesSincronizados = 0;
    let expedientesNuevosPendientes = 0;


    // Operaciones pendientes
    let nuevosExpedientes = 0;
    let nuevasConsultas = 0;
    let expedientesModificados = 0;
    let consultasModificadas = 0;
    let operacionesSinClasificar = 0;

    let totalOperacionesPendientes = 0;


    // =====================================================
    // 4. LEER INDEXEDDB Y COLA
    // =====================================================

    try {

      const expedientes =
        await dbGetAll("expedientes") || [];


      const cola =
        await dbGetAll(
          "cola_sincronizacion"
        ) || [];


      totalExpedientes =
        expedientes.length;


      totalOperacionesPendientes =
        cola.length;


      // ===================================================
      // 5. CLASIFICAR OPERACIONES DE LA COLA
      // ===================================================

      nuevosExpedientes =
        cola.filter(
          item =>
            item.tipoOperacion ===
            "nuevo_expediente"
        ).length;


      nuevasConsultas =
        cola.filter(
          item =>
            item.tipoOperacion ===
            "nueva_consulta"
        ).length;


      expedientesModificados =
        cola.filter(
          item =>
            item.tipoOperacion ===
            "actualizar_expediente"
        ).length;


      consultasModificadas =
        cola.filter(
          item =>
            item.tipoOperacion ===
            "actualizar_consulta"
        ).length;


      // ===================================================
      // 6. OPERACIONES ANTIGUAS / SIN CLASIFICAR
      // ===================================================

      operacionesSinClasificar =
        cola.filter(
          item =>
            !item.tipoOperacion
        ).length;


      // ===================================================
      // 7. IDENTIFICAR EXPEDIENTES NUEVOS ÚNICOS
      // ===================================================
      //
      // Si existen varias operaciones correspondientes al
      // mismo expediente nuevo, el expediente debe contar
      // solamente una vez.
      //

      const idsExpedientesNuevos =
        new Set(

          cola

            .filter(
              item =>
                item.tipoOperacion ===
                "nuevo_expediente"
            )

            .map(
              item =>
                item.datos?.id
            )

            .filter(Boolean)

        );


      expedientesNuevosPendientes =
        idsExpedientesNuevos.size;


      // ===================================================
      // 8. EXPEDIENTES SINCRONIZADOS
      // ===================================================
      //
      // SOLAMENTE "nuevo_expediente" disminuye el contador.
      //
      // nueva_consulta        -> NO disminuye
      // actualizar_consulta   -> NO disminuye
      // actualizar_expediente -> NO disminuye
      //

      expedientesSincronizados =
        totalExpedientes -
        expedientesNuevosPendientes;


    } catch (error) {

      console.error(
        "❌ Error leyendo IndexedDB / cola:",
        error
      );


      indexeddb =
        "🔴 Error";

    }


    // =====================================================
    // 9. OBTENER ELEMENTOS DEL PANEL
    // =====================================================

    const estadoInternet =
      document.getElementById(
        "estado-internet"
      );


    const estadoFirebase =
      document.getElementById(
        "estado-firebase"
      );


    const estadoIndexedDB =
      document.getElementById(
        "estado-indexeddb"
      );


    const estadoCola =
      document.getElementById(
        "estado-cola"
      );


    // =====================================================
    // 10. INTERNET
    // =====================================================

    if (estadoInternet) {

      estadoInternet.innerText =
        `Internet: ${internet}`;

    }


    // =====================================================
    // 11. FIREBASE
    // =====================================================

    if (estadoFirebase) {

      estadoFirebase.innerText =
        `Firebase: ${firebase}`;

    }


    // =====================================================
    // 12. EXPEDIENTES
    // =====================================================

    if (estadoIndexedDB) {

      estadoIndexedDB.innerText =
        `IndexedDB: ${indexeddb} | Total expedientes: ${totalExpedientes} | Sincronizados: ${expedientesSincronizados} | Nuevos pendientes: ${expedientesNuevosPendientes}`;

    }


    // =====================================================
    // 13. OPERACIONES PENDIENTES
    // =====================================================

    if (estadoCola) {

      estadoCola.innerText =
        `Sincronización pendiente | 🆕 Expedientes nuevos: ${nuevosExpedientes} | ➕ Consultas nuevas: ${nuevasConsultas} | 📝 Expedientes modificados: ${expedientesModificados} | ✏️ Consultas modificadas: ${consultasModificadas} | ⚠️ Sin clasificar: ${operacionesSinClasificar} | Total operaciones: ${totalOperacionesPendientes}`;

    }


    // =====================================================
    // 14. LOG DE DIAGNÓSTICO
    // =====================================================

    console.log(
      "📊 Estado de sincronización:",
      {
        totalExpedientes,
        expedientesSincronizados,
        expedientesNuevosPendientes,
        nuevosExpedientes,
        nuevasConsultas,
        expedientesModificados,
        consultasModificadas,
        operacionesSinClasificar,
        totalOperacionesPendientes
      }
    );


  } catch (error) {

    console.warn(
      "⚠️ Error en renderizarPanelDiagnostico:",
      error
    );


    // =====================================================
    // 15. FALLBACK
    // =====================================================

    const estadoInternet =
      document.getElementById(
        "estado-internet"
      );


    const estadoFirebase =
      document.getElementById(
        "estado-firebase"
      );


    if (estadoInternet) {

      estadoInternet.innerText =
        "Internet: 🔴 Offline";

    }


    if (estadoFirebase) {

      estadoFirebase.innerText =
        "Firebase: 🔴 Sin conexión";

    }

  }
}

function mostrarEstadoTemporal() {
  document.getElementById('estado-internet').innerText = "Internet: ⏳ Verificando...";
  document.getElementById('estado-firebase').innerText = "Firebase: ⏳ Verificando...";
  document.getElementById('estado-indexeddb').innerText = "IndexedDB: ⏳ Verificando...";
  document.getElementById('estado-cola').innerText = "Cola pendientes: ⏳ ...";
}

window.gestionarBotonParametros = async function() {
    const btnParametros = document.getElementById('btn-parametros');
    if (!btnParametros) return;

    const statusDiv = document.getElementById("status");
    // Verificamos si el texto o la clase indican que estamos en línea
    const conectado = statusDiv && (statusDiv.classList.contains("online") || statusDiv.textContent.includes("Conectado"));

    if (conectado) {
        btnParametros.disabled = false;
        btnParametros.style.opacity = "1";
        btnParametros.style.pointerEvents = "auto";
        console.log("🟢 Botón Parámetros habilitado por estado online.");
    } else {
        btnParametros.disabled = true;
        btnParametros.style.opacity = "0.5";
        btnParametros.style.pointerEvents = "none";
        console.log("🔴 Botón Parámetros deshabilitado por estado offline.");
    }
}

async function procesarColaSincronizacion() {

  const internetReal = await verificarInternetReal();

  if (!internetReal) {

    console.log(
      "📴 Sin conexión real, no se procesa la cola."
    );

    return;
  }

  const pendientes =
    await dbGetAll("cola_sincronizacion");

  if (!pendientes || pendientes.length === 0) {

    console.log(
      "📭 Cola vacía, nada que sincronizar."
    );

    await renderizarPanelDiagnostico();

    return;
  }

  console.log(
    `🔄 Sincronizando ${pendientes.length} elementos pendientes...`
  );

  for (const item of pendientes) {

    try {

      if (item.accion !== "guardar") {
        continue;
      }

      const guardarExpediente =
        httpsCallable(
          functions,
          "administrarExpedientePruebas"
        );

      // ==========================================
      // ENVIAR A FIREBASE
      // ==========================================
      await guardarExpediente({
        accion: "guardar",
        datos: item.datos
      });

      // ==========================================
      // MARCAR EXPEDIENTE LOCAL
      // ==========================================
      const expedienteLocal =
        await dbGet(
          "expedientes",
          item.datos.id
        );

      if (expedienteLocal) {

        expedienteLocal.sincronizado = true;
        expedienteLocal.ultimaSincronizacion =
          Date.now();

        await dbPut(
          "expedientes",
          expedienteLocal
        );
      }

      // ==========================================
      // ELIMINAR DE COLA SOLAMENTE DESPUÉS
      // DE QUE FIREBASE RESPONDIÓ CORRECTAMENTE
      // ==========================================
      await dbDelete(
        "cola_sincronizacion",
        item.id
      );

      console.log(
        `✅ Sincronizado y eliminado de cola: ${item.id}`
      );

    } catch (error) {

      console.error(
        `❌ Error sincronizando ${item.id}:`,
        error
      );

      break;
    }
  }

  await renderizarPanelDiagnostico();
}

document.addEventListener('DOMContentLoaded', async () => {
    const offlineUser = await dbGet("usuarios", "offlineUser");
    console.log("🔍 offlineUser leído de IndexedDB:", offlineUser);

    if (offlineUser) {
        // ✅ Sesión offline activa
        console.log("✅ Sesión activa (offline):", offlineUser.email);

        const backup = await dbGetAll("expedientes");
        if (backup && backup.length > 0) {
            console.log("📂 Usando respaldo local de expedientes.");
        } else {
            console.log("⚠️ No hay respaldo local disponible.");
        }
        actualizarStatus();
    } else {
        // 🔹 Solo si no hay offlineUser, escuchamos Firebase
        /*onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log("✅ Sesión activa (online):", user.email);
                onValue(ref(db, 'expedientes'), async (snapshot) => {
                    if (snapshot.exists()) {
                        const datos = snapshot.val();
                        // Guardar cada expediente en IndexedDB
                        for (const id in datos) {
                            await dbPut("expedientes", { id, ...datos[id] });
                        }
                        console.log("💾 Respaldo sincronizado en IndexedDB.");
                    }
                });
                await sincronizarParametros();
                actualizarStatus();
            } else {
                window.location.href = "login.html";
            }
        });*/

        onAuthStateChanged(auth, async (user) => {

            if (user) {

                console.log("✅ Sesión activa (online):", user.email);

                // =====================================================
                // SINCRONIZACIÓN FIREBASE → INDEXEDDB
                // =====================================================
                onValue(
                    ref(db, "expedientes"),
                    async (snapshot) => {

                        try {

                            console.log(
                                "🔄 Reconciliando Firebase con IndexedDB..."
                            );

                            // =================================================
                            // 1. OBTENER ESTADO ACTUAL DE FIREBASE
                            // =================================================
                            //
                            // IMPORTANTE:
                            // Si Firebase no tiene expedientes, usamos {}
                            // para poder detectar que los expedientes locales
                            // fueron eliminados de Firebase.
                            //
                            const datosFirebase = snapshot.exists()
                                ? snapshot.val()
                                : {};


                            // =================================================
                            // 2. OBTENER ESTADO ACTUAL DE INDEXEDDB
                            // =================================================

                            const expedientesLocales =
                                await dbGetAll("expedientes") || [];

                            const cola =
                                await dbGetAll("cola_sincronizacion") || [];


                            // =================================================
                            // 3. IDENTIFICAR EXPEDIENTES PENDIENTES
                            // =================================================
                            //
                            // Si un expediente está en la cola significa que
                            // todavía puede estar esperando sincronización.
                            //
                            // Estos expedientes NO deben eliminarse aunque aún
                            // no existan en Firebase.
                            //
                            const idsPendientes = new Set(
                                cola
                                    .map(item => item.datos?.id)
                                    .filter(Boolean)
                            );


                            console.log(
                                "☁️ Expedientes en Firebase:",
                                Object.keys(datosFirebase).length
                            );

                            console.log(
                                "📦 Expedientes en IndexedDB:",
                                expedientesLocales.length
                            );

                            console.log(
                                "⏳ Expedientes protegidos por cola:",
                                [...idsPendientes]
                            );


                            // =================================================
                            // 4. INSERTAR / ACTUALIZAR DESDE FIREBASE
                            // =================================================

                            for (const id in datosFirebase) {

                                // Recuperamos primero la versión local
                                // para conservar metadatos propios de IndexedDB.
                                const expedienteLocal =
                                    await dbGet(
                                        "expedientes",
                                        id
                                    );


                                await dbPut(
                                    "expedientes",
                                    {

                                        // -------------------------------------
                                        // Conservar metadatos locales existentes
                                        // -------------------------------------
                                        //
                                        // Ejemplo:
                                        // sincronizado
                                        // ultimaSincronizacion
                                        //
                                        ...(expedienteLocal || {}),


                                        // -------------------------------------
                                        // ID obligatorio para IndexedDB
                                        // -------------------------------------
                                        id,


                                        // -------------------------------------
                                        // Firebase manda sobre datos clínicos
                                        // -------------------------------------
                                        ...datosFirebase[id]

                                    }
                                );

                            }


                            // =================================================
                            // 5. RECONCILIAR ELIMINACIONES
                            // =================================================
                            //
                            // Ahora revisamos cada expediente existente
                            // localmente.
                            //
                            // Si dejó de existir en Firebase y NO está
                            // pendiente de sincronización, se elimina localmente.
                            //

                            for (const expedienteLocal of expedientesLocales) {

                                const id = expedienteLocal.id;


                                // ---------------------------------------------
                                // ¿EXISTE ACTUALMENTE EN FIREBASE?
                                // ---------------------------------------------
                                const existeEnFirebase =
                                    Object.prototype.hasOwnProperty.call(
                                        datosFirebase,
                                        id
                                    );


                                // ---------------------------------------------
                                // ¿ESTÁ PROTEGIDO POR LA COLA?
                                // ---------------------------------------------
                                const tienePendientes =
                                    idsPendientes.has(id);


                                // =================================================
                                // CASO A:
                                // EL EXPEDIENTE SIGUE EXISTIENDO EN FIREBASE
                                // =================================================
                                if (existeEnFirebase) {

                                    continue;

                                }


                                // =================================================
                                // CASO B:
                                // NO EXISTE EN FIREBASE,
                                // PERO ESTÁ PENDIENTE DE SINCRONIZACIÓN
                                // =================================================
                                //
                                // Este puede ser un expediente creado offline.
                                //
                                // NO BORRAR.
                                //
                                if (tienePendientes) {

                                    console.log(
                                        `🛡️ Conservando expediente pendiente: ${id}`
                                    );

                                    continue;

                                }


                                // =================================================
                                // CASO C:
                                // NO EXISTE EN FIREBASE
                                // Y TAMPOCO ESTÁ PENDIENTE
                                // =================================================
                                //
                                // Significa que Firebase ya no lo tiene y no
                                // existe ninguna operación local que justifique
                                // conservarlo.
                                //
                                console.log(
                                    `🗑️ Eliminando expediente local inexistente en Firebase: ${id}`
                                );


                                await dbDelete(
                                    "expedientes",
                                    id
                                );

                            }


                            // =================================================
                            // 6. RECONCILIACIÓN TERMINADA
                            // =================================================

                            console.log(
                                "✅ Firebase e IndexedDB reconciliados."
                            );


                            // =================================================
                            // 7. ACTUALIZAR PANEL DE DIAGNÓSTICO
                            // =================================================

                            await renderizarPanelDiagnostico();


                        } catch (error) {

                            console.error(
                                "❌ Error reconciliando Firebase con IndexedDB:",
                                error
                            );

                        }

                    }
                );


                // =====================================================
                // SINCRONIZAR PARÁMETROS
                // =====================================================

                await sincronizarParametros();


                // =====================================================
                // ACTUALIZAR INDICADOR DE CONEXIÓN
                // =====================================================

                actualizarStatus();


            } else {

                // =====================================================
                // NO EXISTE SESIÓN ACTIVA
                // =====================================================

                window.location.href = "login.html";

            }

        });


    }

    inicializarConexion();

    await procesarColaSincronizacion();

    // 🔹 Forzar evaluación de parámetros tras la carga inicial y la cola
    await gestionarBotonParametros();

    // Escuchar cuando el navegador recupera la conexión en caliente
    // ==========================================
    // RECUPERACIÓN DE CONEXIÓN
    // ==========================================
    window.addEventListener("online", async () => {

    console.log(
        "🌐 Navegador Online. Verificando conexión real..."
    );

    mostrarEstadoTemporal();

    try {

        const internetReal =
        await verificarInternetReal();

        if (!internetReal) {

        console.warn(
            "⚠️ Navegador Online, pero todavía no existe Internet real."
        );

        await renderizarPanelDiagnostico();
        await gestionarBotonParametros();

        return;
        }

        console.log(
        "✅ Internet real confirmado. Procesando cola..."
        );

        // Primero procesa pendientes
        await procesarColaSincronizacion();

        // Después actualiza panel
        await renderizarPanelDiagnostico();

        // Reevaluar botón parámetros
        await gestionarBotonParametros();

        console.log(
        "✅ Recuperación de conexión terminada."
        );

    } catch (error) {

        console.error(
        "❌ Error recuperando conexión:",
        error
        );

        await renderizarPanelDiagnostico();
        await gestionarBotonParametros();
    }

    });


    // ==========================================
    // PÉRDIDA DE CONEXIÓN
    // ==========================================
    window.addEventListener("offline", async () => {

    console.log(
        "📴 Conexión perdida."
    );

    await renderizarPanelDiagnostico();
    await gestionarBotonParametros();

    });

    window.addEventListener('pageshow', async (event) => {
        if (event.persisted || (performance.navigation && performance.navigation.type === 2)) {
            console.log("🔄 Página restaurada desde caché. Forzando reevaluación...");
        }
        
        // 1. Forzar verificación inmediata de red si está disponible
        if (typeof actualizarStatus === 'function') {
            await actualizarStatus();
        }
        
        // 2. Dar un pequeño respiro para que termine el fetch/ping y reevaluar el botón
        setTimeout(async () => {
            if (typeof window.gestionarBotonParametros === 'function') {
                await window.gestionarBotonParametros();
            }
        }, 1000);
    });

    // 🔹 Botones
    const btnBuscar = document.getElementById('btn-buscar');
    if (btnBuscar) btnBuscar.addEventListener('click', filtrarExpedientes);

    const btnLimpiar = document.getElementById('btn-limpiar');
    if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarCriterios);

    const btnExportar = document.getElementById('btn-exportar');
    if (btnExportar) btnExportar.addEventListener('click', exportarExcel);

    const btnBuscarHistorico = document.getElementById('btn-buscar-historico');
    if (btnBuscarHistorico) btnBuscarHistorico.addEventListener('click', filtrarHistoricoFirestore);

    const btnLogout = document.getElementById('btn-logout');
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

            if (!respuesta.isConfirmed) return;

            try {
                // 🔹 Si hay conexión, cerrar sesión en Firebase
                if (navigator.onLine) {
                    await signOut(auth);
                }

                // 🔹 Siempre limpiar datos locales (offline + respaldo)
                
                await dbDelete("usuarios", "offlineUser");
               /* const backup = await dbGetAll("expedientes");
                if (backup && backup.length > 0) {
                    for (const exp of backup) {
                        await dbDelete("expedientes", exp.id);
                    }
                }*/

                console.log("🚪 Sesión cerrada correctamente (online/offline).");
                window.location.href = 'login.html';
            } catch (error) {
                console.error(error);
                Swal.fire('Error','No fue posible cerrar la sesión.','error');
            }
        });
    }
        document.getElementById('btn-diagnostico')?.addEventListener('click', async () => {
        const panel = document.getElementById('panel-diagnostico');
        if (!panel) return;

        // 🔹 Mostrar/ocultar panel
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';

        try {
            await renderizarPanelDiagnostico();
        } catch (e) {
            console.warn("⚠️ Diagnóstico parcial (offline).", e);

            // 🔹 Internet y Firebase caen
            document.getElementById('estado-internet').innerText = "Internet: 🔴 Offline";
            document.getElementById('estado-firebase').innerText = "Firebase: 🔴 Sin conexión";

            // 🔹 Pero IndexedDB y cola sí se pueden leer
            try {
            const expedientes = await dbGetAll("expedientes");
            const totalExpedientes = expedientes ? expedientes.length : 0;
            document.getElementById('estado-indexeddb').innerText =
                `IndexedDB: 🟢 Disponible (Expedientes: ${totalExpedientes})`;
            } catch {
            document.getElementById('estado-indexeddb').innerText = "IndexedDB: 🔴 Error";
            }

            try {
            const cola = await dbGetAll("cola_sincronizacion");
            const pendientes = cola ? cola.length : 0;
            document.getElementById('estado-cola').innerText = `Cola pendientes: ${pendientes}`;
            } catch {
            document.getElementById('estado-cola').innerText = "Cola pendientes: ?";
            }
        }
        });

        document.getElementById('btn-cerrar-diagnostico')?.addEventListener('click', () => {
            const panel = document.getElementById('panel-diagnostico');
            if (panel) panel.style.display = 'none';
        });

        const btnParametros = document.getElementById('btn-parametros');
        if (btnParametros) {
            btnParametros.addEventListener('click', () => {
                console.log("⚙️ Redirigiendo a parámetros del sistema...");
                window.location.href = 'parametros.html';
            });
        }


        document
        .getElementById("btn-refrescar-panel")
        ?.addEventListener("click", async () => {

            console.log(
            "🔄 Refresco manual del panel..."
            );

            mostrarEstadoTemporal();

            try {

            await new Promise(
                resolve => setTimeout(resolve, 50)
            );

            const internetReal =
                await verificarInternetReal();

            if (internetReal) {

                console.log(
                "🌐 Internet disponible. Procesando cola..."
                );

                await procesarColaSincronizacion();

            } else {

                console.log(
                "📴 Sin Internet real. Solo se actualizará información local."
                );
            }

            await renderizarPanelDiagnostico();

            // En búsqueda también tenemos que
            // reevaluar el botón Parámetros
            await gestionarBotonParametros();

            console.log(
                "✅ Refresco manual terminado."
            );

            } catch (error) {

            console.error(
                "❌ Error durante refresco manual:",
                error
            );

            await renderizarPanelDiagnostico();

            }

        });
});

