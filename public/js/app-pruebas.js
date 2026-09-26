// js/app-pruebas.js - Versión 1.6.3 - SGCMED
import { auth, db, functions } from '/js/config.js'; 
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, get, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
const firestore = getFirestore(undefined, "historico-sgcem");
import { inicializarConexion, actualizarStatus } from "/js/conexion.js";
import { dbPut, dbGet, dbGetAll, dbDelete } from "/js/db-crud.js";


// --- 🔑 PASO 3: FUNCIÓN CORE PARA EXTRAER CONSULTAS DESDE AMBAS BASES DE DATOS ---
async function obtenerDatosVisitaHibrida(pacienteId, visitaId) {
    console.log(`🔍 Buscando visita ${visitaId} para el paciente ${pacienteId}...`);
    
    // 1. Intentar primero en la Base Caliente (Realtime Database)
    try {
        const snapshotCaliente = await get(ref(db, `expedientes/${pacienteId}/visitas/${visitaId}`));
        if (snapshotCaliente.exists()) {
            console.log("🔥 Registro localizado en la Base Caliente (RTDB).");

            // Guardamos en IndexedDB para respaldo offline
            await dbPut("visitas", {
                pacienteId,
                visitaId,
                ...snapshotCaliente.val()
            });

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

                const dataFria = snapshotFria.data();

                // Guardamos también en IndexedDB
                await dbPut("visitas", {
                    pacienteId,
                    visitaId,
                    ...dataFria
                });

                return dataFria;
            }
        } catch (firestoreErr) {
            console.error("Falla crítica al leer en el archivo histórico:", firestoreErr);
        }
    }

    // 3. Fallback final: intentar recuperar desde IndexedDB
    const backup = await dbGet("visitas", visitaId);
    if (backup) {
        console.log("📦 Recuperando visita desde respaldo local IndexedDB.");
        return backup;
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
    
    document.getElementById('fechaVisita').value = obtenerFechaLocalISO();
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

/*
function initForm() {
  const form = document.getElementById('form-expediente');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('btn-main');
    const pId =
      document.getElementById('edit-id').value ||
      document.getElementById('nombre').value;

    if (!pId) {
      return Swal.fire(
        'Atención',
        'Nombre del paciente es obligatorio',
        'warning'
      );
    }

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

    const expPrevio = await dbGet("expedientes", idLimpio) || {};
    const visitasPrevias = expPrevio.visitas || {};

    visitasPrevias[vKey] = visitaData;

    await dbPut("expedientes", {
      id: idLimpio,
      historiaClinica: hcData,
      visitas: visitasPrevias,
      ultimaVisitaId: vKey,
      ultimaVisita: visitaData.fechaVisita,
      ultimaModificacion: Date.now(),
      sincronizado: false
    });

    window.visitaActualId = vKey;

    const internetReal = await verificarInternetReal();

    // ========= OFFLINE =========
    if (!internetReal) {

      await dbPut("cola_sincronizacion", {
        id: `${idLimpio}_${vKey}`,
        accion: "guardar",
        datos: {
          id: idLimpio,
          historiaClinica: hcData,
          consultaActual: visitaData,
          visitaId: vKey
        },
        timestamp: Date.now()
      });

      Swal.fire(
        'Guardado Local',
        'Datos protegidos en el dispositivo (Modo Offline).',
        'info'
      );

      btn.disabled = false;
      btn.innerText = "💾 Guardado Offline";
      return;
    }

    try {

      const guardarExpediente = httpsCallable(
        functions,
        "administrarExpedientePruebas"
      );

      const result = await guardarExpediente({
        accion: "guardar",
        datos: {
          id: idLimpio,
          historiaClinica: hcData,
          consultaActual: visitaData,
          visitaId: vKey
        }
      });
        // ✅ Firebase confirmó el guardado
        const expedienteLocal = await dbGet("expedientes", idLimpio);
         
        if (expedienteLocal) {
        expedienteLocal.sincronizado = true;
        expedienteLocal.ultimaSincronizacion = Date.now();
         
        await dbPut("expedientes", expedienteLocal);
        }

      Swal.fire(
        '¡Éxito!',
        result.data.message || 'Expediente guardado en la nube.',
        'success'
      );

      btn.innerText = "💾 Guardado en Nube";

      const snap = await get(
        ref(db, `expedientes/${idLimpio}/visitas`)
      );

      if (snap.exists()) {
        cargarHistorialVisitas(idLimpio, snap.val());
      }

    } catch (error) {

      await dbPut("cola_sincronizacion", {
        id: `${idLimpio}_${vKey}`,
        accion: "guardar",
        datos: {
          id: idLimpio,
          historiaClinica: hcData,
          consultaActual: visitaData,
          visitaId: vKey
        },
        timestamp: Date.now()
      });

      Swal.fire(
        'Guardado Local',
        'Datos protegidos localmente en el dispositivo (Error de red).',
        'info'
      );

      btn.innerText = "⚠️ Guardado Local";

    } finally {
      btn.disabled = false;
    }
  });
} */

function initForm() {
  const form = document.getElementById('form-expediente');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('btn-main');

    const pId =
      document.getElementById('edit-id').value ||
      document.getElementById('nombre').value;

    if (!pId) {
      return Swal.fire(
        'Atención',
        'Nombre del paciente es obligatorio',
        'warning'
      );
    }

    btn.disabled = true;
    btn.innerHTML = '⏳ Guardando...';

    try {

      // =====================================================
      // 1. IDENTIFICADOR DEL EXPEDIENTE
      // =====================================================

      const idLimpio =
        pId.toLowerCase().trim();


      // =====================================================
      // 2. LEER EXPEDIENTE ANTES DE MODIFICAR INDEXEDDB
      // =====================================================

      const expPrevio =
        await dbGet(
          "expedientes",
          idLimpio
        );

      const expedienteExistia =
        !!expPrevio;


      // =====================================================
      // 3. IDENTIFICAR LA CONSULTA ACTUAL
      // =====================================================

      const visitaActualId =
        window.visitaActualId || null;

      const consultaExistia =
        !!(
          expPrevio &&
          visitaActualId &&
          expPrevio.visitas?.[visitaActualId]
        );


      // =====================================================
      // 4. GENERAR O CONSERVAR ID DE VISITA
      // =====================================================

      const vKey =
        visitaActualId ||
        `v_${Date.now()}`;


      // =====================================================
      // 5. HISTORIA CLÍNICA ACTUAL
      // =====================================================

      const hcData = {
        nombre:
          document.getElementById('nombre').value ||
          document.getElementById('fi_nombre').value,

        edad:
          document.getElementById('edad').value,

        fechaFicha:
          document.getElementById('fi_fecha').value,

        domicilio:
          document.getElementById('fi_domicilio').value,

        telefono:
          document.getElementById('fi_telefono').value,

        fechaNacimiento:
          document.getElementById('fi_nacimiento').value,

        escolaridad:
          document.getElementById('fi_escolaridad').value,

        ocupacion:
          document.getElementById('fi_ocupacion').value,

        estadoCivil:
          document.getElementById('fi_estado_civil').value,

        religion:
          document.getElementById('fi_religion').value,

        informante:
          document.getElementById('fi_informante').value,

        parentesco:
          document.getElementById('fi_parentesco').value,

        heredofamiliares:
          document.getElementById('ant_heredofamiliares').value,

        patologicos:
          document.getElementById('ant_patologicos').value,

        noPatologicos:
          document.getElementById('ant_no_patologicos').value,

        gineco:
          document.getElementById('ant_gineco').value
      };


      // =====================================================
      // 6. DATOS ACTUALES DE LA CONSULTA
      // =====================================================

      const visitaData = {
        fechaVisita:
          document.getElementById('fechaVisita').value,

        tipo:
          document.getElementById('tipo').value,

        padecimiento:
          document.getElementById('padecimiento').value,

        signosVitales:
          document.getElementById('receta').value,

        estudios:
          document.getElementById('estudios').value,

        diagnostico:
          document.getElementById('diagnostico').value,

        tratamiento:
          document.getElementById('tratamiento').value,

        pronostico:
          document.getElementById('pronostico').value,

        fecha:
          Date.now()
      };


      // =====================================================
      // 7. NORMALIZADOR PARA COMPARACIÓN
      // =====================================================

      const normalizar = (valor) => {
        if (
          valor === null ||
          valor === undefined
        ) {
          return "";
        }

        return String(valor).trim();
      };


      // =====================================================
      // 8. DETECTAR CAMBIOS EN HISTORIA CLÍNICA
      // =====================================================

      let historiaClinicaCambio = false;

      if (expedienteExistia) {

        const hcAnterior =
          expPrevio.historiaClinica || {};

        const camposHistoria = [
          "nombre",
          "edad",
          "fechaFicha",
          "domicilio",
          "telefono",
          "fechaNacimiento",
          "escolaridad",
          "ocupacion",
          "estadoCivil",
          "religion",
          "informante",
          "parentesco",
          "heredofamiliares",
          "patologicos",
          "noPatologicos",
          "gineco"
        ];

        historiaClinicaCambio =
          camposHistoria.some((campo) => {
            return (
              normalizar(hcAnterior[campo]) !==
              normalizar(hcData[campo])
            );
          });
      }


      // =====================================================
      // 9. DETECTAR CAMBIOS EN CONSULTA EXISTENTE
      // =====================================================
      //
      // NO se compara "fecha" porque Date.now()
      // cambia en cada submit.
      //

      let consultaCambio = false;

      if (consultaExistia) {

        const visitaAnterior =
          expPrevio.visitas[visitaActualId];

        const camposConsulta = [
          "fechaVisita",
          "tipo",
          "padecimiento",
          "signosVitales",
          "estudios",
          "diagnostico",
          "tratamiento",
          "pronostico"
        ];

        consultaCambio =
          camposConsulta.some((campo) => {
            return (
              normalizar(visitaAnterior?.[campo]) !==
              normalizar(visitaData[campo])
            );
          });
      }


      // =====================================================
      // 10. DETERMINAR TIPO DE OPERACIÓN
      // =====================================================

      let tipoOperacion;


      // -----------------------------------------------------
      // CASO A:
      // EXPEDIENTE COMPLETAMENTE NUEVO
      // -----------------------------------------------------

      if (!expedienteExistia) {

        tipoOperacion =
          "nuevo_expediente";

      }


      // -----------------------------------------------------
      // CASO B:
      // EXPEDIENTE EXISTENTE + CONSULTA NUEVA
      // -----------------------------------------------------

      else if (!consultaExistia) {

        tipoOperacion =
          "nueva_consulta";

      }


      // -----------------------------------------------------
      // CASO C:
      // CONSULTA EXISTENTE MODIFICADA
      //
      // Si además cambió Historia Clínica, se clasifica
      // como actualizar_consulta porque esta operación
      // transporta ambos objetos hacia Firebase.
      // -----------------------------------------------------

      else if (consultaCambio) {

        tipoOperacion =
          "actualizar_consulta";

      }


      // -----------------------------------------------------
      // CASO D:
      // CONSULTA SIN CAMBIOS
      // + HISTORIA CLÍNICA MODIFICADA
      // -----------------------------------------------------

      else if (historiaClinicaCambio) {

        tipoOperacion =
          "actualizar_expediente";

      }


      // -----------------------------------------------------
      // CASO E:
      // ABSOLUTAMENTE NINGÚN CAMBIO
      // -----------------------------------------------------

      else {

        tipoOperacion =
          "sin_cambios";

      }


      console.log(
        "🧭 Clasificación de operación:",
        {
          tipoOperacion,
          idLimpio,
          vKey,
          expedienteExistia,
          consultaExistia,
          historiaClinicaCambio,
          consultaCambio
        }
      );


      // =====================================================
      // 11. SIN CAMBIOS
      // =====================================================

      if (tipoOperacion === "sin_cambios") {

        console.log(
          "ℹ️ No se detectaron cambios."
        );

        Swal.fire(
          'Sin cambios',
          'No se detectaron modificaciones para guardar.',
          'info'
        );

        btn.innerText =
          "💾 Sin cambios";

        return;
      }


      // =====================================================
      // 12. PREPARAR VISITAS LOCALES
      // =====================================================

      const visitasPrevias = {
        ...(expPrevio?.visitas || {})
      };

      visitasPrevias[vKey] =
        visitaData;


      // =====================================================
      // 13. GUARDAR EN INDEXEDDB
      // =====================================================

      await dbPut(
        "expedientes",
        {
          id:
            idLimpio,

          historiaClinica:
            hcData,

          visitas:
            visitasPrevias,

          ultimaVisitaId:
            vKey,

          ultimaVisita:
            visitaData.fechaVisita,

          ultimaModificacion:
            Date.now(),

          // Un cambio en consulta o expediente existente
          // no significa que el expediente deje de existir
          // en la nube.
          sincronizado:
            expedienteExistia
              ? (expPrevio.sincronizado ?? true)
              : false
        }
      );


      // =====================================================
      // 14. CONSERVAR ID DE VISITA
      // =====================================================

      window.visitaActualId =
        vKey;


      // =====================================================
      // 15. VERIFICAR INTERNET REAL
      // =====================================================

      const internetReal =
        await verificarInternetReal();


      // =====================================================
      // 16. MODO OFFLINE
      // =====================================================

      if (!internetReal) {

        await dbPut(
          "cola_sincronizacion",
          {
            id:
              `${idLimpio}_${vKey}`,

            accion:
              "guardar",

            tipoOperacion:
              tipoOperacion,

            datos: {
              id:
                idLimpio,

              historiaClinica:
                hcData,

              consultaActual:
                visitaData,

              visitaId:
                vKey
            },

            timestamp:
              Date.now()
          }
        );


        console.log(
          `📥 Operación agregada a cola: ${tipoOperacion}`
        );


        // Actualizar el panel inmediatamente
        await renderizarPanelDiagnostico();


        Swal.fire(
          'Guardado Local',
          'Datos protegidos en el dispositivo (Modo Offline).',
          'info'
        );


        btn.innerText =
          "💾 Guardado Offline";

        return;
      }


      // =====================================================
      // 17. MODO ONLINE
      // =====================================================

      try {

        const guardarExpediente =
          httpsCallable(
            functions,
            "administrarExpedientePruebas"
          );


        const result =
          await guardarExpediente({
            accion:
              "guardar",

            datos: {
              id:
                idLimpio,

              historiaClinica:
                hcData,

              consultaActual:
                visitaData,

              visitaId:
                vKey
            }
          });


        // ===================================================
        // 18. FIREBASE CONFIRMÓ EL GUARDADO
        // ===================================================

        const expedienteLocal =
          await dbGet(
            "expedientes",
            idLimpio
          );


        if (expedienteLocal) {

          expedienteLocal.sincronizado =
            true;

          expedienteLocal.ultimaSincronizacion =
            Date.now();


          await dbPut(
            "expedientes",
            expedienteLocal
          );
        }


        console.log(
          `✅ Operación sincronizada: ${tipoOperacion}`
        );


        // Actualizar panel después de éxito
        await renderizarPanelDiagnostico();


        Swal.fire(
          '¡Éxito!',
          result.data.message ||
          'Expediente guardado en la nube.',
          'success'
        );


        btn.innerText =
          "💾 Guardado en Nube";


        // ===================================================
        // 19. ACTUALIZAR HISTORIAL DESDE FIREBASE
        // ===================================================

        const snap =
          await get(
            ref(
              db,
              `expedientes/${idLimpio}/visitas`
            )
          );


        if (snap.exists()) {

          cargarHistorialVisitas(
            idLimpio,
            snap.val()
          );

        }


      } catch (error) {

        // ===================================================
        // 20. FIREBASE FALLÓ
        // ===================================================

        console.warn(
          "⚠️ Firebase no confirmó el guardado. Agregando a cola:",
          error
        );


        await dbPut(
          "cola_sincronizacion",
          {
            id:
              `${idLimpio}_${vKey}`,

            accion:
              "guardar",

            tipoOperacion:
              tipoOperacion,

            datos: {
              id:
                idLimpio,

              historiaClinica:
                hcData,

              consultaActual:
                visitaData,

              visitaId:
                vKey
            },

            timestamp:
              Date.now()
          }
        );


        // Actualizar panel después de encolar
        await renderizarPanelDiagnostico();


        Swal.fire(
          'Guardado Local',
          'Datos protegidos localmente en el dispositivo (Error de red).',
          'info'
        );


        btn.innerText =
          "⚠️ Guardado Local";

      }


    } catch (error) {

      // =====================================================
      // 21. ERROR GENERAL
      // =====================================================

      console.error(
        "❌ Error general guardando expediente:",
        error
      );


      Swal.fire(
        'Error',
        'No fue posible guardar la información.',
        'error'
      );


      btn.innerText =
        "⚠️ Error al guardar";


    } finally {

      // =====================================================
      // 22. REACTIVAR SIEMPRE BOTÓN
      // =====================================================

      btn.disabled =
        false;

    }

  });
}

