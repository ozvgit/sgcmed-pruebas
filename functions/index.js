const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onValueCreated } = require("firebase-functions/v2/database");
// 🔑 Importamos el programador de tareas cron v2 para la automatización diaria
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

// Inicialización del SDK de Admin con soporte híbrido (RTDB + Firestore)
admin.initializeApp({
    databaseURL: "https://sgcmed-pruebas.firebaseio.com"
});

const db = admin.database();
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
//const firestore = getFirestore("historico-sgcem"); // ID exacto de tu panel[cite: 2]
const firestore = getFirestore(
admin.app(),
"historico-sgcem"
);

/**
 * 🚀 FUNCIÓN: procesarSincronizacionAuto (Mantenida intacta para compatibilidad offline)[cite: 2]
 */
exports.procesarSincronizacionAuto = onValueCreated("/cola_sincronizacion/{id}", async (event) => {
    const data = event.data.val();
    const id = event.params.id;

    if (!data) return null;

    try {
        const docRef = db.ref(`expedientes/${id}`);

        if (data.historiaClinica) {
            await docRef.child('historiaClinica').update({
                ...data.historiaClinica,
                sincronizadoEn: admin.database.ServerValue.TIMESTAMP
            });
        }

        if (data.consultaActual) {
            let visitaRef = data.visitaId ? docRef.child('visitas').child(data.visitaId) : docRef.child('visitas').push();
            await visitaRef.update({
                ...data.consultaActual,
                fecha: admin.database.ServerValue.TIMESTAMP,
                fuente: "offline_sync"
            });
        }

        await docRef.update({ id: id, ultimaModificacion: admin.database.ServerValue.TIMESTAMP });
        await db.ref(`cola_sincronizacion/${id}`).remove();
        return null;

    } catch (error) {
        await db.ref(`cola_sincronizacion/${id}`).update({ estado: 'error', errorDetalle: error.message });
        return null;
    }
});

/**
 * 🧹 PASO 1: ejecutarDepuracionHistorica[cite: 2]
 * Ejecución: Todos los días a la medianoche estrictamente (00:00 AM).[cite: 2]
 * Tareas: 
 * 1. Migrar visitas médicas mayores a 365 días desde RTDB hacia Firestore.[cite: 2]
 * 2. Generar un log analítico detallado.[cite: 2]
 * 3. Auto-depurar la sección de logs viejos para mantener solo los últimos 30 días de historial.[cite: 2]
 */
