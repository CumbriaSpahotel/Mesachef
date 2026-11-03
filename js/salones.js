// js/salones.js - v11 (Restored & Fixed)


(function () {
    // --- ROBUST FIREBASE INIT ---
    let appStarted = false;

    function ensureFirebase(callback) {
        // Assume Firebase initialized by firebase-init.js
        const checkInterval = setInterval(() => {
            if (window.firebase && window.firebase.auth && window.firebase.firestore) {
                clearInterval(checkInterval);
                initFirebase(callback);
            }
        }, 100);
    }

    function initFirebase(callback) {
        console.log("Salones: Using central Firebase initialization...");
        try {
            // AUTH LISTENER
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    if (!appStarted) {
                        console.log("Salones: Auth Ready (User logged in)", user.uid);
                        appStarted = true;
                        callback();
                    }
                } else {
                    console.log("Salones: User not logged in, signing in anonymously...");
                    // TRIGGER SIGN IN
                    firebase.auth().signInAnonymously().catch((error) => {
                        console.error("Auth Error (SignInAnonymously)", error);
                        alert("Error de autenticación con Firebase: " + error.message);
                    });
                }
            });

        } catch (e) {
            console.error("Firebase Init Error:", e);
            alert("Error crítico iniciando Firebase: " + e.message);
        }
    }