function obtenerFechaLocalISO() {
  const hoy = new Date();

  const year = hoy.getFullYear();
  const month = String(hoy.getMonth() + 1).padStart(2, "0");
  const day = String(hoy.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

window.cargarVisitaEspecifica = async function(pacienteId, visitaId) {
    const data = await dbGet("expedientes", pacienteId);
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

// --- 6. ENGINE DE IMPRESIÓN CON TELEMETRÍA DE DEBUG EN CONSOLA (F12) ---
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

async function renderizarDatos(data, idLimpio, modo, vIdUrl) {
  const hc = data.historiaClinica || {};

  // --- 1. Poblado de Historia Clínica y Palabras Reservadas ---
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

  // --- 2. Carga de la Visita (Edición vs Nueva Consulta) ---
  if (modo === 'editar') {
    let v = null;

    // 1. Intentar primero con IndexedDB (reemplazo de RTDB caliente)
    if (data.visitas?.[vIdUrl]) {
      console.log("🔥 Visita localizada en IndexedDB.");
      v = data.visitas[vIdUrl];
    } 
    // 2. Si vIdUrl es nulo o inválido → usar ultimaVisitaId
    else if ((!vIdUrl || !data.visitas?.[vIdUrl]) && data.ultimaVisitaId && data.visitas?.[data.ultimaVisitaId]) {
      console.log("⚠️ visitaId inválido → usando ultimaVisitaId:", data.ultimaVisitaId);
      v = data.visitas[data.ultimaVisitaId];
    }
    // 3. Si estás offline → última visita guardada
    else if (!navigator.onLine && data.ultimaVisitaId && data.visitas?.[data.ultimaVisitaId]) {
      console.log("📴 Offline → usando última visita guardada:", data.ultimaVisitaId);
      v = data.visitas[data.ultimaVisitaId];
    }
    // 4. Si estás online y vIdUrl existe → buscar en la base fría (Firestore)
    else if (navigator.onLine && vIdUrl) {
      try {
        console.log("❄️ Buscando en Firestore (base fría)...");
        const docRef = doc(firestore, "historico_visitas", idLimpio, "visitas_archivadas", vIdUrl);
        const snapshotFria = await getDoc(docRef);
        if (snapshotFria.exists()) {
          console.log("✅ Registro recuperado desde Firestore.");
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

    // 5. Pintar datos de la visita si se encontró algo
    if (v) {
      document.getElementById('fechaVisita').value = v.fechaVisita || "";
      document.getElementById('tipo').value = v.tipo || "Regular";
      document.getElementById('padecimiento').value = v.padecimiento || "";
      document.getElementById('receta').value = v.signosVitales || v.receta || ""; // Respaldo cruzado
      document.getElementById('estudios').value = v.estudios || "";
      document.getElementById('diagnostico').value = v.diagnostico || "";
      document.getElementById('tratamiento').value = v.tratamiento || "";
      document.getElementById('pronostico').value = v.pronostico || "Bueno";
      window.visitaActualId = vIdUrl || data.ultimaVisitaId;
    } else {
      Swal.fire('No encontrado', 'El identificador de la consulta no existe en el registro actual ni en el archivo muerto.', 'error');
      document.getElementById('fechaVisita').value = obtenerFechaLocalISO();
    }
  } else {
    // Si es modo "nueva" consulta, dejamos la fecha actual lista en el formulario de la visita
    document.getElementById('fechaVisita').value = obtenerFechaLocalISO();
    document.getElementById('padecimiento').value = "MOTIVO:\nSÍNTOMAS:\n";
    document.getElementById('tratamiento').value = "MEDICAMENTOS:\n";
    document.getElementById('pronostico').value = "Bueno";
  }

  // --- 3. Disparador de eventos para campos dinámicos y autocompletado ---
  const event = new Event('input');
  ['padecimiento', 'receta', 'estudios', 'diagnostico', 'tratamiento', 'ant_heredofamiliares', 'ant_patologicos', 'ant_no_patologicos', 'ant_gineco'].forEach(id => {
    document.getElementById(id)?.dispatchEvent(event);
  });

  if (typeof configurarImpresionExpediente === 'function') {
    configurarImpresionExpediente(data);
  }
}

async function verificarEdicion() {
  const params = new URLSearchParams(window.location.search);
  const idUrl = params.get('id');
  const modo = params.get('modo');
  const vIdUrl = params.get('visitaId');

  console.log("🔍 verificarEdicion() iniciado");
  console.log("➡️ Parámetros URL:", { idUrl, modo, vIdUrl });

  if (!idUrl) {
    console.log("⚠️ No hay idUrl → nuevo expediente");
    limpiarFormularioVisita();
    reordenarSeccionesFormulario('nuevo_expediente');
    return;
  }

  const idLimpio = idUrl.toLowerCase().trim();
  console.log("🧹 idLimpio:", idLimpio);

  // 🔹 1. Asegurar el orden correcto de los apartados según la versión productiva
  if (modo === 'nueva' || modo === 'editar' || vIdUrl) {
    reordenarSeccionesFormulario('consulta_primero');
  } else {
    reordenarSeccionesFormulario('nuevo_expediente');
  }

  // 🔹 2. Leer desde IndexedDB
  console.log("📂 Buscando expediente en IndexedDB...");
  let data = await dbGet("expedientes", idLimpio);

  if (data) {
    console.log("✅ Expediente encontrado en IndexedDB, renderizando...");
    await renderizarDatos(data, idLimpio, modo, vIdUrl);
  } else {
    console.log("⚠️ No se encontró el expediente en IndexedDB localmente.");
    limpiarFormularioVisita();
  }

  // 🔹 3. Sincronización online con Firebase y actualización de IndexedDB
  if (navigator.onLine) {
    console.log("🌐 Online → intentando refrescar desde Firebase...");
    try {
      const snap = await get(ref(db, `expedientes/${idLimpio}`));
      if (snap.exists()) {
        const newData = snap.val();
        console.log("✅ Datos obtenidos de Firebase, actualizando vista...");
        
        await renderizarDatos(newData, idLimpio, modo, vIdUrl);

        // Actualizar respaldo local en IndexedDB
        await dbPut("expedientes", { id: idLimpio, ...newData });
        console.log("💾 IndexedDB sincronizado con datos frescos de Firebase");
      } else {
        console.log("⚠️ Firebase no devolvió datos para:", idLimpio);
      }
    } catch(e) { 
      console.warn("❌ Error al leer Firebase o modo offline transitorio:", e); 
    }
  } else {
    console.log("📴 Offline → usando exclusivamente datos de IndexedDB");
  }

  console.log("🏁 verificarEdicion() terminado");
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

async function verificarInternetReal() {
  try {
    const resp = await fetch('/ping.txt', { cache: 'no-store' });
    return resp.ok;
  } catch {
    return false;
  }
}

/*
async function renderizarPanelDiagnostico() {
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
    // 3. INDEXEDDB + COLA DE SINCRONIZACIÓN
    // ==========================================
    let indexeddb = "🟢 Disponible";

    let totalExpedientes = 0;
    let expedientesSincronizados = 0;
    let expedientesPendientes = 0;

    // Número de operaciones pendientes
    let pendientes = 0;


    try {

      // Leer todos los expedientes locales
      const expedientes =
        await dbGetAll("expedientes") || [];

      // Leer todas las operaciones de sincronización
      const cola =
        await dbGetAll("cola_sincronizacion") || [];


      // ==========================================
      // TOTAL DE EXPEDIENTES LOCALES
      // ==========================================
      totalExpedientes = expedientes.length;


      // ==========================================
      // TOTAL DE OPERACIONES PENDIENTES
      // ==========================================
      pendientes = cola.length;


      // ==========================================
      // IDs ÚNICOS DE EXPEDIENTES PENDIENTES
      // ==========================================
      const idsPendientes = new Set(
        cola
          .map(item => item.datos?.id)
          .filter(Boolean)
      );


      // ==========================================
      // EXPEDIENTES QUE TIENEN ALGO PENDIENTE
      // ==========================================
      expedientesPendientes = expedientes.filter(
        exp => idsPendientes.has(exp.id)
      ).length;


      // ==========================================
      // EXPEDIENTES SIN OPERACIONES PENDIENTES
      // ==========================================
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


    // ==========================================
    // 5. LOG PARA DIAGNÓSTICO
    // ==========================================
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


    // ==========================================
    // 6. FALLBACK
    // ==========================================

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
      //
      // Esto permite detectar elementos de la cola creados
      // antes de agregar tipoOperacion.
      //

      operacionesSinClasificar =
        cola.filter(
          item =>
            !item.tipoOperacion
        ).length;


      // ===================================================
      // 7. IDENTIFICAR EXPEDIENTES NUEVOS ÚNICOS
      // ===================================================
      //
      // IMPORTANTE:
      //
      // Si el mismo expediente nuevo tiene varias
      // operaciones pendientes, debe seguir contando como
      // UN SOLO expediente nuevo pendiente.
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
      // 8. CALCULAR EXPEDIENTES SINCRONIZADOS
      // ===================================================
      //
      // SOLO los expedientes completamente nuevos
      // pendientes disminuyen este contador.
      //
      // Nueva consulta:
      // NO disminuye.
      //
      // Consulta modificada:
      // NO disminuye.
      //
      // Expediente modificado:
      // NO disminuye.
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
    // 10. MOSTRAR INTERNET
    // =====================================================

    if (estadoInternet) {

      estadoInternet.innerText =
        `Internet: ${internet}`;

    }


    // =====================================================
    // 11. MOSTRAR FIREBASE
    // =====================================================

    if (estadoFirebase) {

      estadoFirebase.innerText =
        `Firebase: ${firebase}`;

    }


    // =====================================================
    // 12. MOSTRAR ESTADO DE EXPEDIENTES
    // =====================================================

    if (estadoIndexedDB) {

      estadoIndexedDB.innerText =
        `IndexedDB: ${indexeddb} | Total expedientes: ${totalExpedientes} | Sincronizados: ${expedientesSincronizados} | Nuevos pendientes: ${expedientesNuevosPendientes}`;

    }


    // =====================================================
    // 13. MOSTRAR DETALLE DE OPERACIONES PENDIENTES
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


async function procesarColaSincronizacion() {
  const internetReal = await verificarInternetReal();

  if (!internetReal) {
    console.log("📴 Sin conexión real, no se procesa la cola.");
    return;
  }

  const pendientes = await dbGetAll("cola_sincronizacion");

    if (!pendientes || pendientes.length === 0) {
     
    console.log(
    "📭 Cola vacía, nada que sincronizar."
    );
     
    await renderizarPanelDiagnostico();
     
    return;
    }

  console.log(`🔄 Sincronizando ${pendientes.length} elementos pendientes...`);

  for (const item of pendientes) {
    try {

      if (item.accion !== "guardar") continue;

      const guardarExpediente = httpsCallable(
        functions,
        "administrarExpedientePruebas"
      );

        await guardarExpediente({
        accion: "guardar",
        datos: item.datos
        });
         
        // ✅ Firebase confirmó el expediente
        const expedienteLocal = await dbGet(
        "expedientes",
        item.datos.id
        );
         
        if (expedienteLocal) {
        expedienteLocal.sincronizado = true;
        expedienteLocal.ultimaSincronizacion = Date.now();
         
        await dbPut(
        "expedientes",
        expedienteLocal
        );
        }
         
        // Ahora sí eliminamos de la cola
        await dbDelete("cola_sincronizacion", item.id);

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


  // --- 8. INICIO ---
document.addEventListener('DOMContentLoaded', async () => {
  console.log("✅ DOMContentLoaded ejecutado, enganchando listeners...");  
  // --- Acceso híbrido ---
    const offlineUser = await dbGet("usuarios", "offlineUser");

    if (offlineUser) {
        console.log("✅ Sesión activa (offline):", offlineUser.email);
        actualizarStatus();
    } else {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log("✅ Sesión activa (online):", user.email);
                actualizarStatus();
            } else {
                console.warn("⏳ Esperando confirmación de sesión...");
                // Espera unos segundos antes de redirigir
                setTimeout(() => {
                    if (!auth.currentUser) {
                        window.location.href = "login.html";
                    }
                }, 2000); // 2 segundos de gracia
            }
        });
    }

    // --- Inicializa conexión centralizada ---
    inicializarConexion();

    // --- Tu lógica de expedientes ---
    initUI();
    //actualizarIndicador("Esperando autoguardado...", "#f0f0f0", "⏳");
    //iniciarAutoguardado();
    initForm();

    await procesarColaSincronizacion();

    // ==========================================
    // CAMBIO DE ESTADO DE CONEXIÓN
    // ==========================================

    // El navegador detectó que regresó la conexión
    window.addEventListener("online", async () => {

    console.log(
        "🌐 Navegador Online. Verificando conexión real..."
    );

    // Mostrar visualmente que estamos comprobando
    mostrarEstadoTemporal();

    try {

        // Confirmar que realmente existe acceso a Internet
        const internetReal = await verificarInternetReal();

        if (!internetReal) {

        console.warn(
            "⚠️ El navegador reporta Online, pero aún no hay Internet real."
        );

        await renderizarPanelDiagnostico();
        return;
        }

        console.log(
        "✅ Internet real confirmado. Procesando cola..."
        );

        // IMPORTANTE:
        // Primero procesamos TODA la cola
        await procesarColaSincronizacion();

        // Después actualizamos el panel
        await renderizarPanelDiagnostico();

        console.log(
        "✅ Panel actualizado después de recuperar conexión."
        );

    } catch (error) {

        console.error(
        "❌ Error procesando recuperación de conexión:",
        error
        );

        await renderizarPanelDiagnostico();

    }

    });


    // ==========================================
    // EL NAVEGADOR PIERDE CONEXIÓN
    // ==========================================

    window.addEventListener("offline", async () => {

    console.log(
        "📴 Conexión perdida."
    );

    await renderizarPanelDiagnostico();

    });

    verificarEdicion();
    configurarImpresionReceta();

    const params = new URLSearchParams(window.location.search);
    const idUrl = params.get('id');
    if (idUrl) {
        const pacienteData = await dbGet("expedientes", idUrl.toLowerCase().trim()) || {};
        configurarImpresionExpediente(pacienteData);
    } else {
        configurarImpresionExpediente({});
    }

    // --- Logout híbrido ---
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

                // 🔹 Limpiar usuario offline
                await dbDelete("usuarios", "offlineUser");

                // 🔹 Limpiar todos los expedientes locales
                /*
                const backup = await dbGetAll("expedientes");
                if (backup && backup.length > 0) {
                    for (const exp of backup) {
                        await dbDelete("expedientes", exp.id);
                    }
                }
                */

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

        document
        .getElementById("btn-refrescar-panel")
        ?.addEventListener("click", async () => {

            console.log("🔄 Refresco manual del panel...");

            mostrarEstadoTemporal();

            try {

            // Permitir que se muestre el estado "Verificando..."
            await new Promise(resolve => setTimeout(resolve, 50));

            // Verificar Internet real
            const internetReal = await verificarInternetReal();

            if (internetReal) {

                console.log(
                "🌐 Internet disponible. Procesando cola..."
                );

                // Intentar sincronizar pendientes
                await procesarColaSincronizacion();

            } else {

                console.log(
                "📴 Sin Internet real. Solo se actualizará información local."
                );

            }

            // Actualizar panel con el estado final
            await renderizarPanelDiagnostico();

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