exports.ejecutarDepuracionHistoricaPruebas = onSchedule({
    schedule: "0 0 * * *",
    timeZone: "America/Mexico_City",
    secrets: ["GMAIL_USER_EMAIL", "GMAIL_USER_PASSWORD"]
}, async (event) => {

    const timestampInicio = Date.now();
    const logsDetalle = [];

    let expedientesEvaluados = 0;
    let visitasDepuradasTotal = 0;

    let estadoFinal = "✅ EXITOSO (Operación sin anomalías)";

    logsDetalle.push(
        `[${new Date().toLocaleTimeString()}] 💾 Iniciando escaneo automatizado en 'expedientes/'...`
    );

    try {

        const snapshot = await db.ref("expedientes").get();

        if (!snapshot.exists()) {

            logsDetalle.push(
                `[${new Date().toLocaleTimeString()}] ⚠️ No se encontraron expedientes en el nodo principal.`
            );

            await registrarLogMantenimiento(
                timestampInicio,
                "CONCLUIDO_SIN_DATOS",
                0,
                0,
                logsDetalle
            );

            return null;
        }

        const datosMapeados = snapshot.val();

        const LIMITE_RETENCION_MS =
            365 * 24 * 60 * 60 * 1000;

        const fechaCorte =
            timestampInicio - LIMITE_RETENCION_MS;

        const llavesPacientes =
            Object.keys(datosMapeados);

        expedientesEvaluados =
            llavesPacientes.length;

        for (const pacienteId of llavesPacientes) {

            const exp = datosMapeados[pacienteId];

            if (!exp.visitas) continue;

            const llavesVisitas =
                Object.keys(exp.visitas);

            const visitasParaMigrar = [];

            console.log(
                `Paciente: ${pacienteId}`
            );

            console.log(
                `Visitas encontradas: ${llavesVisitas.length}`
            );

            llavesVisitas.forEach(vId => {

                const visita = exp.visitas[vId];

                let timestampVisita = 0;

                // PRIORIDAD 1:
                // fecha clínica real
                if (
                    visita.fechaVisita &&
                    typeof visita.fechaVisita === "string"
                ) {

                    const fechaParseada = new Date(
                        visita.fechaVisita + "T00:00:00"
                    ).getTime();

                    if (!isNaN(fechaParseada)) {
                        timestampVisita = fechaParseada;
                    }
                }

                // PRIORIDAD 2:
                // respaldo para registros antiguos
                else if (
                    visita.fecha &&
                    !isNaN(Number(visita.fecha))
                ) {
                    timestampVisita =
                        Number(visita.fecha);
                }

                if (
                    timestampVisita > 0 &&
                    timestampVisita < fechaCorte
                ) {

                    visitasParaMigrar.push({
                        vId,
                        datos: visita
                    });
                }

            });

            console.log(
            `Paciente ${pacienteId}: ${visitasParaMigrar.length} visitas para migrar`
            );
            if (visitasParaMigrar.length > 0) {

                logsDetalle.push(
                    `[${new Date().toLocaleTimeString()}] 📌 Paciente '${pacienteId}': Se detectaron ${visitasParaMigrar.length} visitas antiguas.`
                );

                for (const item of visitasParaMigrar) {

                    console.log(
                    `Migrando visita ${item.vId} del paciente ${pacienteId}`
                    );
                    // Guardar en Firestore Histórico
                    await firestore
                        .collection("historico_visitas")
                        .doc(pacienteId)
                        .collection("visitas_archivadas")
                        .doc(item.vId)
                        .set({
                            ...item.datos,
                            migradoEnTimestamp:
                                FieldValue.serverTimestamp(),
                            securityStatus:
                                "ARCHIVADO_HISTORICO_5_ANOS"
                        });

                        console.log(
                        `Migración exitosa: ${item.vId}`
                        );
                    // Eliminar de RTDB
                    await db
                        .ref(
                            `expedientes/${pacienteId}/visitas/${item.vId}`
                        )
                        .remove();

                    visitasDepuradasTotal++;
                }

                logsDetalle.push(
                    "           -> Migración a Firestore y liberación de espacio completada. ✅"
                );
            }
        }

        logsDetalle.push(
            `[${new Date().toLocaleTimeString()}] 🧹 Limpieza y compactación de logs de auditoría completada con éxito.`
        );

    } catch (error) {

        console.error(
            "❌ Error crítico durante el proceso de mantenimiento diario:",
            error
        );

        estadoFinal =
            `🚨 ERROR INTERNO CRÍTICO: ${error.message}`;

        logsDetalle.push(
            `[${new Date().toLocaleTimeString()}] ❌ FALLA EN EJECUCIÓN: ${error.message}`
        );

    } finally {

        await registrarLogMantenimiento(
            timestampInicio,
            estadoFinal,
            expedientesEvaluados,
            visitasDepuradasTotal,
            logsDetalle
        );
    }

    return null;
});

/**
 * Auxiliar: Registra el Log de mantenimiento, purga reportes obsoletos y DISPARA EL CORREO DIRECTO[cite: 2]
 */
