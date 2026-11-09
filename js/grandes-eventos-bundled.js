/**
 * Grandes Eventos Bundled Script (No Modules)
 * Combines: state.js, utils.js, api.js, print.js, ui.js, main.js
 * To support file:// protocol usage without CORS errors.
 */
(function () {
    'use strict';

    // --- STATE.JS ---
    const state = {
        currentEventId: null,
        currentEvent: null,
        participants: [],
        modalPagos: [],
        hasUnsavedChanges: false,
        hotelInfo: {
            name: "Sercotel Guadiana", // Default
            logo: "Img/logo-guadiana.png",
            id: "Guadiana"
        },
        ui: {
            filter: 'activo',
            view: 'list',
            printMode: null
        }
    };



    function getActiveHotel() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlHotel = urlParams.get('hotel');
        const raw = urlHotel || localStorage.getItem("mesaChef_hotel") || "Guadiana";
        return (raw.toLowerCase().includes("cumbria")) ? "Cumbria" : "Guadiana";
    }

    function syncHotelState(hotelId) {
        const norm = (hotelId || getActiveHotel()).toLowerCase().includes("cumbria") ? "Cumbria" : "Guadiana";
        state.hotelInfo.id = norm;
        if (norm === "Cumbria") {
            state.hotelInfo.name = "Cumbria Spa&Hotel";
            state.hotelInfo.logo = "Img/logo-cumbria.svg";
        } else {
            state.hotelInfo.name = "Sercotel Guadiana";
            state.hotelInfo.logo = "Img/logo-guadiana.svg";
        }
        localStorage.setItem("mesaChef_hotel", norm);
        return norm;
    }

    syncHotelState();

    function updateHeaderHotelDisplay() {
        const curHotel = state.hotelInfo.id || getActiveHotel();
        const isGuadiana = curHotel === "Guadiana";
        const logoSrc = isGuadiana ? "Img/logo-guadiana.svg" : "Img/logo-cumbria.svg";
        const displayName = isGuadiana ? "Sercotel Guadiana" : "Cumbria Spa & Hotel";

        const headerName = $('headerHotelName');
        const headerLogo = $('headerHotelLogo');
        if (headerName) headerName.textContent = displayName;
        if (headerLogo) headerLogo.src = logoSrc;

        const sel = $('hotelSwitcherSelect');
        if (sel) {
            sel.value = curHotel;
        }
    }

    function ensureAuth(callback) {
        if (typeof firebase === 'undefined' || !firebase.auth) {
            console.warn("Grandes Eventos: Firebase Auth no disponible");
            if (callback) callback();
            return;
        }

        let executed = false;
        const runOnce = () => {
            if (!executed) {
                executed = true;
                if (callback) callback();
            }
        };

        try {
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    console.log("Grandes Eventos: Usuario autenticado:", user.uid);
                    runOnce();
                } else {
                    console.log("Grandes Eventos: Iniciando sesión anónima...");
                    firebase.auth().signInAnonymously().catch((err) => {
                        console.error("Grandes Eventos: Error en autenticación anónima:", err);
                        runOnce();
                    });
                }
            });
        } catch (e) {
            console.error("Grandes Eventos: Error en inicialización de Auth:", e);
            runOnce();
        }
    }

    function resetState() {
        state.currentEventId = null;
        state.currentEvent = null;
        state.participants = [];
        state.modalPagos = [];
    }

    function checkSecurity() {
        const key = prompt("Introduce la clave de seguridad (Mreserva):");
        if (key === "Mreserva") return true;
        if (key !== null) alert("Clave incorrecta (v5)");
        return false;
    }

    // --- UTILS.JS ---
    function formatPhoneES(value) {
        if (!value) return "";
        let clean = String(value).replace(/\D/g, '');
        if (clean.startsWith('34') && clean.length > 9) {
            clean = clean.slice(2);
        }
        clean = clean.slice(0, 9);
        if (clean.length <= 3) return clean;
        if (clean.length <= 6) return `${clean.slice(0, 3)} ${clean.slice(3)}`;
        return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
    }
    function formatCurrency(amount) {
        if (amount === undefined || amount === null) return "0,00 €";
        return parseFloat(amount).toLocaleString('es-ES', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + " €";
    }

    function formatDate(dateString) {
        if (!dateString) return "";
        const [y, m, d] = dateString.split('-');
        return `${d}/${m}/${y}`;
    }

    function formatTimestamp(timestamp) {
        if (!timestamp) return "No disponible";

        // Handle Firebase Timestamp object
        let date;
        if (timestamp.toDate && typeof timestamp.toDate === 'function') {
            date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            date = timestamp;
        } else {
            return "No disponible";
        }

        // Format as: DD/MM/YYYY, HH:MM
        return date.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // [FIX] Get hotel logo path
    function getHotelLogo() {
        const hotelId = state.hotelInfo?.id || 'Guadiana';
        return hotelId === 'Cumbria' ? 'Img/logo-cumbria.png' : 'Img/logo-guadiana.png';
    }

    function getHotelLogo(salonName) {
        if (salonName === 'Cumbria') return "Img/logo-cumbria.png";
        return "Img/logo-guadiana.png";
    }

    function calculateStats(participants, capacity) {
        let totalPax = 0;
        let totalAdults = 0;
        let totalKids = 0;
        let totalCollected = 0;
        let totalPending = 0;
        let totalCancelledAmount = 0;

        participants.forEach(p => {
            const isAnulado = p.estado && p.estado.startsWith("anulado");
            const pagos = p.pagos || [];
            const paidAmount = pagos.reduce((acc, pay) => acc + (parseFloat(pay.amount) || 0), 0) + (p.pagado && !p.pagos ? parseFloat(p.pagado) : 0);

            if (isAnulado) {
                totalCancelledAmount += paidAmount;
            } else {
                totalAdults += parseInt(p.adultos) || 0;
                totalKids += parseInt(p.ninos) || 0;

                const priceAd = parseFloat(document.getElementById("inputPriceAdult").value) || 0;
                const priceCh = parseFloat(document.getElementById("inputPriceChild").value) || 0;
                const totalCost = ((parseInt(p.adultos) || 0) * priceAd) + ((parseInt(p.ninos) || 0) * priceCh);

                // Si está incluido, sumar el total al recaudado
                const isIncluded = p.servicioIncluido || false;
                const effectivePaid = isIncluded ? (paidAmount + totalCost) : paidAmount;

                totalCollected += effectivePaid;

                const pending = Math.max(0, totalCost - effectivePaid);
                totalPending += pending;
            }
        });

        totalPax = totalAdults + totalKids;
        const occupancy = capacity > 0 ? ((totalPax / capacity) * 100).toFixed(0) : 0;
        const available = capacity - totalPax;

        return {
            totalPax, totalAdults, totalKids, occupancy, available, totalCollected, totalPending, totalCancelledAmount
        };
    }

    // --- API.JS ---
    const API = (() => {
        // Access global db instance
        // Assuming firebase-init.js runs before this script
        let db, eventosRef, participantesRef, masterRef;

        function initAPI() {
            db = window.db || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
            if (!db) return false;
            if (!eventosRef) eventosRef = db.collection("grandes_eventos");
            if (!participantesRef) participantesRef = db.collection("participantes_eventos");
            if (!masterRef) masterRef = db.collection("master_data");
            return true;
        }

        async function fetchEvents() {
            if (!initAPI()) return [];

            const currentHotel = state.hotelInfo.id || "Guadiana";
            let query = eventosRef.orderBy("fecha", "desc");

            try {
                let snapshot;
                try {
                    snapshot = await query.get();
                } catch (orderErr) {
                    console.warn("Fallback to get without order:", orderErr);
                    snapshot = await eventosRef.get();
                }

                let events = [];

                // Process each event with participant stats
                for (const doc of snapshot.docs) {
                    const data = doc.data();
                    const evtHotel = (data.hotel || "Guadiana").toLowerCase().includes("cumbria") ? "Cumbria" : "Guadiana";

                    if (evtHotel === currentHotel) {
                        const eventData = { id: doc.id, ...data };

                        // Fetch participants for this event to calculate totalPax
                        try {
                            const participantsSnapshot = await participantesRef.where("eventoId", "==", doc.id).get();
                            let totalPax = 0;

                            participantsSnapshot.forEach(pDoc => {
                                const p = pDoc.data();
                                // Only count active participants
                                const isAnulado = p.estado && p.estado.startsWith('anulado');
                                if (!isAnulado) {
                                    totalPax += (parseInt(p.adultos) || 0) + (parseInt(p.ninos) || 0);
                                }
                            });

                            eventData.stats = { totalPax };
                        } catch (pErr) {
                            console.warn("Error participants for event", doc.id, pErr);
                            eventData.stats = { totalPax: 0 };
                        }
                        events.push(eventData);
                    }
                }

                events.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

                return events;
            } catch (e) {
                console.error("Error fetching events", e);
                return [];
            }
        }

        async function fetchEventDetails(eventId) {
            if (!initAPI()) throw new Error("DB not ready");
            const doc = await eventosRef.doc(eventId).get();
            if (!doc.exists) throw new Error("Evento no encontrado");
            return { id: doc.id, ...doc.data() };
        }

        async function fetchParticipants(eventId) {
            if (!initAPI()) return [];
            const snapshot = await participantesRef.where("eventoId", "==", eventId).get();
            // [FIX] Extract ID from doc.id, not from data()
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        async function fetchSalonConfig() {
            if (!initAPI()) return null;
            try {
                const doc = await masterRef.doc("CONFIG_SALONES").get();
                if (doc.exists) return doc.data();
                return null;
            } catch (e) {
                console.warn("Error fetching salon config", e);
                return null;
            }
        }

        async function createEvent(eventData) {
            if (!initAPI()) throw new Error("Base de datos no inicializada");
            const prefix = (eventData.nombre || "EVT").trim().substring(0, 3).toUpperCase().padEnd(3, 'X');
            const cleanDate = (eventData.fecha || "").replace(/-/g, '');
            const ref = `${prefix}${cleanDate}-GE${Math.floor(Math.random() * 1000)}`;

            const newEvent = {
                ...eventData,
                referencia: ref,
                estado: 'abierto',
                hotel: eventData.hotel || state.hotelInfo.id || "Guadiana",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await eventosRef.add(newEvent);
            return docRef.id;
        }

        async function updateEvent(eventId, updates) {
            if (!initAPI()) return;
            await eventosRef.doc(eventId).update({
                ...updates,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        async function saveParticipant(participantData) {
            if (!initAPI()) return;

            // [FIX] Remove 'id' from data to prevent overwriting doc.id when fetching
            const { id, ...dataToSave } = participantData;

            if (id) {
                // Update existing
                const ref = participantesRef.doc(id);
                await ref.update({
                    ...dataToSave,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                // Create new
                await participantesRef.add({
                    ...dataToSave,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        async function cancelParticipant(pId, reason, action, modalPagos) {
            if (!initAPI()) return;
            let updates = {
                estado: 'anulado',
                motivoAnulacion: reason,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (action === "refund") {
                updates.pagos = [];
                updates.pagado = 0;
            }
            await participantesRef.doc(pId).update(updates);
        }

        async function recoverParticipant(pId) {
            if (!initAPI()) return;
            await participantesRef.doc(pId).update({
                estado: 'activo',
                motivoAnulacion: firebase.firestore.FieldValue.delete(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        async function cancelEvent(eventId, salonId, fecha) {
            console.log('cancelEvent called with:', { eventId, salonId, fecha });
            if (!initAPI()) {
                console.error('API not initialized');
                return;
            }

            try {
                console.log('Updating event status to anulado...');
                // Update event status to 'anulado'
                await eventosRef.doc(eventId).update({
                    estado: 'anulado',
                    fechaAnulacion: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log('Event status updated successfully');

                // Release salon reservation if exists
                if (salonId && fecha) {
                    console.log('Releasing salon reservation...');
                    await releaseSalonReservation(salonId, fecha, eventId);
                }
            } catch (error) {
                console.error('Error in cancelEvent:', error);
                throw error; // Re-throw to be caught by handleCancelEvent
            }
        }

        async function releaseSalonReservation(salonId, fecha, eventoId) {
            try {
                // Query for the salon reservation by eventoId
                const salonesRef = db.collection("reservas_salones");
                const snapshot = await salonesRef
                    .where("eventoId", "==", eventoId)
                    .get();

                // Mark reservation as cancelled (don't delete, preserve data)
                const batch = db.batch();
                snapshot.forEach(doc => {
                    batch.update(doc.ref, {
                        estado: 'cancelado',
                        fechaCancelacion: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                await batch.commit();
                console.log(`Reserva de salón liberada para evento ${eventoId}`);
            } catch (e) {
                console.error("Error releasing salon reservation:", e);
                // Don't throw - event cancellation should proceed even if salon release fails
            }
        }

        return {
            initAPI, fetchEvents, fetchEventDetails, fetchParticipants, createEvent, updateEvent, saveParticipant, cancelParticipant, recoverParticipant, cancelEvent, fetchSalonConfig
        };
    })();

    // --- PRINT.JS ---
    // --- PRINT.JS RECOVERY ---
    function printGeneric(title, content) {
        const w = window.open('', '_blank');
        w.document.write(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>${title}</title>
                <link rel="stylesheet" href="css/print.css">
                <style>
                    @page { size: A4; margin: 10mm 12mm; }
                    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
                    .print-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
                    .print-title { font-size: 20px; font-weight: 800; color: #0f172a; text-transform: uppercase; margin: 0; line-height: 1.15; }
                    .print-subtitle { font-size: 13px; color: #475569; margin-top: 4px; font-weight: 600; }
                    table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 10px; }
                    th { background-color: #f1f5f9 !important; color: #334155; font-weight: 700; text-transform: uppercase; font-size: 11px; padding: 6px 8px; text-align: left; border-bottom: 2px solid #cbd5e1; }
                    td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; color: #1e293b; vertical-align: middle; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .font-bold { font-weight: 700; }
                    .section-break { page-break-before: always; }
                    .summary-box { background: #f8fafc; border: 1px solid #cbd5e1; padding: 10px 14px; border-radius: 6px; margin-top: 12px; page-break-inside: avoid; }
                </style>
            </head>
            <body>
                ${content}
                <script>
                    window.onload = function() { setTimeout(() => window.print(), 500); };
                </script>
            </body>
            </html>
        `);
        w.document.close();
    }

    function getPrintHeader(title) {
        const evt = state.currentEvent;
        return `
            <div class="print-header">
                <div>
                    <h1 class="print-title">${title}</h1>
                    <div class="print-subtitle">${evt.nombre} · ${formatDate(evt.fecha)}</div>
                </div>
                <img src="${state.hotelInfo.logo}" style="height: 50px;">
            </div>
         `;
    }

    function generateParticipantsPdf() {
        const parts = [...state.participants].filter(p => !p.estado?.startsWith('anulado')).sort((a, b) => {
            if (a.mesa && b.mesa) {
                const nA = parseInt(a.mesa), nB = parseInt(b.mesa);
                if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
                return a.mesa.localeCompare(b.mesa);
            }
            if (a.mesa) return -1;
            if (b.mesa) return 1;
            return (a.secuencia || 0) - (b.secuencia || 0);
        });

        let totalAd = 0;
        let totalNi = 0;
        let confirmedPax = 0;
        let pendingPax = 0;

        const rows = parts.map(p => {
            const ad = parseInt(p.adultos) || 0;
            const ni = parseInt(p.ninos) || 0;
            const totalPax = ad + ni;
            totalAd += ad;
            totalNi += ni;

            const isIncluded = Boolean(p.servicioIncluido);
            const rawPaid = (p.pagos || []).reduce((a, c) => a + (parseFloat(c.amount) || 0), 0) + (parseFloat(p.pagado) || 0);
            const cost = (ad * (parseFloat(state.currentEvent?.precioAdulto) || 0) + ni * (parseFloat(state.currentEvent?.precioNino) || 0));
            const paid = isIncluded ? cost : rawPaid;
            const isConfirmed = isIncluded || (cost > 0 && paid >= cost) || (p.paygoldStatus === 'garantizado');

            if (isConfirmed) confirmedPax += totalPax;
            else pendingPax += totalPax;

            // Icono discreto para optimizar al máximo el espacio A4
            const statusIcon = isConfirmed
                ? '<span style="color:#16a34a; font-size:14px; font-weight:bold;" title="Confirmado">✔</span>'
                : '<span style="color:#d97706; font-size:12px; font-weight:bold;" title="Pendiente">⏳</span>';

            const mesaDisplay = p.mesa 
                ? `<strong>Mesa ${p.mesa}</strong>`
                : `<span style="color:#94a3b8; font-size:11px;">-</span>`;

            return `<tr>
                <td style="font-size:11.5px;">${mesaDisplay}</td>
                <td>
                    <span class="font-bold" style="font-size:12px; color:#0f172a;">${p.titular}</span>
                    ${p.referencia ? `<br><span style="font-size:10px; color:#64748b;">Ref: ${p.referencia}</span>` : ''}
                </td>
                <td style="font-size:11.5px; white-space:nowrap;">${formatPhoneES(p.telefono) || '-'}</td>
                <td class="text-center font-semibold">${ad}</td>
                <td class="text-center font-semibold">${ni}</td>
                <td class="text-center font-bold" style="font-size:12.5px; color:#0f172a;">${totalPax}</td>
                <td class="text-center" style="font-size:14px;">${statusIcon}</td>
                <td style="font-size:11px; color:#475569;">${p.observaciones || '-'}</td>
            </tr>`;
        }).join('');

        const totalPaxGeneral = totalAd + totalNi;

        return `
            ${getPrintHeader("Listado de Participantes y Asistencia")}
            
            <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:7px 12px; margin-bottom:10px; font-size:11.5px;">
                <span><strong>Total Personas:</strong> ${totalPaxGeneral} (${totalAd} Adultos / ${totalNi} Niños)</span>
                <span><span style="color:#16a34a; font-weight:800;">✔</span> <strong>Confirmadas:</strong> <strong style="color:#16a34a; font-size:12.5px;">${confirmedPax}</strong></span>
                <span><span style="color:#d97706; font-weight:800;">⏳</span> <strong>Pendientes:</strong> <strong style="color:#d97706; font-size:12.5px;">${pendingPax}</strong></span>
            </div>

            <table style="width:100%; table-layout:fixed;">
                <thead>
                    <tr>
                        <th style="width:8%;">Mesa</th>
                        <th style="width:34%;">Titular</th>
                        <th style="width:13%;">Teléfono</th>
                        <th class="text-center" style="width:5%;">Ad</th>
                        <th class="text-center" style="width:5%;">Ni</th>
                        <th class="text-center" style="width:6%;">Total</th>
                        <th class="text-center" style="width:6%;">Est.</th>
                        <th style="width:23%;">Observaciones</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr style="background:#f1f5f9; font-weight:bold;">
                        <td colspan="3" style="text-align:right;">TOTALES:</td>
                        <td class="text-center">${totalAd}</td>
                        <td class="text-center">${totalNi}</td>
                        <td class="text-center">${totalPaxGeneral}</td>
                        <td class="text-center"><span style="color:#16a34a;">✔</span></td>
                        <td style="font-size:11px;"><span style="color:#16a34a;">${confirmedPax} Conf.</span> / <span style="color:#d97706;">${pendingPax} Pend.</span></td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    function generateTablesPdf() {
        const tables = {};
        state.participants.filter(p => !p.estado?.startsWith('anulado')).forEach(p => {
            const m = p.mesa || "Sin Asignar";
            if (!tables[m]) tables[m] = [];
            tables[m].push(p);
        });

        const keys = Object.keys(tables).sort((a, b) => {
            if (a === "Sin Asignar") return 1;
            if (b === "Sin Asignar") return -1;
            const nA = parseInt(a), nB = parseInt(b);
            if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
            return a.localeCompare(b);
        });

        let totalAssignedPax = 0;
        let content = getPrintHeader("Distribución de Mesas y Sala");
        content += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">`;

        keys.forEach(k => {
            const group = tables[k];
            const totalAd = group.reduce((a, c) => a + (parseInt(c.adultos) || 0), 0);
            const totalCh = group.reduce((a, c) => a + (parseInt(c.ninos) || 0), 0);
            const tablePax = totalAd + totalCh;
            totalAssignedPax += tablePax;

            let tableContent = `
                <div class="summary-box">
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #e2e8f0; padding-bottom:5px; margin-bottom:10px;">
                        <span class="font-bold" style="font-size:16px; color:#0f172a;">${k === 'Sin Asignar' ? '⚠️ Sin Asignar' : 'Mesa ' + k}</span>
                        <span style="font-size:12px; color:#64748b; font-weight:bold;">${tablePax} Pax (${totalAd} Ad / ${totalCh} Ni)</span>
                    </div>
                    <table style="margin-top:0;">
                        <tbody>
                            ${group.map(p => `
                                <tr>
                                    <td style="padding:4px 0; border:none;">
                                        <strong>${p.titular}</strong>
                                        ${p.observaciones ? `<br><span style="font-size:10px; color:#b45309; font-style:italic;">⚠️ ${p.observaciones}</span>` : ''}
                                    </td>
                                    <td style="padding:4px 0; border:none; text-align:right; font-weight:bold;">
                                        ${(parseInt(p.adultos) || 0) + (parseInt(p.ninos) || 0)} Pax
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
             `;
            content += tableContent;
        });

        content += `</div>`;
        return content;
    }

    function generateFinancialPdf() {
        const stats = calculateStats(state.participants, 0);
        let sumCost = 0;
        let sumPaid = 0;
        let sumPending = 0;

        const rows = state.participants.filter(p => !p.estado?.startsWith('anulado')).map(p => {
            const ad = parseInt(p.adultos) || 0;
            const ni = parseInt(p.ninos) || 0;
            const pax = ad + ni;
            const isIncluded = Boolean(p.servicioIncluido);
            const rawPaid = (p.pagos || []).reduce((a, c) => a + (parseFloat(c.amount) || 0), 0) + (parseFloat(p.pagado) || 0);
            const cost = (ad * parseFloat($('inputPriceAdult')?.value || state.currentEvent?.precioAdulto || 0) + 
                          ni * parseFloat($('inputPriceChild')?.value || state.currentEvent?.precioNino || 0));
            const paid = isIncluded ? cost : rawPaid;
            const pending = isIncluded ? 0 : Math.max(0, cost - paid);

            sumCost += cost;
            sumPaid += paid;
            sumPending += pending;

            const estadoLabel = isIncluded
                ? '<span style="color:#0284c7; font-weight:700;">✨ Incluido</span>'
                : (pending <= 0 || p.paygoldStatus === 'garantizado' 
                    ? '<span style="color:#15803d; font-weight:700;">✅ Pagado</span>' 
                    : (paid > 0 ? `<span style="color:#0284c7; font-weight:700;">💳 Parcial (${formatCurrency(paid)})</span>` : '<span style="color:#d97706; font-weight:700;">⏳ Pendiente</span>'));

            return `<tr>
                <td>${p.referencia || p.paygoldRef || '-'}</td>
                <td><span class="font-bold">${p.titular}</span></td>
                <td class="text-center">${pax} (${ad}Ad/${ni}Ni)</td>
                <td class="text-right font-bold">${formatCurrency(cost)}</td>
                <td class="text-right text-green-700">${formatCurrency(paid)}</td>
                <td class="text-right ${pending > 0 ? 'text-red-600' : ''}">${pending > 0 ? formatCurrency(pending) : '-'}</td>
                <td class="text-center">${estadoLabel}</td>
            </tr>`;
        }).join('');

        return `
            ${getPrintHeader("Informe Económico y Financiero")}
            
            <div class="summary-box" style="margin-bottom:24px;">
                <h3 style="margin-top:0;">Resumen Global de Recaudación</h3>
                <table style="width: auto; min-width: 60%;">
                    <tr><td style="border:none; padding:4px 0;">Total Comensales:</td><td style="border:none; padding:4px 0; font-weight:bold;">${stats.totalPax} (${stats.totalAdults} Adultos / ${stats.totalKids} Niños)</td></tr>
                    <tr><td style="border:none; padding:4px 0;">Total Facturación Prevista:</td><td style="border:none; padding:4px 0; font-weight:bold; font-size:14px;">${formatCurrency(sumCost)}</td></tr>
                    <tr><td style="border:none; padding:4px 0;">Total Cobrado / Recaudado:</td><td style="border:none; padding:4px 0; font-weight:bold; color:#15803d; font-size:14px;">${formatCurrency(sumPaid)}</td></tr>
                    <tr><td style="border:none; padding:4px 0;">Total Pendiente de Cobro:</td><td style="border:none; padding:4px 0; font-weight:bold; color:#b91c1c; font-size:14px;">${formatCurrency(sumPending)}</td></tr>
                    ${stats.totalCancelledAmount > 0 ? `<tr><td style="border:none; padding:4px 0;">Cancelado/Devuelto:</td><td style="border:none; padding:4px 0; font-weight:bold; color:#64748b;">${formatCurrency(stats.totalCancelledAmount)}</td></tr>` : ''}
                </table>
            </div>

            <h3>Desglose Detallado por Reserva</h3>
            <table>
                <thead>
                    <tr>
                        <th width="14%">Ref / Pedido</th>
                        <th>Titular</th>
                        <th class="text-center" width="12%">Pax</th>
                        <th class="text-right" width="13%">Total</th>
                        <th class="text-right" width="13%">Pagado</th>
                        <th class="text-right" width="13%">Pendiente</th>
                        <th class="text-center" width="14%">Estado Cobro</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr style="background:#f1f5f9; font-weight:bold;">
                        <td colspan="3" style="text-align:right;">TOTALES GENERALES:</td>
                        <td class="text-right">${formatCurrency(sumCost)}</td>
                        <td class="text-right text-green-700">${formatCurrency(sumPaid)}</td>
                        <td class="text-right text-red-600">${formatCurrency(sumPending)}</td>
                        <td class="text-center">${sumPending === 0 ? '100% Cobrado' : ''}</td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    // --- UI.JS ---
    const $ = id => document.getElementById(id);

    let eventsListenersInitialized = false;

    function initEventListeners() {
        if (eventsListenersInitialized) return;
        eventsListenersInitialized = true;

        $('btnSaveEventConfig')?.addEventListener('click', saveConfig);
        $('btnAddParticipant')?.addEventListener('click', () => openParticipantModal());
        $('btnCloseModal')?.addEventListener('click', closeParticipantModal);
        $('formParticipant')?.addEventListener('submit', handleParticipantSubmit);
        $('btnToggleStatus')?.addEventListener('click', toggleStatus);

        $('listStatusFilter')?.addEventListener('change', refreshEventsList);
        $('listDateFilter')?.addEventListener('change', refreshEventsList);
        $('listSearch')?.addEventListener('input', () => refreshEventsList());
        $('filterParticipants')?.addEventListener('change', renderParticipantsTable);

        $('hotelSwitcherSelect')?.addEventListener('change', (e) => {
            syncHotelState(e.target.value);
            updateHeaderHotelDisplay();
            refreshEventsList();
        });

        window.addEventListener("storage", (e) => {
            if (e.key === "mesaChef_hotel" && e.newValue) {
                const newNorm = e.newValue.toLowerCase().includes("cumbria") ? "Cumbria" : "Guadiana";
                if (newNorm !== state.hotelInfo.id) {
                    syncHotelState(newNorm);
                    updateHeaderHotelDisplay();
                    refreshEventsList();
                }
            }
        });

        ['pAdults', 'pKids', 'pCollectionDate'].forEach(id => {
            $(id)?.addEventListener('input', recalcModalFinancials);
        });

        // Servicio Incluido Checkbox
        $('pServicioIncluido')?.addEventListener('change', recalcModalFinancials);

        // Real-time Spanish phone formatting (000 000 000)
        $('pPhone')?.addEventListener('input', function () {
            this.value = formatPhoneES(this.value);
        });

        // PayGold Charge Date change listener
        $('pChargeDate')?.addEventListener('input', updateChargeAlertBadge);
        $('pChargeDate')?.addEventListener('change', updateChargeAlertBadge);
        $('pPaygoldStatus')?.addEventListener('change', () => {
            updatePaygoldStatusStyle();
            if ($('pPaygoldStatus')?.value === 'garantizado') {
                const pending = parseFloat($('pPendingCalc')?.value || 0);
                if (pending > 0) {
                    const confirmAdd = confirm("Has marcado la reserva como 'Garantizado / Pagado'.\n\n¿Deseas registrar automáticamente el abono del importe pendiente (" + pending.toFixed(2) + " €) en el Historial de Pagos?");
                    if (confirmAdd) {
                        payFullPendingToModal();
                    }
                }
            }
        });

        // Card Last 4 digits only
        $('pCardLast4')?.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '').slice(0, 4);
        });

        // Card Expiry auto-slash (MM/AA)
        $('pCardExpiry')?.addEventListener('input', function (e) {
            let v = this.value.replace(/\D/g, '').slice(0, 4);
            if (v.length >= 3) {
                this.value = v.slice(0, 2) + '/' + v.slice(2);
            } else {
                this.value = v;
            }
        });

        // Copy Paygold Ref button
        // Copy PayGold Amount button
        $('btnCopyPaygoldAmount')?.addEventListener('click', () => {
            const pending = $('pPendingCalc')?.value || '0.00';
            const total = $('pTotalCalc')?.value || '0.00';
            const amountToCopy = parseFloat(pending) > 0 ? pending : total;
            navigator.clipboard.writeText(amountToCopy).then(() => {
                const btn = $('btnCopyPaygoldAmount');
                btn.textContent = '✅ Copiado (' + amountToCopy + ' €)';
                setTimeout(() => btn.textContent = '💰 Copiar Importe', 2000);
            }).catch(() => alert('Importe: ' + amountToCopy));
        });

        // Copy PayGold Description button
        $('btnCopyPaygoldDesc')?.addEventListener('click', () => {
            const titular = $('pName')?.value || 'Cliente';
            const evtName = ($('inputName')?.value || 'Cena Fin de Año 2026').trim();
            const desc = (evtName + ' - ' + titular).slice(0, 125);
            navigator.clipboard.writeText(desc).then(() => {
                const btn = $('btnCopyPaygoldDesc');
                btn.textContent = '✅ Copiado!';
                setTimeout(() => btn.textContent = '📝 Copiar Descripción', 2000);
            }).catch(() => alert('Descripción: ' + desc));
        });

        // Copy Webhook Notification URL button
        $('btnCopyWebhookUrl')?.addEventListener('click', () => {
            const url = 'https://europe-west1-mesa-chef-prod.cloudfunctions.net/redsysWebhook';
            navigator.clipboard.writeText(url).then(() => {
                const btn = $('btnCopyWebhookUrl');
                if (btn) {
                    const orig = btn.innerHTML;
                    btn.innerHTML = '✅ ¡URL Copiada!';
                    setTimeout(() => { btn.innerHTML = orig; }, 2000);
                }
            }).catch(() => alert('URL Notificación: ' + url));
        });

        
        // Regenerate PayGold Ref for new link / modification of guests
        $('btnRegenPaygoldRef')?.addEventListener('click', () => {
            const curRef = ($('pPaygoldRef')?.value || '').trim();
            let newRef = '';
            const match = curRef.match(/^(GE-\d+)(?:-(\d+))?$/);
            if (match) {
                const base = match[1];
                const ver = parseInt(match[2] || '1', 10) + 1;
                newRef = base + '-' + ver;
            } else {
                newRef = 'GE-' + Math.floor(100000 + Math.random() * 900000);
            }
            if ($('pPaygoldRef')) $('pPaygoldRef').value = newRef;
            if ($('pPaygoldLink')) $('pPaygoldLink').value = '';
            if ($('pPaygoldStatus')) {
                $('pPaygoldStatus').value = 'pendiente';
                updatePaygoldStatusStyle();
            }
            const btn = $('btnRegenPaygoldRef');
            if (btn) {
                const orig = btn.textContent;
                btn.textContent = '✅ ¡Generado!';
                setTimeout(() => { btn.textContent = orig; }, 2000);
            }
        });

        // Formateo y validación de Cód. Pedido al editarse manualmente
        $('pPaygoldRef')?.addEventListener('input', (e) => {
            let val = (e.target.value || '').trim().toUpperCase();
            if (val && !val.startsWith('GE-') && /^\d+$/.test(val)) {
                val = 'GE-' + val;
            }
            e.target.value = val;
        });

        $('btnCopyPaygoldRef')?.addEventListener('click', () => {
            const ref = $('pPaygoldRef')?.value;
            if (ref) {
                navigator.clipboard.writeText(ref).then(() => {
                    const btn = $('btnCopyPaygoldRef');
                    btn.textContent = '✅ Copiado!';
                    setTimeout(() => btn.textContent = '📋 Copiar', 2000);
                }).catch(() => alert('Código Pedido: ' + ref));
            }
        });

        // Send WhatsApp PayGold button
        $('btnSendWhatsAppPaygold')?.addEventListener('click', () => {
            const phoneRaw = $('pPhone')?.value || '';
            let phone = phoneRaw.replace(/\s+/g, '').replace(/[^\d]/g, '');
            if (!phone) {
                alert('⚠️ Introduce o revisa el teléfono del participante para enviar el WhatsApp.');
                return;
            }
            if (phone.length === 9 && !phone.startsWith('34')) {
                phone = '34' + phone;
            }

            const titular = $('pName')?.value || 'Cliente';
            const adults = $('pAdults')?.value || '1';
            const kids = $('pKids')?.value || '0';
            const rawEventTitle = ($('inputName')?.value || 'Cena Fin de año 2026 en Sercotel Guadiana').trim();
            const hasHotelInTitle = rawEventTitle.toLowerCase().includes('guadiana');
            const eventTitle = rawEventTitle;
            const total = $('pTotalCalc')?.value || '0.00';
            const pending = $('pPendingCalc')?.value || '0.00';
            const chargeDate = $('pChargeDate')?.value ? formatDate($('pChargeDate').value) : '';
            const paygoldRef = $('pPaygoldRef')?.value || '';
            const paygoldLink = ($('pPaygoldLink')?.value || '').trim();
            if (!paygoldLink) {
                alert('⚠️ Para enviar el WhatsApp con PayGold es OBLIGATORIO pegar el enlace generado en Eurocaja Rural.');
                $('pPaygoldLink')?.focus();
                return;
            }
            const cardLast4 = $('pCardLast4')?.value || '';

            let msg = hasHotelInTitle
                ? 'Hola ' + titular + ', le confirmamos su reserva para "' + eventTitle + '".\n\n'
                : 'Hola ' + titular + ', le confirmamos su reserva en Sercotel Guadiana para el evento "' + eventTitle + '".\n\n';
            const evtDate = $('inputDate')?.value ? formatDate($('inputDate').value) : '';
            if (evtDate) {
                msg += '📅 Fecha del evento: ' + evtDate + '\n';
            }
            msg += '👥 Asistentes: ' + adults + ' adulto(s)' + (parseInt(kids) > 0 ? ', ' + kids + ' niño(s)' : '') + '.\n';
            msg += '💶 Importe total: ' + total + ' € (Pendiente: ' + pending + ' €).\n\n';

            if (paygoldLink) {
                msg += '💳 Para formalizar su garantía bancaria oficial mediante Eurocaja Rural (TPV Seguro PayGold), por favor acceda al siguiente enlace:\n' + paygoldLink + '\n\n';
            } else if (cardLast4) {
                msg += '💳 Garantía bancaria registrada: Tarjeta terminada en •••• ' + cardLast4 + '.\n';
            }

            if (chargeDate) {
                msg += '📅 Fecha límite de pago: ' + chargeDate + '.\n';
                msg += '⚠️ A partir de esta fecha la cantidad será no reembolsable. Si el pago no se recibe en esta fecha, su reserva será cancelada por falta de pago.\n\n';
            }
            if (paygoldRef) {
                msg += '🔖 Ref. de pedido: ' + paygoldRef + '.\n\n';
            }

            msg += 'Si tiene cualquier duda o necesita realizar alguna modificación, responda a este mensaje.\n¡Muchas gracias!';

            const url = 'https://api.whatsapp.com/send?phone=' + phone + '&text=' + encodeURIComponent(msg);
            window.open(url, '_blank');

            if ($('pPaygoldStatus') && $('pPaygoldStatus').value === 'pendiente') {
                $('pPaygoldStatus').value = 'enlace_enviado';
            }
        });

        // [FIX] Real-time Dashboard Updates
        ['inputCapacity', 'inputPriceAdult', 'inputPriceChild'].forEach(id => {
            $(id)?.addEventListener('input', updateDashboard);
        });

        $('btnCloseCancelForm')?.addEventListener('click', () => window.toggleCancelForm());
        $('btnAddPayment')?.addEventListener('click', addPaymentToModal);
        $('btnPayFullPending')?.addEventListener('click', payFullPendingToModal);
        $('paymentsList')?.addEventListener('click', handlePaymentListClick);
        $('btnConfirmCancel')?.addEventListener('click', confirmCancel);
        $('btnShowCancel')?.addEventListener('click', () => {
            const btn = $('btnShowCancel');
            if (btn.dataset.action === 'recover') {
                const id = $('pId').value;
                handleRecover(id);
            } else {
                if (typeof window.toggleCancelForm === 'function') {
                    window.toggleCancelForm();
                } else {
                    console.error("toggleCancelForm not found");
                    // Fallback implementation
                    const form = $('divCancelForm');
                    form.classList.toggle('hidden');
                    if (!form.classList.contains('hidden')) {
                        $('txtCancelReason').value = '';
                        const containerAction = $('divCancelPaymentAction');
                        if (containerAction && state.modalPagos) {
                            const totalPaid = state.modalPagos.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
                            containerAction.style.display = totalPaid > 0 ? 'block' : 'none';
                        }
                    }
                }
            }
        });

        $('btnPrintMenu')?.addEventListener('click', (e) => {
            e.stopPropagation();
            $('printDropdown').classList.toggle('hidden');
        });

        // [FIX] Print Options Listeners
        document.querySelectorAll('.print-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = btn.dataset.printType;
                const eventId = state.currentEventId;
                if (!eventId) return;

                // Hide dropdown
                $('printDropdown').classList.add('hidden');

                // Logic to print
                if (type === 'participants') {
                    printGeneric(`Participantes - ${state.currentEvent.nombre}`, generateParticipantsPdf());
                } else if (type === 'tables') {
                    printGeneric(`Mesas - ${state.currentEvent.nombre}`, generateTablesPdf());
                } else if (type === 'financial') {
                    printGeneric(`Financiero - ${state.currentEvent.nombre}`, generateFinancialPdf());
                } else if (type === 'complete') {
                    const combined = generateParticipantsPdf() +
                        `<div class="section-break"></div>` +
                        generateTablesPdf() +
                        `<div class="section-break"></div>` +
                        generateFinancialPdf();
                    printGeneric(`Reporte Completo - ${state.currentEvent.nombre}`, combined);
                } else {
                    alert("Opción desconocida");
                }
            });
        });

        // [FIX] Map Button
        $('btnOpenMapWindow')?.addEventListener('click', () => {
            if (state.currentEventId) {
                window.open(`plano-evento.html?id=${state.currentEventId}`, '_blank');
            } else {
                alert("Primero debes guardar el evento o seleccionar uno.");
            }
        });

        $('btnNewEventParams')?.addEventListener('click', () => $('modalNewEvent').classList.remove('hidden'));
        $('btnCloseNewEvent')?.addEventListener('click', () => $('modalNewEvent').classList.add('hidden'));
        $('btnCreateNewEvent')?.addEventListener('click', handleCreateNewEvent);

        // Setup Modal Enviar Menú WhatsApp
        $('btnSendMenuWhatsApp')?.addEventListener('click', () => {
            const baseUrl = window.location.href.split('?')[0].replace(/[^/]*$/, '');
            const menuUrl = baseUrl + 'docs/Menu_Fin_de_Ano_Guadiana_2026.pdf';
            const evtName = state.currentEvent?.nombre || 'Cena Fin de Año 2026';
            const priceAd = state.currentEvent?.precioAdulto || '120';
            const priceCh = state.currentEvent?.precioNino || '30';

            const defaultMsg = `¡Hola! Le enviamos el Menú Oficial de la Gran ${evtName} en Sercotel Hotel Guadiana:\n\n` +
                `📄 Descargue y consulte el menú oficial en PDF aquí:\n${menuUrl}\n\n` +
                `✨ Incluye aperitivos de gala, ensalada de marisco con bogavante, lomito de rodaballo, lingote de cochinillo crujiente, postre de autor, bodega incluida, uvas de la suerte, cotillón y fiesta con DJ.\n` +
                `• Menú Adulto: ${priceAd} € (IVA inc.)\n` +
                `• Menú Infantil: ${priceCh} € (IVA inc.)\n\n` +
                `Para cualquier duda o confirmar su reserva, puede responder a este mensaje o llamarnos al 926 22 33 13.`;

            if ($('txtMenuWaMessage')) $('txtMenuWaMessage').value = defaultMsg;
            if ($('inputMenuWaPhone')) $('inputMenuWaPhone').value = '';
            $('modalSendMenuWhatsApp')?.classList.remove('hidden');
        });

        $('btnCloseMenuWhatsApp')?.addEventListener('click', () => $('modalSendMenuWhatsApp')?.classList.add('hidden'));
        $('btnCancelMenuWhatsApp')?.addEventListener('click', () => $('modalSendMenuWhatsApp')?.classList.add('hidden'));

        $('btnCopyMenuWaText')?.addEventListener('click', () => {
            const txt = $('txtMenuWaMessage')?.value || '';
            if (txt) {
                navigator.clipboard.writeText(txt).then(() => {
                    const btn = $('btnCopyMenuWaText');
                    if (btn) {
                        const orig = btn.innerHTML;
                        btn.innerHTML = '<span>✅</span> ¡Copiado!';
                        setTimeout(() => { btn.innerHTML = orig; }, 2000);
                    }
                });
            }
        });

        $('btnConfirmSendMenuWa')?.addEventListener('click', () => {
            const rawPhone = $('inputMenuWaPhone')?.value.replace(/\D/g, '') || '';
            let phone = '';
            if (rawPhone.length >= 9) {
                phone = rawPhone.length === 9 ? '34' + rawPhone : rawPhone;
            }
            const msg = encodeURIComponent($('txtMenuWaMessage')?.value || '');
            const waUrl = phone
                ? `https://api.whatsapp.com/send?phone=${phone}&text=${msg}`
                : `https://api.whatsapp.com/send?text=${msg}`;
            window.open(waUrl, '_blank');
            $('modalSendMenuWhatsApp')?.classList.add('hidden');
        });

        // Setup global cancel toggler
        window.toggleCancelForm = function () {
            const form = $('divCancelForm');
            form.classList.toggle('hidden');
            if (!form.classList.contains('hidden')) {
                $('txtCancelReason').value = '';
                const totalPaid = state.modalPagos.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
                const containerAction = $('divCancelPaymentAction');
                if (containerAction) {
                    containerAction.style.display = totalPaid > 0 ? 'block' : 'none';
                }
            }
        };

        // [FIX] Smart Back Button
        const backLink = $('linkHeaderBack');
        if (backLink) {
            backLink.addEventListener('click', (e) => {
                // If we are in Detail View, go back to List instead of Home
                if (!$('view-detail').classList.contains('hidden')) {
                    e.preventDefault();
                    showListView();
                }
            });
        }
    }

    async function showListView() {
        // Check for unsaved changes
        if (state.hasUnsavedChanges) {
            if (!confirm('⚠️ Hay cambios sin guardar. ¿Deseas continuar sin guardar?')) {
                return; // Cancel navigation
            }
        }

        $('view-detail').classList.add('hidden');
        $('view-list').classList.remove('hidden');

        // Update Back Button Text
        const backLink = $('linkHeaderBack');
        if (backLink) backLink.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg> Volver al Inicio`;

        // Clear URL param
        try {
            window.history.pushState({}, document.title, window.location.pathname);
        } catch (e) { console.warn("History API restricted on file://"); }

        // Reset unsaved changes flag when leaving detail view
        state.hasUnsavedChanges = false;

        // Refresh event list to show any changes made
        await refreshEventsList();
    }

    async function renderEventsList(events) {
        const tbody = $('eventsListBody');
        tbody.innerHTML = '';
        if (events.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-slate-500">No se encontraron eventos.</td></tr>`;
            return;
        }
        events.forEach(e => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="font-mono text-xs bg-slate-100 px-2 py-1 rounded">${e.referencia || 'Auto'}</span></td>
                <td>${formatDate(e.fecha)}</td>
                <td class="font-semibold text-slate-700">${e.nombre}</td>
                <td>${e.salonId}</td>
                <td>${e.capacidad || 0}</td>
                <td>${e.stats?.totalPax || '-'}</td>
                <td>${renderStatusBadge(e.estado)}</td>
                <td><button class="btn-action open-event" data-id="${e.id}">Gestionar</button></td>
            `;
            tr.querySelector('.open-event').addEventListener('click', () => loadEventDetail(e.id));
            tbody.appendChild(tr);
        });
    }

    function renderStatusBadge(status) {
        const isClosed = status === 'completo' || status === 'cerrado';
        return `<span class="status-badge ${isClosed ? 'status-closed' : 'status-open'}">${isClosed ? 'Completo' : 'Abierto'}</span>`;
    }

    async function loadEventDetail(eventId) {
        $('view-list').classList.add('hidden');
        $('view-detail').classList.remove('hidden');

        // [FIX] Update Back Button Text
        const backLink = $('linkHeaderBack');
        if (backLink) backLink.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg> Volver a la Lista`;

        try {
            const event = await API.fetchEventDetails(eventId);
            state.currentEvent = event;
            state.currentEventId = eventId;

            $('inputRef').value = event.referencia;
            $('inputName').value = event.nombre;
            $('inputDate').value = event.fecha;
            $('inputSalon').value = event.salonId;
            $('inputCapacity').value = event.capacidad || 0;
            $('inputPriceAdult').value = event.precioAdulto || 0;
            $('inputPriceChild').value = event.precioNino || 0;

            // Update status badge and toggle button based on event status
            const status = event.estado || 'abierto';
            const badge = $('eventStatusBadge');
            if (badge) {
                badge.textContent = status === 'completo' ? 'CERRADO' : (status === 'anulado' ? 'ANULADO' : 'ABIERTO');
                badge.className = status === 'completo' ? 'status-badge status-closed' : (status === 'anulado' ? 'status-badge status-closed' : 'status-badge status-open');
            }

            const btn = $('btnToggleStatus');
            if (btn) {
                btn.textContent = status === 'completo' ? 'Reabrir Evento' : 'Marcar Completo';
            }

            // Reset unsaved changes flag when loading event
            state.hasUnsavedChanges = false;

            // Add change listeners to detect unsaved changes
            const configInputs = ['inputName', 'inputDate', 'inputCapacity', 'inputPriceAdult', 'inputPriceChild'];
            configInputs.forEach(id => {
                const input = $(id);
                if (input) {
                    input.addEventListener('input', () => {
                        state.hasUnsavedChanges = true;
                    });
                }
            });

            await loadParticipants(eventId);
        } catch (e) { console.error(e); }
    }

    async function loadParticipants(eventId) {
        state.participants = await API.fetchParticipants(eventId);
        renderParticipantsTable();
        updateDashboard();
    }

    function renderParticipantsTable() {
        const tbody = $('participantsTableBody');
        tbody.innerHTML = '';
        const filter = $('filterParticipants').value;
        const filtered = state.participants.filter(p => {
            if (filter === 'todos') return true;
            if (filter === 'anulado') return p.estado && p.estado.startsWith('anulado');
            return !p.estado || p.estado === 'activo';
        });
        filtered.sort((a, b) => (a.secuencia || 0) - (b.secuencia || 0));

        filtered.forEach(p => {
            const isAnulado = p.estado && p.estado.startsWith('anulado');
            const tr = document.createElement('tr');
            if (isAnulado) tr.classList.add('bg-red-50');

            const paid = (p.pagos || []).reduce((acc, pay) => acc + (parseFloat(pay.amount) || 0), 0) + (parseFloat(p.pagado) || 0);

            // [FIX] Calculate total and pending
            const priceAdult = parseFloat($('inputPriceAdult')?.value) || 0;
            const priceChild = parseFloat($('inputPriceChild')?.value) || 0;
            const isIncluded = p.servicioIncluido || false;

            // Always calculate real total
            const total = ((parseInt(p.adultos) || 0) * priceAdult) + ((parseInt(p.ninos) || 0) * priceChild);

            // If included, add total to paid automatically
            const displayPaid = isIncluded ? (paid + total) : paid;
            const pending = Math.max(0, total - displayPaid);

            // Display logic for pending column
            let pendingDisplay;
            if (isIncluded) {
                pendingDisplay = '<span class="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Incluido</span>';
            } else if (pending > 0) {
                pendingDisplay = `<span class="font-mono text-xs text-orange-600 font-semibold">${formatCurrency(pending)}</span>`;
            } else {
                pendingDisplay = '<span class="font-mono text-xs text-slate-400">-</span>';
            }

            // Total always shows real amount
            const totalDisplay = total > 0 ? formatCurrency(total) : '-';

            // Guadiana PayGold & Charge Date badges
            const isGuadiana = (state.hotelInfo.id || getActiveHotel()) === 'Guadiana';
            let chargeBadges = '';
            if (isGuadiana && !isAnulado) {
                if (p.chargeDate && pending > 0) {
                    const todayStr = new Date().toISOString().split('T')[0];
                    if (p.chargeDate < todayStr) {
                        chargeBadges += '<span class="inline-block mt-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-red-100 text-red-700 border border-red-200" title="Cargo vencido el ' + formatDate(p.chargeDate) + '">⚠️ Vencido: ' + formatDate(p.chargeDate) + '</span>';
                    } else if (p.chargeDate === todayStr) {
                        chargeBadges += '<span class="inline-block mt-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-300 animate-pulse" title="Cargo programado para HOY">🔔 Cobrar HOY</span>';
                    } else {
                        chargeBadges += '<span class="inline-block mt-0.5 px-1.5 py-0.5 text-[9px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200" title="Fecha prevista de cargo">📅 Cargo: ' + formatDate(p.chargeDate) + '</span>';
                    }
                }
                if (p.cardLast4) {
                    chargeBadges += '<span class="inline-block mt-0.5 ml-1 px-1.5 py-0.5 text-[9px] font-mono rounded bg-slate-100 text-slate-700 border border-slate-200">💳 •••• ' + p.cardLast4 + '</span>';
                }
            }

            tr.innerHTML = `
                <td class="font-mono text-xs">${p.mesa || '-'}</td>
                <td class="font-medium ${isAnulado ? 'text-red-700 line-through' : 'text-slate-800'}">
                    ${p.titular} <br> <span class="text-[10px] text-slate-500">${p.referencia || (p.id ? 'P-' + p.id.slice(-6) : '-')}</span>
                    ${chargeBadges ? '<div class="mt-0.5 flex flex-wrap gap-1 items-center">' + chargeBadges + '</div>' : ''}
                </td>
                <td class="text-xs text-slate-500">${formatPhoneES(p.telefono) || '-'}</td>
                <td><span class="font-bold">${p.adultos}</span> / ${p.ninos}</td>
                <td class="font-mono text-xs">${totalDisplay}</td>
                <td class="font-mono text-xs text-green-700">${formatCurrency(displayPaid)}</td>
                <td>${pendingDisplay}</td>
                <td><button class="btn-action edit-p" data-id="${p.id}">Editar</button></td>
            `;
            tr.querySelector('.edit-p').addEventListener('click', () => openParticipantModal(p));
            tbody.appendChild(tr);
        });
    }

    function updateDashboard() {
        const capacity = parseInt($('inputCapacity').value) || 0;
        const stats = calculateStats(state.participants, capacity);

        $('statTotalPax').textContent = stats.totalPax;
        if ($('statAdults')) $('statAdults').textContent = stats.totalAdults;
        if ($('statKids')) $('statKids').textContent = stats.totalKids;
        $('statOccupancy').textContent = stats.occupancy + '%';

        // [FIX] Update Context Label
        const lblCap = $('lblCapacity');
        if (lblCap) lblCap.textContent = capacity;

        // [FIX] Color Logic (> 100% Red Background)
        const occVal = parseFloat(stats.occupancy);
        const occElem = $('statOccupancy');
        const cardElem = $('statCardOccupancy');

        if (occElem && cardElem) {
            if (occVal > 100) {
                // Warning State
                occElem.classList.remove('text-slate-800');
                occElem.classList.add('text-red-700');

                cardElem.classList.remove('bg-white', 'border-slate-200');
                cardElem.classList.add('bg-red-100', 'border-red-400', 'animate-pulse'); // Dramatic effect
            } else {
                // Normal State
                occElem.classList.remove('text-red-700', 'text-red-600'); // Clean cleanup
                occElem.classList.add('text-slate-800');

                cardElem.classList.remove('bg-red-100', 'border-red-400', 'animate-pulse');
                cardElem.classList.add('bg-white', 'border-slate-200');
            }
        }

        $('statCollected').textContent = formatCurrency(stats.totalCollected);
        $('statPending').textContent = formatCurrency(stats.totalPending);
        $('statCancelledAmount').textContent = formatCurrency(stats.totalCancelledAmount);
        $('lblAvailableSeats').textContent = stats.available;
        $('lblAvailableSeats').style.color = stats.available < 0 ? '#ef4444' : '#0f172a';
    }

    function updateChargeAlertBadge() {
        const badge = $('pChargeAlertBadge');
        const input = $('pChargeDate');
        if (!badge || !input) return;
        const val = input.value;
        if (!val) {
            badge.style.display = 'none';
            return;
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [y, m, d] = val.split('-').map(Number);
        const target = new Date(y, m - 1, d);
        const diffTime = target.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        badge.style.display = 'block';
        if (diffDays < 0) {
            badge.style.color = '#b91c1c';
            badge.innerHTML = '<span style="background:#fee2e2; padding:2px 6px; border-radius:4px; border:1px solid #fca5a5;">⚠️ Cargo Vencido hace ' + Math.abs(diffDays) + ' día(s)</span>';
        } else if (diffDays === 0) {
            badge.style.color = '#b45309';
            badge.innerHTML = '<span style="background:#fef3c7; padding:2px 6px; border-radius:4px; border:1px solid #fcd34d; font-weight:700;">🔔 ¡Cargo programado para HOY!</span>';
        } else if (diffDays === 1) {
            badge.style.color = '#b45309';
            badge.innerHTML = '<span style="background:#fef3c7; padding:2px 6px; border-radius:4px; border:1px solid #fcd34d;">⏰ Cargo mañana</span>';
        } else {
            badge.style.color = '#15803d';
            badge.innerHTML = '<span style="background:#dcfce7; padding:2px 6px; border-radius:4px; border:1px solid #86efac;">🟢 En plazo (en ' + diffDays + ' días)</span>';
        }
    }

    
    function updatePaygoldStatusStyle() {
        const sel = $('pPaygoldStatus');
        if (!sel) return;
        const val = sel.value;
        if (val === 'garantizado') {
            sel.style.backgroundColor = '#dcfce7';
            sel.style.borderColor = '#16a34a';
            sel.style.color = '#15803d';
        } else if (val === 'enlace_enviado') {
            sel.style.backgroundColor = '#eff6ff';
            sel.style.borderColor = '#3b82f6';
            sel.style.color = '#1d4ed8';
        } else {
            sel.style.backgroundColor = '#fffbeb';
            sel.style.borderColor = '#f59e0b';
            sel.style.color = '#b45309';
        }
    }
    
    function openParticipantModal(participant = null) {
        const modal = $('modalParticipant');
        modal.classList.remove('hidden');
        if (participant) {
            state.modalPagos = participant.pagos ? [...participant.pagos] : [];
            $('pId').value = participant.id;
            $('pName').value = participant.titular;
            $('pPhone').value = formatPhoneES(participant.telefono || '');
            $('pEmail').value = participant.email || '';
            $('pAdults').value = participant.adultos;
            $('pKids').value = participant.ninos;
            $('pObservaciones').value = participant.observaciones || '';

            // Servicio Incluido checkbox
            $('pServicioIncluido').checked = participant.servicioIncluido || false;

            // Display timestamps
            $('pCreatedAt').value = formatTimestamp(participant.createdAt);
            $('pUpdatedAt').value = formatTimestamp(participant.updatedAt);

            // [FIX] Store Old Pax to avoid calculation errors on save
            const oldTotal = (parseInt(participant.adultos) || 0) + (parseInt(participant.ninos) || 0);
            $('pOldPax').value = oldTotal;
            // Guadiana PayGold fields
            if ($('pPaygoldRef')) {
                $('pPaygoldRef').value = participant.paygoldRef || ('GE-' + (participant.referencia || (participant.id ? participant.id.slice(-6).toUpperCase() : Math.floor(100000 + Math.random() * 900000))));
            }
            if ($('pChargeDate')) $('pChargeDate').value = participant.chargeDate || '';
            if ($('pPaygoldStatus')) $('pPaygoldStatus').value = participant.paygoldStatus || 'pendiente';
            if ($('pCardLast4')) $('pCardLast4').value = participant.cardLast4 || '';
            if ($('pCardExpiry')) $('pCardExpiry').value = participant.cardExpiry || '';
            if ($('pCardBrand')) $('pCardBrand').value = participant.cardBrand || 'Visa';
            if ($('pPaygoldLink')) $('pPaygoldLink').value = participant.paygoldLink || '';

            const btnCancel = $('btnShowCancel');
            if (participant.estado && participant.estado.startsWith('anulado')) {
                btnCancel.textContent = "Recuperar Reserva";
                // Check if listener already exists? No, just clone to strip old ones if necessary or handle state
                // Simplest: just set usage in listener via state check or unique buttons.
                // But here we're swapping behavior.
                // Let's rely on a global state or class to switch logic in the event listener.
                btnCancel.dataset.action = "recover";
            } else {
                btnCancel.textContent = "Anular Participación";
                btnCancel.dataset.action = "cancel";
            }
            btnCancel.style.display = 'block';
        } else {
            state.modalPagos = [];
            $('pId').value = '';
            $('formParticipant').reset();
            $('btnShowCancel').style.display = 'none';
            $('pCollectionDate').value = new Date().toISOString().split('T')[0];
            $('pAdults').value = 1;
            $('pAdults').value = 1;
            $('pOldPax').value = 0;
            $('pServicioIncluido').checked = false;
            $('pCreatedAt').value = 'No disponible';
            $('pUpdatedAt').value = 'No disponible';
            // Guadiana PayGold defaults
            if ($('pPaygoldRef')) $('pPaygoldRef').value = 'GE-' + Math.floor(100000 + Math.random() * 900000);
            if ($('pChargeDate')) $('pChargeDate').value = '';
            if ($('pPaygoldStatus')) $('pPaygoldStatus').value = 'pendiente';
            if ($('pCardLast4')) $('pCardLast4').value = '';
            if ($('pCardExpiry')) $('pCardExpiry').value = '';
            if ($('pCardBrand')) $('pCardBrand').value = 'Visa';
            if ($('pPaygoldLink')) $('pPaygoldLink').value = '';
        }

        // [FIX] Set Default Date to Today
        $('newPayDate').value = new Date().toISOString().split('T')[0];

        renderModalPayments();
        recalcModalFinancials();
        // Toggle Guadiana Paygold Section vs Servicio Incluido Notice
        const isGuadianaModal = (state.hotelInfo.id || getActiveHotel()) === 'Guadiana';
        const isIncluded = $('pServicioIncluido')?.checked || false;
        const secGuadiana = $('sectionGuadianaPaygold');
        const noticeIncluded = $('noticeServicioIncluido');
        if (secGuadiana) secGuadiana.style.display = (isGuadianaModal && !isIncluded) ? 'block' : 'none';
        if (noticeIncluded) noticeIncluded.style.display = isIncluded ? 'block' : 'none';
        updateChargeAlertBadge();
        updatePaygoldStatusStyle();
    }

    function recalcModalFinancials() {
        // Simple recalc visual logic if needed
        const adults = parseInt($('pAdults').value) || 0;
        const kids = parseInt($('pKids').value) || 0;
        const isServiceIncluded = $('pServicioIncluido')?.checked || false;
        const priceAd = parseFloat($('inputPriceAdult').value) || 0;
        const priceCh = parseFloat($('inputPriceChild').value) || 0;

        let total = 0;
        if (!isServiceIncluded) {
            total = (adults * priceAd) + (kids * priceCh);
        }

        const paid = state.modalPagos.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

        $('pTotalCalc').value = total.toFixed(2);
        $('pPaidSummary').value = paid.toFixed(2);
        $('pPendingCalc').value = Math.max(0, total - paid).toFixed(2);

        // Toggle Guadiana Paygold Section vs Servicio Incluido Notice
        const isGuadianaModal = (state.hotelInfo.id || getActiveHotel()) === 'Guadiana';
        const secGuadiana = $('sectionGuadianaPaygold');
        const noticeIncluded = $('noticeServicioIncluido');
        if (secGuadiana) secGuadiana.style.display = (isGuadianaModal && !isServiceIncluded) ? 'block' : 'none';
        if (noticeIncluded) noticeIncluded.style.display = isServiceIncluded ? 'block' : 'none';
    }

    async function handleParticipantSubmit(e) {
        e.preventDefault();
        const newAdults = parseInt($('pAdults').value) || 0;
        const newKids = parseInt($('pKids').value) || 0;
        const newTotal = newAdults + newKids;

        // [FIX] Capacity Check
        const currentCap = parseInt($('inputCapacity').value) || 0;
        if (currentCap > 0) {
            const pId = $('pId').value;
            // No password required for modifying participants

            // DEBUG: Log current state
            console.log('=== CAPACITY CHECK DEBUG ===');
            console.log('pId from input:', pId, 'Type:', typeof pId);
            console.log('Total participants in state:', state.participants.length);
            console.log('Participant IDs:', state.participants.map(p => ({ id: p.id, type: typeof p.id, titular: p.titular })));

            // Calculate usage of ALL OTHER participants (excluding this one if editing)
            const otherParticipants = state.participants.filter(p => {
                const match = p.id !== pId;
                console.log(`Comparing p.id="${p.id}" (${typeof p.id}) !== pId="${pId}" (${typeof pId}): ${match}`);
                return match;
            });

            console.log('Filtered to', otherParticipants.length, 'other participants');

            const statsOthers = calculateStats(otherParticipants, currentCap);

            const currentOccupiedOther = statsOthers.totalPax;
            const futureOccupied = currentOccupiedOther + newTotal;

            console.log(`Capacity Check: Cap=${currentCap}, Others=${currentOccupiedOther}, New=${newTotal}, Future=${futureOccupied}`);
            console.log('=== END DEBUG ===');

            if (futureOccupied > currentCap) {
                const overflow = futureOccupied - currentCap;
                if (!confirm(`⚠️ AFORO EXCEDIDO\n\nEl evento tiene un aforo de ${currentCap} personas.\nCon estos cambios, se alcanzarán ${futureOccupied} personas (Exceso: ${overflow}).\n\n¿Deseas continuar de todas formas?`)) {
                    return; // Abort
                }
            }
        }

        const data = {
            id: $('pId').value || null,
            eventoId: state.currentEventId,
            titular: $('pName').value,
            telefono: formatPhoneES($('pPhone').value),
            email: $('pEmail').value,
            adultos: newAdults,
            ninos: newKids,
            observaciones: $('pObservaciones').value || '',
            pagos: state.modalPagos,
            servicioIncluido: $('pServicioIncluido')?.checked || false,
            // Guadiana PayGold & Card fields
            paygoldRef: $('pPaygoldRef')?.value || '',
            chargeDate: $('pChargeDate')?.value || '',
            paygoldStatus: $('pServicioIncluido')?.checked ? 'garantizado' : ($('pPaygoldStatus')?.value || 'pendiente'),
            cardLast4: $('pCardLast4')?.value ? $('pCardLast4').value.replace(/\D/g, '').slice(-4) : '',
            cardExpiry: $('pCardExpiry')?.value || '',
            cardBrand: $('pCardBrand')?.value || 'Visa',
            paygoldLink: $('pPaygoldLink')?.value || ''
        };
        try {
            await API.saveParticipant(data);
            closeParticipantModal();
            // [FIX] Reload participants immediately to get fresh IDs from Firebase
            await loadParticipants(state.currentEventId);
        } catch (err) { console.error(err); alert("Error al guardar"); }
    }

    function renderModalPayments() {
        const container = $('paymentsList');
        if (!container) return;
        container.innerHTML = '';
        state.modalPagos.forEach((p, idx) => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-white p-2 border border-slate-200 rounded text-xs";
            div.innerHTML = `<span>${formatDate(p.date)}</span><span class="font-bold text-slate-700">${formatCurrency(p.amount)}</span><button type="button" class="text-red-500 hover:text-red-700 btn-remove-pay" data-idx="${idx}">&times;</button>`;
            container.appendChild(div);
        });
    }

    function payFullPendingToModal() {
        const pending = parseFloat($('pPendingCalc')?.value || 0);
        if (pending > 0) {
            const date = $('newPayDate')?.value || new Date().toISOString().split('T')[0];
            state.modalPagos.push({
                date,
                amount: pending,
                method: 'PayGold Eurocaja',
                notes: 'Abono total registrado'
            });
            $('newPayDate').value = new Date().toISOString().split('T')[0];
            $('newPayAmount').value = '';
            renderModalPayments();
            recalcModalFinancials();

            if ($('pPaygoldStatus') && $('pPaygoldStatus').value !== 'garantizado') {
                $('pPaygoldStatus').value = 'garantizado';
                updatePaygoldStatusStyle();
            }
        } else {
            alert('No hay importe pendiente por abonar.');
        }
    }

    function addPaymentToModal() {
        const date = $('newPayDate').value;
        const amount = parseFloat($('newPayAmount').value);
        if (date && amount) {
            state.modalPagos.push({ date, amount });

            // [FIX] Reset key fields but keep date as today for convenience
            $('newPayDate').value = new Date().toISOString().split('T')[0];
            $('newPayAmount').value = '';
            renderModalPayments();
            recalcModalFinancials();
        }
    }

    // [FIX] Cancellation Logic
    $('btnConfirmCancel')?.addEventListener('click', confirmCancel);

    async function confirmCancel() {
        const id = $('pId').value;
        const reason = $('txtCancelReason').value;
        const action = $('selCancelAction').value; // refund | keep

        if (!id) return alert("No se puede identificar al participante.");
        if (!reason) return alert("Indica un motivo.");
        
        if (!confirm("¿Confirmar anulación del participante?")) return;

        const newState = action === 'keep' ? 'anulado-con-cargos' : 'anulado-sin-cargos';

        try {
            // [FIX] Use saveParticipant instead of non-existent updateParticipant
            // Get current participant data first
            const currentP = state.participants.find(p => p.id === id);
            if (!currentP) throw new Error("Participante no encontrado en el estado");

            await API.saveParticipant({
                ...currentP,
                id: id,
                estado: newState,
                observaciones: (currentP.observaciones || '') + ` [ANULADO: ${reason}]`
            });

            alert("Participante anulado correctamente.");
            toggleCancelForm(); // Hide mini-form
            closeParticipantModal(); // Hide main modal

            // Refresh
            if (state.currentEventId) {
                state.participants = await API.fetchParticipants(state.currentEventId);
                renderParticipantsTable();
                updateDashboard();
            }

        } catch (e) {
            console.error(e);
            alert("Error al anular: " + e.message);
        }
    }

    function handlePaymentListClick(e) {
        // [FIX] Robuster Event Delegation
        const btn = e.target.closest(".btn-remove-pay");
        if (btn) {
            e.preventDefault();
            e.stopPropagation(); // Stop bubbling
            const idx = parseInt(btn.dataset.idx);
            console.log("Deleting payment at index:", idx);

            if (state.modalPagos[idx]) {
                state.modalPagos.splice(idx, 1);
                renderModalPayments();
                recalcModalFinancials();
            }
        }
    }



    async function handleRecover(id) {
        if (!confirm("¿Recuperar?")) return;
        await API.recoverParticipant(id);
        closeParticipantModal();
        loadParticipants(state.currentEventId);
    }

    function closeParticipantModal() { $('modalParticipant').classList.add('hidden'); }
    function closeParticipantModal() { $('modalParticipant').classList.add('hidden'); }

    // [FIX] Toggle Status Implementation
    async function toggleStatus() {
        if (!state.currentEventId) return;
        const current = state.currentEvent.estado;
        const newState = (current === 'completo' || current === 'cerrado') ? 'abierto' : 'completo';

        if (!confirm(`¿Cambiar estado a ${newState.toUpperCase()}?`)) return;

        try {
            await API.updateEvent(state.currentEventId, { estado: newState });
            state.currentEvent.estado = newState;
            await API.updateEvent(state.currentEventId, { estado: newState });
            state.currentEvent.estado = newState;
            // Refresh UI
            // [FIX] Correct ID: eventStatusBadge
            $('eventStatusBadge').textContent = newState === 'completo' ? 'Completo' : 'Abierto';
            $('eventStatusBadge').className = `px-3 py-1 rounded-full text-xs font-bold ${newState === 'completo' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`;
            alert(`Estado actualizado a ${newState}`);
        } catch (e) { console.error(e); alert("Error actualizando estado"); }
    }

    // --- MAIN.JS ---
    let isAppInitialized = false;
    async function init() {
        if (isAppInitialized) return;
        isAppInitialized = true;
        console.log("Grandes Eventos Module (Bundled) Init");
        initEventListeners();

        // Update Header UI
        updateHeaderHotelDisplay();

        // Ensure defaults
        const viewList = $('view-list');
        const viewDetail = $('view-detail');
        if (viewList) viewList.classList.remove('hidden');
        if (viewDetail) viewDetail.classList.add('hidden');

        try {
            await refreshEventsList();
        } catch (e) { console.warn("Error fetching events or DB not ready", e); }
    }

    function startApp() {
        ensureAuth(() => {
            init();
        });
    }

    // Initialize when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApp);
    } else {
        startApp();
    }

    // Logic for creating event
    async function handleCreateNewEvent() {
        const sName = $('newEvtSalon')?.value;
        const eName = $('newEvtName')?.value?.trim();
        const eDate = $('newEvtDate')?.value;

        if (!eName || !eDate || !sName) {
            return alert("Por favor, completa todos los campos (Nombre, Fecha y Salón).");
        }

        const salonObj = cachedSalonsForNewEvent.find(s => s.name === sName);
        const defaultCap = salonObj ? (parseInt(salonObj.pax) || 0) : 0;
        const currentHotel = state.hotelInfo.id || "Guadiana";

        const data = {
            nombre: eName,
            fecha: eDate,
            hotel: currentHotel,
            salonId: sName,
            capacidad: defaultCap,
            precioAdulto: 0,
            precioNino: 0
        };

        try {
            const id = await API.createEvent(data);
            if (!id) {
                throw new Error("No se pudo obtener el identificador del nuevo evento.");
            }

            // Create Blocking Reservation in Salones
            if (window.db) {
                console.log("Creando bloqueo de salón para Gran Evento...");
                try {
                    await window.db.collection("reservas_salones").add({
                        hotel: currentHotel,
                        salon: sName,
                        cliente: eName,
                        fecha: eDate,
                        estado: 'confirmada',
                        revisado: true,
                        tipoEvento: "Gran Evento",
                        eventoId: id,
                        origen: 'grandes_eventos',
                        referenciaPresupuesto: 'GE-' + id.substring(0, 4),
                        contact: { tel: "", email: "" },
                        detalles: {
                            jornada: "todo",
                            montaje: "banquete",
                            hora: "12:00",
                            pax_adultos: 0,
                            pax_ninos: 0
                        },
                        notas: {
                            interna: "Bloqueo automático por Gran Evento",
                            cliente: ""
                        },
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch (resErr) {
                    console.warn("Advertencia: No se pudo crear el bloqueo en reservas_salones:", resErr);
                }
            }

            $('modalNewEvent').classList.add('hidden');
            await loadEventDetail(id);
        } catch (e) {
            console.error("Error creando evento:", e);
            alert("Error creando evento: " + (e.message || "Error desconocido"));
        }
    }

    // Logic to open New Event Modal and Populate Salons
    let cachedSalonsForNewEvent = []; // Store for lookup

    $('btnNewEventParams')?.addEventListener('click', async () => {
        $('modalNewEvent').classList.remove('hidden');
        if ($('newEvtName')) $('newEvtName').value = '';
        if ($('newEvtDate')) $('newEvtDate').value = '';

        // Populate Salons
        const sel = $('newEvtSalon');
        if (sel) {
            sel.innerHTML = '<option value="">Cargando salones...</option>';
            const config = await API.fetchSalonConfig();
            sel.innerHTML = '';

            const hotelKey = state.hotelInfo.id || "Guadiana";
            let salons = [];

            if (config && Array.isArray(config[hotelKey]) && config[hotelKey].length > 0) {
                salons = config[hotelKey].filter(s => s && s.active !== false && s.name);
            }

            // Real fallbacks per hotel if config is unavailable
            if (!salons || salons.length === 0) {
                if (hotelKey === "Cumbria") {
                    salons = [
                        { name: "Salón Mercurio", pax: 90 },
                        { name: "Salón Venus (sala de Gym)", pax: 90 },
                        { name: "Salón La Tierra", pax: 70 },
                        { name: "Salón Marte", pax: 90 },
                        { name: "Salón Saturno", pax: 70 },
                        { name: "Desp 12", pax: 10 }
                    ];
                } else {
                    salons = [
                        { name: "Puerta de Alarcos", pax: 800 },
                        { name: "Puerta de Calatrava (Buffet)", pax: 135 },
                        { name: "Puerta del Carmen", pax: 120 },
                        { name: "Puerta de Ciruela", pax: 20 },
                        { name: "Puerta de Granada", pax: 135 },
                        { name: "Puerta de Santa María", pax: 80 },
                        { name: "Puerta de Toledo", pax: 160 }
                    ];
                }
            }

            cachedSalonsForNewEvent = salons;

            salons.forEach((s, idx) => {
                const opt = document.createElement('option');
                opt.value = s.name;
                const paxText = (s.pax && s.pax > 0) ? ` (Aforo: ${s.pax})` : '';
                opt.textContent = `${s.name}${paxText}`;
                if (idx === 0) opt.selected = true;
                sel.appendChild(opt);
            });
        }
    });

    $('btnCloseNewEvent')?.addEventListener('click', () => {
        $('modalNewEvent').classList.add('hidden');
    });

    $('btnCreateNewEvent')?.addEventListener('click', handleCreateNewEvent);

    $('btnCancelEvent')?.addEventListener('click', handleCancelEvent);

    async function saveConfig() {
        const id = state.currentEventId;
        if (!id) return;

        const updates = {
            nombre: $('inputName').value,
            fecha: $('inputDate').value,
            capacidad: parseInt($('inputCapacity').value) || 0,
            precioAdulto: parseFloat($('inputPriceAdult').value) || 0,
            precioNino: parseFloat($('inputPriceChild').value) || 0,
        };
        try {
            await API.updateEvent(id, updates);
            state.hasUnsavedChanges = false; // Reset flag after save
            state.currentEvent = { ...state.currentEvent, ...updates };

            // Update UI without reload
            updateDashboard();

            // Show success feedback
            const btn = $('btnSaveEventConfig');
            const originalText = btn ? btn.textContent : '';
            if (btn) {
                btn.textContent = '✓ Guardado';
                btn.style.backgroundColor = '#10b981';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.backgroundColor = '';
                }, 2000);
            } else {
                alert('Guardado.');
            }
        } catch (e) { console.error(e); alert('Error al guardar.'); }
    }

    async function toggleStatus() {
        if (!state.currentEventId || !state.currentEvent) {
            alert('No hay evento cargado');
            return;
        }

        const currentStatus = state.currentEvent.estado || 'abierto';
        const newStatus = currentStatus === 'completo' ? 'abierto' : 'completo';

        try {
            await API.updateEvent(state.currentEventId, { estado: newStatus });
            state.currentEvent.estado = newStatus;

            // Update button text and badge
            const btn = $('btnToggleStatus');
            if (btn) {
                btn.textContent = newStatus === 'completo' ? 'Reabrir Evento' : 'Marcar Completo';
            }

            // Update status badge if exists
            const badge = $('eventStatusBadge');
            if (badge) {
                badge.textContent = newStatus === 'completo' ? 'CERRADO' : 'ABIERTO';
                badge.className = newStatus === 'completo' ? 'status-badge status-closed' : 'status-badge status-open';
            }

            // Visual feedback on button instead of alert
            if (btn) {
                const originalBg = btn.style.backgroundColor;
                btn.style.backgroundColor = '#10b981';
                setTimeout(() => {
                    btn.style.backgroundColor = originalBg;
                }, 1500);
            }
        } catch (err) {
            console.error('Error updating status:', err);
            alert('Error al actualizar el estado');
        }
    }

    async function refreshEventsList() {
        try {
            const events = await API.fetchEvents();

            const statusFilter = $('listStatusFilter')?.value || 'todos';
            const dateFilter = $('listDateFilter')?.value || '';
            const searchVal = ($('listSearch')?.value || '').toLowerCase().trim();

            const filtered = events.filter(e => {
                // Status Filter
                if (statusFilter === 'abierto') {
                    if (e.estado === 'completo' || e.estado === 'cerrado' || e.estado === 'anulado') return false;
                } else if (statusFilter === 'completo') {
                    if (e.estado !== 'completo' && e.estado !== 'cerrado') return false;
                } else if (statusFilter === 'anulado') {
                    if (e.estado !== 'anulado') return false;
                }

                // Date Filter
                if (dateFilter && e.fecha !== dateFilter) {
                    return false;
                }

                // Search Filter
                if (searchVal) {
                    const ref = (e.referencia || '').toLowerCase();
                    const name = (e.nombre || '').toLowerCase();
                    const salon = (e.salonId || '').toLowerCase();
                    if (!ref.includes(searchVal) && !name.includes(searchVal) && !salon.includes(searchVal)) {
                        return false;
                    }
                }

                return true;
            });

            renderEventsList(filtered);

        } catch (e) { console.warn("Error refreshing events", e); }
    }

    async function handleCancelEvent() {
        if (!state.currentEventId || !state.currentEvent) {
            alert('No hay evento cargado');
            return;
        }

        const eventName = state.currentEvent.nombre || 'este evento';
        const confirmMessage = `⚠️ ANULAR EVENTO\n\n¿Estás seguro de que deseas anular "${eventName}"?\n\nEsta acción:\n- Marcará el evento como ANULADO\n- Liberará la reserva del salón\n- NO eliminará ningún dato\n\n¿Deseas continuar?`;

        if (!checkSecurity()) return;
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            const { salonId, fecha } = state.currentEvent;
            await API.cancelEvent(state.currentEventId, salonId, fecha);

            // Update local state
            state.currentEvent.estado = 'anulado';

            // Update badge dynamically
            const badge = $('eventStatusBadge');
            if (badge) {
                badge.textContent = 'ANULADO';
                badge.className = 'status-badge status-closed';
            }

            // Disable action buttons
            const btnToggle = $('btnToggleStatus');
            const btnSave = $('btnSaveEventConfig');
            const btnCancel = $('btnCancelEvent');
            if (btnToggle) btnToggle.disabled = true;
            if (btnSave) btnSave.disabled = true;
            if (btnCancel) {
                btnCancel.textContent = '✓ Evento Anulado';
                btnCancel.disabled = true;
                btnCancel.style.backgroundColor = '#6b7280';
            }

            // Show success message
            alert('✓ Evento anulado correctamente.\n\nEl estado se ha actualizado y la reserva del salón ha sido liberada.');
        } catch (err) {
            console.error('Error cancelling event:', err);
            alert('Error al anular el evento. Por favor, inténtalo de nuevo.');
        }
    }

// Trailing init removed - handled by startApp

    // Unsaved changes warning for browser close/refresh
    window.addEventListener('beforeunload', (e) => {
        if (state.hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

})();
