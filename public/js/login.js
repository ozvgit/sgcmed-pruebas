import { auth } from "/js/config.js";

import {
    signInWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = "index.html";
    }
});

const btnLogin = document.getElementById("btn-login");

btnLogin.addEventListener("click", async () => {

    const correo = document.getElementById("correo").value.trim();
    const password = document.getElementById("password").value;
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

        await signInWithEmailAndPassword(auth, correo, password);

    } catch (error) {

        console.error(error);

        Swal.fire({
            icon: "error",
            title: "Acceso denegado",
            text: "Usuario o contraseña incorrectos."
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
console.log("ENVIANDO A:", correo);
console.log("RECOVERY OK");
/*
            Swal.fire({
                icon: "success",
                title: "Correo enviado",
                text: "Revise su correo para restablecer la contraseña."
            });
*/
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