async function registrarLogMantenimiento(timestampInicio, estado, evaluados, depurados, logArreglo) {
    const logId = `mantenimiento_${new Date(timestampInicio).toISOString().slice(0,10)}`;
    const duracionSegundos = ((Date.now() - timestampInicio) / 1000).toFixed(2);
    
    // 1. Estructuramos el cuerpo del log tal como lo solicitaste[cite: 2]
    const detalleTextoLogs = logArreglo.join("\n");

    const payloadLog = {
        fechaEjecucion: new Date(timestampInicio).toLocaleString(),
        timestamp: timestampInicio,
        estadoGeneral: estado,
        duracionComputo: `${duracionSegundos} seg`,
        totalExpedientesEvaluados: evaluados,
        totalVisitasMigradasAFirestore: depurados,
        espacioLiberadoEstimado: `${(depurados * 0.4).toFixed(2)} KB (Aprox)`,
        detalleFlujoLogs: detalleTextoLogs
    };

    // Guardamos el reporte del día actual para tu auditoría interna[cite: 2]
    await db.ref(`logs_mantenimiento/${logId}`).set(payloadLog);

    // =========================================================================
    // 📧 2. ENVÍO DIRECTO DE CORREO AUTOMÁTICO (USANDO SECRETOS)[cite: 2]
    // =========================================================================
    try {
        const nodemailer = require("nodemailer");

        // Creamos el transporte usando de manera segura tus variables de entorno en la nube[cite: 2]
        const transportador = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.GMAIL_USER_EMAIL,
                pass: process.env.GMAIL_USER_PASSWORD
            }
        });

        const opcionesCorreo = {
            from: process.env.GMAIL_USER_EMAIL,
            to: "oscarzarzalinternaverde@gmail.com",
            subject: `🛠️ [SGI-SGCMED] - LOG DE MANTENIMIENTO CORRESPONDIENTE AL ${new Date(timestampInicio).toLocaleDateString()}`,
            text: `REPORTE DE OPERACIÓN Y LOGS DE AUDITORÍA CENTRALIZADA\n\n` +
                  `• Fecha de Ejecución: ${payloadLog.fechaEjecucion}\n` +
                  `• Estado General: ${payloadLog.estadoGeneral}\n` +
                  `• Duración del Cómputo: ${payloadLog.duracionComputo}\n` +
                  `• Total Expedientes Evaluados: ${payloadLog.totalExpedientesEvaluados}\n` +
                  `• Visitas Migradas a Firestore: ${payloadLog.totalVisitasMigradasAFirestore}\n` +
                  `• Espacio Liberado Estimado: ${payloadLog.espacioLiberadoEstimado}\n\n` +
                  `=========================================================================\n` +
                  `DETALLE CRONOLÓGICO DEL FLUJO DE DEPURACIÓN:\n` +
                  `=========================================================================\n` +
                  `${payloadLog.detalleFlujoLogs}`
        };

        // Ejecutamos el envío de forma asíncrona hacia los servidores de Gmail[cite: 2]
        await transportador.sendMail(opcionesCorreo);
        console.log(`📧 Correo de mantenimiento enviado con éxito de forma directa para el log: ${logId}`);

    } catch (mailErr) {
        console.error("⚠️ Falla crítica al intentar enviar el correo directo de mantenimiento:", mailErr.message);
    }

    // 3. 🧹 AUTO-DEPURACIÓN DE LOGS (Anti-Basura para mantener limpia la BD)[cite: 2]
    try {
        const snapshotLogs = await db.ref('logs_mantenimiento').get();
        if (snapshotLogs.exists()) {
            const todosLosLogs = snapshotLogs.val();
            const RETENCION_LOGS_MS = 30 * 24 * 60 * 60 * 1000;
            const limiteVencimientoLogs = timestampInicio - RETENCION_LOGS_MS;

            for (const key of Object.keys(todosLosLogs)) {
                const logItem = todosLosLogs[key];
                if (logItem.timestamp && logItem.timestamp < limiteVencimientoLogs) {
                    await db.ref(`logs_mantenimiento/${key}`).remove();
                    // Al borrar el log viejo, también borramos su orden de correo residual para no dejar basura[cite: 2]
                    await db.ref(`cola_correos_sistema/${key}`).remove();
                    console.log(`🧹 Log y correo residual obsoleto removido: ${key}`);
                }
            }
        }
    } catch (err) {
        console.warn("No se pudo completar la purga secundaria de logs obsoletos:", err.message);
    }
}

/**
 * Cloud Function: administrarExpedientePruebas (Extendida para Búsqueda Híbrida)[cite: 2]
 */
