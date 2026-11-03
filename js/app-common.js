// js/app-common.js
(function () {
    // CORRECTION: Standardize key to match index.html
    const HOTEL_KEY = "mesaChef_hotel";

    function getCurrentHotel() {
        return localStorage.getItem(HOTEL_KEY) || "Guadiana";
    }

    function setCurrentHotel(id) {
        localStorage.setItem(HOTEL_KEY, id);
    }

    // Lunes como inicio de semana
    function startOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay(); // 0=Dom, 1=Lun, ...
        const diff = day === 0 ? -6 : 1 - day; // mover al lunes
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    // Helper fechas
    function getWeekDates(base) {
        const start = startOfWeek(base);
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            days.push(d);
        }
        return days;
    }

    // YYYY-MM-DD para values de inputs
    function toIsoDate(date) {
        if (!date) return "";
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    // 💡 Este es el texto que sale en las cabeceras del planning
    // Ejemplo: "Lun 8 Dic"
    function formatDayHeader(date) {
        const dias = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];
        const meses = [
            "Ene", "Feb", "Mar", "Abr", "May", "Jun",
            "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
        ];
        const diaNombre = dias[date.getDay()];
        const diaNum = date.getDate();
        const mesTxt = meses[date.getMonth()];
        const yearStr = String(date.getFullYear()).slice(-2);
        return `${diaNombre} ${diaNum} ${mesTxt} ${yearStr}`;
    }

    // Para rangos tipo 01/12/25 → 07/12/25
    function formatDateES(date) {
        const d = String(date.getDate()).padStart(2, "0");
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const y = String(date.getFullYear()).slice(-2); // 2 dígitos
        // Si queremos 4 dígitos cambiar a date.getFullYear()
        return `${d}/${m}/${Math.abs(date.getFullYear())}`;
    }

    window.MesaChef = {
        getCurrentHotel,
        setCurrentHotel,
        getWeekDates,
        toIsoDate,
        formatDayHeader,
        formatDateES,
        checkSalonAvailability: async (db, hotel, salon, dateStr, jornada, excludeId = null) => {
            // 1. Queries Firestore
            // Conflict Rules:
            // - New "TODO" -> Conflicts with ANY existing (Mañana, Tarde, Todo)
            // - New "Mañana" -> Conflicts with Existing "Mañana" OR "Todo"
            try {
                // [NEW] MULTI-SERVICE EXCEPTION: Eventos Restaurante / Grupos Alarcos (Ignore conflicts)
                if (window.MesaChef.isRestauranteStyle(salon)) return { available: true };

                const snapshot = await db.collection("reservas_salones")
                    .where("hotel", "==", hotel)
                    .where("salon", "==", salon)
                    .where("fecha", "==", dateStr)
                    .get();

                if (snapshot.empty) return { available: true };

                const getShift = (j) => {
                    const normalized = (j || "").toLowerCase().trim();
                    if (normalized === 'todo' || normalized.includes('dia') || normalized.includes('completo')) return 'todo';
                    if (normalized.includes('mañana') || normalized.includes('almuerzo') || normalized.includes('desayuno') || normalized.includes('mjm')) return 'mañana';
                    if (normalized.includes('tarde') || normalized.includes('cena') || normalized.includes('merienda') || normalized.includes('mjt')) return 'tarde';
                    return 'todo';
                };

                const myShift = getShift(jornada);
                let conflict = null;

                snapshot.forEach(doc => {
                    if (conflict) return; // Already found one
                    if (excludeId && doc.id === excludeId) return; // Ignore self

                    const data = doc.data();
                    const st = (data.estado || "").toLowerCase();
                    if (st === 'cancelada' || st === 'anulada') return;

                    const override = data.jornadaOverrideHotel === data.hotel && data.jornadaOverrideFecha === data.fecha ? data.jornadaOverride : null;
                    const otherShift = getShift(override || data.detalles?.jornada || "todo");

                    // LOGIC
                    if (myShift === 'todo' || otherShift === 'todo') {
                        // Full day conflict
                        conflict = data;
                    } else if (myShift === otherShift) {
                        // Exact match (morning vs morning, afternoon vs afternoon)
                        conflict = data;
                    }
                });

                if (conflict) {
                    return {
                        available: false,
                        reason: `Ocupado por ${conflict.cliente} (${conflict.detalles?.jornada || 'Todo el día'})`,
                        conflictData: conflict
                    };
                }

                return { available: true };

            } catch (e) {
                console.error("Error checking availability:", e);
                // Fallback to allow if DB fails? Or block? Safety first: Block or Alert? 
                // Let's return error so caller decides.
                throw e;
            }
        },
        // --- SPANISH INPUT FORMATTERS ---
        // 0. Format Number -> "1.234,56"
        formatEuroValue: (num) => {
            if (num === null || num === undefined || num === "") return "0,00";
            let val = typeof num === 'number' ? num : window.MesaChef.parseEuroInput(num);
            if (isNaN(val)) return "0,00";
            return val.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
        },
        parseEuroInput: (val) => {
            if (typeof val === 'number') return isNaN(val) ? 0 : val;
            if (!val) return 0;
            let s = val.toString().trim();
            if (!s) return 0;
            // Remove spaces, currency symbols, keep digits, minus, dot, comma
            s = s.replace(/[^\d.,-]/g, '');
            if (!s) return 0;

            const hasComma = s.includes(',');
            const hasDot = s.includes('.');

            if (hasComma && hasDot) {
                const lastComma = s.lastIndexOf(',');
                const lastDot = s.lastIndexOf('.');
                if (lastComma > lastDot) {
                    // Spanish format: 1.234,56 -> remove dots, replace comma with dot
                    s = s.replace(/\./g, '').replace(',', '.');
                } else {
                    // English format: 1,234.56 -> remove commas
                    s = s.replace(/,/g, '');
                }
            } else if (hasComma) {
                s = s.replace(/,/g, '.');
            } else if (hasDot) {
                if (/^-?\d+\.\d{1,2}$/.test(s)) {
                    // Single dot followed by 1 or 2 digits -> decimal dot (e.g. 25.50 or 25.5)
                } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
                    // Thousands dot (e.g. 1.000 or 10.000)
                    s = s.replace(/\./g, '');
                }
            }
            return parseFloat(s) || 0;
        },
        formatEuroInput: (input) => {
            let val = input.value;
            if (!val || val.trim() === "") { input.value = ""; return; }
            let num = window.MesaChef.parseEuroInput(val);
            if (isNaN(num) || num === 0) { input.value = ""; return; }
            input.value = num.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },
        unformatEuroInput: (input) => {
            let val = input.value;
            if (!val || val.trim() === "") return; // ya vacío, no tocar
            let num = window.MesaChef.parseEuroInput(val);
            if (num === 0) { input.value = ""; return; } // limpiar si es 0
            // Editing format: Use Comma for decimal, No dots
            input.value = num.toString().replace('.', ',');
        },
        isRestauranteStyle: (name) => {
            const n = (name || "").toLowerCase().trim();
            if (n.startsWith("puerta") || n.includes("puerta de alarcos")) return false;
            return n.includes("restaurante") || n.includes("grupos") || n.includes("eventos grupos");
        }
    };

    // --- GLOBAL: Punto → Coma en inputs de precio ---
    // Convierte la tecla "." (teclado normal y numérico) en "," en todos los
    // inputs de texto y número, para que los precios siempre usen coma decimal.
    document.addEventListener("keydown", function (e) {
        const tag = (e.target.tagName || "").toUpperCase();
        if (tag !== "INPUT" && tag !== "TEXTAREA") return;

        const type = (e.target.type || "text").toLowerCase();
        if (type === "date" || type === "time" || type === "checkbox" ||
            type === "radio" || type === "file" || type === "email" ||
            type === "url" || type === "search") return;

        // key "." tanto del teclado principal como del numérico (Decimal)
        if (e.key === "." || e.key === "Decimal") {
            e.preventDefault();
            const el = e.target;
            const start = el.selectionStart;
            const end = el.selectionEnd;
            const val = el.value;

            // Si es input type=number cambiarlo a text temporalmente no funciona bien,
            // así que insertamos en la posición del cursor
            if (type === "number") {
                // Para type=number no podemos usar selectionStart en todos los browsers,
                // así que simplemente añadimos "," al final si no hay ya una
                if (!val.includes(",")) {
                    el.value = val + ",";
                }
            } else {
                el.value = val.slice(0, start) + "," + val.slice(end);
                // Mover cursor tras la coma
                el.setSelectionRange(start + 1, start + 1);
            }
            // Disparar evento 'input' para que los cálculos dinámicos reaccionen
            el.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }, true); // capture = true para interceptar antes que cualquier otro handler
})();
