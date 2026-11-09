// js/restaurante.js - v7 (Fixed & Clean)

(function () {
  // --- FIREBASE INIT ---
  function ensureFirebase(callback) {
    if (window.firebase && window.firebase.auth && window.firebase.firestore) {
      initFirebase(callback);
    } else {
      console.error("Firebase libraries not loaded. Check internet connection.");
    }
  }

  function initFirebase(callback) {
    console.log("Restaurante: Using central Firebase initialization...");
    if (!firebase.apps.length) {
      console.error("Firebase not initialized. Ensure firebase-init.js is loaded.");
      return;
    }

    const auth = firebase.auth();
    window.auth = auth; // Expose globally

    // [MODIFIED] Force Persistence to LOCAL (Remember session)
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .catch(error => console.error("Persistence Error:", error));

    // --- UI AUTH HANDLERS ---
    const modalLogin = document.getElementById("modalLogin");
    const formLogin = document.getElementById("formLogin");
    const btnLogout = document.getElementById("btnLogout");

    if (formLogin) {
      formLogin.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = document.getElementById("loginEmail").value;
        const pass = document.getElementById("loginPass").value;
        const errDiv = document.getElementById("loginError");
        const btn = document.getElementById("btnLoginSubmit");

        if (errDiv) errDiv.classList.add("hidden");
        if (btn) { btn.disabled = true; btn.innerText = "Verificando..."; }

        auth.signInWithEmailAndPassword(email, pass).catch(err => {
          console.error("Auth Error:", err);
          if (btn) { btn.disabled = false; btn.innerText = "ENTRAR"; }
          if (errDiv) {
            // Friendly error messages
            let msg = "Error desconocido";
            if (err.code === 'auth/wrong-password') msg = "Contraseña incorrecta";
            else if (err.code === 'auth/user-not-found') msg = "Usuario no encontrado";
            else if (err.code === 'auth/invalid-email') msg = "Email inválido";
            else msg = err.message;

            errDiv.innerText = msg;
            errDiv.classList.remove("hidden");
          }
        });
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        if (confirm("¿Cerrar sesión de Chef?")) {
          auth.signOut().then(() => window.location.reload());
        }
      });
    }

    // --- AUTH STATE MONITOR ---
    // Only loads data (callback) if authenticated
    auth.onAuthStateChanged((user) => {
      if (user) {
        console.log("[AUTH] Chef Logged In:", user.email);
        if (modalLogin) modalLogin.classList.add("hidden");
        if (btnLogout) btnLogout.classList.remove("hidden");

        // Prevent double init
        if (!window.appStarted) {
          window.appStarted = true;
          callback();
        }
      } else {
        console.log("[AUTH] No User. Locking UI.");
        if (modalLogin) modalLogin.classList.remove("hidden");
        if (btnLogout) btnLogout.classList.add("hidden");
      }
    });
  }

  let db;
  let currentWeekStart = new Date();
  // [MODIFIED] Do not force to Monday on init, so we keep "Today" as selected
  // const cleanDay = currentWeekStart.getDay();
  // const diff = currentWeekStart.getDate() - cleanDay + (cleanDay === 0 ? -6 : 1);
  // currentWeekStart.setDate(diff);

  let loadedReservations = [];
  const STORAGE_KEY = "mesaChef_hotel";

  // [INTEGRATION] Check for Hotel Context Override (Before App Start)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const hotelOverride = urlParams.get('hotel');
    if (hotelOverride && (hotelOverride === 'Guadiana' || hotelOverride === 'Cumbria')) {
      console.log("[INTEGRATION] Hotel override detected:", hotelOverride);
      localStorage.setItem(STORAGE_KEY, hotelOverride);
    }
  } catch (e) {
    console.error("[INTEGRATION] Error reading params:", e);
  }

  const SPACES = ["Restaurante", "Cafeteria"];

  const utils = {
    getWeekDates: (d) => {
      const start = new Date(d);
      // [NEW] Calculate Monday dynamically
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);

      const dates = [];
      for (let i = 0; i < 7; i++) {
        let temp = new Date(start);
        temp.setDate(temp.getDate() + i);
        dates.push(temp);
      }
      return dates;
    },
    toIsoDate: (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },
    formatDateES: (d) => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    formatDateShort: (d) => {
      const dias = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];
      const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
    },
    formatDateTime: (ts) => {
      if (!ts) return "-";
      let d;
      if (ts.toDate) d = ts.toDate();
      else if (ts instanceof Date) d = ts;
      else d = new Date(ts);
      if (isNaN(d.getTime())) return "-";
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    }
  };

  let restaurantConfig = {}; // Global Config
  let specialDatesConfig = []; // [NEW] Special Capacity Dates
  let closureRules = []; // [NEW] Automatic Closure Rules
  let whatsappTemplate = ''; // WhatsApp message template

  async function loadRestaurantConfig() {
    try {
      const doc = await db.collection("master_data").doc("CONFIG_SALONES").get();
      if (doc.exists) {
        const data = doc.data();
        restaurantConfig = data.horarios || {};
        // Load hotel-specific configs
        const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
        const specialKey = 'restauranteEspecial' + hotel;
        const whatsappKey = 'whatsappTemplate' + hotel;
        specialDatesConfig = data[specialKey] || [];
        closureRules = data.restauranteCierres || []; // [NEW]
        whatsappTemplate = data[whatsappKey] || '';
        console.log("DEBUG: Restaurant Config Loaded", restaurantConfig, "Special Dates (" + hotel + "):", specialDatesConfig, "Closure Rules:", closureRules.length, "WhatsApp Template:", whatsappTemplate ? "✓" : "✗");
      }
    } catch (e) { console.error("Config Load Error", e); }
  }

  // Auto-fill time based on Turn and Config
  function autoSetTime(turno) {
    const t = (turno || 'almuerzo').toLowerCase();
    const field = document.getElementById("campoHora");
    if (!field) return;

    let time = "13:00"; // Fallback
    if (t === 'almuerzo') time = restaurantConfig.almIni || "13:00";
    if (t === 'cena') time = restaurantConfig.cenaIni || "20:30";

    field.value = time;
  }

  // [NEW] Check if a shift is closed by rule or override
  function getShiftStatus(hotel, space, turno, dateStr) {
    // 1. Check Especial Capacity (OVERRIDE)
    const specialEntry = specialDatesConfig.find(d => d.date === dateStr);
    if (specialEntry) {
      const isLunch = turno === 'almuerzo';
      const key = space === 'Cafeteria' ? (isLunch ? 'cafLunchMax' : 'cafDinnerMax') : (isLunch ? 'lunchMax' : 'dinnerMax');
      const max = specialEntry[key];

      // If we have an entry with max > 0, it is FORCED OPEN
      if (typeof max === 'number' && max > 0) return { closed: false, override: true, max: max };
      // If we have an entry with max === 0, it is FORCED CLOSED
      if (max === 0) return { closed: true, override: true, reason: 'Aforo 0 (Especial)' };
    }

    // 2. Check General Closure Rules
    const date = new Date(dateStr);
    const dow = date.getDay(); // 0=Sun, 1=Mon...

    for (const r of closureRules) {
      // Match Hotel
      if (r.hotel !== 'AMBOS' && r.hotel !== hotel) continue;
      // Match Turno
      if (r.turno !== 'AMBOS' && r.turno.toLowerCase() !== turno.toLowerCase()) continue;
      // Match Day of Week
      if (r.dow !== 'ALL' && parseInt(r.dow) !== dow) continue;
      // Match Date Range
      if (r.start && dateStr < r.start) continue;
      if (r.end && dateStr > r.end) continue;

      return { closed: true, reason: r.note || 'Cerrado por admin' };
    }

    return { closed: false };
  }

  // [NEW] Open a closed shift punctually
  window.openPunctually = async function (space, dateStr, turno) {
    const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
    if (!confirm(`¿Deseas ABRIR PUNTUALMENTE el turno de ${turno} para el ${dateStr}?\n\n(Esto creará un aforo especial para este día anulando las reglas de cierre general)`)) return;

    try {
      const docRef = db.collection("master_data").doc("CONFIG_SALONES");
      const snap = await docRef.get();
      if (!snap.exists) return;

      const data = snap.data();
      const specialKey = 'restauranteEspecial' + hotel;
      const list = data[specialKey] || [];

      // Find or Create entry
      let entry = list.find(d => d.date === dateStr);
      if (!entry) {
        entry = { date: dateStr, lunchMax: 130, dinnerMax: 130, cafLunchMax: 50, cafDinnerMax: 50 };
        list.push(entry);
      }

      // Set positive capacity for this specific shift
      const isLunch = turno === 'almuerzo';
      if (space === 'Cafeteria') {
        if (isLunch) entry.cafLunchMax = 50;
        else entry.cafDinnerMax = 50;
      } else {
        if (isLunch) entry.lunchMax = 130;
        else entry.dinnerMax = 130;
      }

      await docRef.update({ [specialKey]: list });
      alert("✅ Turno abierto correctamente. Recargando...");
      location.reload();
    } catch (e) {
      alert("Error: " + e.message);
    }
  };

  async function startApp() {
    console.log("Restaurante v7: Starting...");
    db = firebase.firestore();

    await loadRestaurantConfig(); // <--- Load Config

    // Event Listener for Auto-Time
    const turnoSelect = document.getElementById("campoTurno");
    if (turnoSelect) {
      turnoSelect.addEventListener("change", (e) => {
        autoSetTime(e.target.value);
      });
    }

    // 1. HOTEL
    let currentHotel = localStorage.getItem(STORAGE_KEY);
    if (!currentHotel) currentHotel = "Guadiana";

    const headerHotelName = document.getElementById("headerHotelName");
    console.log("DEBUG: looking for headerHotelName", headerHotelName);
    if (headerHotelName) {
      console.log("DEBUG: injection hotel", currentHotel);
      if (currentHotel === "Guadiana") {
        headerHotelName.innerHTML = `
              <img src="Img/logo-guadiana.svg" class="h-8 w-auto object-contain mr-3" alt="Sercotel Guadiana">
              <span class="text-slate-700 font-bold tracking-tight">Sercotel Guadiana</span>
          `;
      } else {
        headerHotelName.innerHTML = `
              <img src="Img/logo-cumbria.svg" class="h-8 w-auto object-contain mr-3" alt="Cumbria Spa">
              <span class="text-slate-700 font-bold tracking-tight">Cumbria Spa&Hotel</span>
          `;
      }
    } else {
      console.error("DEBUG: headerHotelName NOT FOUND");
    }
    const connStatus = document.getElementById("connStatus");
    if (connStatus) connStatus.classList.remove("opacity-50"); // Example logic, or generally just leave it be as style is static mainly.
    // Actually, in salones.js we didn't specifically toggle a class to show it, it's always there. 
    // But the loading logic handles the 'Online' text. Let's match existing logic if possible or ignore if visual only.
    // In startApp, line 69 was showing a label. The new UI has it always visible.
    // We can just remove the old line 69.

    // 2. LISTENERS
    document.getElementById("btnNuevaReserva").addEventListener("click", () => openBooking());
    document.getElementById("btnCerrarModal").addEventListener("click", closeModal);
    document.getElementById("btnAnular").addEventListener("click", anularReservation);
    document.getElementById("formReserva").addEventListener("submit", saveReservation);

    document.getElementById("btnPrev").addEventListener("click", () => changeWeek(-1));
    document.getElementById("btnNext").addEventListener("click", () => changeWeek(1));

    // PAYGOLD LISTENERS (MULTIHOTEL)
    document.getElementById("btnCopyRtePaygoldRef")?.addEventListener("click", () => {
      const el = document.getElementById("campoPaygoldRef");
      if (el && el.value) {
        navigator.clipboard.writeText(el.value).then(() => {
          const btn = document.getElementById("btnCopyRtePaygoldRef");
          if (btn) { const t = btn.innerText; btn.innerText = "✓ Copiado"; setTimeout(() => btn.innerText = t, 1500); }
        });
      }
    });

    document.getElementById("btnCopyRtePaygoldAmount")?.addEventListener("click", () => {
      const el = document.getElementById("campoPaygoldAmount");
      if (el && el.value) {
        navigator.clipboard.writeText(el.value).then(() => {
          const btn = document.getElementById("btnCopyRtePaygoldAmount");
          if (btn) { const t = btn.innerText; btn.innerText = "✓ Copiado"; setTimeout(() => btn.innerText = t, 1500); }
        });
      }
    });

    document.getElementById("btnRegenRtePaygoldRef")?.addEventListener("click", () => {
      const el = document.getElementById("campoPaygoldRef");
      if (el) {
        el.value = "RES-" + Date.now().toString().slice(-6);
      }
    });

    document.getElementById("btnPayFullPendingRte")?.addEventListener("click", () => {
      const st = document.getElementById("campoPaygoldStatus");
      const est = document.getElementById("campoEstado");
      if (st) st.value = "garantizado";
      if (est) est.value = "confirmada";
      alert("✅ Fianza / Garantía marcada como COBRADA.\nEl estado pasará a Confirmada al pulsar GUARDAR.");
    });

    document.getElementById("btnSendWhatsAppPaygoldRte")?.addEventListener("click", () => {
      const phoneInput = document.getElementById("campoTelefono");
      const linkInput = document.getElementById("campoPaygoldLink");
      const refInput = document.getElementById("campoPaygoldRef");
      const amountInput = document.getElementById("campoPaygoldAmount");
      const nameInput = document.getElementById("campoNombre");
      const fechaInput = document.getElementById("campoFecha");
      const horaInput = document.getElementById("campoHora");
      const paxInput = document.getElementById("campoPax");

      const phone = phoneInput ? phoneInput.value.replace(/\D/g, "") : "";
      if (!phone || phone.length < 9) {
        alert("⚠️ Por favor introduce un número de teléfono válido para enviar el WhatsApp.");
        return;
      }

      const link = linkInput ? linkInput.value.trim() : "";
      if (!link || !link.startsWith("http")) {
        alert("⚠️ Es obligatorio pegar el enlace de pago PayGold generado en el TPV de Eurocaja antes de enviar el WhatsApp.");
        linkInput?.focus();
        return;
      }

      const hotelKey = localStorage.getItem(STORAGE_KEY) || "Guadiana";
      const hotelName = hotelKey === "Guadiana" ? "Sercotel Guadiana" : "Cumbria Spa&Hotel";
      const cliente = nameInput ? nameInput.value.trim() : "Cliente";
      const ref = refInput ? refInput.value.trim() : "";
      const amount = amountInput ? amountInput.value.trim() : "0.00";
      const fecha = fechaInput ? utils.formatDateES(new Date(fechaInput.value)) : "";
      const hora = horaInput ? horaInput.value : "";
      const pax = paxInput ? (paxInput.value || "1") : "1";

      const msg = `Hola ${cliente}, te contactamos desde ${hotelName}. Para confirmar tu reserva del ${fecha} a las ${hora} (${pax} pax), te facilitamos el enlace oficial de fianza/garantía (${amount}€) a través de nuestra pasarela segura Eurocaja Rural:\n\n👉 Enlace de pago: ${link}\nCód. Pedido: ${ref}\n\n¡Muchas gracias!`;

      const st = document.getElementById("campoPaygoldStatus");
      if (st && st.value === "pendiente") st.value = "enlace_enviado";

      const url = `https://api.whatsapp.com/send?phone=34${phone}&text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank");
    });

    // DYNAMIC TOTALS LISTENERS
    const calcInputs = ["campoPrecio", "campoPax", "campoNinos", "campoPrecioNinos"];
    calcInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", updateTotalDisplay);
    });

    // SERVICE INCLUDED HELPER & TOGGLE
    window.setServicioIncluidoUI = function (isIncluded) {
      const checkServicio = document.getElementById("checkServicioIncluido");
      if (checkServicio) checkServicio.checked = !!isIncluded;

      const container = document.getElementById("containerDetalleIncluido");
      const wrapperPrecioAdl = document.getElementById("wrapperPrecioAdl");
      const wrapperPrecioNin = document.getElementById("wrapperPrecioNin");
      const precioAdl = document.getElementById("campoPrecio");
      const precioNin = document.getElementById("campoPrecioNinos");
      const euroAdl = precioAdl ? precioAdl.nextElementSibling : null;
      const euroNin = precioNin ? precioNin.nextElementSibling : null;
      const badgeDirecto = document.getElementById("badgePagoDirectoModal");

      if (isIncluded) {
        if (precioAdl) { precioAdl.value = ""; precioAdl.disabled = true; }
        if (precioNin) { precioNin.value = ""; precioNin.disabled = true; }
        if (wrapperPrecioAdl) wrapperPrecioAdl.style.display = "none";
        else if (precioAdl) { precioAdl.style.display = "none"; if (euroAdl) euroAdl.style.display = "none"; }
        if (wrapperPrecioNin) wrapperPrecioNin.style.display = "none";
        else if (precioNin) { precioNin.style.display = "none"; if (euroNin) euroNin.style.display = "none"; }
        if (container) container.classList.remove("hidden");
        if (badgeDirecto) badgeDirecto.classList.add("hidden");
        document.getElementById("sectionRestaurantePaygold")?.classList.add("hidden");
      } else {
        if (precioAdl) { precioAdl.disabled = false; }
        if (precioNin) { precioNin.disabled = false; }
        if (wrapperPrecioAdl) wrapperPrecioAdl.style.display = "";
        else if (precioAdl) { precioAdl.style.display = ""; if (euroAdl) euroAdl.style.display = ""; }
        if (wrapperPrecioNin) wrapperPrecioNin.style.display = "";
        else if (precioNin) { precioNin.style.display = ""; if (euroNin) euroNin.style.display = ""; }
        if (container) container.classList.add("hidden");
        if (badgeDirecto) badgeDirecto.classList.remove("hidden");
        document.getElementById("sectionRestaurantePaygold")?.classList.remove("hidden");
      }
    };

    document.getElementById("checkServicioIncluido").addEventListener("change", function () {
      window.setServicioIncluidoUI(this.checked);
      updateTotalDisplay();
    });

    // TIPO INCLUIDO TOGGLE
    const tipoIncluido = document.getElementById("tipoIncluido");
    if (tipoIncluido) {
      tipoIncluido.addEventListener("change", function () {
        const isHotel = this.value === 'hotel';
        document.getElementById("wrapperHabitacion").classList.toggle("hidden", !isHotel);
        document.getElementById("wrapperBono").classList.toggle("hidden", isHotel);
      });
    }

    // PHONE MASK
    if (document.getElementById("campoTelefono")) {
      document.getElementById("campoTelefono").addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '').substring(0, 9);
        if (v.length > 6) v = v.slice(0, 3) + " " + v.slice(3, 6) + " " + v.slice(6);
        else if (v.length > 3) v = v.slice(0, 3) + " " + v.slice(3);
        e.target.value = v;
      });
    }

    // PRINT
    document.getElementById("btnPrintWeek").addEventListener("click", () => printReport('semana'));
    document.getElementById("btnPrintDay").addEventListener("click", () => printReport('dia'));

    // FILTERS
    document.getElementById("filtroEstado").addEventListener("change", () => paintReservations(loadedReservations));
    document.getElementById("txtBuscar").addEventListener("input", function (e) {
      paintReservations(loadedReservations);
      if (typeof doSearch === 'function') doSearch(e.target.value);
    });

    renderGridStructure();
    renderGridStructure();
    loadReservations();

    // [INTEGRATION] Check for Voucher Params (Gest-Spa Integration)
    const params = new URLSearchParams(window.location.search);
    if (params.get('source') === 'bono') {
      console.log("[INTEGRATION] Voucher detected. Auto-opening booking...");
      setTimeout(() => {
        const client = params.get('client') || '';
        const phone = params.get('phone') || '';
        const voucher = params.get('voucher') || '?';
        const service = params.get('service') || '';
        const paxRaw = parseInt(params.get('pax')) || 1;

        // Open Modal (New Booking) - Default to Today, Lunch
        openBooking('Restaurante', utils.toIsoDate(new Date()), 'almuerzo');

        // Set flag for Gest-Spa redirect context
        window.state = window.state || {};
        window.state.isGestSpaRedirect = true;

        // Show warning banner
        const gestSpaAlert = document.getElementById("gestSpaAlert");
        if (gestSpaAlert) {
          gestSpaAlert.classList.remove("hidden");
        }

        // VISUAL CUE: Update Modal Title
        const modalTitle = document.getElementById("modalTitle");
        if (modalTitle) modalTitle.innerHTML = `<span class="bg-blue-600 text-white px-2 py-0.5 rounded text-sm mr-2">SPA/BONO</span> Nueva Reserva`;

        // Pre-fill fields
        if (document.getElementById("campoNombre")) document.getElementById("campoNombre").value = client;
        if (document.getElementById("campoTelefono")) document.getElementById("campoTelefono").value = phone;

        // Pax (Default to Adults)
        if (document.getElementById("campoPax")) {
          document.getElementById("campoPax").value = paxRaw;
        }

        // Set "Servicio Incluido" to TRUE
        const checkIncluded = document.getElementById("checkServicioIncluido");
        if (checkIncluded) {
          checkIncluded.checked = true;
          checkIncluded.dispatchEvent(new Event('change'));
        }

        // Set "Tipo de Servicio" to Spa (Nº Bono)
        const tipoIncluido = document.getElementById("tipoIncluido");
        if (tipoIncluido) {
          tipoIncluido.value = 'spa';
          tipoIncluido.dispatchEvent(new Event('change'));
        }

        // Fill Voucher in "Nº Bono" field
        const campoBono = document.getElementById("campoBono");
        if (campoBono) {
          campoBono.value = voucher;
        }

        // Clear and highlight Fecha & Hora to draw attention
        const campoFecha = document.getElementById("campoFecha");
        const campoHora = document.getElementById("campoHora");

        if (campoFecha) {
          campoFecha.value = "";
          campoFecha.style.setProperty("border", "2px solid #ef4444", "important");
          campoFecha.style.setProperty("background-color", "#fee2e2", "important");
          
          const labelFecha = campoFecha.previousElementSibling;
          if (labelFecha && labelFecha.tagName === 'LABEL') {
            labelFecha.innerHTML = 'Fecha <span class="text-red-500 font-bold">* Obligatorio</span>';
            labelFecha.classList.remove("text-slate-400");
            labelFecha.classList.add("text-red-500");
          }

          campoFecha.addEventListener("change", function() {
            if (this.value) {
              this.style.border = "";
              this.style.backgroundColor = "";
              if (labelFecha && labelFecha.tagName === 'LABEL') {
                labelFecha.innerHTML = 'Fecha';
                labelFecha.classList.remove("text-red-500");
                labelFecha.classList.add("text-slate-400");
              }
            } else {
              this.style.setProperty("border", "2px solid #ef4444", "important");
              this.style.setProperty("background-color", "#fee2e2", "important");
              if (labelFecha && labelFecha.tagName === 'LABEL') {
                labelFecha.innerHTML = 'Fecha <span class="text-red-500 font-bold">* Obligatorio</span>';
                labelFecha.classList.remove("text-slate-400");
                labelFecha.classList.add("text-red-500");
              }
            }
          });
        }

        if (campoHora) {
          campoHora.value = "";
          campoHora.style.setProperty("border", "2px solid #ef4444", "important");
          campoHora.style.setProperty("background-color", "#fee2e2", "important");

          const labelHora = campoHora.previousElementSibling;
          if (labelHora && labelHora.tagName === 'LABEL') {
            labelHora.innerHTML = 'Hora <span class="text-red-500 font-bold">* Obligatorio</span>';
            labelHora.classList.remove("text-slate-400");
            labelHora.classList.add("text-red-500");
          }

          campoHora.addEventListener("change", function() {
            if (this.value) {
              this.style.border = "";
              this.style.backgroundColor = "";
              if (labelHora && labelHora.tagName === 'LABEL') {
                labelHora.innerHTML = 'Hora';
                labelHora.classList.remove("text-red-500");
                labelHora.classList.add("text-slate-400");
              }
            } else {
              this.style.setProperty("border", "2px solid #ef4444", "important");
              this.style.setProperty("background-color", "#fee2e2", "important");
              if (labelHora && labelHora.tagName === 'LABEL') {
                labelHora.innerHTML = 'Hora <span class="text-red-500 font-bold">* Obligatorio</span>';
                labelHora.classList.remove("text-slate-400");
                labelHora.classList.add("text-red-500");
              }
            }
          });
        }

        // Notes
        const notesField = document.getElementById("campoNotas");
        if (notesField) {
          const existing = notesField.value;
          notesField.value = (existing ? existing + "\n" : "") + `[BONO] Código: ${voucher} - Servicio: ${service}`;
          notesField.rows = 4; // Expand to ensure visibility
        }

        // FORCE SAVE BUTTON VISIBILITY
        // Sometimes it might be hidden by ReadOnly logic or CSS z-index
        const btnGuardar = document.getElementById("btnGuardar");
        if (btnGuardar) {
          btnGuardar.classList.remove("hidden");
          btnGuardar.style.display = "block";
          btnGuardar.disabled = false;
        }

        // Ensure Footer is Visible via Scroll
        const modalBody = document.querySelector(".modal-body") || document.querySelector(".modal-content");
        if (modalBody) modalBody.scrollTop = modalBody.scrollHeight;

        // Force update totals again just in case
        updateTotalDisplay();

      }, 1000); // Slight delay to ensure modal logic is ready
    }
  }

  function renderGridStructure() {
    console.log("DEBUG: renderGridStructure started");
    try {
      const grid = document.getElementById("gridRestaurante");
      if (!grid) {
        console.error("DEBUG: gridRestaurante NOT FOUND");
        return;
      }

      const dates = utils.getWeekDates(currentWeekStart);
      const inputSemana = document.getElementById("inputSemana");
      // [FIX] Show current SELECTED date in input, not just Monday
      if (inputSemana) inputSemana.value = utils.toIsoDate(currentWeekStart);

      console.log("DEBUG: Building HTML...");

      let html = ``;
      html += `<div class="grid-header-cell">ESPACIO</div>`;
      dates.forEach(d => {
        html += `<div class="grid-header-cell">${utils.formatDateShort(d)}</div>`;
      });

      SPACES.forEach(space => {
        html += `<div class="space-label pl-4">${space}</div>`;
        dates.forEach(d => {
          const dateStr = utils.toIsoDate(d);

          let lunchPax = 0, dinnerPax = 0;
          let lockLunch = null, lockDinner = null;
          const currentHotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";

          loadedReservations.forEach(r => {
            if (r.hotel && r.hotel !== currentHotel) return;
            const st = (r.estado || 'pendiente').toLowerCase();
            if (st === 'anulada' || st === 'cancelada') return;

            let rDate = "";
            if (r.fecha && r.fecha.toDate) rDate = utils.toIsoDate(r.fecha.toDate());
            else if (typeof r.fecha === 'string') rDate = r.fecha;

            if (rDate !== dateStr) return;
            if ((r.espacio || 'Restaurante') !== space) return;

            const t = (r.turno || 'almuerzo').toLowerCase();

            if (r.type === 'lock') {
              if (t === 'almuerzo') lockLunch = r;
              if (t === 'cena') lockDinner = r;
              return;
            }

            const p = (parseInt(r.pax) || 0) + (parseInt(r.ninos) || 0);
            if (t === 'almuerzo') lunchPax += p;
            if (t === 'cena') dinnerPax += p;
          });

          const renderHeader = (isLocked, turno, paxCount, icon) => {
            const tName = (turno || 'almuerzo').toLowerCase();
            const special = specialDatesConfig.find(sd => sd.date === dateStr);
            let maxCap = 0;
            if (special) {
              if (space === 'Restaurante') {
                maxCap = tName === 'almuerzo' ? (special.lunchMax || 0) : (special.dinnerMax || 0);
              } else if (space === 'Cafeteria') {
                maxCap = tName === 'almuerzo' ? (special.cafLunchMax || 0) : (special.cafDinnerMax || 0);
              }
            }

            let paxDisplay = paxCount > 0 ? `<span class="ml-1 font-bold text-slate-600">${paxCount} 👥</span>` : '';
            if (maxCap > 0) {
              const remaining = maxCap - paxCount;
              const capColor = remaining <= 0 ? 'text-red-600' : (remaining <= maxCap * 0.2 ? 'text-amber-600' : 'text-blue-600');

              const remainingText = remaining <= 0 ? 'AFORO COMPLETO' : `Quedan ${remaining} pers.`;
              paxDisplay = `
                <div class="flex flex-col items-start ml-1 leading-[1.1] py-0.5">
                  <span class="text-[10px] font-bold ${capColor}">${paxCount} Van / ${maxCap} Máx.</span>
                  <span class="text-[9px] font-semibold opacity-90 ${capColor}">${remainingText}</span>
                </div>`;
            }

            const lockIcon = isLocked
              ? `<button onclick="toggleLock('${space}', '${dateStr}', '${turno}')" class="text-red-500 hover:text-red-700 p-0.5" title="Desbloquear"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"></path></svg></button>`
              : `<button onclick="toggleLock('${space}', '${dateStr}', '${turno}')" class="text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition p-0.5" title="Bloquear (Completo)"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 016 0v2h-1V7a2 2 0 00-2-2z"></path></svg></button>`;

            // [MODIFIED] Logic for Past/Blocked
            // Check if it is "Lunch" today and time is past 18:00
            const now = new Date();
            const todayIso = utils.toIsoDate(now);
            const currentHour = now.getHours();

            let istimeBlocked = false;
            // Rule: Block "Almuerzo" if it is today and past 18:00
            if (dateStr === todayIso && turno === 'almuerzo' && currentHour >= 18) {
              istimeBlocked = true;
            }

            const isPast = dateStr < todayIso || istimeBlocked;
            const currentHotel = localStorage.getItem(STORAGE_KEY) || "Guadiana"; // Ensure it's inside or accessible
            const status = getShiftStatus(currentHotel, space, turno, dateStr);

            const shadeClass = (isPast || status.closed) && !isLocked ? "bg-slate-100 text-slate-400" : "";
            const bgClass = isLocked ? "bg-slate-50 border-red-100" : shadeClass;

            let addBtn = "";
            if (isLocked) {
              addBtn = `<span class="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 rounded border border-red-100 uppercase">Completo</span>`;
            } else if (status.closed) {
              addBtn = `<button onclick="openPunctually('${space}', '${dateStr}', '${turno}')" class="text-[9px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-1.5 rounded border border-red-200 transition">ABRIR 🔓</button>`;
            } else if (!isPast) {
              addBtn = `<button onclick="openBooking('${space}', '${dateStr}', '${turno}')" class="opacity-0 group-hover:opacity-100 text-blue-600 font-bold bg-blue-50 px-1.5 rounded text-[10px] transition">+</button>`;
            }

            const closureReason = status.closed ? `<div class="text-[9px] font-bold text-red-500/70 italic mt-0.5">${status.reason}</div>` : '';

            return `
                            <div class="turn-cell group ${bgClass} relative">
                                <div class="flex justify-between items-center mb-1">
                                    <div class="flex items-center gap-1">
                                        ${lockIcon}
                                        <span class="text-xs ${turno === 'almuerzo' ? 'text-amber-500' : 'text-slate-400'}">${icon}</span>
                                        ${paxDisplay}
                                    </div>
                                    ${addBtn}
                                </div>
                                ${closureReason}
                                <div id="zone_${space}_${dateStr}_${turno}" class="flex flex-col gap-2 ${isLocked || status.closed ? 'opacity-75 blur-[0.5px]' : ''}"></div>
                            </div>`;
          };

          html += `<div class="day-column">
                            ${renderHeader(!!lockLunch, 'almuerzo', lunchPax, '☀️')}
                            ${renderHeader(!!lockDinner, 'cena', dinnerPax, '🌙')}
                        </div>`;
        });
      });

      console.log("DEBUG: Setting grid innerHTML. Length:", html.length);
      grid.innerHTML = html;

      if (loadedReservations.length > 0) {
        console.log("DEBUG: Calling paintReservations");
        paintReservations(loadedReservations);
      }
      console.log("DEBUG: renderGridStructure finished");
    } catch (err) {
      console.error("DEBUG: renderGridStructure CRASHED:", err);
      logUI("Render Error: " + err.message);
    }
  }

  // Helper to log to UI
  function logUI(msg) {
    console.log("[Restaurante]", msg);
    const el = document.getElementById("connStatus");
    if (el) {
      const textSpan = el.querySelector("span");
      const indicator = el.querySelector("div");
      if (textSpan) textSpan.innerText = msg;

      // Visual cues
      if (msg.toLowerCase().includes("error") || msg.toLowerCase().includes("fatal")) {
        el.className = "flex items-center gap-2 px-3 py-0.5 bg-red-50 rounded-full border border-red-100";
        if (indicator) indicator.className = "w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse";
        if (textSpan) textSpan.className = "text-[10px] font-bold text-red-700 uppercase tracking-wide";
      } else if (msg.toLowerCase().includes("conectado")) {
        el.className = "flex items-center gap-2 px-3 py-0.5 bg-green-50 rounded-full border border-green-100";
        if (indicator) indicator.className = "w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(34,197,94,0.6)]";
        if (textSpan) textSpan.className = "text-[10px] font-bold text-green-700 uppercase tracking-wide";
      }
    }
  }

  let unsubscribeRestaurante = null;
  let unsubscribeSalones = null;
  let rawRestauranteDocs = [];
  let rawSalonesDocs = [];

  function mapSalonDocToRestaurante(d) {
    const paxA = parseInt(d.detalles?.pax_adultos) || 0;
    const paxN = parseInt(d.detalles?.pax_ninos) || 0;
    const totalPax = paxA + paxN;

    let precioAdulto = 0;
    let precioNinos = 0;
    let totalImporte = 0;

    if (Array.isArray(d.servicios) && d.servicios.length > 0) {
      d.servicios.forEach(s => {
        totalImporte += (parseFloat(s.total) || 0);
        const conc = (s.concepto || "").toLowerCase();
        if (conc.includes("niño") || conc.includes("infantil")) {
          if (!precioNinos && s.precio) precioNinos = parseFloat(s.precio) || 0;
        } else {
          if (!precioAdulto && s.precio) precioAdulto = parseFloat(s.precio) || 0;
        }
      });
    }

    let turno = "almuerzo";
    const j = (d.detalles?.jornada || "").toLowerCase();
    const h = d.detalles?.hora || "";
    const hourNum = parseInt((h.split(":")[0] || "0"), 10);
    if (j.includes("cena") || j.includes("tarde") || hourNum >= 19) {
      turno = "cena";
    }

    let notasCombined = "";
    if (typeof d.notas === "string") {
      notasCombined = d.notas;
    } else if (d.notas && typeof d.notas === "object") {
      const parts = [];
      if (d.notas.interna) parts.push(d.notas.interna);
      if (d.notas.cliente) parts.push("Nota cliente: " + d.notas.cliente);
      notasCombined = parts.join(" | ");
    }
    if (d.detalles?.montaje) {
      notasCombined = (notasCombined ? notasCombined + " | " : "") + `Montaje: ${d.detalles.montaje}`;
    }

    let fechaVal = d.fecha;
    if (fechaVal && fechaVal.toDate) {
      fechaVal = utils.toIsoDate(fechaVal.toDate());
    }

    return {
      id: "salon_" + d.id,
      salonBookingId: d.id,
      _isFromSalones: true,
      hotel: d.hotel,
      espacio: "Restaurante",
      fecha: fechaVal,
      hora: d.detalles?.hora || (turno === "cena" ? "21:00" : "14:00"),
      turno: turno,
      nombre: d.cliente || "Evento Salón",
      cliente: d.cliente,
      telefono: d.contact?.tel || "",
      email: d.contact?.email || "",
      pax: totalPax || 1,
      paxAdultos: paxA,
      ninos: paxN,
      precio: precioAdulto,
      precioAdulto: precioAdulto,
      precioPorPersona: precioAdulto,
      precioNinos: precioNinos,
      total: totalImporte,
      importeTotal: totalImporte,
      estado: d.estado || "confirmada",
      notas: notasCombined,
      servicioIncluido: !!d.detalles?.incluido,
      referencia: d.referenciaPresupuesto || (d.reservaId ? String(d.reservaId) : d.id),
      createdAt: d.created_at || d.createdAt || null,
      updatedAt: d.updated_at || d.updatedAt || null
    };
  }

  function combineAndRenderReservations() {
    const currentHotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
    const combined = [];
    const seenSalonIds = new Set();

    // 1. Process explicit restaurant bookings
    rawRestauranteDocs.forEach(r => {
      const sourceId = r.salonBookingId || (r.id?.startsWith('salon_') ? r.id.slice(6) : null);
      const source = sourceId && rawSalonesDocs.find(doc => doc.id === sourceId);
      if (source && !window.EventLocation.isRestaurant(source.salon)) return;
      combined.push(r);
      if (r.salonBookingId) {
        seenSalonIds.add(r.salonBookingId);
      }
      if (r.id && r.id.startsWith("salon_")) {
        seenSalonIds.add(r.id.replace("salon_", ""));
      }
    });

    // 2. Process salon bookings assigned to "Restaurante"
    rawSalonesDocs.forEach(sDoc => {
      const sHotel = sDoc.hotel || currentHotel;
      if (sHotel !== currentHotel) return;

      const salonName = (sDoc.salon || "").trim().toLowerCase();
      if (salonName !== "restaurante") return;

      // Skip if already in rawRestauranteDocs
      if (seenSalonIds.has(sDoc.id)) return;

      const mapped = mapSalonDocToRestaurante(sDoc);
      combined.push(mapped);
    });

    loadedReservations = combined;
    console.log("DEBUG: Loaded", loadedReservations.length, "reservations (restaurante + salones)");

    // [UX] Feedback to User
    const connStatus = document.getElementById("connStatus");
    if (connStatus) {
      const span = connStatus.querySelector("span");
      if (span) span.innerText = "Online";
    }

    renderGridStructure();
  }

  function loadReservations() {
    if (unsubscribeRestaurante) unsubscribeRestaurante();
    if (unsubscribeSalones) unsubscribeSalones();
    console.log("DEBUG: loadReservations started");

    const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";

    unsubscribeRestaurante = db.collection("reservas_restaurante")
      .where("hotel", "==", hotel)
      .onSnapshot(snapshot => {
        rawRestauranteDocs = [];
        snapshot.forEach(doc => {
          rawRestauranteDocs.push({ id: doc.id, ...window.EventLocation.applyJornadaOverride(doc.data()) });
        });
        combineAndRenderReservations();
      }, err => {
        console.error("DEBUG: Load Error reservas_restaurante", err);
        logUI("Error cargando restaurante: " + err.message);
      });

    unsubscribeSalones = db.collection("reservas_salones")
      .where("hotel", "==", hotel)
      .onSnapshot(snapshot => {
        rawSalonesDocs = [];
        snapshot.forEach(doc => {
          rawSalonesDocs.push({ id: doc.id, ...window.EventLocation.applyJornadaOverride(doc.data()) });
        });
        combineAndRenderReservations();
      }, err => {
        console.error("DEBUG: Load Error reservas_salones", err);
      });
  }

  // Centralized robust price extractor for restaurant bookings
  function extractReservationPrices(r) {
    if (!r) return { precioAdulto: 0, precioNinos: 0, total: 0 };

    const parseVal = (val) => {
      if (val === undefined || val === null || val === "") return 0;
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      return window.MesaChef.parseEuroInput(val);
    };

    const pax = parseInt(r.pax) || 0;
    const ninos = parseInt(r.ninos) || 0;

    // Search for first NON-ZERO adult price candidate
    const adultCandidates = [
      r.precio,
      r.precioPorPersona,
      r.precio_por_persona,
      r.precioAdulto,
      r.precio_adulto,
      r.precioAdultos,
      r.precioPersona,
      r.precio_persona,
      r.precioPax,
      r.precio_pax,
      r.price,
      r.priceAdult,
      r.priceAdults,
      r.detalles?.precio,
      r.detalles?.precioAdulto,
      r.detalles?.price,
      r.menuPrecio
    ];

    let precioAdulto = 0;
    for (const c of adultCandidates) {
      const parsed = parseVal(c);
      if (parsed > 0) {
        precioAdulto = parsed;
        break;
      }
    }

    // Search for first NON-ZERO child price candidate
    const childCandidates = [
      r.precioNinos,
      r.precio_ninos,
      r.precioNino,
      r.precio_nino,
      r.priceKids,
      r.priceChild,
      r.detalles?.precioNinos,
      r.detalles?.precioNino
    ];

    let precioNinos = 0;
    for (const c of childCandidates) {
      const parsed = parseVal(c);
      if (parsed > 0) {
        precioNinos = parsed;
        break;
      }
    }

    // Search for first NON-ZERO total candidate
    const totalCandidates = [
      r.total,
      r.importeTotal,
      r.importe,
      r.totalReserva,
      r.detalles?.total
    ];

    let total = 0;
    for (const c of totalCandidates) {
      const parsed = parseVal(c);
      if (parsed > 0) {
        total = parsed;
        break;
      }
    }

    // Fallback: If precioAdulto is 0, but precioNinos > 0:
    // When ninos is 0 (or not specified) or pax > 0, the booking price was stored in the child price field
    if (precioAdulto === 0 && precioNinos > 0) {
      if (ninos === 0 || pax > 0) {
        precioAdulto = precioNinos;
        if (ninos === 0) precioNinos = 0;
      }
    }

    // Fallback: If precioNinos is 0, but precioAdulto > 0 and pax is 0 and ninos > 0
    if (precioNinos === 0 && precioAdulto > 0 && pax === 0 && ninos > 0) {
      precioNinos = precioAdulto;
      precioAdulto = 0;
    }

    // Fallback: derive adult price if total exists and pax exists
    if (precioAdulto === 0 && total > 0 && pax > 0 && precioNinos === 0) {
      precioAdulto = total / pax;
    }

    // Fallback: calculate total if prices exist
    if (total === 0 && (precioAdulto > 0 || precioNinos > 0)) {
      total = (pax * precioAdulto) + (ninos * precioNinos);
    }

    // Fallback: scan notes text if still 0
    if (precioAdulto === 0 && r.notas && typeof r.notas === 'string') {
      const match = r.notas.match(/(?:^|[^\d])(\d+(?:[.,]\d{1,2})?)\s*€(?:\s*(?:\/|\s*por\s*|\s*pax|\s*persona|\s*p\b|\s*comensal\b))?/i);
      if (match && match[1]) {
        const foundPrice = window.MesaChef.parseEuroInput(match[1]);
        if (foundPrice > 0) {
          precioAdulto = foundPrice;
          if (total === 0 && pax > 0) total = (pax * precioAdulto) + (ninos * precioNinos);
        }
      }
    }

    return { precioAdulto, precioNinos, total };
  }

  function paintReservations(reservations) {
    if (!reservations) reservations = loadedReservations;

    // Sort by time (HH:mm string comparison)
    // We use a copy to avoid mutating the original array if it's used elsewhere
    const sortedReservations = [...reservations].sort((a, b) => {
      const timeA = a.hora || "99:99";
      const timeB = b.hora || "99:99";
      return timeA.localeCompare(timeB);
    });

    console.log("DEBUG: paintReservations called with", sortedReservations.length);

    const zones = document.querySelectorAll("[id^='zone_']");
    zones.forEach(z => z.innerHTML = '');

    const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
    const filterStatus = document.getElementById("filtroEstado").value;
    const searchText = (document.getElementById("txtBuscar").value || "").toLowerCase();

    // Date range for filtering
    const dates = utils.getWeekDates(currentWeekStart);
    const startStr = utils.toIsoDate(dates[0]);
    const endStr = utils.toIsoDate(dates[6]);

    sortedReservations.forEach(r => {
      // 1. Filter Hotel & Locks
      if (r.hotel && r.hotel !== hotel) return;
      if (r.type === 'lock') return; // Do not paint locks as cards

      // 2. Date
      let rDateStr = "";
      if (r.fecha && r.fecha.toDate) rDateStr = utils.toIsoDate(r.fecha.toDate());
      else if (typeof r.fecha === 'string') rDateStr = r.fecha;

      if (rDateStr < startStr || rDateStr > endStr) return;

      // 3. Status Filter
      const rStatus = (r.estado || "pendiente").toLowerCase();
      if (filterStatus === 'activos') {
        if (rStatus === 'anulada' || rStatus === 'no-presentado' || rStatus === 'cancelada') return;
      } else if (filterStatus === 'anulada') {
        if (rStatus !== 'anulada' && rStatus !== 'cancelada') return;
      } else if (filterStatus !== 'todas') {
        if (rStatus !== filterStatus) return;
      }

      // 4. Search Filter
      if (searchText) {
        const combined = `${r.nombre || ''} ${r.telefono || ''} ${r.id || ''}`.toLowerCase();
        if (!combined.includes(searchText)) return;
      }

      // 5. Paint
      const space = r.espacio || "Restaurante";
      const turno = r.turno || "almuerzo";
      const time = r.hora || "--:--";
      const name = r.nombre || r.cliente || "Sin nombre";
      const totalPax = (parseInt(r.pax) || 0) + (parseInt(r.ninos) || 0);
      const pax = totalPax || r.pax || "?";

      // Robust price extraction with full fallbacks
      const { precioAdulto: precioNum, precioNinos: precioNinosNum, total: totalNum } = extractReservationPrices(r);

      const zoneId = `zone_${space}_${rDateStr}_${turno}`;
      const zone = document.getElementById(zoneId);

      if (zone) {
        const div = document.createElement("div");
        // Check if reservation is in the past
        const now = new Date();
        const todayIso = utils.toIsoDate(now);
        const currentHour = now.getHours();

        let isPast = rDateStr < todayIso;
        if (rDateStr === todayIso && turno === 'almuerzo' && currentHour >= 18) {
          isPast = true;
        } else if (rDateStr === todayIso && turno === 'cena' && (currentHour > 23 || (currentHour === 23 && now.getMinutes() >= 30))) {
          isPast = true;
        }

        const isCancelled = rStatus === 'anulada' || rStatus === 'cancelada' || rStatus === 'anulado' || rStatus === 'cancelado';
        let border = 'border-l-[3px] border-amber-300';
        let bgCard = 'bg-white';
        if (rStatus === 'confirmada') border = 'border-l-[3px] border-green-500';
        if (rStatus === 'presupuesto') border = 'border-l-[3px] border-blue-400';
        if (isCancelled) {
          border = 'border-l-[3px] border-red-500';
          bgCard = 'bg-red-100 text-red-900';
        }
        if (rStatus === 'no-presentado') border = 'border-l-[3px] border-slate-400';

        // Sombrear reservas pasadas
        if (isPast) {
          if (isCancelled) {
            bgCard = 'bg-red-50/70 text-red-900/80';
            border = 'border-l-[3px] border-red-400';
          } else {
            bgCard = 'bg-slate-200/90 text-slate-600';
            if (rStatus === 'confirmada') border = 'border-l-[3px] border-emerald-600/70';
            else if (rStatus === 'presupuesto') border = 'border-l-[3px] border-blue-500/70';
            else if (rStatus === 'no-presentado') border = 'border-l-[3px] border-slate-400';
            else border = 'border-l-[3px] border-amber-400/70';
          }
        }

        // Event from Salones badge
        let badgeSalones = "";
        if (r._isFromSalones) {
          const salonesClasses = isPast
            ? "text-purple-700/70 bg-purple-100/60 border-purple-200/60"
            : "text-purple-700 bg-purple-50 border-purple-200";
          badgeSalones = `<span class="text-[9px] font-bold ${salonesClasses} px-1 py-0.2 rounded border" title="Evento de Salones">🏛️ Evento</span>`;
        }

        let badgeCancelled = "";
        if (isCancelled) {
          const cancelClasses = isPast
            ? "text-red-800/80 bg-red-100/80 border-red-200"
            : "text-red-800 bg-red-200 border-red-300";
          badgeCancelled = `<span class="text-[9px] font-bold ${cancelClasses} px-1 py-0.5 rounded border">❌ Anulada</span>`;
        }

        // NEW: Check for recent creation (15 mins) -> Flashing Badge (never for past reservations)
        let badgeHTML = "";
        if (!isPast && r.createdAt) {
          const created = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
          const diffMins = (now - created) / 1000 / 60;
          if (diffMins <= 15) {
            badgeHTML = `<span class="badge-nuevo">NUEVO</span>`;
          }
        }

        let priceDisplay = "";
        if (r.servicioIncluido) {
          let detailStr = "";
          let symbol = "";
          if (r.tipoIncluido === 'hotel') {
            symbol = "🏨 ";
            if (r.campoHabitacion) detailStr = `: ${r.campoHabitacion}`;
          } else if (r.tipoIncluido === 'spa') {
            // Stylized Lotus Logo (Gold) matching the reference
            const lotusColor = isPast ? '#856404' : '#b8860b';
            symbol = `<svg class="inline-block w-3.5 h-3.5 mr-0.5" viewBox="0 0 24 24" style="color: ${lotusColor}; vertical-align: -3px;" fill="currentColor">
                <path d="M12,22c0,0-5-2-5-7s2-8,5-10c3,2,5,5,5,10S12,22,12,22z M12,14c1.1,0,2-0.9,2-2s-0.9-2-2-2s-2,0.9-2,2S10.9,14,12,14z M2,12 c0,0,3-1,5,3c2,4,0,7,0,7s-4-1-5-6C1.5,14,2,12,2,12z M22,12c0,0-3-1-5,3c-2,4,0,7,0,7s4-1,5-6C22.5,14,22,12,22,12z"></path>
            </svg>`;
            if (r.campoBono) detailStr = `: ${r.campoBono}`;
          }
          const inclClasses = isPast
            ? "text-slate-600 bg-slate-300/70 border-slate-300"
            : "text-blue-600 bg-blue-50 border-blue-100";
          priceDisplay = `<span class="text-[9px] font-bold ${inclClasses} px-1.5 py-0.5 rounded border italic" title="${r.tipoIncluido || ''}${detailStr}">${symbol}Incl${detailStr}</span>`;
        } else {
          // PAGO DIRECTO: Debe quedar claro en el planning
          const pVal = precioNum > 0 ? precioNum : precioNinosNum;
          const pFormatted = window.MesaChef.formatEuroValue(pVal);
          const tFormatted = window.MesaChef.formatEuroValue(totalNum);
          const directClasses = isPast
            ? "text-slate-600 bg-slate-300/70 border-slate-300"
            : "text-emerald-700 bg-emerald-50 border-emerald-200";
          if (pVal > 0) {
            priceDisplay = `<span class="text-[9px] font-bold ${directClasses} px-1.5 py-0.5 rounded border whitespace-nowrap" title="Pago Directo en restaurante · Total: ${tFormatted}€">💶 Directo: ${pFormatted}€/p</span>`;
          } else if (totalNum > 0) {
            priceDisplay = `<span class="text-[9px] font-bold ${directClasses} px-1.5 py-0.5 rounded border whitespace-nowrap" title="Pago Directo en restaurante">💶 Directo: ${tFormatted}€</span>`;
          } else {
            priceDisplay = `<span class="text-[9px] font-bold ${directClasses} px-1.5 py-0.5 rounded border whitespace-nowrap" title="Pago Directo en restaurante">💶 Pago Directo</span>`;
          }
        }

        // CHECK NOTES
        let notesIcon = "";
        const notasStr = (typeof r.notas === 'string') ? r.notas : "";
        if (notasStr.trim().length > 0) {
          notesIcon = `<span title="${notasStr}" class="ml-1 text-[10px] cursor-help">📝</span>`;
        }

        const pastCardClasses = isPast
          ? 'reserva-pasada border-slate-300/80 opacity-75 hover:opacity-100 shadow-none hover:shadow-sm'
          : 'border-gray-100 shadow-sm hover:shadow-md';

        div.className = `${bgCard} border ${pastCardClasses} rounded p-1.5 cursor-pointer transition text-[10px] ${border} mb-1`;
        if (isPast) {
          div.title = `${name} · (Reserva pasada)`;
        }

        div.innerHTML = `
                    <div class="flex justify-between font-bold ${isPast ? 'text-slate-500' : 'text-gray-700'} pointer-events-none items-center mb-1">
                        <div class="flex items-center gap-1">
                            ${badgeHTML}
                            ${badgeSalones}
                            ${badgeCancelled}
                            <span>${time}</span>
                        </div>
                        <span class="${isPast ? 'bg-slate-300/70 text-slate-600' : 'bg-gray-100 text-gray-600'} px-1 rounded">${pax}p</span>
                    </div>
                    
                    <div class="truncate font-bold ${isPast ? 'text-slate-600' : 'text-slate-800'} text-xs mb-1 pointer-events-none w-full" title="${name}">
                        ${name}
                    </div>

                    <div class="flex justify-between items-end mt-1">
                        <div class="pointer-events-auto">${notesIcon}</div>
                        <div class="flex flex-col items-end">
                             ${r.mesa ? `<span class="text-[10px] font-bold ${isPast ? 'text-slate-500 bg-slate-300/50 border-slate-300' : 'text-slate-500 bg-slate-50 border-slate-100'} px-1 rounded border mb-0.5" title="Mesa">M.${r.mesa}</span>` : ''}
                             <div class="text-right pointer-events-none">${priceDisplay}</div>
                        </div>
                    </div>
                `;
        div.onclick = (e) => { e.stopPropagation(); openBooking(space, rDateStr, turno, r); };
        zone.appendChild(div);
      }
    });
  }

  window.printReport = function (mode) {
    const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
    const dates = utils.getWeekDates(currentWeekStart);
    let filterFn;
    let title; // Declare title here

    if (mode === 'dia') {
      // [FIX] Use the exact selected date (currentWeekStart now holds the specific date)
      let targetDateStr = utils.toIsoDate(currentWeekStart);
      const prettyDate = utils.formatDateES(new Date(targetDateStr));
      title = `Informe Diario - ${prettyDate}`;
      filterFn = (r, dateStr) => dateStr === targetDateStr;
    } else {
      const d1 = utils.formatDateES(dates[0]);
      const d2 = utils.formatDateES(dates[6]);
      title = `Informe Semanal (${d1} - ${d2})`;
      filterFn = (r, dateStr) => dateStr >= utils.toIsoDate(dates[0]) && dateStr <= utils.toIsoDate(dates[6]);
    }

    const logoPath = (hotel === "Guadiana") ? "Img/logo-guadiana.png" : "Img/logo-cumbria.png";
    // Get base path from current document (works with file:// protocol)
    const basePath = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    const logoUrl = `${basePath}/${logoPath}`;

    let html = `
            <div style="font-family: sans-serif; padding: 20px;">
                <div style="display:flex; align-items:center; gap:20px; margin-bottom:20px; border-bottom:2px solid #eee; padding-bottom:15px;">
                   <img src="${logoUrl}" style="height:60px; width:auto;" onerror="this.style.display='none'">
                   <div>
                        <h1 style="font-size: 24px; font-weight: bold; margin:0; color:#333;">${hotel === "Guadiana" ? "Sercotel Guadiana" : "Cumbria Spa&Hotel"}</h1>
                        <h2 style="font-size: 16px; color: #666; margin:5px 0 0 0;">${title}</h2>
                   </div>
                </div>
    `;

    let rows = [];
    loadedReservations.forEach(r => {
      if (r.hotel && r.hotel !== hotel) return;
      let rDateStr = "";
      if (r.fecha && r.fecha.toDate) rDateStr = utils.toIsoDate(r.fecha.toDate());
      else if (typeof r.fecha === 'string') rDateStr = r.fecha;

      if (filterFn(r, rDateStr) && ['pendiente', 'confirmada', 'presupuesto'].includes(r.estado)) {
        rows.push({ ...r, dateStr: rDateStr, ts: new Date(rDateStr + 'T' + (r.hora || '00:00')) });
      }
    });
    rows.sort((a, b) => a.ts - b.ts);

    const groups = {};
    rows.forEach(r => {
      if (!groups[r.dateStr]) groups[r.dateStr] = [];
      groups[r.dateStr].push(r);
    });

    // 2. Build HTML per Day (Always show all 7 days of the week)
    const weekDates = mode === 'dia' ? [new Date(utils.toIsoDate(currentWeekStart))] : dates;

    weekDates.forEach(dateObj => {
      const dateStr = utils.toIsoDate(dateObj);
      const dayName = utils.formatDateES(dateObj);
      const dayNameCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);

      html += `<h3 style="font-size: 16px; font-weight: bold; margin-top: 20px; margin-bottom: 10px; color: #2c3e50; border-bottom: 1px solid #ddd; padding-bottom: 5px;">📅 ${dayNameCap}</h3>`;

      if (!groups[dateStr] || groups[dateStr].length === 0) {
        html += `<p style="font-size: 11px; color: #94a3b8; font-style: italic; margin-bottom: 20px;">No hay reservas programadas.</p>`;
        return;
      }
      html += `<ul style="list-style-type: none; padding-left: 0; margin-bottom: 15px;">`;

      let dailyPax = 0;
      let countLunch = 0;
      let countDinner = 0;
      let countSpecial = 0;

      html += `<table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px;">
                    <thead>
                        <tr style="background: #f1f5f9; color: #475569; text-align: left;">
                            <th style="padding: 6px; width: 40px; border-bottom: 2px solid #ddd;">Mesa</th>
                            <th style="padding: 6px; width: 45px; border-bottom: 2px solid #ddd;">Hora</th>
                            <th style="padding: 6px; width: 140px; border-bottom: 2px solid #ddd;">Cliente</th>
                            <th style="padding: 6px; width: 30px; border-bottom: 2px solid #ddd; text-align:center;">Pax</th>
                            <th style="padding: 6px; border-bottom: 2px solid #ddd;">Notas / Observaciones</th>
                            <th style="padding: 6px; width: 40px; border-bottom: 2px solid #ddd;">Est.</th>
                            <th style="padding: 6px; width: 50px; border-bottom: 2px solid #ddd;">Serv.</th>
                        </tr>
                    </thead>
                    <tbody>`;

      groups[dateStr].forEach(r => {
        const pax = (parseInt(r.pax) || 0) + (parseInt(r.ninos) || 0);
        dailyPax += pax;
        const clientName = r.nombre || r.cliente || "Sin Nombre";
        const time = r.hora || "00:00";
        const space = r.espacio || "Restaurante";
        let statusFull = r.estado || "confirmada";
        let statusAbbr = (statusFull === 'confirmada' || statusFull === 'confirmed') ? 'Conf' : 'Pend';
        const spaceAbbr = space.substring(0, 8) + (space.length > 8 ? '.' : '');
        let notesText = "";
        if (r.notas) {
          if (typeof r.notas === 'string') notesText = r.notas;
          else if (typeof r.notas === 'object') {
            notesText = Object.values(r.notas).filter(v => v && typeof v === 'string').join(". ");
          }
        }
        if (r.servicioIncluido) {
          const incType = (r.tipoIncluido === 'spa') ? 'SPA' : 'HOTEL';
          const incVal = (r.tipoIncluido === 'spa') ? (r.campoBono || '?') : (r.campoHabitacion || '?');
          notesText = `[INC ${incType}: ${incVal}] ` + (notesText ? " - " + notesText : "");
        } else {
          const { precioAdulto: pVal } = extractReservationPrices(r);
          const pStr = pVal > 0 ? ` ${window.MesaChef.formatEuroValue(pVal)}€/p` : '';
          notesText = `[PAGO DIRECTO${pStr}] ` + (notesText ? " - " + notesText : "");
        }
        let type = "Esp.";
        let typeFull = "Especial";
        const mesa = r.mesa || "-"; // [NEW] Get mesa
        const hour = parseInt(time.split(':')[0]);
        if (hour >= 12 && hour <= 15) { type = "Alm."; typeFull = "Almuerzo"; }
        else if (hour >= 20) { type = "Cena"; typeFull = "Cena"; }
        if (typeFull === "Almuerzo") countLunch += pax;
        else if (typeFull === "Cena") countDinner += pax;
        else countSpecial += pax;

        html += `<tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 6px; font-weight:bold; color: #000;">${mesa}</td>
                    <td style="padding: 6px; font-weight:bold;">${time}</td>
                    <td style="padding: 6px; font-weight:600; color:#333;">${clientName.substring(0, 20)}</td>
                    <td style="padding: 6px; text-align:center;">${pax}</td>
                    <td style="padding: 6px; font-style:italic; color:#444;">${notesText}</td>
                    <td style="padding: 6px;">${statusAbbr}</td>
                    <td style="padding: 6px;">${type}</td>
                   </tr>`;
      });

      html += `</tbody></table>`;

      let parts = [];
      if (countLunch > 0) parts.push(`${countLunch} almuerzo${countLunch > 1 ? 's' : ''}`);
      if (countDinner > 0) parts.push(`${countDinner} cena${countDinner > 1 ? 's' : ''}`);
      if (countSpecial > 0) parts.push(`${countSpecial} especial${countSpecial > 1 ? 'es' : ''}`);
      const breakdown = parts.length > 0 ? `(${parts.join(', ')})` : "";

      html += `<div style="margin-bottom: 30px;"></div>`; // Spacer replaced summary
    });

    html += `
              <div style="margin-top: 20px; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 5px;">
                  Impreso el ${new Date().toLocaleString()}
              </div>
          </div>`;

    const printWindow = window.open('', '', 'height=600,width=800');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Imprimir</title></head><body>');
      printWindow.document.write(html);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.print();
    }
  }

  // RESTORED FUNCTIONS

  function updateTotalDisplay() {
    const priceField = document.getElementById("campoPrecio");
    let price = priceField ? window.MesaChef.parseEuroInput(priceField.value) : 0;
    const pax = parseInt(document.getElementById("campoPax").value) || 0;
    const priceKidsField = document.getElementById("campoPrecioNinos");
    let priceKids = priceKidsField ? window.MesaChef.parseEuroInput(priceKidsField.value) : 0;
    const kids = parseInt(document.getElementById("campoNinos").value) || 0;

    // Smart fallback if user typed price in kids price field while kids is 0
    if (price === 0 && priceKids > 0 && kids === 0) {
      price = priceKids;
      priceKids = 0;
    }

    const total = (price * pax) + (priceKids * kids);
    const el = document.getElementById("displayTotal");
    if (el) el.innerText = total.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  // WhatsApp Confirmation Message
  window.sendWhatsApp = function () {
    if (!whatsappTemplate) {
      alert("⚠️ No hay plantilla de WhatsApp configurada para este hotel. Configúrala en Admin → [Hotel] → Plantilla WhatsApp.");
      return;
    }

    // Get data from modal fields
    const nombre = document.getElementById("campoNombre")?.value || '';
    const telefono = document.getElementById("campoTelefono")?.value || '';
    const fecha = document.getElementById("campoFecha")?.value || '';
    const hora = document.getElementById("campoHora")?.value || '';
    const paxAdultos = parseInt(document.getElementById("campoPax")?.value) || 0;
    const paxNinos = parseInt(document.getElementById("campoNinos")?.value) || 0;
    const pax = paxAdultos + paxNinos;
    const turno = document.getElementById("campoTurno")?.value || '';
    const espacio = document.getElementById("campoEspacio")?.value || '';

    // Get hotel name
    const hotelId = localStorage.getItem(STORAGE_KEY) || "Guadiana";
    const hotel = hotelId === "Guadiana" ? "Sercotel Guadiana" : "Cumbria Spa&Hotel";

    // Format date for display (dd/mm/yyyy)
    let fechaFormatted = fecha;
    if (fecha) {
      const parts = fecha.split('-');
      if (parts.length === 3) {
        fechaFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    // Format turno for display
    const turnoFormatted = turno === 'almuerzo' ? 'Almuerzo' : (turno === 'cena' ? 'Cena' : turno);

    // Build message by replacing placeholders
    let message = whatsappTemplate
      .replace(/{nombre}/gi, nombre)
      .replace(/{fecha}/gi, fechaFormatted)
      .replace(/{hora}/gi, hora)
      .replace(/{pax}/gi, pax.toString())
      .replace(/{turno}/gi, turnoFormatted)
      .replace(/{espacio}/gi, espacio)
      .replace(/{hotel}/gi, hotel);

    // Format phone number (remove spaces, ensure country code)
    let phone = telefono.replace(/\s+/g, '').replace(/[^\d]/g, '');
    if (phone.length === 9 && !phone.startsWith('34')) {
      phone = '34' + phone; // Add Spain country code
    }

    if (!phone) {
      alert("⚠️ No hay teléfono válido para enviar el mensaje.");
      return;
    }

    // Open WhatsApp (app:// format opens the app directly instead of web)
    const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }


  window.openBooking = function (space, dateStr, turno, data) {
    // [NEW] Initialize Global State for Sync Context
    window.state = {
      currentReserva: data || null
    };

    // [NEW] Check closure rules
    const currentHotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
    if (!data) {
      const status = getShiftStatus(currentHotel, space || 'Restaurante', turno || 'almuerzo', dateStr || utils.toIsoDate(new Date()));
      if (status.closed) {
        alert(`⛔ ESTE TURNO ESTÁ CERRADO.\nMotivo: ${status.reason}\n\nSi necesitas abrirlo puntualmente, haz clic en "ABRIR 🔓" desde el calendario.`);
        return;
      }
    }

    if (!data) {
      const isLocked = loadedReservations.some(r =>
        r.type === 'lock' &&
        r.espacio === space &&
        r.turno === turno &&
        (r.fecha && (r.fecha.toDate ? utils.toIsoDate(r.fecha.toDate()) : r.fecha) === dateStr)
      );
      if (isLocked) {
        alert("⛔ Este turno está BLOQUEADO (Completo). No se pueden añadir más reservas.");
        return;
      }
    }

    const modal = document.getElementById("modalReserva");
    if (!modal) return;

    // --- PAST DATE CHECK (NEW & EDIT) ---
    const checkDate = data ? (data.fecha && data.fecha.toDate ? utils.toIsoDate(data.fecha.toDate()) : data.fecha) : dateStr;
    const isPast = checkDate < utils.toIsoDate(new Date());

    if (!data && isPast) {
      alert("⚠️ No se pueden crear reservas en fechas pasadas.");
      return;
    }
    // ------------------------------------

    modal.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const checkServicio = document.getElementById("checkServicioIncluido");
    if (checkServicio) {
      checkServicio.checked = false;
      const detailContainer = document.getElementById("containerDetalleIncluido");
      if (detailContainer) detailContainer.classList.add("hidden");
    }

    // [PAYGOLD] Set Hotel Credentials Display
    const activeHotelRte = currentHotel;
    const isGuadianaRte = activeHotelRte === "Guadiana";
    const lblHotelRte = document.getElementById("lblHotelPaygoldRte");
    const chipFucRte = document.getElementById("chipFucTerminalRte");
    const linkTpvRte = document.getElementById("linkOpenTpvRte");
    if (lblHotelRte) lblHotelRte.innerText = isGuadianaRte ? "Garantía PayGold (Eurocaja Rural)" : "Garantía PayGold (Cumbria Spa&Hotel)";
    if (chipFucRte) chipFucRte.innerText = isGuadianaRte ? "168355840-001" : "TPV Cumbria";
    if (linkTpvRte) linkTpvRte.href = "https://canales.redsys.es/portal";

    // Reset details
    document.getElementById("tipoIncluido").value = "hotel";
    document.getElementById("campoHabitacion").value = "";
    document.getElementById("campoBono").value = "";
    document.getElementById("wrapperHabitacion").classList.remove("hidden");
    document.getElementById("wrapperBono").classList.add("hidden");

    // Reset potential highlighting and alerts for Gest-Spa redirection
    const gestSpaAlertReset = document.getElementById("gestSpaAlert");
    if (gestSpaAlertReset) {
      gestSpaAlertReset.classList.add("hidden");
    }

    const campoFechaReset = document.getElementById("campoFecha");
    const campoHoraReset = document.getElementById("campoHora");
    if (campoFechaReset) {
      campoFechaReset.style.border = "";
      campoFechaReset.style.backgroundColor = "";
      const labelFecha = campoFechaReset.previousElementSibling;
      if (labelFecha && labelFecha.tagName === 'LABEL') {
        labelFecha.innerHTML = 'Fecha';
        labelFecha.classList.remove("text-red-500");
        labelFecha.classList.add("text-slate-400");
      }
    }
    if (campoHoraReset) {
      campoHoraReset.style.border = "";
      campoHoraReset.style.backgroundColor = "";
      const labelHora = campoHoraReset.previousElementSibling;
      if (labelHora && labelHora.tagName === 'LABEL') {
        labelHora.innerHTML = 'Hora';
        labelHora.classList.remove("text-red-500");
        labelHora.classList.add("text-slate-400");
      }
    }

    document.getElementById("campoEstado").value = "confirmada";
    const btnAnular = document.getElementById("btnAnular");
    const btnWhatsApp = document.getElementById("btnWhatsApp");
    const btnGuardar = document.getElementById("btnGuardar"); // Assuming ID 'btnGuardar' exists for Save button

    // Reset visibility first
    if (btnAnular) btnAnular.style.display = data ? 'block' : 'none';
    // Show WhatsApp button only for existing reservations with template configured
    if (btnWhatsApp) {
      const hasTemplate = whatsappTemplate && whatsappTemplate.length > 0;
      btnWhatsApp.classList.toggle('hidden', !(data && hasTemplate));
    }
    if (btnGuardar) btnGuardar.style.display = 'block';

    // Inputs to disable/enable
    const inputs = document.querySelectorAll("#modalReserva input, #modalReserva select, #modalReserva textarea");

    if (data) {
      // ... population logic ...
      document.getElementById("campoReferencia").value = data.referencia || data.id || "SIN REF";
      // Populate PayGold
      const elPayRef = document.getElementById("campoPaygoldRef");
      if (elPayRef) elPayRef.value = data.paygoldRef || data.referencia || ("RES-" + Date.now().toString().slice(-6));
      const elPayAmount = document.getElementById("campoPaygoldAmount");
      if (elPayAmount) elPayAmount.value = (data.paygoldAmount !== undefined && data.paygoldAmount !== null && data.paygoldAmount !== '') ? data.paygoldAmount : (data.fianzaPagada || data.total || "");
      const elPayStatus = document.getElementById("campoPaygoldStatus");
      if (elPayStatus) elPayStatus.value = data.paygoldStatus || "pendiente";
      const elPayLink = document.getElementById("campoPaygoldLink");
      if (elPayLink) elPayLink.value = data.paygoldLink || "";
      const elCardLast4 = document.getElementById("campoCardLast4");
      if (elCardLast4) elCardLast4.value = data.cardLast4 || "";
      const elCardExpiry = document.getElementById("campoCardExpiry");
      if (elCardExpiry) elCardExpiry.value = data.cardExpiry || "";
      const elCardBrand = document.getElementById("campoCardBrand");
      if (elCardBrand) elCardBrand.value = data.cardBrand || "Visa";
      document.getElementById("campoNombre").value = data.nombre || data.cliente || "";
      document.getElementById("campoTelefono").value = data.telefono || "";
      document.getElementById("campoHora").value = data.hora || "";
      document.getElementById("campoMesa").value = data.mesa || ""; // [NEW] Populate Mesa
      
      const { precioAdulto: adultPriceNum, precioNinos: childPriceNum } = extractReservationPrices(data);

      document.getElementById("campoPrecio").value = adultPriceNum ? window.MesaChef.formatEuroValue(adultPriceNum) : "";
      document.getElementById("campoPax").value = data.pax || "";
      document.getElementById("campoNinos").value = data.ninos || 0;
      if (document.getElementById("campoPrecioNinos")) {
        document.getElementById("campoPrecioNinos").value = childPriceNum ? window.MesaChef.formatEuroValue(childPriceNum) : "";
      }
      document.getElementById("campoNotas").value = typeof data.notas === 'object' ? Object.values(data.notas).join(". ") : (data.notas || "");
      document.getElementById("campoNotaCliente").value = data.notaCliente || "";
      if (data.espacio) document.getElementById("campoEspacio").value = data.espacio;
      if (data.turno) document.getElementById("campoTurno").value = data.turno;
      if (data.estado) document.getElementById("campoEstado").value = data.estado;

      // Restore servicioIncluido state
      window.setServicioIncluidoUI(data.servicioIncluido);
      if (data.servicioIncluido) {
        if (data.tipoIncluido) {
          document.getElementById("tipoIncluido").value = data.tipoIncluido;
          const isHotel = data.tipoIncluido === 'hotel';
          document.getElementById("wrapperHabitacion").classList.toggle("hidden", !isHotel);
          document.getElementById("wrapperBono").classList.toggle("hidden", isHotel);
        }
        document.getElementById("campoHabitacion").value = data.campoHabitacion || "";
        document.getElementById("campoBono").value = data.campoBono || "";
      }

      let dVal = dateStr;
      if (!dVal && data.fecha) dVal = data.fecha && data.fecha.toDate ? utils.toIsoDate(data.fecha.toDate()) : data.fecha;
      document.getElementById("campoFecha").value = dVal;
      document.getElementById("campoId").value = data.id;



      // Populate Header Metadata
      const headerMetadata = document.getElementById("headerMetadata");
      const headerCreated = document.getElementById("headerMetadataCreated");
      const headerUpdated = document.getElementById("headerMetadataUpdated");
      const headerDivider = document.getElementById("headerMetadataDivider");

      if (headerMetadata) {
        headerMetadata.classList.remove("hidden");
        const createdStr = utils.formatDateTime(data.createdAt);
        const updatedStr = utils.formatDateTime(data.updatedAt);

        if (headerCreated) {
          headerCreated.innerText = `Creada: ${createdStr}`;
        }

        // Only display modified date if it differs from the creation date (i.e. it was actually updated later)
        const hasBeenModified = updatedStr !== '-' && updatedStr !== createdStr;
        if (data.updatedAt && hasBeenModified) {
          if (headerUpdated) {
            headerUpdated.innerText = `Modificada: ${updatedStr}`;
            headerUpdated.classList.remove("hidden");
          }
          if (headerDivider) headerDivider.classList.remove("hidden");
        } else {
          if (headerUpdated) headerUpdated.classList.add("hidden");
          if (headerDivider) headerDivider.classList.add("hidden");
        }
      }
    } else {
      // NEW
      // Hide Header Metadata for new bookings
      const headerMetadata = document.getElementById("headerMetadata");
      if (headerMetadata) headerMetadata.classList.add("hidden");

      // Reset PayGold for new booking
      const elPayRef = document.getElementById("campoPaygoldRef");
      if (elPayRef) elPayRef.value = "RES-" + Date.now().toString().slice(-6);
      const elPayAmount = document.getElementById("campoPaygoldAmount");
      if (elPayAmount) elPayAmount.value = "";
      const elPayStatus = document.getElementById("campoPaygoldStatus");
      if (elPayStatus) elPayStatus.value = "pendiente";
      const elPayLink = document.getElementById("campoPaygoldLink");
      if (elPayLink) elPayLink.value = "";
      const elCardLast4 = document.getElementById("campoCardLast4");
      if (elCardLast4) elCardLast4.value = "";
      const elCardExpiry = document.getElementById("campoCardExpiry");
      if (elCardExpiry) elCardExpiry.value = "";
      const elCardBrand = document.getElementById("campoCardBrand");
      if (elCardBrand) elCardBrand.value = "Visa";
    }

    const now = new Date();
    const todayIso = utils.toIsoDate(now);

    // Logic: Read-Only if:
    // 1. Date is strictly in the past (< Today)
    // 2. Date is Today AND Now >= 18:00 AND Reservation Time < 18:00 (Lunch passed)

    let isReadOnly = dateStr < todayIso;

    if (dateStr === todayIso && now.getHours() >= 18) {
      // Check reservation time
      if (data && data.hora) {
        const [h, m] = data.hora.split(':').map(Number);
        if (h < 18) isReadOnly = true;
      } else if (turno === 'almuerzo') {
        // For new/empty data, if turn is lunch, it's effectively < 18:00 default
        isReadOnly = true;
      }
    }

    const readOnlyElements = [
      "campoNombre", "campoTelefono", "campoHora", "campoPrecio",
      "campoPax", "campoNinos", "campoPrecioNinos", "campoNotas",
      "campoNotaCliente", "campoEstado", "campoEspacio", "campoTurno", "campoMesa",
      "btnAnular", "btnGuardar", "checkServicioIncluido",
      "tipoIncluido", "campoHabitacion", "campoBono", "campoFecha"
    ];

    readOnlyElements.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.disabled = isReadOnly;
        if (isReadOnly) el.classList.add("opacity-50", "cursor-not-allowed");
        else el.classList.remove("opacity-50", "cursor-not-allowed");
      }
    });

    configureReturnToEvents(data, isReadOnly);
    const modalTitle = document.getElementById("modalTitle");
    if (modalTitle) {
      if (isReadOnly) {
        modalTitle.innerHTML = `Visualizar Reserva <span class="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded border border-amber-200">HISTÓRICO (Solo Lectura)</span>`;
      } else if (data && (data._isFromSalones || data.salonBookingId || (data.id && data.id.startsWith("salon_")))) {
        modalTitle.innerHTML = `Editar Reserva <span class="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded border border-purple-200">🏛️ Evento Salón</span>`;
      } else {
        modalTitle.innerText = data ? "Editar Reserva" : "Nueva Reserva";
      }
    }

    // --- POPULATE FORM ---
    document.getElementById("modalReserva").classList.remove("hidden");
    document.getElementById("campoEspacio").value = space;
    // Date & Turn population (follows isReadOnly logic for disabled status)
    document.getElementById("campoFecha").value = dateStr;
    document.getElementById("campoTurno").value = turno;

    if (btnGuardar && isReadOnly) btnGuardar.style.display = 'none';
    else if (btnGuardar) btnGuardar.style.display = 'block';

    if (data) {
      document.getElementById("campoId").value = data.id || "";
    } else {
      // NEW
      document.getElementById("campoId").value = "";
      inputs.forEach(inp => inp.disabled = false); // Ensure enabled
      window.setServicioIncluidoUI(false);

      // Defaults from arguments (Restored)
      if (space) document.getElementById("campoEspacio").value = space;
      document.getElementById("campoFecha").value = dateStr || utils.toIsoDate(new Date());
      if (turno) document.getElementById("campoTurno").value = turno;

      document.getElementById("campoReferencia").value = "RES-" + Date.now().toString().slice(-6);

      document.getElementById("campoNombre").value = "";
      document.getElementById("campoTelefono").value = "";
      document.getElementById("campoHora").value = "";
      document.getElementById("campoMesa").value = ""; // [NEW] Clear Mesa
      document.getElementById("campoPrecio").value = "";
      document.getElementById("campoPax").value = "";
      document.getElementById("campoNinos").value = "";
      document.getElementById("campoPrecioNinos").value = "";
      document.getElementById("campoNotas").value = "";
      document.getElementById("campoNotaCliente").value = "";

      // Auto-set time based on turn (After clearing)
      autoSetTime(turno);

      const title = document.getElementById("modalTitle");
      if (title) title.innerText = "Nueva Reserva";
    }
    updateTotalDisplay();
  };

  window.closeModal = function () {
    document.getElementById("modalReserva").classList.add("hidden");
  };

  let returnEventsRequest = 0;
  let returnEventsBookingId = null;
  async function configureReturnToEvents(data, isReadOnly) {
    const request = ++returnEventsRequest;
    const panel = document.getElementById('returnToEvents');
    panel.classList.add('hidden');
    returnEventsBookingId = null;
    const bookingId = data?.salonBookingId || (data?.id?.startsWith('salon_') ? data.id.slice(6) : null);
    if (!bookingId || isReadOnly) return;
    const button = document.getElementById('btnReturnEvents');
    const select = document.getElementById('returnSalon');
    const error = document.getElementById('returnEventsError');
    panel.classList.remove('hidden');
    button.disabled = true;
    select.replaceChildren();
    error.textContent = 'Cargando salones…';
    try {
      const [source, config] = await Promise.all([
        db.collection('reservas_salones').doc(bookingId).get(),
        db.collection('master_data').doc('CONFIG_SALONES').get()
      ]);
      if (request !== returnEventsRequest) return;
      if (!source.exists || !window.EventLocation.isRestaurant(source.data().salon)) {
        panel.classList.add('hidden');
        return;
      }
      const record = source.data();
      const hotel = record.hotel || localStorage.getItem(STORAGE_KEY) || 'Guadiana';
      const salons = (config.exists && config.data()[hotel]) || [];
      const names = salons.filter(s => s.active !== false && !window.EventLocation.isRestaurant(s.name)).map(s => s.name).filter(Boolean);
      if (record.salonAnterior && names.includes(record.salonAnterior)) {
        names.splice(names.indexOf(record.salonAnterior), 1);
        names.unshift(record.salonAnterior);
      }
      names.forEach(name => select.add(new Option(name, name)));
      returnEventsBookingId = bookingId;
      error.textContent = names.length ? '' : 'No hay salones activos configurados para este hotel.';
      button.disabled = !names.length;
    } catch (err) {
      if (request === returnEventsRequest) error.textContent = 'No se han podido cargar los salones: ' + err.message;
    }
  }

  window.returnReservationToEvents = async function () {
    const bookingId = returnEventsBookingId;
    const salon = document.getElementById('returnSalon').value;
    if (!bookingId || !salon) return;
    const button = document.getElementById('btnReturnEvents');
    button.disabled = true;
    try {
      await window.EventLocation.returnToEvents(db, bookingId, salon);
      closeModal();
      alert('Reserva trasladada a Eventos: ' + salon);
    } catch (err) {
      document.getElementById('returnEventsError').textContent = 'No se ha podido trasladar: ' + err.message;
    } finally {
      button.disabled = false;
    }
  };

  window.saveReservation = async function (e) {
    e.preventDefault();
    const nombre = document.getElementById("campoNombre").value.trim();
    const telefono = document.getElementById("campoTelefono").value.trim();
    const fecha = document.getElementById("campoFecha").value;
    const hora = document.getElementById("campoHora").value;

    const isGestSpa = window.state && window.state.isGestSpaRedirect;

    if (isGestSpa) {
      if (!nombre || !telefono || !fecha || !hora) {
        alert("⚠️ Por favor, completa los campos obligatorios para la reserva de Spa/Bono:\n- Nombre\n- Teléfono\n- Fecha\n- Hora");
        return;
      }
    } else {
      if (!nombre || !telefono || !fecha) {
        alert("⚠️ Por favor, completa los campos obligatorios:\n- Nombre\n- Teléfono\n- Fecha");
        return;
      }
    }

    // --- CHECK KITCHEN HOURS ---
    const valHora = document.getElementById("campoHora").value;
    const valTurno = document.getElementById("campoTurno").value;
    if (restaurantConfig && valHora && valTurno) {
      const t = valTurno.toLowerCase();
      let ini = "", fin = "";
      // Default fallbacks if config missing
      if (t === 'almuerzo') {
        ini = restaurantConfig.almIni || "13:00";
        fin = restaurantConfig.almFin || "16:00";
      } else if (t === 'cena') {
        ini = restaurantConfig.cenaIni || "20:30";
        fin = restaurantConfig.cenaFin || "23:00";
      }

      if (ini && fin && (valHora < ini || valHora > fin)) {
        if (!confirm(`⚠️ FUERA DE HORARIO DE COCINA\n\nLa hora seleccionada (${valHora}) está fuera del horario establecido para ${valTurno} (${ini} - ${fin}).\n\n¿Deseas continuar con la reserva?`)) {
          return;
        }
      }
    }
    // ---------------------------

    // Past Date Validation
    const eventDate = new Date(fecha);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDateMidnight = new Date(eventDate);
    eventDateMidnight.setHours(0, 0, 0, 0);

    if (eventDateMidnight < today) {
      alert("⚠️ No se puede crear una reserva en fecha pasada.");
      return;
    }

    // Strict Time Check for Today
    if (eventDateMidnight.getTime() === today.getTime()) {
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();

      const [selH, selM] = document.getElementById("campoHora").value.split(':').map(Number);

      if (selH < currentHours || (selH === currentHours && selM < currentMinutes)) {
        alert("⚠️ No se puede reservar en una hora pasada.");
        return;
      }

      // [NEW] Rule: Block Lunch after 18:00
      const turno = document.getElementById("campoTurno").value;
      if (turno === 'almuerzo' && currentHours >= 18) {
        alert("⚠️ El servicio de almuerzo ha finalizado (Hora límite 18:00).");
        return;
      }
    }

    // --- CHECK LOCK (COMPLETO) ---
    // Rule: New Reservations cannot be created on blocked shifts.
    // Rule: Existing reservations CAN be edited (Editor check).
    const valId = document.getElementById("campoId").value;
    const isEdit = valId && valId.trim() !== "";

    if (!isEdit) {
      const currentHotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
      const targetSpace = document.getElementById("campoEspacio").value;
      const targetTurn = document.getElementById("campoTurno").value;

      // [NEW] Special Capacity Check
      const tName = targetTurn.toLowerCase();
      const special = specialDatesConfig.find(sd => sd.date === fecha);
      if (special) {
        let maxCap = 0;
        if (targetSpace === 'Restaurante') {
          maxCap = tName === 'almuerzo' ? (special.lunchMax || 0) : (special.dinnerMax || 0);
        } else if (targetSpace === 'Cafeteria') {
          maxCap = tName === 'almuerzo' ? (special.cafLunchMax || 0) : (special.cafDinnerMax || 0);
        }

        if (maxCap > 0) {
          const currentPax = loadedReservations.reduce((sum, r) => {
            if (r.type === 'lock' || (r.estado || '').toLowerCase() === 'anulada') return sum;
            const rDate = (r.fecha && r.fecha.toDate ? utils.toIsoDate(r.fecha.toDate()) : r.fecha);
            if (rDate !== fecha) return sum;
            if ((r.espacio || 'Restaurante') !== targetSpace) return sum;
            if ((r.turno || 'almuerzo').toLowerCase() !== tName) return sum;
            return sum + (parseInt(r.pax) || 0) + (parseInt(r.ninos) || 0);
          }, 0);

          const newPax = (parseInt(document.getElementById("campoPax").value) || 0) + (parseInt(document.getElementById("campoNinos").value) || 0);
          if (currentPax + newPax > maxCap) {
            alert(`⛔ VENTA CERRADA: AFORO COMPLETO\n\nEl aforo máximo para ${targetSpace} (${tName}) es de ${maxCap} personas.\nActualmente hay ${currentPax} reservadas.\nNo se pueden añadir ${newPax} personas más.`);
            return;
          }
        }
      }

      // 1. Client-Side Check (Fast & Matches UI)
      // Uses same defaults as Grid Render to ensure consistency
      console.log(`Checking Lock Client-Side: Date=${fecha} Space=${targetSpace} Turn=${targetTurn}`);

      const localLock = loadedReservations.find(r => {
        if (r.type !== 'lock') return false;

        const rDate = (r.fecha && r.fecha.toDate ? utils.toIsoDate(r.fecha.toDate()) : r.fecha);
        const rSpace = r.espacio || 'Restaurante';
        const rTurno = (r.turno || 'almuerzo').toLowerCase();

        return rSpace === targetSpace &&
          rTurno === targetTurn.toLowerCase() &&
          rDate === fecha;
      });

      if (localLock) {
        alert(`⛔ EL TURNO ESTÁ CERRADO (COMPLETO).\nNo se admiten nuevas reservas.`);
        return;
      }

      // 2. Robust Async Date Check (Server Side - Simplified to avoid Index Error)
      try {
        const lockSnap = await db.collection("reservas_restaurante")
          .where("hotel", "==", currentHotel)
          .where("espacio", "==", targetSpace)
          .where("turno", "==", targetTurn)
          .where("type", "==", "lock")
          // Removed date inequality filter to avoid composite index requirement
          // .where("fecha", ">=", startRange) 
          // .where("fecha", "<=", endRange)
          .get();

        let isLocked = false;
        lockSnap.forEach(doc => {
          const data = doc.data();
          let dateStr = "";
          if (data.fecha && data.fecha.toDate) dateStr = utils.toIsoDate(data.fecha.toDate());
          else if (typeof data.fecha === 'string') dateStr = data.fecha;

          // Manual Date Check
          if (dateStr === fecha) isLocked = true;
        });


        if (isLocked) {
          alert(`⛔ EL TURNO ESTÁ CERRADO (COMPLETO).\nNo se permiten nuevas reservas en este turno.`);
          return;
        }
      } catch (err) {
        console.error("Error checking lock:", err);
        // Optionally alert user or fail open. Failing open allows work to continue if DB hiccup.
      }
    }
    // -----------------------------

    const isServiceIncluded = document.getElementById("checkServicioIncluido").checked;
    let precio = window.MesaChef.parseEuroInput(document.getElementById("campoPrecio").value);
    let precioNinos = window.MesaChef.parseEuroInput(document.getElementById("campoPrecioNinos")?.value);
    if (isServiceIncluded) {
      precio = 0;
      precioNinos = 0;
    }

    const pax = parseInt(document.getElementById("campoPax").value) || 0;
    const ninos = parseInt(document.getElementById("campoNinos").value) || 0;

    if (!isServiceIncluded && precio === 0 && precioNinos > 0 && ninos === 0) {
      precio = precioNinos;
      precioNinos = 0;
    }

    const total = (pax * precio) + (ninos * precioNinos);

    const payload = {
      hotel: localStorage.getItem(STORAGE_KEY) || "Guadiana",
      referencia: document.getElementById("campoReferencia").value,
      fecha: firebase.firestore.Timestamp.fromDate(new Date(fecha)),
      espacio: document.getElementById("campoEspacio").value,
      nombre: nombre,
      telefono: telefono,
      hora: document.getElementById("campoHora").value,
      mesa: document.getElementById("campoMesa").value.trim(), // [NEW] Save Mesa
      pax: pax,
      ninos: ninos,
      precio: precio,
      precioAdulto: precio,
      precioPorPersona: precio,
      precioNinos: precioNinos,
      total: total,
      importeTotal: total,
      turno: document.getElementById("campoTurno").value,
      estado: document.getElementById("campoEstado").value,
      notas: document.getElementById("campoNotas").value,
      notaCliente: document.getElementById("campoNotaCliente").value,
      servicioIncluido: isServiceIncluded,
      tipoIncluido: isServiceIncluded ? document.getElementById("tipoIncluido").value : null,
      campoHabitacion: isServiceIncluded ? document.getElementById("campoHabitacion").value.trim() : null,
      campoBono: isServiceIncluded ? document.getElementById("campoBono").value.trim() : null,
      paygoldRef: document.getElementById("campoPaygoldRef") ? document.getElementById("campoPaygoldRef").value.trim() : "",
      paygoldAmount: document.getElementById("campoPaygoldAmount") ? parseFloat(document.getElementById("campoPaygoldAmount").value) || 0 : 0,
      paygoldStatus: document.getElementById("campoPaygoldStatus") ? document.getElementById("campoPaygoldStatus").value : "pendiente",
      paygoldLink: document.getElementById("campoPaygoldLink") ? document.getElementById("campoPaygoldLink").value.trim() : "",
      cardLast4: document.getElementById("campoCardLast4") ? document.getElementById("campoCardLast4").value.trim() : "",
      cardExpiry: document.getElementById("campoCardExpiry") ? document.getElementById("campoCardExpiry").value.trim() : "",
      cardBrand: document.getElementById("campoCardBrand") ? document.getElementById("campoCardBrand").value : "Visa",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!document.getElementById("campoId").value) {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    // --- CONFIRMATION FOR LINKED BUDGETS ---
    // --- CONFIRMATION FOR LINKED BUDGETS ---
    if (window.state && window.state.currentReserva && window.state.currentReserva.presupuestoId) {
      // Skip if cancelling (handled by anularReservation) - though usually save is not used for cancel here
      if (payload.estado !== 'cancelada' && payload.estado !== 'anulada') {
        if (!confirm(`⚠️ ATENCIÓN:\nEsta reserva está vinculada al presupuesto ${window.state.currentReserva.referenciaPresupuesto || "Linked"}.\n\nCualquier cambio que guardes aquí se sincronizará automáticamente con el presupuesto.\n\n¿Estás seguro de que quieres continuar?`)) {
          return;
        }
      }
    }
    // Fallback: verify if we have budget ID from somewhere else if state is empty? 
    // No, state should be populated on edit.

    let finalId = null;
    try {
      const id = document.getElementById("campoId").value;
      if (id) {
        finalId = id;
        if (window.state?.currentReserva?._isFromSalones || window.state?.currentReserva?.salonBookingId || id.startsWith("salon_")) {
          payload.salonBookingId = window.state?.currentReserva?.salonBookingId || id.replace("salon_", "");
          payload._isFromSalones = true;
        }
        if (payload.paygoldStatus === 'garantizado' && (!payload.fianzaPagada || payload.fianzaPagada === 0)) {
        payload.fianzaPagada = payload.paygoldAmount || 0;
      }
      await db.collection("reservas_restaurante").doc(id).set(payload, { merge: true });

        // 2-Way Sync to Salones
        if (payload.salonBookingId) {
          try {
            const salonUpdate = {
              cliente: payload.nombre,
              updated_at: new Date().toISOString()
            };
            if (payload.hora) salonUpdate["detalles.hora"] = payload.hora;
            if (payload.pax !== undefined) salonUpdate["detalles.pax_adultos"] = payload.pax;
            if (payload.ninos !== undefined) salonUpdate["detalles.pax_ninos"] = payload.ninos;
            if (payload.telefono) salonUpdate["contact.tel"] = payload.telefono;
            if (payload.estado) salonUpdate.estado = payload.estado;
            await db.collection("reservas_salones").doc(payload.salonBookingId).set(salonUpdate, { merge: true });
          } catch (eSal) {
            console.warn("Could not sync back to reservas_salones:", eSal);
          }
        }

        // [NEW] 2-Way Sync
        if (window.state && window.state.currentReserva && window.state.currentReserva.presupuestoId) {
          payload.presupuestoId = window.state.currentReserva.presupuestoId;
          await syncPresupuestoFromRestaurante(payload);
        }
      } else {
        const ref = await db.collection("reservas_restaurante").add(payload);
        finalId = ref.id;
      }

      // [INTEGRATION] PostMessage back to Gest-Spa
      const params = new URLSearchParams(window.location.search);
      if (params.get('source') === 'bono' && window.opener) {
        console.log("[INTEGRATION] Sending callback to Gest-Spa and closing...");
        window.opener.postMessage({
          type: 'RESTAURANT_RESERVATION_CREATED',
          id: finalId,
          voucher: params.get('voucher'),
          date: document.getElementById("campoFecha").value, // Use input value directly
          time: document.getElementById("campoHora").value,
          pax: payload.pax
        }, '*');

        // Auto-focus opener and close self
        setTimeout(() => {
          window.opener.focus();
          window.close();
        }, 300);
      }

      closeModal();
    } catch (err) {
      console.error(err);
      alert("Error al guardar: " + err.message);
    }
  };

  // [NEW] 2-Way Sync Helper
  async function syncPresupuestoFromRestaurante(reserva) {
    if (!reserva.presupuestoId) return;
    // console.log("Syncing Budget from Rte...", reserva.presupuestoId);

    try {
      const pRef = db.collection("presupuestos").doc(reserva.presupuestoId);
      const pSnap = await pRef.get();
      if (!pSnap.exists) return;

      const pData = pSnap.data();
      let lines = pData.lines || [];

      // In Restaurante, we don't have "Lines" in the reservation object exactly like Salones.
      // We have "pax" (Adults) and "ninos".
      // We must update the CORRESPONDING lines in the budget.
      // Strategy: Find lines that look like "Menú Rte..." or match the shift/concepts.

      // Update Pax Headers
      let newPaxA = reserva.pax || 0;
      let newPaxN = reserva.ninos || 0;

      // We need to update lines intelligently.
      // If we have "Menú Adulto", set uds = newPaxA.
      // If we have "Menú Niño", set uds = newPaxN.

      lines = lines.map(l => {
        const c = l.concepto.toLowerCase();
        if (c.includes("adulto") && (c.includes("menú") || c.includes("menu"))) {
          l.uds = newPaxA;
          if (reserva.precio !== undefined && reserva.precio !== null && reserva.precio > 0) {
            l.precio = reserva.precio;
          }
          l.total = l.uds * l.precio;
        }
        else if (c.includes("niño") || c.includes("infantil")) {
          l.uds = newPaxN;
          if (reserva.precioNinos !== undefined && reserva.precioNinos !== null && reserva.precioNinos > 0) {
            l.precio = reserva.precioNinos;
          }
          l.total = l.uds * l.precio;
        }

        return l;
      });

      const newTotal = lines.reduce((sum, l) => sum + (l.total || 0), 0);

      await pRef.update({
        paxAdultos: newPaxA,
        paxNinos: newPaxN,
        pax: newPaxA + newPaxN,
        lines: lines,
        importeTotal: newTotal,
        fecha: reserva.fecha, // Sync Date
        cliente: reserva.nombre, // Sync Client Name
        lastModifiedSource: 'Restaurante 🍽️', // Audit Trail
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.log("✅ Budget Synced from Restaurante!");

    } catch (e) {
      console.error("Error syncing Budget from Rte:", e);
    }
  }

  async function anularReservation() {
    const id = document.getElementById("campoId").value;
    if (!id) return;
    if (!confirm("⚠️ ¿Estás seguro de que quieres ANULAR esta reserva?")) return;

    try {
      // 1. Fetch the reservation first to see if it has a linked budget
      // We need to do this BEFORE updating because we need the presupuestoId
      const resDoc = await db.collection("reservas_restaurante").doc(id).get();
      const resData = resDoc.exists ? resDoc.data() : null;

      // 2. Update Reservation Status
      await db.collection("reservas_restaurante").doc(id).set({
        estado: 'anulada',
        cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // Sync cancellation to Salones if this reservation originated there
      const salonBookingId = (resData && resData.salonBookingId) || (window.state?.currentReserva?.salonBookingId) || (id.startsWith("salon_") ? id.replace("salon_", "") : null);
      if (salonBookingId) {
        try {
          await db.collection("reservas_salones").doc(salonBookingId).update({
            estado: 'cancelada',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch (eSal) {
          console.warn("Could not cancel salon booking:", eSal);
        }
      }

      // 3. Sync to Linked Budget (if exists)
      if (resData && resData.presupuestoId) {
        try {
          // console.log("Syncing Cancellation to Budget from Rte:", resData.presupuestoId);
          await db.collection("presupuestos").doc(resData.presupuestoId).update({
            estado: 'rechazada',
            lastModifiedSource: 'Restaurante 🍽️', // Audit Trail
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch (e) {
          console.error("Error syncing Rte Cancellation to Budget:", e);
        }
      }

      closeModal();
    } catch (err) {
      console.error(err);
      alert("Error al anular: " + err.message);
    }
  }

  function doSearch(query) {
    const container = document.getElementById("searchResults");
    if (!container) return;

    if (!query) {
      container.classList.add("hidden");
      return;
    }

    const q = query.toLowerCase();
    const results = loadedReservations.filter(r => {
      const combined = `${r.nombre || ''} ${r.cliente || ''} ${r.telefono || ''} ${r.email || ''} ${r.id || ''} ${r.espacio || ''} `.toLowerCase();
      const dateStr = r.fecha && r.fecha.toDate ? utils.toIsoDate(r.fecha.toDate()) : (r.fecha || "");
      return combined.includes(q) || dateStr.includes(q);
    });
    renderSearchResults(results);
  }

  window.toggleLock = async function (space, dateStr, turno) {
    if (!confirm(`¿Cambiar estado de BLOQUEO para ${space} - ${dateStr} - ${turno}?`)) return;
    const currentHotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";

    let existingLockId = null;
    loadedReservations.forEach(r => {
      if (r.type !== 'lock') return;
      if (r.espacio !== space) return;
      if (r.turno !== turno) return;
      let rDate = "";
      if (r.fecha && r.fecha.toDate) rDate = utils.toIsoDate(r.fecha.toDate());
      else if (typeof r.fecha === 'string') rDate = r.fecha;
      if (rDate === dateStr) existingLockId = r.id;
    });

    try {
      if (existingLockId) {
        await db.collection("reservas_restaurante").doc(existingLockId).delete();
      } else {
        await db.collection("reservas_restaurante").add({
          hotel: currentHotel,
          espacio: space,
          fecha: firebase.firestore.Timestamp.fromDate(new Date(dateStr)),
          turno: turno,
          type: 'lock',
          estado: 'COMPLETO',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (err) {
      console.error(err);
      alert("Error al cambiar bloqueo: " + err.message);
    }
  };

  function renderSearchResults(results) {
    const container = document.getElementById("searchResults");
    if (!container) return;
    container.innerHTML = "";

    if (results.length === 0) {
      container.innerHTML = '<div class="p-4 text-center text-slate-400 text-xs">No se encontraron resultados</div>';
    } else {
      // Sort by Date Desc
      results.sort((a, b) => {
        const da = a.fecha && a.fecha.toDate ? a.fecha.toDate() : new Date(a.fecha);
        const db = b.fecha && b.fecha.toDate ? b.fecha.toDate() : new Date(b.fecha);
        return db - da; // Descending
      });

      results.slice(0, 50).forEach(r => {
        const rDate = r.fecha && r.fecha.toDate ? r.fecha.toDate() : new Date(r.fecha);
        const datePretty = utils.formatDateShort(rDate);
        const name = r.nombre || r.cliente || "Sin Nombre";

        const item = document.createElement("div");
        item.className = "p-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition border-b border-gray-50 last:border-0";
        item.innerHTML = `
      <div class="flex flex-col">
                      <span class="font-bold text-slate-800 text-sm">${name}</span>
                      <span class="text-[10px] text-slate-500 uppercase">📅 ${datePretty} &bull; ${r.espacio || 'Restaurante'} &bull; ${r.turno}</span>
                  </div>
      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${r.estado || 'pendiente'}</span>
    `;
        item.onclick = () => selectSearchResult(r);
        container.appendChild(item);
      });
    }
    container.classList.remove("hidden");
  }

  window.selectSearchResult = function (r) {
    document.getElementById("searchResults").classList.add("hidden");
    const rDate = r.fecha && r.fecha.toDate ? r.fecha.toDate() : new Date(r.fecha);
    const dateStr = utils.toIsoDate(rDate);

    // Navigate (optional, but good for context)
    goToDate(rDate);

    // Open Modal Directly
    // openBooking(space, dateStr, turno, data)
    openBooking(r.espacio || "Restaurante", dateStr, r.turno, r);
  };

  window.goToDate = function (dateObj) {
    // [FIX] Just set the date, don't force Monday. getWeekDates handles the view.
    currentWeekStart = new Date(dateObj);
    renderGridStructure();
  };

  window.changeWeek = function (offset) {
    currentWeekStart.setDate(currentWeekStart.getDate() + (offset * 7));
    loadReservations(); // Reloads creates the grid structure and fetches data
  };

  // Listen for manual date change
  const inputSemana = document.getElementById("inputSemana");
  if (inputSemana) {
    inputSemana.addEventListener("change", (e) => {
      if (e.target.value) {
        const d = new Date(e.target.value);
        goToDate(d);
      }
    });
  }

  ensureFirebase(startApp);
})();