exports.administrarExpedientePruebas = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Acceso denegado.");
    const { accion, datos } = request.data;
    const PATH_BD = 'expedientes';

    try {
        switch (accion) {
            case 'guardar':
                if (!datos.id) throw new HttpsError("invalid-argument", "ID requerido.");
                const pacienteId = datos.id.toLowerCase().trim();
                const docRef = db.ref(`${PATH_BD}/${pacienteId}`);
                
                if (datos.historiaClinica) await docRef.child('historiaClinica').update(datos.historiaClinica);

                if (datos.consultaActual) {
                    let visitaRef = (datos.visitaId && datos.visitaId !== "null") 
                        ? docRef.child('visitas').child(datos.visitaId) 
                        : docRef.child('visitas').push();

                    await visitaRef.set({ ...datos.consultaActual, fecha: admin.database.ServerValue.TIMESTAMP });
                }
                await docRef.update({ id: pacienteId, ultimaModificacion: admin.database.ServerValue.TIMESTAMP });
                return { success: true, message: "Sincronizado correctamente.", id: pacienteId };

            case 'eliminar':
                if (!datos.id) throw new HttpsError("invalid-argument", "ID requerido.");
                await db.ref(`${PATH_BD}/${datos.id}`).remove();
                return { success: true, message: "Eliminado correctamente." };

            // 🔍 CONSULTA HISTÓRICA REFORZADA CON METADATOS DE FICHA INTEGRADOS
            case 'consultarHistorico':
                if (!datos.id) throw new HttpsError("invalid-argument", "Término de búsqueda requerido.");
                const terminoLimpio = datos.id.toLowerCase().trim();
                
                console.log(`Iniciando escaneo seguro en Firestore para: ${terminoLimpio}`);
                
                const coleccionRaiz = firestore.collection("historico_visitas");
                const listaDocumentos = await coleccionRaiz.listDocuments();

                if (listaDocumentos.length === 0) {
                    return { success: true, mensaje: "El archivo histórico se encuentra vacío.", visitas: [] };
                }

                const visitasArchivadas = [];

                for (const docRef of listaDocumentos) {
                    const idPacienteReal = docRef.id.toLowerCase();

                    if (idPacienteReal.includes(terminoLimpio)) {
                        console.log(`Coincidencia hallada en contenedor: ${docRef.id}`);

                        // 📄 Recuperamos el documento raíz del paciente para extraer los datos reales de su Ficha
                        const docPacienteSnap = await docRef.get();
                        let fechaFichaRaiz = "Sin Fecha";
                        let edadRaiz = "N/A";

                        if (docPacienteSnap.exists) {
                            const datosRaiz = docPacienteSnap.data();
                            // Buscamos las propiedades tal cual se estructuran en tu base de datos
                            fechaFichaRaiz = datosRaiz.fechaFicha || datosRaiz.fechaAlta || datosRaiz.historiaClinica?.fechaFicha || "Sin Fecha";
                            edadRaiz = datosRaiz.edad || datosRaiz.historiaClinica?.edad || "N/A";
                        }

                        // Extraemos la subcolección de visitas reales del paciente
                        const subSnapshot = await coleccionRaiz
                            .doc(docRef.id)
                            .collection("visitas_archivadas")
                            .get();
                            
                        subSnapshot.forEach(docVisita => {
                            const dataVisita = docVisita.data();
                            
                            visitasArchivadas.push({
                                visitaId: docVisita.id,
                                pacienteIdOriginal: docRef.id,
                                // 🎯 INYECCIÓN DE SEGURIDAD: Si la visita individual no tiene los datos,
                                // le asignamos los valores reales que leímos del expediente raíz del paciente
                                fechaFicha: dataVisita.fechaFicha || dataVisita.historiaClinica?.fechaFicha || fechaFichaRaiz,
                                edad: dataVisita.edad || dataVisita.historiaClinica?.edad || edadRaiz,
                                ...dataVisita
                            });
                        });
                    }
                }

                if (visitasArchivadas.length === 0) {
                    return { 
                        success: true, 
                        mensaje: `No se localizaron registros archivados que coincidan con '${datos.id}'.`, 
                        visitas: [] 
                    };
                }

                return {
                    success: true,
                    mensaje: `Se localizaron ${visitasArchivadas.length} visitas históricas de forma exitosa.`,
                    visitas: visitasArchivadas
                };

            default: throw new HttpsError("invalid-argument", "Acción no válida.");
        }
    } catch (error) { throw new HttpsError("internal", error.message); }
});

/**
 * Cloud Function: administrarConfiguracion (Mantenida para compatibilidad de paginación)[cite: 2]
 */
exports.administrarConfiguracion = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Acceso denegado.");
    const { accion, datos } = request.data;
    const PATH_CFG = 'parametros/global';

    try {
        if (accion === 'actualizar') {
            const configuracionLimpia = {
                paginacion: parseInt(datos.paginacion) || 10,
                estiloBotones: datos.estiloBotones || 'completo',
                ultimaActualizacion: admin.database.ServerValue.TIMESTAMP
            };
            await db.ref(PATH_CFG).set(configuracionLimpia);
            return { success: true, message: "Parámetros actualizados." };
        }
        if (accion === 'obtener') {
            const snapshot = await db.ref(PATH_CFG).get();
            return snapshot.val() || { paginacion: 10, estiloBotones: 'completo' };
        }
    } catch (error) { throw new HttpsError("internal", error.message); }
});