/**
 * Salones Module - Matrix v5
 */
    let db;
    let globalConfig = null;
    let currentWeekStart = new Date();
    // Key used by index.html
    const STORAGE_KEY = "mesaChef_hotel";

    function getActiveHotel() {
        const raw = localStorage.getItem(STORAGE_KEY) || "Guadiana";
        return (raw.toLowerCase().includes("cumbria")) ? "Cumbria" : "Guadiana";
    }

    function updateHeaderHotelDisplay(currentHotel) {
        const hotel = currentHotel || getActiveHotel();
        const headerName = document.getElementById("headerHotelName");
        if (!headerName) return;

        const isGuadiana = hotel === "Guadiana";
        const logoSrc = isGuadiana ? "Img/logo-guadiana.svg" : "Img/logo-cumbria.svg";
        const displayName = isGuadiana ? "Sercotel Guadiana" : "Cumbria Spa & Hotel";

        headerName.innerHTML = `
            <div class="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 shadow-sm">
                <img src="${logoSrc}" class="h-6 w-auto max-w-[100px] object-contain mr-1 shrink-0" alt="${displayName}">
                <select id="hotelSwitcherSelect" class="text-xs font-bold text-slate-800 bg-transparent border-none py-0 pl-1 pr-6 cursor-pointer focus:ring-0 outline-none">
                    <option value="Guadiana" ${isGuadiana ? 'selected' : ''}>Sercotel Guadiana</option>
                    <option value="Cumbria" ${!isGuadiana ? 'selected' : ''}>Cumbria Spa & Hotel</option>
                </select>
            </div>
        `;

        const selectEl = document.getElementById("hotelSwitcherSelect");
        if (selectEl) {
            selectEl.addEventListener("change", (e) => {
                setActiveHotel(e.target.value);
            });
        }
    }

    function setActiveHotel(hotelName) {
        const norm = (hotelName || "").toLowerCase().includes("cumbria") ? "Cumbria" : "Guadiana";
        localStorage.setItem(STORAGE_KEY, norm);
        updateHeaderHotelDisplay(norm);
        if (globalConfig) {
            populateDatalist();
            renderGrid();
        }
    }

    window.addEventListener("storage", (e) => {
        if (e.key === STORAGE_KEY && e.newValue) {
            const newNorm = e.newValue.toLowerCase().includes("cumbria") ? "Cumbria" : "Guadiana";
            if (newNorm !== getActiveHotel()) {
                updateHeaderHotelDisplay(newNorm);
                if (globalConfig) {
                    populateDatalist();
                    renderGrid();
                }
            }
        }
    });

    const utils = window.MesaChef || {
        getWeekDates: (d) => {
            const start = new Date(d);
            const day = start.getDay();
            const diff = start.getDate() - day + (day === 0 ? -6 : 1);
            start.setDate(diff);
            let dates = [];
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
        formatDateES: (d) => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    };

    const isRestauranteStyle = (name) => window.MesaChef.isRestauranteStyle(name);

    // --- NEXUS GROUPS HELPERS ---
    const isNexusEvent = (data) => {
        if (!data) return false;
        if (data.origen === "Nexus Groups" || (typeof data.origen === "string" && data.origen.toLowerCase().includes("nexus"))) return true;
        if (typeof data.id === "string" && data.id.startsWith("nexus_")) return true;
        if (data.reservaId && typeof data.notas?.interna === "string" && data.notas.interna.includes("[Nexus Groups]")) return true;
        return false;
    };

    const isNexusLinked = (data) => {
        if (!isNexusEvent(data)) return false;
        return !data.desvinculado && !data.vinculoRoto;
    };

    const getNexusRef = (data) => {
        if (!data) return "";
        if (data.reservaId) return String(data.reservaId);
        if (data.id && typeof data.id === "string" && data.id.startsWith("nexus_")) {
            const parts = data.id.split("_");
            if (parts.length >= 2) return parts[1];
        }
        if (typeof data.notas?.interna === "string") {
            const match = data.notas.interna.match(/Ref:\s*([^\s|]+)/i);
            if (match) return match[1];
        }
        if (typeof data.cliente === "string") {
            const match = data.cliente.match(/Ref:\s*([^)]+)\)/i);
            if (match) return match[1].trim();
        }
        return "";
    };

    function setModalFieldsDisabled(disabled) {
        const modal = document.getElementById("modal-evt");
        if (!modal) return;
        const fields = modal.querySelectorAll("input, select, textarea");
        fields.forEach(el => {
            el.disabled = disabled;
        });
        const serviceDeleteBtns = modal.querySelectorAll("#services-list button");
        serviceDeleteBtns.forEach(btn => {
            btn.disabled = disabled;
            if (disabled) btn.classList.add("opacity-30", "cursor-not-allowed", "pointer-events-none");
            else btn.classList.remove("opacity-30", "cursor-not-allowed", "pointer-events-none");
        });
        const btnAddSvc = document.getElementById("btnAddService");
        if (btnAddSvc) {
            if (disabled) btnAddSvc.classList.add("hidden");
            else btnAddSvc.classList.remove("hidden");
        }
    }

    function startApp() {
        console.log("Salones: Iniciando aplicación...");
        db = firebase.firestore();

        // 1. URL OVERRIDE & HOTEL IDENTITY
        const urlParams = new URLSearchParams(window.location.search);
        const hotelParam = urlParams.get('hotel');
        if (hotelParam) {
            const normParam = hotelParam.toLowerCase().includes("cumbria") ? "Cumbria" : "Guadiana";
            localStorage.setItem(STORAGE_KEY, normParam);
        }
        updateHeaderHotelDisplay(getActiveHotel());

        // 2. LOAD CONFIG
        db.collection("master_data").doc("CONFIG_SALONES").get().then(doc => {
            if (doc.exists) {
                globalConfig = doc.data();
            } else {
                globalConfig = { montajes: ["Banquete"], Guadiana: [], Cumbria: [] };
            }
            populateDatalist();
            renderGrid();
        }).catch(err => {
            console.error("Salones: Error config", err);
            globalConfig = { montajes: ["Banquete"], Guadiana: [], Cumbria: [] };
            renderGrid();
        });
    }

    function populateDatalist(salonFilter = null) {
        const dl = document.getElementById("charge-options");
        if (!dl || !globalConfig) return;

        const hotel = getActiveHotel();
        let html = "";

        // 1. Add Salon Rental Options (Filtered)
        if (globalConfig[hotel]) {
            globalConfig[hotel].forEach(s => {
                if (s.active !== false) {
                    const isRte = isRestauranteStyle(s.name);
                    const sDisplayName = s.name;
                    // Filter: Show only if no filter is set OR matches selected salon
                    if (!salonFilter || s.name === salonFilter || (isRte && isRestauranteStyle(salonFilter))) {
                        if (isRte) {
                            html += `<option value="Grupo ${sDisplayName} - almuerzo">`;
                            html += `<option value="Grupo ${sDisplayName} - cena">`;
                            html += `<option value="Grupo ${sDisplayName} - mañana">`;
                            html += `<option value="Grupo ${sDisplayName} - tarde">`;
                            html += `<option value="Grupo ${sDisplayName} - todo">`;
                            html += `<option value="Grupo ${sDisplayName} - almuerzo (Niños)">`;
                            html += `<option value="Grupo ${sDisplayName} - cena (Niños)">`;
                            if (hotel === "Guadiana" && sDisplayName.toLowerCase() !== "restaurante") {
                                html += `<option value="Grupo Restaurante - almuerzo">`;
                                html += `<option value="Grupo Restaurante - cena">`;
                                html += `<option value="Grupo Restaurante - mañana">`;
                                html += `<option value="Grupo Restaurante - tarde">`;
                                html += `<option value="Grupo Restaurante - todo">`;
                                html += `<option value="Grupo Restaurante - almuerzo (Niños)">`;
                                html += `<option value="Grupo Restaurante - cena (Niños)">`;
                            }
                        } else {
                            html += `<option value="Alquiler Salón ${s.name} - todo">`;
                            html += `<option value="Alquiler Salón ${s.name} - mañana">`;
                            html += `<option value="Alquiler Salón ${s.name} - tarde">`;
                        }
                    }
                }
            });
        }

        // 2. Add Extras (Always show)
        if (globalConfig.extras) {
            globalConfig.extras.forEach(e => {
                html += `<option value="${e.name}">`;
            });
        }

        dl.innerHTML = html;
    }

    window.updateRowPrice = function (input) {
        const val = input.value.trim();
        if (!val || !globalConfig) return;

        const row = input.closest("tr");
        if (!row) return;

        const conceptLower = val.toLowerCase();
        const udsInput = row.querySelector(".row-uds") || row.querySelectorAll("input")[2];
        
        // Detect if the concept is a technical equipment / single-unit item or configured extra
        let isExtra = false;
        if (globalConfig.extras) {
            isExtra = globalConfig.extras.some(e => (e.name || "").toLowerCase().trim() === conceptLower.trim());
        }
        const singleUnitKeywords = ["proyector", "pantalla", "microfono", "altavoz", "atril", "sonido", "dj", "tv", "television", "televisión", "portatil", "ordenador", "laptop", "cable"];
        const isSingleUnitItem = isExtra || singleUnitKeywords.some(kw => conceptLower.includes(kw));

        if (udsInput && (!udsInput.value || parseFloat(udsInput.value) === 1 || parseFloat(udsInput.value) === 0)) {
            if (conceptLower.includes("niño") || conceptLower.includes("nino") || conceptLower.includes("infantil")) {
                const paxN = parseFloat(document.getElementById("evt-pax-n").value) || 0;
                if (paxN > 0) {
                    udsInput.value = paxN;
                }
            } else if (!conceptLower.includes("alquiler") && !conceptLower.includes("extra") && !isSingleUnitItem) {
                const paxA = parseFloat(document.getElementById("evt-pax-a").value) || 0;
                if (paxA > 0) {
                    udsInput.value = paxA;
                }
            }
        }

        // Check Extras
        if (globalConfig.extras) {
            const ext = globalConfig.extras.find(e => e.name === val);
            if (ext) {
                row.querySelector(".row-price").value = ext.price;
            }
        }

        calcTotal();
    };

    function getCellId(hotel, salonName, dateStr) {
        const normalize = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s/g, '').toLowerCase();
        const h = normalize(hotel);
        const s = normalize(salonName);
        return `cell_${h}_${s}_${dateStr}`;
    }

    window.renderGrid = function () {
        const hotel = getActiveHotel();
        const container = document.getElementById("calendarGrid");
        if (!container) return;

        // Ensure reservations are loaded
        loadReservations();

        let salons = (globalConfig[hotel] || []).filter(s => s.active !== false);
        if (hotel === "Guadiana") {
            const hasRte = salons.some(s => isRestauranteStyle(s.name));
            if (!hasRte) {
                salons.unshift({ name: "Restaurante", pax: 150, active: true });
            }
        }
        const dates = utils.getWeekDates(currentWeekStart);

        const rangeEl = document.getElementById("currentWeekRange");
        if (rangeEl) rangeEl.innerText = `${dates[0].toLocaleDateString()} - ${dates[6].toLocaleDateString()}`;

        // Update Custom Date Label (Toolbar)
        const dateLabel = document.getElementById("currentDateLabel");
        const datePicker = document.getElementById("currentDate");
        if (dateLabel && datePicker && datePicker.value) {
            const d = new Date(datePicker.value);
            const dias = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];
            const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
            const dayName = dias[d.getDay()];
            const dayNum = d.getDate();
            const monthName = meses[d.getMonth()];
            const yearStr = String(d.getFullYear()).slice(-2);
            dateLabel.innerText = `${dayName} ${dayNum} ${monthName} ${yearStr}`;
        }

        // TABLE LAYOUT
        let html = `
        <div style="display: flex; flex-direction: column; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <div style="display: grid; grid-template-columns: 200px repeat(7, 1fr); background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                <div class="py-2 px-2 font-bold text-slate-500 text-xs tracking-wide uppercase flex items-center justify-center border-r border-slate-200">SALA</div>
                ${dates.map(d => {
            const dias = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];
            const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
            const dayName = dias[d.getDay()];
            const dayNum = d.getDate();
            const monthName = meses[d.getMonth()];
            const yearStr = String(d.getFullYear()).slice(-2);
            return `
                    <div class="py-1 px-1 font-bold text-center text-xs text-slate-500 border-r border-slate-100 last:border-r-0 flex items-center justify-center bg-[#f8fafc]">
                        ${dayName} ${dayNum} ${monthName} ${yearStr}
                    </div>
                `}).join('')}
            </div>
        `;

        if (salons.length === 0) {
            html += `
            <div class="p-10 text-center text-slate-400">
                <span class="text-4xl block mb-2">🏨</span>
                <span class="font-bold">No hay salones activos para ${hotel}.</span>
            </div>`;
        } else {
            const bloqueos = globalConfig.bloqueos || [];

            salons.forEach((salon, index) => {
                const isLast = index === salons.length - 1;
                const isRteRow = isRestauranteStyle(salon.name);

                const isOddRow = index % 2 === 1;
                const rowBg = isOddRow ? '#f0f5ff' : '#ffffff';
                const nameCellBg = isRteRow ? 'bg-indigo-600 text-white' : (isOddRow ? 'bg-blue-50/60 text-slate-700' : 'bg-white text-slate-700');
                const salonDisplayName = salon.name;

                html += `<div style="display: grid; grid-template-columns: 200px repeat(7, 1fr); background: ${rowBg}; ${isLast ? '' : 'border-bottom: 1px solid #e2e8f0;'}">
                    <div class="${nameCellBg} p-2 font-bold flex flex-col justify-center border-r border-slate-100 relative group transition-colors">
                        <span class="text-xs ${isRteRow ? 'text-white' : 'text-slate-800'}">${isRteRow ? '🍽️ ' : ''}${salonDisplayName}</span>
                        <span class="${isRteRow ? 'text-indigo-100' : 'text-slate-400'} font-normal mt-0.5 uppercase tracking-wider text-[9px]">Cap: ${salon.pax}</span>
                    </div>`;

                dates.forEach(d => {
                    const dateStr = utils.toIsoDate(d);
                    const safeName = salon.name.replace(/'/g, "\\'");

                    // Check Block
                    let isBlocked = false;
                    let blockReason = "";
                    bloqueos.forEach(b => {
                        if (b.salon === "TODOS" || b.salon === salon.name) {
                            if (dateStr >= b.start && dateStr <= b.end) {
                                isBlocked = true;
                                blockReason = b.note || "Bloqueado";
                            }
                        }
                    });

                    if (isBlocked) {
                        html += `<div id="${getCellId(hotel, salon.name, dateStr)}"
                                    class="bg-red-50 hover:bg-red-100 border-r border-slate-100 last:border-r-0 transition p-1 relative flex flex-col items-center justify-center group cursor-not-allowed" title="${blockReason}">
                                    <span class="text-lg">🔒</span>
                                    <span class="text-[9px] text-red-600 font-bold uppercase mt-1 text-center leading-tight">${blockReason}</span>
                               </div>`;
                    } else {
                        // Past check
                        const isPast = dateStr < utils.toIsoDate(new Date());
                        let cellBg = isPast ? (isOddRow ? 'bg-blue-50/40' : 'bg-slate-100') : (isOddRow ? 'bg-blue-50/30' : 'bg-white');
                        if (isRteRow && !isPast) cellBg = "bg-indigo-50/30 bg-gradient-to-b from-indigo-100/20 to-transparent";

                        // Interaction Classes
                        let interactionClass = isPast
                            ? "cursor-default text-slate-300"
                            : "cursor-pointer hover:bg-slate-50 text-slate-200 hover:text-slate-400";
                        
                        if (isRteRow && !isPast) interactionClass = "cursor-pointer hover:bg-white text-indigo-300 hover:text-indigo-600";

                        const maOnClick = isPast ? "" : `onclick="window.openBooking('${safeName}', '${dateStr}', null, 'mañana')"`;
                        const taOnClick = isPast ? "" : `onclick="window.openBooking('${safeName}', '${dateStr}', null, 'tarde')"`;
                        const slotMaText = isPast ? '-' : (isRteRow ? '<span class="text-xl filter drop-shadow-sm">☀️</span>' : 'LIBRE');
                        const slotTaText = isPast ? '-' : (isRteRow ? '<span class="text-lg filter drop-shadow-sm">🌙</span>' : 'LIBRE');

                        let slotRteClass = isRteRow && !isPast ? "m-1 rounded-xl bg-indigo-50/60 border border-indigo-100 shadow-sm hover:bg-white hover:border-indigo-300 hover:shadow-md" : "";

                        // DATA ATTRIBUTES for easy reset
                        html += `<div id="${getCellId(hotel, salon.name, dateStr)}"
                                    data-salon="${safeName}" data-date="${dateStr}"
                                    class="${cellBg} min-h-[120px] border-r border-slate-100 last:border-r-0 relative group grid grid-rows-2 gap-[1px]">
                                    
                                    <!-- Slot Mañana -->
                                    <div ${maOnClick}
                                         class="relative flex items-center justify-center text-[9px] font-bold uppercase tracking-tight transition ${interactionClass} ${slotRteClass}">
                                         ${slotMaText}
                                    </div>

                                    <!-- Slot Tarde -->
                                    <div ${taOnClick}
                                         class="relative flex items-center justify-center text-[9px] font-bold uppercase tracking-tight transition ${interactionClass} ${slotRteClass}">
                                         ${slotTaText}
                                    </div>
                                  </div>`;
                    }
                });
                html += `</div>`;
            });
        }

        html += `</div>`;
        container.innerHTML = html;
        paintReservations(hotel);
    };

    // --- LOGIC: FETCHING ---
    let unsubscribe = null;
    let loadedReservations = [];

    function loadReservations() {
        if (unsubscribe) unsubscribe();
        loadedReservations = [];

        const hotel = getActiveHotel();
        const dates = utils.getWeekDates(currentWeekStart);
        const start = utils.toIsoDate(dates[0]);
        const end = utils.toIsoDate(dates[6]);

        console.log(`Loading reservations for ${hotel} from ${start} to ${end}`);

        unsubscribe = db.collection("reservas_salones")
            .where("fecha", ">=", start)
            .where("fecha", "<=", end)
            .onSnapshot(snapshot => {
                const normalize = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s/g, "").toLowerCase();
                const hLocal = normalize(hotel);

                loadedReservations = [];
                snapshot.forEach(doc => {
                    const data = window.EventLocation.applyJornadaOverride(doc.data());
                    const hDoc = normalize(data.hotel);
                    // STRICT FILTER: Only load reservations that strictly belong to current hotel
                    if (!hDoc || hDoc !== hLocal) return;
                    
                    loadedReservations.push({ id: doc.id, ...data });
                });
                paintReservations(hotel);
            }, error => {
                console.error("Error loading reservations:", error);
            });
    }

    function paintReservations(hotel) {
        const renderedIds = new Set();
        const eligibleReservations = [];
        // RESET ALL CELLS to "Libre" state first (Handles deletions/updates cleanliness)
        document.querySelectorAll(`[id^="cell_"]`).forEach(cell => {
            if (cell.getAttribute("data-salon")) {
                const s = cell.getAttribute("data-salon");
                const d = cell.getAttribute("data-date");
                const isRte = isRestauranteStyle(s);
                const isPast = d < utils.toIsoDate(new Date());
                
                // [NEW] Reset layout classes for multi-service support
                cell.classList.remove('flex', 'flex-col', 'gap-1', 'p-0.5', 'overflow-y-auto');
                cell.classList.add('grid', 'grid-rows-2', 'gap-[1px]');

                const interactionClass = isPast
                    ? "cursor-default text-slate-300"
                    : (isRte ? "cursor-pointer hover:bg-white text-indigo-300 hover:text-indigo-600" : "cursor-pointer hover:bg-slate-50 text-slate-200 hover:text-slate-400");
                
                const slotRteClass = isRte && !isPast ? "m-1 rounded-xl bg-indigo-50/60 border border-indigo-100 shadow-sm hover:bg-white hover:border-indigo-300 hover:shadow-md" : (isRte ? "" : "relative border-b border-transparent hover:border-slate-100");
                const slotMaText = isRte ? '☀️' : 'LIBRE';
                const slotTaText = isRte ? '🌙' : 'LIBRE';
                const opacityClass = isPast ? "opacity-20 grayscale" : "filter drop-shadow-sm";
                const iconSize = isRte ? "text-lg" : "text-[10px]";

                cell.innerHTML = `
                    <div onclick="${isPast ? '' : `window.openBooking('${s}', '${d}', null, 'mañana')`}" class="flex items-center justify-center font-bold uppercase tracking-tight transition ${interactionClass} ${slotRteClass}">
                        <span class="${iconSize} ${opacityClass}">${slotMaText}</span>
                    </div>
                    <div onclick="${isPast ? '' : `window.openBooking('${s}', '${d}', null, 'tarde')`}" class="flex items-center justify-center font-bold uppercase tracking-tight transition ${interactionClass} ${isRte && !isPast ? slotRteClass : ''}">
                        <span class="${iconSize} ${opacityClass}">${slotTaText}</span>
                    </div>
                 `;
            }
        });

        const filterEl = document.getElementById("filterStatus");
        const filterVal = filterEl ? filterEl.value : "todos";

        console.log("Painting Reservations. Hotel:", hotel, "Filter:", filterVal, "Total Loaded:", loadedReservations.length, loadedReservations);

        const salonMap = {};
        const normalize = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s/g, '').toLowerCase();

        if (globalConfig[hotel]) {
            globalConfig[hotel].forEach(s => {
                salonMap[normalize(s.name)] = s.name;
            });
        }

        if (hotel === "Guadiana") {
            const rteSalon = (globalConfig.Guadiana || []).find(s => isRestauranteStyle(s.name));
            const canonicalRteName = rteSalon ? rteSalon.name : "Alarcos Eventos";
            salonMap["alarcoseventos"] = canonicalRteName;
            salonMap["eventosalarcos"] = canonicalRteName;
            salonMap["eventosgruposalarcos"] = canonicalRteName;
            salonMap["gruposalarcos"] = canonicalRteName;

            salonMap["eventosrestaurante"] = canonicalRteName;
        }

        const cellGroups = {};
        const unmappedEvents = [];

        loadedReservations.forEach(res => {
            // Restaurante se gestiona en su propio cuadrante, también si procede de Nexus.
            if (window.EventLocation.isRestaurant(res.salon)) return;
            const st = (res.estado || "").toLowerCase();
            const isConfirmed = st === 'confirmada' || st === 'confirmed';
            const isPending = st === 'provisional' || st === 'pendiente' || st === 'pending' || st === 'presupuesto';
            const isCancelled = st === 'cancelada' || st === 'cancelled' || st === 'anulada';

            if (filterVal === 'activos') { if (!isConfirmed && !isPending) return; }
            else if (filterVal === 'confirmada') { if (!isConfirmed) return; }
            else if (filterVal === 'provisional') { if (!isPending) return; }
            else if (filterVal === 'cancelada') { if (!isCancelled) return; }
            else if (filterVal !== 'todos') { if (st !== filterVal.toLowerCase()) return; }

            eligibleReservations.push(res);

            let relevantDates = new Set();
            if (res.servicios && res.servicios.length > 0) {
                res.servicios.forEach(s => { if (s.fecha) relevantDates.add(s.fecha); });
            }
            if (relevantDates.size === 0) relevantDates.add(res.fecha);

            const rawName = normalize(res.salon);
            let canonicalName = salonMap[rawName];

            if (!canonicalName) {
                const trimmedSalon = (res.salon || "").trim().toLowerCase();
                const foundKey = Object.keys(salonMap).find(k => {
                    const mappedName = (salonMap[k] || "").trim().toLowerCase();
                    return mappedName === trimmedSalon || 
                           mappedName.replace(/\s+/g, '') === trimmedSalon.replace(/\s+/g, '') ||
                           mappedName.includes(trimmedSalon) || 
                           trimmedSalon.includes(mappedName);
                });
                if (foundKey) {
                    canonicalName = salonMap[foundKey];
                }
            }

            if (!canonicalName && hotel === "Guadiana" && isRestauranteStyle(res.salon)) {
                const rteSalon = (globalConfig.Guadiana || []).find(s => isRestauranteStyle(s.name));
                canonicalName = rteSalon ? rteSalon.name : "Alarcos Eventos";
            }

            if (!canonicalName) {
                console.warn(`Salon mismatch: "${res.salon}" (Normalized: "${rawName}") not found in configuration for ${hotel}.`, Object.keys(salonMap));
                unmappedEvents.push(res);
                return;
            }

            relevantDates.forEach(date => {
                const key = `${res.hotel}_${canonicalName}_${date}`;
                if (!cellGroups[key]) cellGroups[key] = [];

                let dailyJornada = res.detalles?.jornada || "todo";
                cellGroups[key].push({ ...res, fecha: date, _displayJornada: dailyJornada, _canonicalSalon: canonicalName });
            });
        });

        // Register clicks
        window._resRegistry = {};

        Object.keys(cellGroups).forEach(key => {
            try {
                const group = cellGroups[key];
                if (group.length === 0) return;

            const sample = group[0];
            const cellId = getCellId(hotel, sample._canonicalSalon, sample.fecha);
            const cell = document.getElementById(cellId);
            if (!cell) {
                // If cell is not found, just skip (legacy data or date outside range)
                return;
            }

            const safeName = sample._canonicalSalon.replace(/'/g, "\\'");
            const dateStr = sample.fecha;

            const isPast = dateStr < utils.toIsoDate(new Date());
            const interactionClass = isPast
                ? "cursor-default text-slate-300"
                : "cursor-pointer hover:bg-slate-50 text-slate-200 hover:text-slate-400";

            const isRte = isRestauranteStyle(sample._canonicalSalon);
            const maOnClick = isPast ? "" : `onclick="window.openBooking('${safeName}', '${dateStr}', null, '${isRte ? 'almuerzo' : 'mañana'}')"`;
            const taOnClick = isPast ? "" : `onclick="window.openBooking('${safeName}', '${dateStr}', null, '${isRte ? 'cena' : 'tarde'}')"`;
            const cellOnClick = isPast ? "" : `onclick="window.openBooking('${safeName}', '${dateStr}', null, '${isRte ? 'almuerzo' : 'todo'}')"`;

            const slotMaText = isRte ? '☀️' : 'LIBRE';
            const slotTaText = isRte ? '🌙' : 'LIBRE';
            const opacityClass = isPast ? "opacity-20 grayscale" : "filter drop-shadow-sm";
            const iconSize = isRte ? "text-lg" : "text-[10px]";

            const slotMañana = `<div ${maOnClick} class="relative flex items-center justify-center font-bold uppercase tracking-widest transition border-b border-transparent hover:border-slate-100 ${interactionClass}"><span class="${iconSize} ${opacityClass}">${slotMaText}</span></div>`;
            const slotTarde = `<div ${taOnClick} class="relative flex items-center justify-center font-bold uppercase tracking-widest transition ${interactionClass}"><span class="${iconSize} ${opacityClass}">${slotTaText}</span></div>`;

            let htmlFinal = "";

            // [NEW] MULTI-SERVICE EXCEPTION: Eventos Restaurante
            const isMultiService = isRestauranteStyle(sample._canonicalSalon);

            if (isMultiService) {
                // Change card container to flex for stacking
                cell.classList.remove('grid', 'grid-rows-2', 'gap-[1px]');
                cell.classList.add('flex', 'flex-col', 'gap-1', 'p-1', 'overflow-y-auto');

                // [ORDER] Sort: Almuerzo first, Cena after
                const turnoOrder = t => {
                    const v = (t.turno || t._displayJornada || '').toLowerCase();
                    if (v.includes('almuerzo') || v.includes('mañana')) return 0;
                    if (v.includes('cena') || v.includes('tarde')) return 2;
                    return 1;
                };
                const sortedGroup = [...group].sort((a, b) => turnoOrder(a) - turnoOrder(b));

                // Detect boundary between last almuerzo and first cena for separator
                let lastLunchIdx = -1;
                sortedGroup.forEach((r, i) => {
                    const v = (r.turno || r._displayJornada || '').toLowerCase();
                    if (v.includes('almuerzo') || v.includes('mañana')) lastLunchIdx = i;
                });
                const hasBothServices = lastLunchIdx >= 0 && lastLunchIdx < sortedGroup.length - 1;

                sortedGroup.forEach((r, i) => {
                    htmlFinal += createCardHTML(r, "min-h-[48px] shrink-0");
                    renderedIds.add(r.id);
                    // Add a subtle separator between the last almuerzo and the first cena
                    if (hasBothServices && i === lastLunchIdx) {
                        htmlFinal += `<div class="border-t border-slate-200 my-0.5 mx-1 no-print" title="—"></div>`;
                    }
                });

                // [FIX] Subtle Add Buttons for MultiService
                if (!isPast) {
                    htmlFinal += `
                        <div class="mt-auto flex justify-center gap-4 py-1 border-t border-slate-50 no-print">
                            <button onclick="window.openBooking('${safeName}', '${dateStr}', null, 'almuerzo')" class="text-lg hover:scale-125 transition filter grayscale hover:grayscale-0" title="Añadir Almuerzo">☀️</button>
                            <button onclick="window.openBooking('${safeName}', '${dateStr}', null, 'cena')" class="text-lg hover:scale-125 transition filter grayscale hover:grayscale-0" title="Añadir Cena">🌙</button>
                        </div>
                    `;
                }
            } else {
                // Relaxed 'Todo' check: matches 'todo', 'dia', 'completo' or if it's not half-day
                const evTodo = group.find(r => {
                    const j = (r._displayJornada || 'todo').toLowerCase();
                    const hora = r.detalles?.hora || r.servicios?.[0]?.hora || '';
                    return j === 'todo' || j.includes('todo') || j.includes('dia') || j.includes('completo') || (j === 'sala' && !/^\d{1,2}:\d{2}$/.test(hora));
                });

                if (evTodo) {
                    htmlFinal += createCardHTML(evTodo, "row-span-2 h-full");
                    renderedIds.add(evTodo.id);
                } else {
                    const evMañana = group.find(r => {
                        const j = (r._displayJornada || (r.detalles && r.detalles.jornada) || '').toLowerCase();
                        if (j.includes('tarde') || j.includes('cena') || j.includes('merienda')) return false;
                        const h = parseInt(((r.detalles && r.detalles.hora) || (r.servicios && r.servicios[0] && r.servicios[0].hora) || '').split(':')[0], 10);
                        return j.includes('mañana') || j.includes('almuerzo') || j.includes('desayuno') || (!isNaN(h) && h < 16);
                    });
                    if (evMañana) {
                        htmlFinal += createCardHTML(evMañana, "h-full");
                        renderedIds.add(evMañana.id);
                    }
                    else htmlFinal += slotMañana;

                    const evTarde = group.find(r => {
                        if (evMañana && r.id === evMañana.id) return false;
                        const j = (r._displayJornada || (r.detalles && r.detalles.jornada) || '').toLowerCase();
                        if (j.includes('mañana') || j.includes('almuerzo') || j.includes('desayuno')) return false;
                        const h = parseInt(((r.detalles && r.detalles.hora) || (r.servicios && r.servicios[0] && r.servicios[0].hora) || '').split(':')[0], 10);
                        return j.includes('tarde') || j.includes('cena') || j.includes('merienda') || (!isNaN(h) && h >= 16);
                    });
                    if (evTarde) {
                        htmlFinal += createCardHTML(evTarde, "h-full");
                        renderedIds.add(evTarde.id);
                    }
                    else htmlFinal += slotTarde;
                }
            }

            cell.innerHTML = htmlFinal;
        } catch (cellErr) {
            console.error("Error pintando celda para clave:", key, cellErr);
        }
        });

        // Find which eligible reservations were not rendered
        const unrenderedEvents = eligibleReservations.filter(r => !renderedIds.has(r.id));
        const alertsArea = document.getElementById("app-alerts");

        if (alertsArea) {
            if (unrenderedEvents.length > 0) {
                // Deduplicate unrendered events
                const uniqueUnrendered = Array.from(new Set(unrenderedEvents.map(e => e.id)))
                    .map(id => unrenderedEvents.find(e => e.id === id));

                alertsArea.innerHTML = `
                    <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-md animate-pulse">
                        <div class="flex items-start gap-3">
                            <span class="text-2xl mt-0.5">🚨</span>
                            <div class="flex-1">
                                <h4 class="text-red-800 font-bold text-sm">CRÍTICO: Hay ${uniqueUnrendered.length} evento(s) activo(s) en este rango que NO se muestran en el cuadrante principal.</h4>
                                <p class="text-red-700 text-xs mt-1 font-semibold uppercase tracking-wider">¡Ningún evento puede perderse! Por favor, haz clic sobre el evento para revisarlo o corregirlo:</p>
                                <div class="flex flex-wrap gap-2 mt-3">
                                    ${uniqueUnrendered.map(e => {
                                        // Ensure the reservation is registered so openBooking can open it
                                        window._resRegistry[e.id] = e;
                                        const safeSalon = (e.salon || '').replace(/'/g, "\\'");
                                        return `
                                            <button onclick="window.openBooking('${safeSalon}', '${e.fecha}', window._resRegistry['${e.id}'])" 
                                                class="bg-white border border-red-200 text-red-900 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-red-100 transition shadow-sm flex items-center gap-2">
                                                📌 ${e.cliente} (${e.salon || 'Sin Salón'}) - ${e.fecha} [Turno: ${e.detalles?.jornada || 'Desconocido'}]
                                            </button>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                alertsArea.innerHTML = "";
            }
        }

        // Clean up legacy footer area if it exists
        const footerArea = document.getElementById("footer-unmapped-area");
        if (footerArea) footerArea.innerHTML = "";
    }

    // Helper for Card HTML
    function createCardHTML(res, extraClasses = "") {
        window._resRegistry[res.id] = res; // Register for click

        const isRte = isRestauranteStyle(res.salon || res._canonicalSalon);
        const jornada = res._displayJornada || res.detalles?.jornada || "todo";
        const st = (res.estado || "").toLowerCase();
        const isCancelled = st === 'cancelada' || st === 'cancelled' || st === 'anulada' || st === 'anulado';
        let rDateStr = "";
        if (res.fecha && res.fecha.toDate) rDateStr = utils.toIsoDate(res.fecha.toDate());
        else if (typeof res.fecha === 'string') rDateStr = res.fecha;
        const isPast = !!(rDateStr && rDateStr < utils.toIsoDate(new Date()));

        let colorClass = 'bg-blue-100 border-blue-500 text-blue-800';

        if (isCancelled) {
            colorClass = isPast ? 'bg-red-50 text-red-900 border-red-400' : 'bg-red-100 border-red-500 text-red-900';
        }
        else if (isPast) {
            colorClass = 'bg-slate-200/85 border-slate-400 text-slate-600';
        }
        else if (st === 'confirmada' || st === 'confirmed') {
            colorClass = 'bg-green-100 border-green-500 text-green-800';
            const jLower = (jornada || "").toLowerCase();
            if (jLower.includes('mañana')) colorClass = 'bg-teal-100 border-green-500 text-green-800';
            else if (jLower.includes('tarde')) colorClass = 'bg-lime-100 border-green-500 text-green-800';
        }
        else if (st === 'provisional' || st === 'pendiente' || st === 'pending') colorClass = 'bg-yellow-100 border-yellow-500 text-yellow-800';
        else if (st === 'presupuesto') colorClass = 'bg-orange-100 border-orange-500 text-orange-800';

        if (isPast) {
            extraClasses += " opacity-75 hover:opacity-100 transition shadow-none";
        }

        // [DISTINCT FORMAT] Custom style for Restaurant
        if (isRte) {
            if (isCancelled) {
                // Anulados en Restaurante con fondo rojo y borde rojo
                colorClass = isPast
                    ? `bg-red-50 text-red-900 border-red-400 border-l-[6px] shadow-sm hover:ring-2 hover:ring-red-200`
                    : `bg-red-100 text-red-900 border-red-500 border-l-[6px] shadow-sm hover:ring-2 hover:ring-red-200`;
                extraClasses += " ring-1 ring-red-200 shadow-md rounded-lg overflow-hidden";
            } else if (isPast) {
                colorClass = `bg-slate-200/85 text-slate-600 border-slate-400 border-l-[6px] shadow-sm hover:ring-2 hover:ring-slate-300`;
                extraClasses += " ring-1 ring-slate-300/60 shadow-md rounded-lg overflow-hidden";
            } else {
                // Determine border color based on status
                let statusColor = 'indigo-600';
                if (st === 'confirmada' || st === 'confirmed') statusColor = 'green-600';
                else if (st === 'provisional' || st === 'pendiente' || st === 'pending') statusColor = 'amber-500';
                else if (st === 'presupuesto') statusColor = 'orange-500';

                // Override colorClass with a unique Indigo/Violet theme
                colorClass = `bg-white text-slate-800 border-${statusColor} border-l-[6px] shadow-sm hover:ring-2 hover:ring-indigo-100`;
                extraClasses += " ring-1 ring-slate-200/50 shadow-md rounded-lg overflow-hidden";
            }
        }

        let noteStr = '';
        try {
            const hasNote = res.notas && res.notas.interna && res.notas.interna.trim().length > 0;
            noteStr = hasNote ? `<span title="Nota Interna: ${(res.notas.interna || '').replace(/"/g, '&quot;')}" class="cursor-help ml-1">📝</span>` : '';
        } catch (e) {
            noteStr = '';
        }

        let jText = (jornada || "").toUpperCase();
        let jClass = isRte ? "text-indigo-700 bg-indigo-100/80" : "text-slate-600";
        
        if (jText.includes("SALA")) { jText = "SALA"; if (!isRte) jClass = "text-purple-700 bg-purple-100/50"; }
        else if (jText.includes("DESAYUNO")) { jText = "DESAY"; if (!isRte) jClass = "text-sky-700 bg-sky-100/50"; }
        else if (jText.includes("MERIENDA")) { jText = "MERI"; if (!isRte) jClass = "text-amber-700 bg-amber-100/50"; }
        else if (jText.includes("MAÑANA") || jText.includes("ALMUERZO")) { jText = isRte ? "ALMUERZO" : "1/2 MAÑ"; if (!isRte) jClass = "text-sky-700 bg-sky-100/50"; }
        else if (jText.includes("TARDE") || jText.includes("CENA")) { jText = isRte ? "CENA" : "1/2 TARD"; if (!isRte) jClass = "text-orange-700 bg-orange-100/50"; }
        else if (jText.includes("TODO")) { jText = "COMP"; if (!isRte) jClass = "text-indigo-700 bg-indigo-100/50"; }

        // [INCLUIDO/PAGO] Badge
        const isIncluido = res.detalles?.incluido === true;
        const pagoBadge = isIncluido
            ? `<span class="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-300 leading-none" title="Incluido en el paquete">✓ INC</span>`
            : `<span class="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300 leading-none" title="Servicio de pago">💰 PAGO</span>`;

        const timeStr = res.detalles?.hora ? `<span class="opacity-75">${res.detalles.hora}</span>` : '';
        const paxTotal = (res.detalles?.pax_adultos || 0) + (res.detalles?.pax_ninos || 0);
        const paxStr = paxTotal > 0 ? `<span class="text-[11px] bg-white/60 px-1 rounded ml-1 font-bold text-slate-700" title="Pax Montaje: ${paxTotal}">👤${paxTotal}</span>` : '';

        const montajeName = res.detalles?.montaje || '-';
        const montajeStr = paxTotal > 0 ? `${montajeName} (${paxTotal} pax)` : montajeName;

        // Breakdown of Services for Planning (safe guard for non-array / null items)
        const cateringServices = Array.isArray(res.servicios) ? res.servicios.filter(s => {
            if (!s) return false;
            const c = (typeof s === 'string' ? s : (s.concepto || "")).toLowerCase();
            return !c.includes("alquiler");
        }) : [];

        const getServiceIcon = (concept) => {
            const c = (concept || "").toLowerCase();
            if (c.includes("coffe") || c.includes("cafe") || c.includes("café") || c.includes("desayuno")) return "☕";
            if (c.includes("coctel") || c.includes("cóctel")) return "🍸";
            if (c.includes("almuerzo") || c.includes("cena") || c.includes("menu") || c.includes("menú") || c.includes("comida")) return "🍽️";
            if (c.includes("barra") || c.includes("copas") || c.includes("vino")) return "🍷";
            return "📌";
        };

        let servicesHtml = '';
        if (cateringServices.length > 0) {
            const displayServices = cateringServices.slice(0, 4);
            const remaining = cateringServices.length - displayServices.length;
            servicesHtml = `
            <div class="mt-1 pt-1 border-t border-slate-300/40 flex flex-col gap-0.5 text-[10px] leading-tight">
                ${displayServices.map(s => {
                    const concepto = typeof s === 'string' ? s : (s.concepto || 'Servicio');
                    const uds = typeof s === 'object' && s && s.uds !== undefined ? s.uds : 1;
                    const hora = typeof s === 'object' && s && s.hora ? s.hora : '';
                    const horaHtml = hora ? `<span class="font-bold text-slate-800 mr-1 bg-slate-200/80 px-1 py-0.5 rounded text-[8.5px]">${hora}</span>` : '';
                    const fullTitle = (hora ? hora + ' ' : '') + concepto;
                    return `
                    <div class="flex items-center justify-between text-slate-700 font-medium">
                        <span class="truncate pr-1 opacity-90" title="${fullTitle.replace(/"/g, '&quot;')}">${horaHtml}${getServiceIcon(concepto)} ${concepto}</span>
                        <span class="font-bold text-slate-900 shrink-0 bg-white/70 px-1 rounded text-[9px] shadow-[0_0_1px_rgba(0,0,0,0.15)]">${uds} pax</span>
                    </div>
                    `;
                }).join('')}
                ${remaining > 0 ? `<div class="text-[9px] text-slate-500 font-bold italic">+${remaining} servicio${remaining > 1 ? 's' : ''} más</div>` : ''}
            </div>
            `;
        }

        const safeCliente = (res.cliente || '').replace(/"/g, '&quot;');
        const safeCardTitle = `${safeCliente} | Montaje: ${montajeStr}${cateringServices.length > 0 ? ' | Servicios: ' + cateringServices.map(s => (typeof s === 'object' && s && s.hora ? s.hora + ' ' : '') + (typeof s === 'string' ? s : s.concepto || '') + ' (' + (s.uds || 1) + ' pax)').join(', ') : ''}`.replace(/"/g, '&quot;');

        let nexusTag = "";
        if (isNexusLinked(res)) {
            nexusTag = `<span class="bg-amber-100 text-amber-900 border border-amber-300 px-1 py-0.5 rounded text-[9px] font-bold mr-1 shrink-0" title="Vinculado a Nexus Groups">🔒 Nexus</span>`;
        } else if (res.desvinculado || res.vinculoRoto) {
            nexusTag = `<span class="bg-emerald-100 text-emerald-900 border border-emerald-300 px-1 py-0.5 rounded text-[9px] font-bold mr-1 shrink-0" title="Desvinculado de Nexus Groups (MesaChef)">🔓 MesaChef</span>`;
        }

        return `
        <div onclick="window.handleCardClick('${res.id}', event)" 
             title="${safeCardTitle}"
             class="booking-card w-full h-auto min-h-full rounded border-l-4 ${colorClass} shadow-sm px-1.5 py-1 text-xs flex flex-col justify-between relative box-border hover:z-20 hover:shadow-md transition cursor-pointer overflow-hidden ${extraClasses}">

            <div>
                <div class="flex items-center justify-between">
                    <div class="font-bold truncate leading-tight flex-1 flex items-center" title="${safeCliente}">${nexusTag}${isRte ? '🍽️ ' : ''}<span>${safeCliente}</span></div>
                    <div class="text-[11px]">${noteStr}</div>
                </div>
                ${isCancelled ? `<div class="text-[9px] font-bold text-red-800 bg-red-200/90 border border-red-300 px-1 py-0.5 rounded w-fit mt-0.5 uppercase tracking-wide">❌ Anulado</div>` : ((res.estado === 'presupuesto' || res.estado === 'provisional' || res.estado === 'pendiente') ? `<div class="text-[9px] font-bold text-orange-700 bg-orange-200/60 px-1 py-0.5 rounded w-fit mt-0.5 uppercase tracking-wide">⚠️ Pendiente de Confirmar</div>` : '')}
                <div class="flex justify-between items-center mt-1 text-[11px]">
                     <div class="flex items-center gap-1">
                         <span class="text-[10px] font-extrabold uppercase tracking-tight leading-none px-1 py-0.5 rounded ${jClass}">${jText}</span>
                         ${pagoBadge}
                     </div>
                     <div class="flex items-center space-x-1 shrink-0">
                        ${timeStr}
                        ${paxStr}
                    </div>
                </div>
                <div class="mt-0.5 text-[11px] truncate opacity-90" title="Montaje: ${montajeStr}">
                    <b class="opacity-70">Montaje:</b> ${montajeStr}
                </div>
            </div>

            ${servicesHtml}
        </div>
        `;
    }

    window.handleCardClick = function (id, e) {
        if (e) e.stopPropagation();
        const res = window._resRegistry[id];
        if (res) window.openBooking(res.salon, res.fecha, res);
    };

    // --- GLOBAL SEARCH LOGIC ---
    let allReservations = [];
    let hasLoadedAll = false;
    let fetchPromise = null;
    let searchDebounce = null;

    window.handleSearch = function (query) {
        clearTimeout(searchDebounce);
        const container = document.getElementById("searchResults");

        if (!query || query.trim().length < 2) {
            if (container) container.classList.add("hidden");
            return;
        }

        searchDebounce = setTimeout(() => {
            if (!hasLoadedAll) {
                fetchAllReservations().then(() => doSearch(query));
            } else {
                doSearch(query);
            }
        }, 500);
    };

    function fetchAllReservations() {
        if (hasLoadedAll) return Promise.resolve();
        if (fetchPromise) return fetchPromise;

        const hotel = getActiveHotel();
        const container = document.getElementById("searchResults");

        if (container) {
            container.innerHTML = '<div class="p-4 text-center text-slate-400 text-xs">⏳ Cargando histórico...</div>';
            container.classList.remove("hidden");
        }

        fetchPromise = db.collection("reservas_salones")
            .where("hotel", "==", hotel)
            .get()
            .then(snapshot => {
                allReservations = [];
                snapshot.forEach(doc => {
                    allReservations.push({ id: doc.id, ...window.EventLocation.applyJornadaOverride(doc.data()) });
                });
                hasLoadedAll = true;
                console.log(`Global Search: Loaded ${allReservations.length} records.`);
                fetchPromise = null;
            })
            .catch(err => {
                console.error("Search Error", err);
                hasLoadedAll = false;
                fetchPromise = null;
                if (container) container.innerHTML = `<div class="p-2 text-red-500 text-xs text-center">Error al cargar: ${err.message}</div>`;
                throw err;
            });

        return fetchPromise;
    }

    function doSearch(query) {
        try {
            if (!query) return;
            const q = query.toLowerCase();

            if (!allReservations) allReservations = [];

            const results = allReservations.filter(r => {
                const name = (r.cliente || "").toLowerCase();
                const tel = (r.contact?.tel || "").toLowerCase();
                const email = (r.contact?.email || "").toLowerCase();
                const salon = (r.salon || "").toLowerCase();
                const dateStr = (r.fecha || "");

                return name.includes(q) || tel.includes(q) || email.includes(q) || salon.includes(q) || dateStr.includes(q);
            });

            renderSearchResults(results);
        } catch (e) {
            console.error("Filtering Error", e);
            const container = document.getElementById("searchResults");
            if (container) container.innerHTML = `<div class="p-2 text-red-500 text-xs text-center">Error de filtrado: ${e.message}</div>`;
        }
    }

    function renderSearchResults(results) {
        const container = document.getElementById("searchResults");
        if (!container) return;

        container.innerHTML = "";

        if (results.length === 0) {
            container.innerHTML = '<div class="p-4 text-center text-slate-400 text-xs">No se encontraron resultados</div>';
        } else {
            // Sort by date desc (recent first)
            results.sort((a, b) => b.fecha.localeCompare(a.fecha));

            results.slice(0, 50).forEach(r => { // Limit to 50
                const datePretty = new Date(r.fecha).toLocaleDateString();
                const item = document.createElement("div");
                item.className = "p-3 border-b border-slate-50 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition";

                // Prevent blurring when clicking
                item.onmousedown = (e) => e.preventDefault();
                item.onclick = () => selectSearchResult(r);

                const st = (r.estado || '').toLowerCase();
                const isCancelled = st === 'cancelada' || st === 'cancelled' || st === 'anulada' || st === 'anulado';
                const statusColor = (st === 'confirmada' || st === 'confirmed') ? 'bg-green-100 text-green-700 border border-green-200' :
                    isCancelled ? 'bg-red-100 text-red-700 border border-red-200' :
                        st === 'presupuesto' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                            'bg-yellow-100 text-yellow-700 border border-yellow-200';

                item.innerHTML = `
                    <div class="flex flex-col">
                        <span class="font-bold text-slate-800 text-sm leading-tight">${r.cliente}</span>
                        <span class="text-[10px] text-slate-500 uppercase tracking-wide mt-1">📅 ${datePretty} &bull; ${r.salon}</span>
                    </div>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor} uppercase shadow-sm">${r.estado}</span>
                `;
                container.appendChild(item);
            });
        }
        container.classList.remove("hidden");
    }

    window.selectSearchResult = function (r) {
        document.getElementById("searchResults").classList.add("hidden");
        // Navigate to date
        window.goToDate(r.fecha);
        // Open Modal Directly
        // window.openBooking(salonName, dateStr, existing, defaultJornada)
        window.openBooking(r.salon, r.fecha, r);
    };

    // --- FORM LOGIC ---
    let currentBookingId = null;

    window.openBooking = function (salonName, dateStr, existing = null, defaultJornada = 'todo') {
        const currentHotel = getActiveHotel();

        // [NEW] Redirect Grand Events
        if (existing && (existing.origen === 'grandes_eventos' || existing.tipoEvento === 'Gran Evento')) {
            if (existing.eventoId) {
                window.location.href = `grandes-eventos.html?id=${existing.eventoId}`;
                return;
            }
        }

        // Check for existing reservations in this slot (if new)
        if (!existing && salonName && dateStr) {
            const salonRaw = salonName.replace(/\s/g, '').toLowerCase();

            // Find existing for this salon/date

            const conflictCandidates = loadedReservations.filter(r => {
                if (r.hotel !== currentHotel) return false;
                // Check status
                if (['cancelada', 'anulada'].includes((r.estado || '').toLowerCase())) return false;

                // Check Date
                let rDate = "";
                if (r.fecha && r.fecha.toDate) rDate = utils.toIsoDate(r.fecha.toDate());
                else if (typeof r.fecha === 'string') rDate = r.fecha;
                if (rDate !== dateStr) return false;

                // Check Salon (Normalize name)
                const rSalonRaw = (r.salon || "").replace(/\s/g, '').toLowerCase();
                return rSalonRaw === salonRaw;
            });

            // Analyze conflicts
            const hasTodo = conflictCandidates.some(r => {
                const j = (r.detalles?.jornada || 'todo').toLowerCase();
                return j === 'todo' || j.includes('dia') || j.includes('completo');
            });
            const hasMorning = conflictCandidates.some(r => {
                const j = (r.detalles?.jornada || 'todo').toLowerCase();
                return j.includes('mañana') || j.includes('almuerzo');
            });
            const hasAfternoon = conflictCandidates.some(r => {
                const j = (r.detalles?.jornada || 'todo').toLowerCase();
                return j.includes('tarde') || j.includes('cena');
            });

            // [NEW] MULTI-SERVICE EXCEPTION: Eventos Restaurante (Ignore conflicts)
            const isMultiService = isRestauranteStyle(salonName);

            if (!isMultiService) {
                if (hasTodo) {
                    alert("⛔ SALÓN OCUPADO: Ya existe un evento de día completo.");
                    return; // Block opening
                }

                if (hasMorning && hasAfternoon) {
                    alert("⛔ SALÓN OCUPADO: Mañana y Tarde ya están reservadas.");
                    return; // Block opening
                }
            }

            if (!isMultiService) {
                if (hasMorning) {
                    defaultJornada = 'tarde';
                } else if (hasAfternoon) {
                    defaultJornada = 'mañana';
                }
            } else {
                // [NEW] Default for Restaurant: if no specific slot but clicked general area
                if (defaultJornada === 'todo' || !defaultJornada) defaultJornada = 'almuerzo';
                
                // Map terminology
                if (defaultJornada === 'mañana') defaultJornada = 'almuerzo';
                if (defaultJornada === 'tarde') defaultJornada = 'cena';
            }
        }


        const sSel = document.getElementById("evt-salon");
        const mInput = document.getElementById("evt-montaje");
        const mList = document.getElementById("montaje-options");

        sSel.innerHTML = "";
        if (mList) mList.innerHTML = "";
        if (mInput) mInput.value = "";

        // Filter Autocomplete on Salon Change
        sSel.onchange = function () {
            populateDatalist(this.value);
            updateRentalPrice(); // Update rental row if present
        };


        const salons = globalConfig[currentHotel] || [];
        let hasRestauranteOption = false;

        salons.forEach(s => {
            if (s.active === false) return;
            if (s.name.toLowerCase() === "restaurante") hasRestauranteOption = true;
            const op = document.createElement("option");
            op.value = s.name;
            op.text = s.name;
            sSel.appendChild(op);
        });

        // En Guadiana y solo en Guadiana, permitir cambiar cualquier evento a "Restaurante"
        if (currentHotel === "Guadiana" && !hasRestauranteOption) {
            const op = document.createElement("option");
            op.value = "Restaurante";
            op.text = "Restaurante";
            const alarcosIdx = Array.from(sSel.options).findIndex(o => isRestauranteStyle(o.value));
            if (alarcosIdx >= 0 && alarcosIdx < sSel.options.length - 1) {
                sSel.insertBefore(op, sSel.options[alarcosIdx + 1]);
            } else {
                sSel.appendChild(op);
            }
        }

        if (globalConfig.montajes && mList) {
            globalConfig.montajes.forEach(m => {
                const op = document.createElement("option");
                op.value = m;
                mList.appendChild(op);
            });
        }

        // RESET

        // RESET
        currentBookingId = null;
        window.currentFullServices = []; // Store full services list for multi-day events
        window.currentViewDate = null;   // Store the date we are viewing/editing

        // Reset Nexus banners and control state
        const nexusBanner = document.getElementById("nexus-banner");
        const nexusUnlinkedBadge = document.getElementById("nexus-unlinked-badge");
        const nexusRefBadge = document.getElementById("nexus-ref-badge");
        const nexusUnlinkedRef = document.getElementById("nexus-unlinked-ref");
        const btnGuardarEl = document.getElementById("btnGuardar");
        const btnEliminarEl = document.getElementById("btnEliminar");

        if (nexusBanner) nexusBanner.classList.add("hidden");
        if (nexusUnlinkedBadge) nexusUnlinkedBadge.classList.add("hidden");
        if (nexusRefBadge) nexusRefBadge.innerText = "";
        if (nexusUnlinkedRef) nexusUnlinkedRef.innerText = "";

        if (btnGuardarEl) {
            btnGuardarEl.disabled = false;
            btnGuardarEl.classList.remove("opacity-50", "cursor-not-allowed", "pointer-events-none");
            btnGuardarEl.title = "";
            btnGuardarEl.style.display = 'inline-block';
        }
        if (btnEliminarEl) {
            btnEliminarEl.disabled = false;
            btnEliminarEl.classList.remove("opacity-50", "cursor-not-allowed", "pointer-events-none");
            btnEliminarEl.title = "";
            btnEliminarEl.style.display = 'block';
        }
        setModalFieldsDisabled(false);

        // Reset Estado select options (remove any temporary old status options) and default to confirmada
        const estadoSelect = document.getElementById("evt-estado");
        const toggleRevisadoVisibility = (status) => {
            const container = document.getElementById("evt-revisado-container");
            if (container) {
                if (status === 'presupuesto') {
                    container.classList.add("hidden");
                    const chk = document.getElementById("evt-revisado");
                    if (chk) chk.checked = false;
                } else {
                    container.classList.remove("hidden");
                }
            }
        };

        if (estadoSelect) {
            estadoSelect.innerHTML = `
                <option value="presupuesto">🟠 Presupuesto</option>
                <option value="confirmada" selected>🟢 Confirmada</option>
                <option value="cancelada">🔴 Cancelada</option>
            `;
            estadoSelect.value = "confirmada";
            estadoSelect.onchange = function () {
                toggleRevisadoVisibility(this.value);
            };
        }

        document.getElementById("evt-nombre").value = "";
        document.getElementById("evt-telefono").value = "";
        document.getElementById("evt-email").value = "";

        // Reset Budget Label
        const budgetLabel = document.getElementById("evt-budget-label");
        if (budgetLabel) budgetLabel.innerText = "";

        // Phone Mask Listener
        const telInput = document.getElementById("evt-telefono");
        if (telInput && !telInput.dataset.masked) {
            telInput.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '').substring(0, 9);
                if (v.length > 6) v = v.slice(0, 3) + " " + v.slice(3, 6) + " " + v.slice(6);
                else if (v.length > 3) v = v.slice(0, 3) + " " + v.slice(3);
                e.target.value = v;
            });
            telInput.dataset.masked = "true"; // Prevent duplicate listeners
        }

        document.getElementById("services-list").innerHTML = "";
        document.getElementById("evt-total").innerText = "0.00 €";
        document.getElementById("evt-nota-interna").value = "";
        document.getElementById("evt-nota-cliente").value = "";
        document.getElementById("evt-pax-a").value = "";
        document.getElementById("evt-pax-n").value = "";
        document.getElementById("evt-hora").value = "";
        document.getElementById("evt-revisado").checked = false; // Default unreviewed

        // Reset timestamps strip
        const tsStrip = document.getElementById("evt-timestamps-strip");
        if (tsStrip) {
            tsStrip.classList.add("hidden");
            document.getElementById("lblEvtCreated").innerText = "--/--/----";
            document.getElementById("lblEvtUpdated").innerText = "--/--/---- --:--";
        }

        // Default Jornada
        document.getElementById("evt-jornada").value = defaultJornada;

        if (!existing) {
            if (salonName) {
                sSel.value = salonName;
            }
            populateDatalist(sSel.value);
        }

        // [NEW] Duplicar Button Visibility
        const btnDup = document.getElementById("btnDuplicar");
        if (btnDup) btnDup.classList.add("hidden");

        window.currentEventBudgetID = null; // [RESET] Ensure we don't carry over IDs from previous opens

        // POPULATE
        if (existing) {
            currentBookingId = existing.id;
            window.currentEventBudgetID = existing.presupuestoId || null; // [NEW] Store Budget ID for sync
            document.getElementById("evt-fecha").value = existing.fecha;
            window.currentViewDate = dateStr || existing.fecha; // Store view date

            sSel.value = existing.salon;
            if (!sSel.value && currentHotel === "Guadiana" && isRestauranteStyle(existing.salon)) {
                const rteSalon = (globalConfig.Guadiana || []).find(s => isRestauranteStyle(s.name));
                sSel.value = rteSalon ? rteSalon.name : "Alarcos Eventos";
            }
            populateDatalist(sSel.value || existing.salon); // Filter for this salon
            document.getElementById("evt-nombre").value = existing.cliente;

            // Show Budget Ref if exists
            if (existing.referenciaPresupuesto) {
                const bl = document.getElementById("evt-budget-label");
                if (bl) bl.innerHTML = `<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold">Presupuesto: ${existing.referenciaPresupuesto}</span>`;
            }

            // [NEW] Display creation/modification timestamps strip
            const tsStrip = document.getElementById("evt-timestamps-strip");
            if (tsStrip) {
                let show = false;
                
                const formatDT = (isoStr) => {
                    if (!isoStr) return "";
                    const d = new Date(isoStr);
                    if (isNaN(d.getTime())) return "";
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const year = d.getFullYear();
                    const hours = String(d.getHours()).padStart(2, '0');
                    const minutes = String(d.getMinutes()).padStart(2, '0');
                    return `${day}/${month}/${year} ${hours}:${minutes}`;
                };

                const formatD = (isoStr) => {
                    if (!isoStr) return "";
                    const d = new Date(isoStr);
                    if (isNaN(d.getTime())) return "";
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const year = d.getFullYear();
                    return `${day}/${month}/${year}`;
                };
                
                const createdVal = existing.created_at || existing.createdAt || "";
                let updatedVal = "";
                if (existing.updated_at) {
                    updatedVal = existing.updated_at;
                } else if (existing.updatedAt) {
                    updatedVal = existing.updatedAt.toDate ? existing.updatedAt.toDate().toISOString() : existing.updatedAt;
                }
                
                if (createdVal) {
                    document.getElementById("lblEvtCreated").innerText = formatD(createdVal);
                    show = true;
                } else {
                    document.getElementById("lblEvtCreated").innerText = "---";
                }
                
                if (updatedVal) {
                    document.getElementById("lblEvtUpdated").innerText = formatDT(updatedVal);
                    show = true;
                } else {
                    document.getElementById("lblEvtUpdated").innerText = createdVal ? formatDT(createdVal) : "---";
                }
                
                if (show) {
                    tsStrip.classList.remove("hidden");
                } else {
                    tsStrip.classList.add("hidden");
                }
            }
            if (existing.contact) {
                document.getElementById("evt-telefono").value = existing.contact.tel || "";
                document.getElementById("evt-email").value = existing.contact.email || "";
            }
            if (estadoSelect && existing.estado) {
                let optionExists = Array.from(estadoSelect.options).some(opt => opt.value === existing.estado);
                if (!optionExists) {
                    const opt = document.createElement("option");
                    opt.value = existing.estado;
                    if (existing.estado === "provisional") {
                        opt.textContent = "🟡 Provisional (Antiguo)";
                    } else if (existing.estado === "pendiente") {
                        opt.textContent = "⏳ Pendiente (Antiguo)";
                    } else {
                        opt.textContent = existing.estado.charAt(0).toUpperCase() + existing.estado.slice(1);
                    }
                    estadoSelect.appendChild(opt);
                }
                estadoSelect.value = existing.estado;
            } else if (estadoSelect) {
                estadoSelect.value = "confirmada";
            }
            document.getElementById("evt-revisado").checked = existing.revisado === true; // Load Status

            if (existing.detalles) {
                document.getElementById("evt-jornada").value = existing.detalles.jornada || "todo";
                mInput.value = existing.detalles.montaje || "";
                document.getElementById("evt-hora").value = existing.detalles.hora || "";
                document.getElementById("evt-pax-a").value = existing.detalles.pax_adultos || "";
                document.getElementById("evt-pax-n").value = existing.detalles.pax_ninos || "";
            }

            if (existing.notas) {
                document.getElementById("evt-nota-interna").value = existing.notas.interna || "";
                document.getElementById("evt-nota-cliente").value = existing.notas.cliente || "";
            }

            // [NEW] Load Incluido
            document.getElementById("evt-incluido").checked = existing.detalles?.incluido === true;
            toggleIncluido();

            // READ ONLY / NEXUS GROUPS CHECK
            const isPast = (dateStr || existing.fecha) < utils.toIsoDate(new Date());
            const isLinkedNexus = isNexusLinked(existing);
            const isUnlinkedNexus = isNexusEvent(existing) && (existing.desvinculado || existing.vinculoRoto);
            const nexusRef = getNexusRef(existing);

            if (isLinkedNexus) {
                const mt = document.getElementById("modalTitle");
                if (mt) mt.innerText = "Evento Nexus Groups (Salón y jornada)";

                if (nexusBanner) {
                    nexusBanner.classList.remove("hidden");
                    if (nexusRefBadge) nexusRefBadge.innerText = nexusRef ? `Ref: ${nexusRef}` : "Nexus Groups";
                }
                if (nexusUnlinkedBadge) nexusUnlinkedBadge.classList.add("hidden");

                // Lock fields and action buttons
                setModalFieldsDisabled(true);
                document.getElementById("evt-salon").disabled = false;
                document.getElementById("evt-jornada").disabled = false;
                // Linked events can change location and shift without altering service rows.
                document.getElementById("evt-salon").onchange = function () {};

                if (btnGuardarEl) {
                    btnGuardarEl.disabled = false;
                    btnGuardarEl.classList.remove("opacity-50", "cursor-not-allowed", "pointer-events-none");
                    btnGuardarEl.style.display = 'inline-block';
                    btnGuardarEl.title = "Guardar salón y jornada manteniendo el vínculo con Grupos.";
                }
                if (btnEliminarEl) {
                    btnEliminarEl.disabled = true;
                    btnEliminarEl.classList.add("opacity-50", "cursor-not-allowed", "pointer-events-none");
                    btnEliminarEl.title = "Evento vinculado a Nexus Groups.";
                }

                const btnDup = document.getElementById("btnDuplicar");
                if (btnDup) btnDup.classList.add("hidden");
            } else if (isPast) {
                const mt = document.getElementById("modalTitle");
                if (mt) mt.innerText = "Reserva Pasada (Solo Lectura)";

                setModalFieldsDisabled(true);

                if (btnGuardarEl) btnGuardarEl.style.display = 'none';
                if (btnEliminarEl) btnEliminarEl.style.display = 'none';

                if (isUnlinkedNexus && nexusUnlinkedBadge) {
                    nexusUnlinkedBadge.classList.remove("hidden");
                    if (nexusUnlinkedRef) nexusUnlinkedRef.innerText = nexusRef ? `Ref: ${nexusRef}` : "Desvinculado";
                }

                const btnDup = document.getElementById("btnDuplicar");
                if (btnDup) btnDup.classList.add("hidden");
            } else {
                const mt = document.getElementById("modalTitle");
                if (mt) mt.innerText = isUnlinkedNexus ? "Editar Reserva (Desvinculada de Nexus Groups)" : "Editar Reserva";

                setModalFieldsDisabled(false);

                if (isUnlinkedNexus) {
                    if (nexusBanner) nexusBanner.classList.add("hidden");
                    if (nexusUnlinkedBadge) {
                        nexusUnlinkedBadge.classList.remove("hidden");
                        if (nexusUnlinkedRef) nexusUnlinkedRef.innerText = nexusRef ? `Ref: ${nexusRef}` : "Desvinculado";
                    }
                }

                if (btnGuardarEl) {
                    btnGuardarEl.disabled = false;
                    btnGuardarEl.classList.remove("opacity-50", "cursor-not-allowed", "pointer-events-none");
                    btnGuardarEl.title = "";
                    btnGuardarEl.style.display = 'inline-block';
                }
                if (btnEliminarEl) {
                    btnEliminarEl.disabled = false;
                    btnEliminarEl.classList.remove("opacity-50", "cursor-not-allowed", "pointer-events-none");
                    btnEliminarEl.title = "";
                    btnEliminarEl.style.display = 'block';
                }

                // Show Duplicar Button when editing
                const btnDup = document.getElementById("btnDuplicar");
                if (btnDup) btnDup.classList.remove("hidden");
            }



            if (existing.servicios) {
                window.currentFullServices = existing.servicios; // Keep full copy

                // Filter: Show only services for the clicked date (or all if no date provided)
                const viewDate = window.currentViewDate;
                const visibleServices = viewDate ? existing.servicios.filter(s => s.fecha === viewDate) : existing.servicios;

                visibleServices.forEach(s => {
                    const row = document.createElement("tr");
                    const uds = s.uds !== undefined ? s.uds : 1;
                    const precioVal = s.precio !== undefined ? s.precio : 0;
                    const totalVal = (parseFloat(uds) || 0) * (parseFloat(precioVal) || 0);
                    row.innerHTML = `
                    <td class="p-2 border-b"><input type="date" value="${s.fecha || ''}" class="text-xs bg-gray-50 w-24 rounded border-gray-200 row-date"></td>
                    <td class="p-2 border-b"><input type="time" value="${s.hora || ''}" class="text-xs bg-gray-50 w-20 rounded border-gray-200 row-time"></td>
                    <td class="p-2 border-b"><input type="text" value="${(s.concepto || '').replace(/"/g, '&quot;')}" list="charge-options" onchange="updateRowPrice(this)" class="text-xs font-bold w-full rounded border-gray-200 row-concept"></td>
                    <td class="p-2 border-b"><input type="number" onchange="calcTotal()" value="${uds}" class="text-xs text-center row-uds w-full rounded border-gray-200"></td>
                    <td class="p-2 border-b col-price">
                        <div class="relative w-full">
                            <input type="text" onchange="calcTotal()" value="${precioVal ? window.MesaChef.formatEuroValue(precioVal) : ''}" 
                                   onfocus="window.MesaChef.unformatEuroInput(this)" onblur="window.MesaChef.formatEuroInput(this)"
                                   class="text-xs text-right row-price w-full rounded border-gray-200" style="padding-right: 30px !important;">
                            <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">€</span>
                        </div>
                    </td>
                    <td class="p-2 border-b text-right font-bold text-xs row-total text-slate-600 col-total">${window.MesaChef.formatEuroValue(totalVal)} €</td>
                    <td class="p-2 border-b text-center"><button onclick="this.closest('tr').remove(); calcTotal()" class="text-red-400 hover:text-red-600 font-bold">&times;</button></td>
                `;
                    document.getElementById("services-list").appendChild(row);
                });
                calcTotal();
            }
        } else {
            // NEW BOOKING: Check Past Date
            const isPast = dateStr < utils.toIsoDate(new Date());
            if (isPast) {
                alert("No se pueden crear eventos en fechas pasadas.");
                window.closeModal();
                return;
            }

            document.getElementById("evt-fecha").value = dateStr || new Date().toISOString().split('T')[0];
            if (salonName) {
                sSel.value = salonName;
                populateDatalist(salonName);
            } else {
                populateDatalist(); // No filter if new and no salon pre-set
            }
            // Auto-add rental price for new events
            setTimeout(updateRentalPrice, 100);

            // [NEW] Reset Incluido
            document.getElementById("evt-incluido").checked = false;
            toggleIncluido();
        }

        toggleRevisadoVisibility(estadoSelect ? estadoSelect.value : "confirmada");

        document.getElementById("modal-evt").classList.remove("hidden");
    };

    window.closeModal = function () {
        document.getElementById("modal-evt").classList.add("hidden");
    };

    window.openOrdenServicio = function () {
        if (!currentBookingId) {
            alert("⚠️ Debes GUARDAR el evento primero antes de generar la Orden de Servicio.");
            return;
        }
        window.open(`orden-servicio.html?id=${currentBookingId}`, '_blank');
    };

    window.duplicateBooking = function () {
        if (!currentBookingId) return;

        let currentDate = document.getElementById("evt-fecha").value;
        let newDateStr = prompt("📅 Introduce la NUEVA FECHA para la copia (AAAA-MM-DD o DD/MM/AAAA):", currentDate);
        if (!newDateStr) return; // Cancelado

        let newDate = newDateStr;
        if (newDateStr.includes("/")) {
            let parts = newDateStr.split("/");
            if (parts.length === 3) {
                if (parts[2].length === 2) parts[2] = "20" + parts[2];
                newDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }

        let currentJornada = document.getElementById("evt-jornada").value;
        let newJornada = prompt("⏱️ Introduce la NUEVA JORNADA para la copia:\n(todo, mañana, tarde, almuerzo, cena)", currentJornada);
        if (!newJornada) return; // Cancelado
        
        newJornada = newJornada.toLowerCase().trim();
        const validJornadas = ['todo', 'mañana', 'tarde', 'almuerzo', 'cena'];
        if (!validJornadas.includes(newJornada)) {
            alert("Jornada no válida. Se mantendrá la actual.");
            newJornada = currentJornada;
        }

        // Apply new values
        document.getElementById("evt-fecha").value = newDate;
        document.getElementById("evt-jornada").value = newJornada;

        // Update all service rows to match the new date
        document.querySelectorAll("#services-list tr").forEach(row => {
            const dateInput = row.querySelector("input[type='date']");
            if (dateInput) dateInput.value = newDate;
        });

        // Recalculate default concepts/prices based on new jornada
        updateRentalPrice();

        // Reset ID and metadata to turn current view into a NEW booking
        currentBookingId = null;
        window.currentEventBudgetID = null;

        // Update UI to reflect "New" state
        const h3 = document.querySelector("#modal-evt h3");
        if (h3) h3.innerText = "Duplicar Evento (Copia)";

        const btnDup = document.getElementById("btnDuplicar");
        if (btnDup) btnDup.classList.add("hidden");

        const btnAnular = document.getElementById("btnAnular");
        if (btnAnular) btnAnular.style.display = 'none';

        alert(`📋 Se ha preparado la copia para el ${newDate} (${newJornada}). Revisa los datos y pulsa GUARDAR para finalizar.`);
    };

    window.desvincularNexus = async function () {
        if (!currentBookingId) return;
        const existing = window._resRegistry[currentBookingId];
        const refStr = getNexusRef(existing);

        const confirmed = confirm(
            `🔓 DESVINCULAR EVENTO DE NEXUS GROUPS\n\n` +
            `Ref: ${refStr || currentBookingId}\n\n` +
            `¿Estás seguro de que deseas desvincular este evento?\n\n` +
            `• El vínculo con Nexus Groups se romperá de forma permanente.\n` +
            `• A partir de ahora, todas las modificaciones se gestionarán exclusivamente desde MesaChef.\n` +
            `• Las sincronizaciones de Nexus Groups NO sobreescribirán ni cancelarán este evento.\n` +
            `• El ID de reserva en MesaChef (${currentBookingId}) se mantendrá intacto.`
        );

        if (!confirmed) return;

        const btnDesvincular = document.getElementById("btnDesvincularNexus");
        const originalHtml = btnDesvincular ? btnDesvincular.innerHTML : "";
        if (btnDesvincular) {
            btnDesvincular.disabled = true;
            btnDesvincular.innerHTML = `<span>⏳</span> Desvinculando...`;
        }

        try {
            const nowIso = new Date().toISOString();
            const updatePayload = {
                desvinculado: true,
                vinculoRoto: true,
                desvinculado_at: nowIso,
                updated_at: nowIso
            };

            await db.collection("reservas_salones").doc(currentBookingId).update(updatePayload);

            // Update local registry & existing object
            if (window._resRegistry[currentBookingId]) {
                window._resRegistry[currentBookingId].desvinculado = true;
                window._resRegistry[currentBookingId].vinculoRoto = true;
                window._resRegistry[currentBookingId].desvinculado_at = nowIso;
            }
            if (existing) {
                existing.desvinculado = true;
                existing.vinculoRoto = true;
                existing.desvinculado_at = nowIso;
            }

            // Update UI
            const nexusBanner = document.getElementById("nexus-banner");
            const nexusUnlinkedBadge = document.getElementById("nexus-unlinked-badge");
            const nexusUnlinkedRef = document.getElementById("nexus-unlinked-ref");
            const btnGuardarEl = document.getElementById("btnGuardar");
            const btnEliminarEl = document.getElementById("btnEliminar");

            if (nexusBanner) nexusBanner.classList.add("hidden");
            if (nexusUnlinkedBadge) {
                nexusUnlinkedBadge.classList.remove("hidden");
                if (nexusUnlinkedRef) nexusUnlinkedRef.innerText = refStr ? `Ref: ${refStr}` : "Desvinculado";
            }

            // Enable fields and buttons
            setModalFieldsDisabled(false);

            if (btnGuardarEl) {
                btnGuardarEl.disabled = false;
                btnGuardarEl.classList.remove("opacity-50", "cursor-not-allowed", "pointer-events-none");
                btnGuardarEl.title = "";
            }
            if (btnEliminarEl) {
                btnEliminarEl.disabled = false;
                btnEliminarEl.classList.remove("opacity-50", "cursor-not-allowed", "pointer-events-none");
                btnEliminarEl.title = "";
            }

            const mt = document.getElementById("modalTitle");
            if (mt) mt.innerText = "Editar Reserva (Desvinculada de Nexus Groups)";

            alert("✅ Evento desvinculado con éxito.\nAhora puedes modificar cualquier dato y guardarlo directamente desde MesaChef.");
        } catch (err) {
            console.error("Error al desvincular de Nexus Groups:", err);
            alert("❌ Error al desvincular el evento: " + err.message);
        } finally {
            if (btnDesvincular) {
                btnDesvincular.disabled = false;
                btnDesvincular.innerHTML = originalHtml;
            }
        }
    };

    window.addServiceRow = function () {
        if (currentBookingId) {
            const existing = window._resRegistry[currentBookingId];
            if (isNexusLinked(existing)) {
                alert("⛔ Este evento está vinculado a Nexus Groups. Desvincúlalo primero para poder añadir items.");
                return;
            }
        }
        const row = document.createElement("tr");
        const defaultDate = window.currentViewDate || document.getElementById("evt-fecha").value;
        row.innerHTML = `
            <td class="p-2 border-b"><input type="date" value="${defaultDate}" class="text-xs bg-gray-50 w-24 rounded border-gray-200 row-date"></td>
            <td class="p-2 border-b"><input type="time" value="" class="text-xs bg-gray-50 w-20 rounded border-gray-200 row-time"></td>
            <td class="p-2 border-b"><input type="text" placeholder="Concepto" list="charge-options" onchange="updateRowPrice(this)" class="text-xs font-bold w-full rounded border-gray-200 row-concept"></td>
            <td class="p-2 border-b"><input type="number" onchange="calcTotal()" value="1" class="text-xs text-center row-uds w-full rounded border-gray-200"></td>
            <td class="p-2 border-b col-price">
                <div class="relative w-full">
                    <input type="text" onchange="calcTotal()" value="" placeholder="0,00"
                           onfocus="window.MesaChef.unformatEuroInput(this)" onblur="window.MesaChef.formatEuroInput(this)"
                           class="text-xs text-right row-price w-full rounded border-gray-200" style="padding-right: 30px !important;">
                    <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">€</span>
                </div>
            </td>
            <td class="p-2 border-b text-right font-bold text-xs row-total text-slate-600 col-total">0,00 €</td>
            <td class="p-2 border-b text-center"><button onclick="this.closest('tr').remove(); calcTotal()" class="text-red-400 hover:text-red-600 font-bold">&times;</button></td>
                `;
        document.getElementById("services-list").appendChild(row);
        toggleIncluido();
    };

    window.calcTotal = function () {
        let total = 0;

        document.querySelectorAll("#services-list tr").forEach(row => {
            const uds = parseFloat(row.querySelector(".row-uds")?.value) || 0;
            const price = window.MesaChef.parseEuroInput(row.querySelector(".row-price")?.value);
            const sub = uds * price;

            // Update row total
            const rowTotal = row.querySelector(".row-total");
            if (rowTotal) {
                rowTotal.innerText = window.MesaChef.formatEuroValue(sub) + " €";
            }
            total += sub;
        });

        const totalEl = document.getElementById("evt-total");
        if (totalEl) {
            totalEl.innerText = window.MesaChef.formatEuroValue(total) + " €";
        }
    };

    // [MODIFIED] Sync Pax from Header to Lines:
    // Event/room pax and service quantities are managed independently.
    // Only updates dynamic restaurant group concepts when in restaurant mode.
    window.syncPaxFromHeaderToLines = function () {
        const salonName = document.getElementById("evt-salon")?.value || "";
        const isRte = isRestauranteStyle(salonName);
        if (isRte) {
            updateRentalPrice();
        }
    };

    window.toggleIncluido = function () {
        const isIncluido = document.getElementById("evt-incluido") ? document.getElementById("evt-incluido").checked : false;
        const totalContainer = document.getElementById("evt-total") ? document.getElementById("evt-total").parentElement : null;

        if (isIncluido) {
            // Set all prices to 0
            document.querySelectorAll("#services-list tr").forEach(row => {
                const priceInput = row.querySelector(".row-price");
                if (priceInput) {
                    priceInput.value = "";
                }
            });
            calcTotal();

            // Hide Price and Total columns
            document.querySelectorAll(".col-price, .col-total").forEach(el => el.classList.add("hidden"));
            if (totalContainer) totalContainer.classList.add("invisible");
        } else {
            // Show Price and Total columns
            document.querySelectorAll(".col-price, .col-total").forEach(el => el.classList.remove("hidden"));
            if (totalContainer) totalContainer.classList.remove("invisible");
        }
    };

    window.updateRentalPrice = function (forceUpdateConcept = false) {
        if (currentBookingId && isNexusLinked(window._resRegistry[currentBookingId])) return;
        const hotel = getActiveHotel();
        const salonName = document.getElementById("evt-salon").value;
        const jornada = document.getElementById("evt-jornada").value;

        const isRte = isRestauranteStyle(salonName);
        if (isRte) {
            const mInput = document.getElementById("evt-montaje");
            if (mInput && !mInput.value) mInput.value = "Grupo";
        }

        if (!globalConfig || !globalConfig[hotel]) return;

        const sObj = globalConfig[hotel].find(s => s.name === salonName || (isRte && isRestauranteStyle(s.name)));
        let price = 0;
        if (sObj) {
            price = (jornada === 'todo') ? (sObj.priceFull || 0) : (sObj.priceHalf || 0);
        }

        const jName = jornada.charAt(0).toUpperCase() + jornada.slice(1);
        
        // Dynamic Concept: "Grupo [Nombre]" instead of "Alquiler Salón [Nombre]"
        const cleanSalon = isRte ? (hotel === "Guadiana" ? salonName : "Restaurante") : salonName.replace(/^(Eventos\s+Grupos|Eventos|Grupos)\s+/i, '');
        const defaultConcept = isRte ? `Grupo ${cleanSalon} - ${jName}` : `Alquiler Salón ${salonName} - ${jornada}`;

        const paxA = parseFloat(document.getElementById("evt-pax-a").value) || 0;
        const paxN = parseFloat(document.getElementById("evt-pax-n").value) || 0;

        // Find existing 'Alquiler Salón' or 'Grupo' rows
        let rows = Array.from(document.querySelectorAll("#services-list tr"));
        let mainRow = rows.find(row => {
            const inp = row.querySelector("input[type='text']");
            return inp && (inp.value.startsWith("Alquiler Salón") || (inp.value.toLowerCase().includes("grupo") && !inp.value.toLowerCase().includes("niño")));
        });
        
        let childRow = rows.find(row => {
            const inp = row.querySelector("input[type='text']");
            return inp && inp.value.toLowerCase().includes("grupo") && inp.value.toLowerCase().includes("niño");
        });

        if (mainRow) {
            const inp = mainRow.querySelector("input[type='text']");
            if (forceUpdateConcept || !inp.value) {
                inp.value = defaultConcept;
            } else if (inp.value) {
                let cleaned = inp.value;
                cleaned = cleaned.replace(/Grupo\s+(Eventos\s+Grupos|Eventos|Grupos|Alarcos)\s+/i, hotel === "Guadiana" ? `Grupo ${cleanSalon} ` : 'Grupo Restaurante ');
                cleaned = cleaned.replace(/\s+/g, ' ').trim();
                inp.value = cleaned;
            }
            const priceInput = mainRow.querySelector(".row-price");
            const udsInput = mainRow.querySelector(".row-uds");
            if (priceInput) {
                const currentPrice = window.MesaChef.parseEuroInput(priceInput.value);
                if (forceUpdateConcept || currentPrice === 0 || !priceInput.value) {
                    priceInput.value = price ? window.MesaChef.formatEuroValue(price) : "";
                }
            }
            if (isRte && udsInput) udsInput.value = paxA;
        }

        if (isRte && paxN > 0) {
            if (childRow) {
                const inp = childRow.querySelector("input[type='text']");
                if (forceUpdateConcept || !inp.value) {
                    inp.value = `Grupo ${cleanSalon} - ${jName} (Niños)`;
                } else if (inp.value) {
                    let cleaned = inp.value;
                    cleaned = cleaned.replace(/Grupo\s+(Eventos\s+Grupos|Eventos|Grupos|Alarcos)\s+/i, hotel === "Guadiana" ? `Grupo ${cleanSalon} ` : 'Grupo Restaurante ');
                    cleaned = cleaned.replace(/\s+/g, ' ').trim();
                    inp.value = cleaned;
                }
                const childUdsInput = childRow.querySelector(".row-uds");
                if (childUdsInput) childUdsInput.value = paxN;
                const childPriceInput = childRow.querySelector(".row-price");
                if (childPriceInput) {
                    const currentChildPrice = window.MesaChef.parseEuroInput(childPriceInput.value);
                    if (forceUpdateConcept || currentChildPrice === 0 || !childPriceInput.value) {
                        childPriceInput.value = price ? window.MesaChef.formatEuroValue(price) : "";
                    }
                }
            } else {
                // Add new row for children
                const row = document.createElement("tr");
                const date = window.currentViewDate || document.getElementById("evt-fecha").value;
                row.innerHTML = `
                    <td class="p-2 border-b"><input type="date" value="${date}" class="text-xs bg-gray-50 w-24 rounded border-gray-200 row-date"></td>
                    <td class="p-2 border-b"><input type="time" value="" class="text-xs bg-gray-50 w-20 rounded border-gray-200 row-time"></td>
                    <td class="p-2 border-b"><input type="text" value="Grupo ${cleanSalon} - ${jName} (Niños)" list="charge-options" onchange="updateRowPrice(this)" class="text-xs font-bold w-full rounded border-gray-200 row-concept"></td>
                    <td class="p-2 border-b"><input type="number" onchange="calcTotal()" value="${paxN}" class="text-xs text-center row-uds w-full rounded border-gray-200"></td>
                    <td class="p-2 border-b col-price">
                        <div class="relative w-full">
                            <input type="text" onchange="calcTotal()" value="${price ? window.MesaChef.formatEuroValue(price) : ''}" 
                                   onfocus="window.MesaChef.unformatEuroInput(this)" onblur="window.MesaChef.formatEuroInput(this)"
                                   class="text-xs text-right row-price w-full rounded border-gray-200" style="padding-right: 30px !important;">
                            <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">€</span>
                        </div>
                    </td>
                    <td class="p-2 border-b text-right font-bold text-xs row-total text-slate-600 col-total">${window.MesaChef.formatEuroValue(price * paxN)} €</td>
                    <td class="p-2 border-b text-center"><button onclick="this.closest('tr').remove(); calcTotal()" class="text-red-400 hover:text-red-600 font-bold">&times;</button></td>
                `;
                document.getElementById("services-list").appendChild(row);
            }
        } else if (childRow) {
            childRow.remove();
        }

        if (!mainRow) {
            // Add new row
            const row = document.createElement("tr");
            const date = window.currentViewDate || document.getElementById("evt-fecha").value;
            const qty = isRte ? paxA : 1;

            row.innerHTML = `
                <td class="p-2 border-b"><input type="date" value="${date}" class="text-xs bg-gray-50 w-24 rounded border-gray-200 row-date"></td>
                <td class="p-2 border-b"><input type="time" value="" class="text-xs bg-gray-50 w-20 rounded border-gray-200 row-time"></td>
                <td class="p-2 border-b"><input type="text" value="${defaultConcept}" list="charge-options" onchange="updateRowPrice(this)" class="text-xs font-bold w-full rounded border-gray-200 row-concept"></td>
                <td class="p-2 border-b"><input type="number" onchange="calcTotal()" value="${qty}" class="text-xs text-center row-uds w-full rounded border-gray-200"></td>
                <td class="p-2 border-b col-price">
                    <div class="relative w-full">
                        <input type="text" onchange="calcTotal()" value="${price ? window.MesaChef.formatEuroValue(price) : ''}" 
                               onfocus="window.MesaChef.unformatEuroInput(this)" onblur="window.MesaChef.formatEuroInput(this)"
                               class="text-xs text-right row-price w-full rounded border-gray-200" style="padding-right: 30px !important;">
                        <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">€</span>
                    </div>
                </td>
                <td class="p-2 border-b text-right font-bold text-xs row-total text-slate-600 col-total">${window.MesaChef.formatEuroValue(price * qty)} €</td>
                <td class="p-2 border-b text-center"><button onclick="this.closest('tr').remove(); calcTotal()" class="text-red-400 hover:text-red-600 font-bold">&times;</button></td>
            `;
            document.getElementById("services-list").appendChild(row);
        }
        calcTotal();
        toggleIncluido();
    };

    window.saveBooking = async function () {
        const btn = document.querySelector("button[onclick='saveBooking()']");
        const originalText = btn ? btn.innerText : "GUARDAR";

        if (currentBookingId) {
            const existing = window._resRegistry[currentBookingId];
            if (isNexusLinked(existing)) {
                const salon = document.getElementById("evt-salon").value;
                const allowed = Array.from(document.getElementById("evt-salon").options).some(option => option.value === salon && !option.disabled);
                if (!salon || !allowed) {
                    alert("Selecciona un salón válido para este hotel.");
                    return;
                }
                const key = prompt("Introduce la clave de seguridad:");
                if (key === null) return;
                if (key !== "Mreserva") { alert("Clave incorrecta (v6.0)"); return; }
                try {
                    if (btn) { btn.disabled = true; btn.innerText = "GUARDANDO…"; }
                    const jornada = document.getElementById("evt-jornada").value;
                    if (!['cancelada', 'anulada'].includes(existing.estado)) {
                        const availability = await window.MesaChef.checkSalonAvailability(db, existing.hotel, salon, existing.fecha, jornada, currentBookingId);
                        if (!availability.available) throw new Error(availability.reason);
                    }
                    await window.EventLocation.changeLinkedSalon(db, currentBookingId, salon, existing.salon, jornada, existing.detalles?.jornada || "todo");
                    closeModal();
                } catch (error) {
                    alert("No se han podido guardar el salón y la jornada: " + error.message);
                } finally {
                    if (btn) { btn.disabled = false; btn.innerText = originalText; }
                }
                return;
            }
        }
        
        if (currentBookingId) {
            const key = prompt("Introduce la clave de seguridad:");
            if (key === null) return; 
            if (key !== "Mreserva") {
                alert("Clave incorrecta (v6.0)");
                return;
            }
        }

        if (btn) {
            // No cambiamos el texto aquí todavía para evitar confusión con los diálogos de validación
        }

        const cliente = document.getElementById("evt-nombre").value.trim();
        if (!cliente) {
            alert("⚠️ Por favor, introduce el NOMBRE del cliente o evento.");
            return;
        }

        const fecha = document.getElementById("evt-fecha").value;
        if (!fecha) {
            alert("⚠️ Por favor, introduce la FECHA del evento.");
            return;
        }

        const salon = document.getElementById("evt-salon").value;
        if (!salon) {
            alert("⚠️ Por favor, selecciona un SALÓN para el evento.");
            return;
        }

        const payload = {
            hotel: getActiveHotel(),
            fecha: document.getElementById("evt-fecha").value,
            salon: document.getElementById("evt-salon").value,
            cliente: cliente,
            contact: {
                tel: document.getElementById("evt-telefono").value,
                email: document.getElementById("evt-email").value
            },
            estado: document.getElementById("evt-estado").value,
            revisado: document.getElementById("evt-revisado").checked, // Save Status
            detalles: {
                jornada: document.getElementById("evt-jornada").value || (currentBookingId && window._resRegistry[currentBookingId]?.detalles?.jornada) || "todo",
                montaje: document.getElementById("evt-montaje").value,
                hora: document.getElementById("evt-hora").value,
                pax_adultos: parseInt(document.getElementById("evt-pax-a").value) || 0,
                pax_ninos: parseInt(document.getElementById("evt-pax-n").value) || 0,
                incluido: document.getElementById("evt-incluido").checked
            },
            notas: {
                interna: document.getElementById("evt-nota-interna").value,
                cliente: document.getElementById("evt-nota-cliente").value
            },
            presupuestoId: window.currentEventBudgetID || (currentBookingId ? (window._resRegistry[currentBookingId]?.presupuestoId || null) : null) || null,
            servicios: []
        };

        // Preservar metadatos y origen de Nexus Groups al editar un evento desvinculado
        if (currentBookingId) {
            const existing = window._resRegistry[currentBookingId];
            if (existing) {
                if (existing.reservaId) payload.reservaId = existing.reservaId;
                if (existing.origen) payload.origen = existing.origen;
                if (existing.desvinculado) payload.desvinculado = true;
                if (existing.vinculoRoto) payload.vinculoRoto = true;
                if (existing.desvinculado_at) payload.desvinculado_at = existing.desvinculado_at;
            }
        }

        const visibleServicios = [];
        document.querySelectorAll("#services-list tr").forEach(row => {
            const dateInput = row.querySelector(".row-date") || row.querySelector("input[type='date']");
            const timeInput = row.querySelector(".row-time") || row.querySelector("input[type='time']");
            const conceptInput = row.querySelector(".row-concept") || row.querySelector("input[list='charge-options']") || row.querySelector("input[type='text']");
            const udsInput = row.querySelector(".row-uds") || row.querySelector("input[type='number']");
            const priceInput = row.querySelector(".row-price");

            const fecha = dateInput ? dateInput.value : "";
            const hora = timeInput ? timeInput.value : "";
            const concepto = conceptInput ? conceptInput.value : "";
            const uds = udsInput ? (parseFloat(udsInput.value) || 0) : 0;
            const precio = priceInput ? window.MesaChef.parseEuroInput(priceInput.value) : 0;
            const total = uds * precio;

            visibleServicios.push({
                fecha,
                hora,
                concepto,
                uds,
                precio,
                total
            });
        });

        // MERGE: Keep invisible services from other dates, replace visible ones
        const viewDate = window.currentViewDate;
        if (viewDate && window.currentFullServices.length > 0) {
            // Keep all services NOT for this date
            const otherServices = window.currentFullServices.filter(s => s.fecha !== viewDate);
            // Add the current visible ones (which are for this date, or edited to be)
            payload.servicios = [...otherServices, ...visibleServicios];
        } else {
            payload.servicios = visibleServicios;
        }

        console.log("Validating Event:", payload);

        // --- PAST DATE VALIDATION ---
        const eventDate = new Date(payload.fecha);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        eventDate.setHours(0, 0, 0, 0);

        if (eventDate < today) {
            alert("⛔ FECHA INVÁLIDA: No se pueden crear eventos en fechas pasadas.");
            btn.innerText = originalText;
            btn.disabled = false;
            return;
        }

        // --- BLOCK VALIDATION ---
        if (globalConfig.bloqueos) {
            const isBlocked = globalConfig.bloqueos.some(b => {
                const salonMatches = b.salon === "TODOS" || b.salon === payload.salon ||
                    (getActiveHotel() === "Guadiana" && isRestauranteStyle(b.salon) && isRestauranteStyle(payload.salon));
                return salonMatches && (payload.fecha >= b.start && payload.fecha <= b.end);
            });
            if (isBlocked) {
                alert("⛔ FECHA BLOQUEADA: El salón seleccionado no está disponible en esta fecha (Reparación/Bloqueo).");
                btn.innerText = originalText;
                btn.disabled = false;
                return;
            }
        }

        try {
            // --- CONFLICT VALIDATION ---
            // If I am cancelling, I don't care about conflicts
            let conflict = false;
            let conflictReason = "";

            if (payload.estado !== 'cancelada') {
                // Use Shared Validation
                try {
                    const validation = await window.MesaChef.checkSalonAvailability(
                        db,
                        payload.hotel,
                        payload.salon,
                        payload.fecha,
                        payload.detalles.jornada || "todo",
                        currentBookingId // exclude self
                    );

                    if (!validation.available) {
                        conflict = true;
                        conflictReason = validation.reason;
                    }
                } catch (err) {
                    console.error("Validation error", err);
                    alert("Error validando disponibilidad: " + err.message);
                    return;
                }
            }

            if (conflict) {
                alert("⛔ CONFLICTO DE RESERVA:\n" + conflictReason);
                btn.innerText = originalText;
                btn.disabled = false;
                return; // ABORT SAVE
            }

            // --- CONFIRMATION FOR LINKED BUDGETS ---
            if (currentBookingId && (payload.presupuestoId || window.currentEventBudgetID)) {
                if (payload.estado !== 'cancelada' && payload.estado !== 'anulada') {
                    if (!confirm(`⚠️ ATENCIÓN: EVENTO VINCULADO\n\nEste evento está vinculado a un presupuesto.\nCualquier cambio se sincronizará automáticamente.\n\n¿Seguro que deseas guardar los cambios?`)) {
                        btn.innerText = originalText;
                        btn.disabled = false;
                        return;
                    }
                }
            }

            if (btn) {
                btn.innerText = "Guardando...";
                btn.disabled = true;
            }

            if (currentBookingId) {
                // Recordar el salón para poder deshacer el traslado desde Restaurante.
                const previous = window._resRegistry && window._resRegistry[currentBookingId];
                if (window.EventLocation.isRestaurant(payload.salon) && previous && previous.salon && !window.EventLocation.isRestaurant(previous.salon)) {
                    payload.salonAnterior = previous.salon;
                }
                // Update existing
                if (isNexusLinked(existing)) {
                    payload.salonOverride = payload.salon;
                }
                payload.updated_at = new Date().toISOString();
                await db.collection("reservas_salones").doc(currentBookingId).set(payload, { merge: true });
            } else {
                // Create new
                payload.created_at = new Date().toISOString();
                payload.updated_at = new Date().toISOString();
                const ref = await db.collection("reservas_salones").add(payload);
                currentBookingId = ref.id; // Update for sync
            }

            // [NEW] 2-Way Sync: Update Budget if this is linked
            if (payload.presupuestoId) {
                await syncPresupuestoFromSalon(payload);
            }

            // [NEW] Traspaso automático a módulo Restaurante si el salón es "Restaurante"
            const isRteSelected = (payload.salon || "").trim().toLowerCase() === "restaurante";
            const rteDocId = "salon_" + currentBookingId;
            if (isRteSelected) {
                try {
                    const turno = (payload.detalles.jornada || "").toLowerCase().includes("cena") ||
                                  (payload.detalles.jornada || "").toLowerCase().includes("tarde") ||
                                  (payload.detalles.hora && parseInt(payload.detalles.hora.split(":")[0]) >= 19) ? "cena" : "almuerzo";
                    
                    let pAdl = 0, pNin = 0, tot = 0;
                    if (Array.isArray(payload.servicios)) {
                        payload.servicios.forEach(s => {
                            tot += (parseFloat(s.total) || 0);
                            const c = (s.concepto || "").toLowerCase();
                            if (c.includes("niño") || c.includes("infantil")) {
                                if (!pNin && s.precio) pNin = parseFloat(s.precio) || 0;
                            } else {
                                if (!pAdl && s.precio) pAdl = parseFloat(s.precio) || 0;
                            }
                        });
                    }

                    const rtePayload = {
                        hotel: payload.hotel,
                        referencia: payload.presupuestoId || (payload.reservaId ? String(payload.reservaId) : currentBookingId),
                        fecha: payload.fecha,
                        espacio: "Restaurante",
                        nombre: payload.cliente,
                        telefono: payload.contact?.tel || "",
                        hora: payload.detalles.hora || (turno === "cena" ? "21:00" : "14:00"),
                        pax: (payload.detalles.pax_adultos || 0) + (payload.detalles.pax_ninos || 0),
                        ninos: payload.detalles.pax_ninos || 0,
                        precio: pAdl,
                        precioAdulto: pAdl,
                        precioPorPersona: pAdl,
                        precioNinos: pNin,
                        total: tot,
                        importeTotal: tot,
                        turno: turno,
                        estado: payload.estado,
                        notas: (payload.notas?.interna ? payload.notas.interna : "") + (payload.notas?.cliente ? " | " + payload.notas.cliente : ""),
                        servicioIncluido: !!payload.detalles.incluido,
                        salonBookingId: currentBookingId,
                        _isFromSalones: true,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    await db.collection("reservas_restaurante").doc(rteDocId).set(rtePayload, { merge: true });
                } catch (eRteSync) {
                    console.warn("Error syncing to reservas_restaurante:", eRteSync);
                }
            } else {
                // Si el evento ya no está en el Restaurante, eliminarlo de reservas_restaurante si existía
                try {
                    const docCheck = await db.collection("reservas_restaurante").doc(rteDocId).get();
                    if (docCheck.exists) {
                        await db.collection("reservas_restaurante").doc(rteDocId).delete();
                    }
                } catch (eCleanRte) {
                    console.warn("Error cleaning up reservas_restaurante:", eCleanRte);
                }
            }

            closeModal();
            // alert("Evento guardado exitosamente."); // Removed to be less intrusive, UI updates automatically via snapshot
        } catch (e) {
            console.error(e);
            alert("Error: " + e.message);
        } finally {
            if (btn) {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        }
    };

    window.deleteBooking = async function () {
        if (!currentBookingId) return;

        const existing = window._resRegistry[currentBookingId];
        if (isNexusLinked(existing)) {
            alert("⛔ Este evento está vinculado a Nexus Groups y no se puede anular desde MesaChef.\n\nPara gestionarlo aquí, debes desvincularlo primero con el botón 'Desvincular de Nexus Groups'.");
            return;
        }

        const key = prompt("Introduce la clave de seguridad para ANULAR:");
        if (key === null) return; // User cancelled prompt
        if (key !== "Mreserva") {
            alert("Clave de seguridad incorrecta.");
            return;
        }

        if (!confirm("⚠️ ¿Estás seguro de que quieres ANULAR este evento?\nSe marcará como CANCELADO pero no se borrará del historial.")) {
            return;
        }

        try {
            // SOFT DELETE (Update status to 'cancelada')
            // This allows it to appear in filters as "Cancelados"
            await db.collection("reservas_salones").doc(currentBookingId).update({
                estado: 'cancelada',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Sincronizar anulación con reservas_restaurante si existía
            try {
                const rteDocId = "salon_" + currentBookingId;
                const docCheck = await db.collection("reservas_restaurante").doc(rteDocId).get();
                if (docCheck.exists) {
                    await db.collection("reservas_restaurante").doc(rteDocId).update({
                        estado: 'anulada',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            } catch (eDelRte) {
                console.warn("Error cancelling in reservas_restaurante:", eDelRte);
            }

            // Sync Cancellation to Linked Budget
            if (window.currentEventBudgetID) {
                try {
                    console.log("Syncing Cancellation to Budget:", window.currentEventBudgetID);
                    await db.collection("presupuestos").doc(window.currentEventBudgetID).update({
                        estado: 'anulada', // Updated to 'anulada' per user preference
                        lastModifiedSource: 'Salones 🏛️', // Audit Trail
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch (errSync) {
                    console.error("Error cancelling linked budget:", errSync);
                }
            }

            closeModal();
            // Trigger grid refresh if needed
            if (window.renderGrid) window.renderGrid();
        } catch (e) {
            console.error("Error deleting:", e);
            alert("Error al anular: " + e.message);
        }
    };

    window.printReport = function (mode) {
        const hotel = getActiveHotel();
        const dates = utils.getWeekDates(currentWeekStart);
        let title = "";
        let filterFn;

        if (mode === 'dia') {
            // [FIX] Always use the selected date (currentWeekStart represents the date visible/picked)
            // defaults to Today on load, or whatever the user picked/navigated to.
            let targetDateStr = utils.toIsoDate(currentWeekStart);

            const prettyDate = new Date(targetDateStr).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            title = `Informe Diario - ${prettyDate}`;
            filterFn = (r) => r.fecha === targetDateStr && r.estado !== 'cancelada';
        } else {
            const d1 = dates[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            const d2 = dates[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            title = `Informe Semanal(${d1} - ${d2})`;
            // Filter is within range
            const s = utils.toIsoDate(dates[0]);
            const e = utils.toIsoDate(dates[6]);
            filterFn = (r) => r.fecha >= s && r.fecha <= e && r.estado !== 'cancelada';
        }

        const logoUrl = (hotel === "Guadiana") ? "Img/logo-guadiana.svg" : "Img/logo-cumbria.svg";

        let html = `
        <div style="font-family: sans-serif; padding: 20px;">
            <div style="display:flex; align-items:center; gap:20px; margin-bottom:20px; border-bottom:2px solid #eee; padding-bottom:15px;">
                <img src="${logoUrl}" style="height:60px; width:auto;">
                <div>
                   <h1 style="font-size: 24px; font-weight: bold; margin:0; color:#333;">${hotel}</h1>
                   <h2 style="font-size: 16px; color: #666; margin:5px 0 0 0;">${title}</h2>
               </div>
            </div>
        `;

        // 0. Collect Rows
        // 0. Collect Rows
        let rows = [];
        loadedReservations.forEach(r => {
            // 1. Hotel Check (Critical for multi-hotel data)
            if (r.hotel && r.hotel !== hotel) return;

            // 2. Status Check (Case Insensitive)
            const st = (r.estado || 'pendiente').toLowerCase();
            // Exclude 'presupuesto' from printed reports as requested
            const validStatuses = ['pendiente', 'confirmada', 'provisional', 'pending', 'confirmed'];

            if (filterFn(r) && validStatuses.includes(st)) {
                rows.push({ ...r, ts: new Date(r.fecha + 'T' + (r.detalles?.hora || '00:00')) });
            }
        });
        // Sort by timestamp first, then by jornada (almuerzo before cena) as secondary criterion
        const jornadaOrder = (r) => {
            const j = (r.detalles?.jornada || '').toLowerCase();
            if (j.includes('almuerzo') || j.includes('mañana')) return 0;
            if (j.includes('cena') || j.includes('tarde') || j.includes('noche')) return 1;
            return 0; // todo / unknown -> treat like almuerzo
        };
        rows.sort((a, b) => {
            const tsDiff = a.ts - b.ts;
            if (tsDiff !== 0) return tsDiff;
            return jornadaOrder(a) - jornadaOrder(b);
        });

        // 1. Group records by Date
        const groups = {};
        rows.forEach(r => {
            if (!groups[r.fecha]) groups[r.fecha] = [];
            groups[r.fecha].push(r);
        });

        // 2. Build HTML per Day (Always show all 7 days of the week)
        const weekDates = mode === 'dia' ? [new Date(utils.toIsoDate(currentWeekStart))] : dates;

        weekDates.forEach(dateObj => {
            const dateStr = utils.toIsoDate(dateObj);
            const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            const dayNameCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);

            html += `<h3 style="font-size: 12px; font-weight: bold; margin-top: 12px; margin-bottom: 3px; color: #2c3e50; border-bottom: 1px solid #ddd; padding-bottom: 3px;">📅 ${dayNameCap}</h3>`;

            if (!groups[dateStr] || groups[dateStr].length === 0) {
                html += `<p style="font-size: 11px; color: #94a3b8; font-style: italic; margin-bottom: 20px;">No hay eventos programados.</p>`;
                return;
            }

            // Table Header
            html += `<table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px;">
                        <thead>
                            <tr style="background: #f1f5f9; color: #475569; text-align: left;">
                                <th style="padding: 6px; width: 45px; border-bottom: 2px solid #ddd;">Hora</th>
                                <th style="padding: 6px; width: 90px; border-bottom: 2px solid #ddd;">Salón</th>
                                <th style="padding: 6px; width: 130px; border-bottom: 2px solid #ddd;">Cliente</th>
                                <th style="padding: 6px; width: 80px; border-bottom: 2px solid #ddd;">Montaje</th>
                                <th style="padding: 6px; width: 60px; border-bottom: 2px solid #ddd;">Jornada</th>
                                <th style="padding: 6px; width: 30px; border-bottom: 2px solid #ddd; text-align:center;">Pax</th>
                                <th style="padding: 6px; width: 40px; border-bottom: 2px solid #ddd;">Est.</th>
                            </tr>
                        </thead>
                        <tbody>`;

            let dailyPax = 0;
            let eventCount = 0;

            groups[dateStr].forEach((r, index) => {
                const pax = (parseInt(r.detalles?.pax_adultos) || 0) + (parseInt(r.detalles?.pax_ninos) || 0);
                dailyPax += pax;
                eventCount++;

                const time = r.detalles?.hora || "--:--";
                let space = r.salon || "Salon";
                const spaceAbbr = space.substring(0, 15) + (space.length > 15 ? '.' : '');
                const clientName = r.cliente || "Sin Nombre";
                const montaje = r.detalles?.montaje || "-";
                const jornada = r.detalles?.jornada || "-";

                let statusFull = r.estado || "";
                let statusAbbr = (statusFull === 'confirmada' || statusFull === 'confirmed') ? 'Conf' : 'Pend';
                let notesText = r.notas?.interna || "";

                // Add a top border only if it's not the first item, to separate groups
                const borderStyle = index > 0 ? "border-top: 1px solid #ddd;" : "";

                // Main Row
                html += `<tr style="${borderStyle}">
                            <td style="padding: 6px; font-weight:bold;">${time}</td>
                            <td style="padding: 6px; color:#555;">${spaceAbbr}</td>
                            <td style="padding: 6px; font-weight:600; color:#333;">${clientName.substring(0, 20)}</td>
                            <td style="padding: 6px;">${montaje.substring(0, 10)}</td>
                            <td style="padding: 6px;">${jornada}</td>
                            <td style="padding: 6px; text-align:center;">${pax}</td>
                            <td style="padding: 6px;">${statusAbbr}</td>
                        </tr>`;

                // Notes Row
                if (notesText) {
                    html += `<tr>
                                <td colspan="7" style="padding: 2px 6px 4px 6px; color:#666; font-style:italic; font-size:10px;">
                                    📝 ${notesText}
                                </td>
                             </tr>`;
                }

                // [NEW] Services Sub-row
                if (r.servicios && r.servicios.length > 0) {
                    // Filter services to show only those on the same date we are printing
                    const dailyServices = r.servicios.filter(s => s.fecha === dateStr);
                    if (dailyServices.length > 0) {
                        html += `<tr>
                                    <td colspan="7" style="padding: 0 6px 8px 30px;">
                                        <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 10px; color: #475569;">
                                            <span style="font-weight: bold; color: #1e293b;">📌 Servicios:</span>
                                            ${dailyServices.map(s => `
                                                <span style="background: #f1f5f9; padding: 1px 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
                                                    ${s.hora ? '<b>' + s.hora + '</b> ' : ''}${s.concepto} (${s.uds})
                                                </span>
                                            `).join('')}
                                        </div>
                                    </td>
                                 </tr>`;
                    }
                }
            });

            html += `</tbody></table>`;

            html += `<div style="margin-bottom: 30px;"></div>`; // Spacer replaced summary
        });

        html += `
            <div style="margin-top: 20px; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 5px;">
                Impreso el ${new Date().toLocaleString()}
            </div>
        </div>`;

        const printArea = document.getElementById("printArea");
        if (printArea) {
            printArea.innerHTML = html;
            window.print();
        }
    };

    window.changeWeek = function (delta) {
        currentWeekStart.setDate(currentWeekStart.getDate() + (delta * 7));
        renderGrid();
        updateDatePicker();
    }

    window.resetToday = function () {
        currentWeekStart = new Date();
        renderGrid();
        updateDatePicker();
    }

    window.goToDate = function (val) {
        if (!val) return;
        currentWeekStart = new Date(val);
        renderGrid();
        // The input is already set by the user, but we sync state
    };

    // Helper to update the input
    function updateDatePicker() {
        const picker = document.getElementById("currentDate");
        if (picker && currentWeekStart) {
            picker.value = utils.toIsoDate(currentWeekStart);
        }
    }

    // Helper for 2-Way Sync
    async function syncPresupuestoFromSalon(reserva) {
        if (!reserva.presupuestoId) return;
        try {
            console.log("Syncing Budget from Salon update...", reserva.presupuestoId);
            const pRef = db.collection("presupuestos").doc(reserva.presupuestoId);

            // Map Salon Services to Budget Lines
            // We assume Salon Services are the master when editing from Salon
            const budgetLines = (reserva.servicios || []).map(s => ({
                fecha: s.fecha,
                hora: s.hora || "",
                concepto: s.concepto,
                uds: s.uds,
                precio: s.precio,
                total: (s.uds || 0) * (s.precio || 0)
            }));

            // Calc Totals
            const newTotal = budgetLines.reduce((acc, curr) => acc + (curr.total || 0), 0);

            // Event Pax: Total adults + children defined for the event
            const eventPax = (reserva.detalles?.pax_adultos || 0) + (reserva.detalles?.pax_ninos || 0);

            await pRef.update({
                lines: budgetLines,
                pax: eventPax,
                paxAdultos: reserva.detalles?.pax_adultos || 0,
                paxNinos: reserva.detalles?.pax_ninos || 0,
                importeTotal: newTotal,
                fecha: reserva.fecha, // Sync Date
                cliente: reserva.cliente, // Sync Client Name
                montaje: reserva.detalles.montaje || "", // Sync Montaje
                turno: reserva.detalles.jornada || "", // Sync Turno/Jornada
                horaInicio: reserva.detalles.hora || "", // Sync Time
                lastModifiedSource: 'Salones 🏛️', // Audit Trail
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log("✅ Budget Synced from Salon!");

        } catch (e) {
            console.error("Error syncing Budget from Salon:", e);
        }
    }

    window.createGrandEvent = function () {
        // Redirect to Grandes Eventos with current Salon and Date
        const salon = document.getElementById("evt-salon").value;
        // Use currentViewDate if set (from openBooking), otherwise from input
        const date = window.currentViewDate || document.getElementById("evt-fecha").value;

        if (!salon || !date) {
            alert("Por favor selecciona Salón y Fecha primero.");
            return;
        }

        // Confirmation?
        if (!confirm(`¿Quieres crear un Gran Evento en ${salon} para el ${date}?\nEsto te llevará al módulo de gestión de Grandes Eventos.`)) return;

        window.location.href = `grandes-eventos.html?salonId=${encodeURIComponent(salon)}&date=${encodeURIComponent(date)}`;
    };

    // Initialize
    ensureFirebase(() => {
        startApp();
        // Set default date in picker after app start
        setTimeout(updateDatePicker, 500);
    });
})();

