/**
 * ═════════════════════════════════════════════════════════════════════════════
 * MESACHEF — SERVICIO INTEGRADO DE GENERACIÓN PAYGOLD REDSYS (MULTIHOTEL)
 * ═════════════════════════════════════════════════════════════════════════════
 * - Cumbria Spa & Hotel: Generación directa con 1 clic vía API Redsys (FUC 168271567)
 * - Sercotel Guadiana: Asistente Eurocaja Rural (FUC 168355840)
 */

(function (window) {
    'use strict';

    const CLOUD_FUNCTION_URL = 'https://createpaygold-nls6pa6unq-uc.a.run.app';

    const HOTELS = {
        cumbria: {
            id: 'cumbria',
            name: 'Cumbria Spa & Hotel',
            fuc: '168271567',
            terminal: '001',
            autoReady: true
        },
        guadiana: {
            id: 'guadiana',
            name: 'Sercotel Guadiana',
            fuc: '168355840',
            terminal: '001',
            autoReady: false // Pendiente de activación de API en Eurocaja
        }
    };

    const PayGoldService = {
        HOTELS,

        getHotelKey(hotelRaw) {
            if (!hotelRaw) return 'guadiana';
            const s = String(hotelRaw).toLowerCase();
            if (s.includes('cumbria')) return 'cumbria';
            return 'guadiana';
        },

        getHotelConfig(hotelRaw) {
            const k = this.getHotelKey(hotelRaw);
            return HOTELS[k] || HOTELS.guadiana;
        },

        /**
         * Llama a la Cloud Function oficial para generar el enlace PayGold en Redsys
         */
        async generateLink(params) {
            const hotelKey = this.getHotelKey(params.hotel);
            const amount = parseFloat(params.amount);

            if (isNaN(amount) || amount <= 0) {
                throw new Error('Por favor, indica un importe a cobrar superior a 0,00 €.');
            }

            const refId = String(params.referenceId || params.reservaId || params.orderId || '').trim();
            const bodyPayload = {
                app: 'mesachef',
                hotel: hotelKey,
                amountEuros: amount,
                referenceId: refId,
                groupId: refId,
                concept: params.concept || `Reserva MesaChef ${refId} - ${params.customerName || ''}`.trim(),
                customerName: params.customerName || '',
                customerMobile: params.customerMobile || '',
                customerEmail: params.customerEmail || '',
                expiryDate: params.expiryDate || '',
                depositLabel: params.depositLabel || 'Garantía MesaChef'
            };

            const response = await fetch(CLOUD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload)
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || `Error Redsys ${data.errorCode || 'desconocido'}`);
            }

            return {
                paymentUrl: data.paymentUrl,
                orderId: data.orderId,
                amountEuros: data.amountEuros,
                expiresAt: data.expiresAt,
                app: data.app || 'mesachef'
            };
        },

        /**
         * Abre la ventana modal interactiva de Generación PayGold Redsys (Idéntica a Grupos)
         */
        openGeneratorModal(config) {
            const hotelKey = this.getHotelKey(config.hotel);
            const hotelCfg = HOTELS[hotelKey];
            const isCumbria = hotelKey === 'cumbria';

            // Remover modal previo si existía
            const oldModal = document.getElementById('modalGenerarPaygoldRedsys');
            if (oldModal) oldModal.remove();

            const defaultAmount = parseFloat(config.amount) || 0;
            const totalReserva = parseFloat(config.total) || defaultAmount;
            const refId = config.referenceId || ('RES-' + Date.now().toString().slice(-6));
            const clientName = config.customerName || 'Cliente';
            const phone = config.customerMobile || '';
            const email = config.customerEmail || '';

            // Fecha caducidad por defecto (+3 días)
            const dDef = new Date(Date.now() + 3 * 86400000);
            const defaultExpiry = dDef.toISOString().split('T')[0];

            const modalHtml = `
            <div id="modalGenerarPaygoldRedsys" class="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
                <div class="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 transform transition-all my-auto">
                    <!-- CABECERA -->
                    <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl">
                                ⚡
                            </div>
                            <div>
                                <h3 class="text-base font-black tracking-wide flex items-center gap-2">
                                    Generar Pasarela PayGold (Redsys)
                                    <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${isCumbria ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'} uppercase tracking-widest">
                                        ${hotelCfg.name.toUpperCase()}
                                    </span>
                                </h3>
                                <p class="text-xs text-slate-400">Crea un enlace de pago bancario seguro y actualiza el código y estado al instante.</p>
                            </div>
                        </div>
                        <button type="button" id="btnPgModalCloseX" class="text-slate-400 hover:text-white transition-colors text-xl font-bold p-1 cursor-pointer">
                            ✕
                        </button>
                    </div>

                    <!-- CUERPO -->
                    <div class="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
                        ${!isCumbria ? `
                        <div class="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-amber-800 text-xs">
                            <span class="text-base">⏳</span>
                            <div>
                                <strong class="font-bold">Sercotel Guadiana:</strong> Generación automática directa en fase de pruebas con Eurocaja Rural. Hotel Cumbria ya está 100% operativo.
                            </div>
                        </div>` : ''}

                        <!-- RESUMEN RESERVA -->
                        <div class="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Reserva / Cliente</span>
                                <span class="font-black text-slate-800 truncate block">${clientName}</span>
                                <div class="flex items-center gap-1.5 mt-0.5">
                                    <span class="text-[10px] text-slate-500 font-bold uppercase">Nº Pedido:</span>
                                    <span class="text-[10px] text-amber-700 font-mono font-black bg-amber-100/70 px-1.5 py-0.5 rounded">${refId}</span>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total / Pendiente</span>
                                <span class="font-black text-emerald-700 block text-sm">${totalReserva.toFixed(2)} €</span>
                                <span class="text-[10px] text-slate-500">Hotel: ${hotelCfg.name}</span>
                            </div>
                        </div>

                        <!-- IMPORTE A COBRAR -->
                        <div>
                            <label class="text-[11px] font-black uppercase tracking-wider text-slate-700 block mb-2">Importe a Cobrar</label>
                            <div class="space-y-2">
                                ${defaultAmount > 0 ? `
                                <label class="flex items-center justify-between p-3 rounded-xl border border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20 cursor-pointer transition-all" id="lblOptFianza">
                                    <div class="flex items-center gap-2.5">
                                        <input type="radio" name="pg_amount_opt" id="optPgFianza" value="fianza" checked class="text-amber-500 focus:ring-amber-500">
                                        <div>
                                            <span class="text-xs font-bold text-slate-800 block">Fianza / Señal Acordada</span>
                                            <span class="text-[10px] text-slate-500">Importe fijado en la ficha</span>
                                        </div>
                                    </div>
                                    <span class="text-sm font-black text-slate-900 font-mono">${defaultAmount.toFixed(2)} €</span>
                                </label>` : ''}

                                <label class="flex flex-col p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-all" id="lblOptCustom">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2.5">
                                            <input type="radio" name="pg_amount_opt" id="optPgCustom" value="custom" ${defaultAmount <= 0 ? 'checked' : ''} class="text-amber-500 focus:ring-amber-500">
                                            <div>
                                                <span class="text-xs font-bold text-slate-800 block">Importe Personalizado</span>
                                                <span class="text-[10px] text-slate-500">Introducir manualmente el importe a cobrar</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div id="wrapperCustomAmount" class="mt-2.5 pt-2 border-t border-slate-200/80 ${defaultAmount > 0 ? 'hidden' : ''}">
                                        <div class="relative">
                                            <input type="number" id="inputPgCustomAmount" step="0.01" min="1" value="${defaultAmount > 0 ? defaultAmount : ''}" placeholder="0.00" class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-black text-slate-900 font-mono text-right pr-8 focus:ring-2 focus:ring-amber-500 outline-none">
                                            <span class="absolute right-3 top-2.5 text-xs font-bold text-slate-400">€</span>
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- FECHA LÍMITE (CADUCIDAD) -->
                        <div>
                            <div class="flex items-center justify-between mb-1.5">
                                <label class="text-[11px] font-black uppercase tracking-wider text-slate-700">Fecha Límite del Enlace (Caducidad)</label>
                                <span class="text-[9px] font-bold text-slate-400 uppercase">Hasta las 23:59h de esa fecha</span>
                            </div>
                            <input type="date" id="inputPgExpiryDate" value="${defaultExpiry}" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none">
                            <div class="flex items-center gap-2 mt-1.5 text-[10px]">
                                <button type="button" class="btnPgQuickDate px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-semibold text-slate-600" data-days="1">+24 horas</button>
                                <button type="button" class="btnPgQuickDate px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-semibold text-slate-600" data-days="2">+48 horas</button>
                                <button type="button" class="btnPgQuickDate px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-semibold text-slate-600" data-days="7">+7 días</button>
                                <button type="button" class="btnPgQuickDate px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-semibold text-slate-600" data-days="15">+15 días</button>
                            </div>
                        </div>

                        <!-- ENVÍO AUTOMÁTICO (OPCIONAL) -->
                        <div class="border-t border-slate-200 pt-3 space-y-2">
                            <span class="text-[11px] font-black uppercase tracking-wider text-slate-700 block">Envío Automático (Opcional)</span>
                            <div class="space-y-2 text-xs">
                                <label class="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                                    <input type="checkbox" id="chkPgSendSms" class="rounded text-amber-500 focus:ring-amber-500">
                                    <span>Enviar enlace por SMS mediante Redsys al móvil del cliente</span>
                                </label>
                                <div id="wrapperPgSmsInput" class="hidden pl-6">
                                    <input type="tel" id="inputPgSmsPhone" value="${phone}" placeholder="Móvil cliente (ej. 600000000)" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800">
                                </div>

                                <label class="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                                    <input type="checkbox" id="chkPgSendEmail" class="rounded text-amber-500 focus:ring-amber-500">
                                    <span>Enviar enlace por Email mediante Redsys al correo del cliente</span>
                                </label>
                                <div id="wrapperPgEmailInput" class="hidden pl-6">
                                    <input type="email" id="inputPgEmailAddr" value="${email}" placeholder="Email cliente (ej. reservas@cliente.com)" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800">
                                </div>
                            </div>
                            <p class="text-[10px] text-slate-500 leading-relaxed italic bg-amber-50/70 p-2.5 rounded-xl border border-amber-200 text-amber-900">
                                💡 Si no marcas ninguna opción, Redsys generará el enlace que quedará registrado en la reserva, se copiará al portapapeles y podrás enviarlo directamente por <strong>WhatsApp</strong>.
                            </p>
                        </div>

                        <!-- MENSAJES DE ERROR / ESTADO -->
                        <div id="pgModalError" class="hidden p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold"></div>
                        <div id="pgModalSuccess" class="hidden p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs space-y-2"></div>
                    </div>

                    <!-- FOOTER / BOTONES -->
                    <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
                        <button type="button" id="btnPgModalCancel" class="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 uppercase tracking-wider cursor-pointer">
                            Cerrar
                        </button>
                        <button type="button" id="btnPgModalSubmit" class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-amber-500 hover:bg-amber-600 shadow-md shadow-amber-200 transition-all cursor-pointer">
                            <span>💳</span>
                            <span id="lblPgModalSubmit">Generar Enlace Redsys</span>
                        </button>
                    </div>
                </div>
            </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // GESTIÓN DE EVENTOS DEL MODAL
            const modalEl = document.getElementById('modalGenerarPaygoldRedsys');
            const closeBtn = document.getElementById('btnPgModalCloseX');
            const cancelBtn = document.getElementById('btnPgModalCancel');
            const submitBtn = document.getElementById('btnPgModalSubmit');
            const submitLabel = document.getElementById('lblPgModalSubmit');
            const errBox = document.getElementById('pgModalError');
            const okBox = document.getElementById('pgModalSuccess');

            const closeModal = () => modalEl.remove();
            closeBtn?.addEventListener('click', closeModal);
            cancelBtn?.addEventListener('click', closeModal);

            // Toggle radio buttons
            const optFianza = document.getElementById('optPgFianza');
            const optCustom = document.getElementById('optPgCustom');
            const wrapCustom = document.getElementById('wrapperCustomAmount');
            const lblFianza = document.getElementById('lblOptFianza');
            const lblCustom = document.getElementById('lblOptCustom');

            const updateAmountOptionUI = () => {
                if (optCustom && optCustom.checked) {
                    wrapCustom?.classList.remove('hidden');
                    lblCustom?.classList.add('border-amber-500', 'bg-amber-50/60', 'ring-2', 'ring-amber-500/20');
                    lblFianza?.classList.remove('border-amber-500', 'bg-amber-50/60', 'ring-2', 'ring-amber-500/20');
                } else {
                    wrapCustom?.classList.add('hidden');
                    lblFianza?.classList.add('border-amber-500', 'bg-amber-50/60', 'ring-2', 'ring-amber-500/20');
                    lblCustom?.classList.remove('border-amber-500', 'bg-amber-50/60', 'ring-2', 'ring-amber-500/20');
                }
            };
            optFianza?.addEventListener('change', updateAmountOptionUI);
            optCustom?.addEventListener('change', updateAmountOptionUI);

            // Quick expiry chips
            document.querySelectorAll('.btnPgQuickDate').forEach(btn => {
                btn.addEventListener('click', () => {
                    const days = parseInt(btn.dataset.days, 10) || 1;
                    const d = new Date(Date.now() + days * 86400000);
                    const inp = document.getElementById('inputPgExpiryDate');
                    if (inp) inp.value = d.toISOString().split('T')[0];
                });
            });

            // Toggle SMS / Email inputs
            const chkSms = document.getElementById('chkPgSendSms');
            const chkEmail = document.getElementById('chkPgSendEmail');
            chkSms?.addEventListener('change', () => {
                document.getElementById('wrapperPgSmsInput')?.classList.toggle('hidden', !chkSms.checked);
            });
            chkEmail?.addEventListener('change', () => {
                document.getElementById('wrapperPgEmailInput')?.classList.toggle('hidden', !chkEmail.checked);
            });

            // ENVÍO Y GENERACIÓN
            submitBtn?.addEventListener('click', async () => {
                errBox.classList.add('hidden');
                okBox.classList.add('hidden');

                let finalAmount = 0;
                if (optCustom && optCustom.checked) {
                    finalAmount = parseFloat(document.getElementById('inputPgCustomAmount')?.value) || 0;
                } else {
                    finalAmount = defaultAmount > 0 ? defaultAmount : parseFloat(document.getElementById('inputPgCustomAmount')?.value) || 0;
                }

                if (isNaN(finalAmount) || finalAmount <= 0) {
                    errBox.innerText = '❌ Por favor, introduce un importe superior a 0,00 €.';
                    errBox.classList.remove('hidden');
                    return;
                }

                const expiryDate = document.getElementById('inputPgExpiryDate')?.value || '';
                const sendSms = chkSms?.checked;
                const sendEmail = chkEmail?.checked;
                const mobile = sendSms ? (document.getElementById('inputPgSmsPhone')?.value || '') : '';
                const emailAddr = sendEmail ? (document.getElementById('inputPgEmailAddr')?.value || '') : '';

                submitBtn.disabled = true;
                submitBtn.classList.add('opacity-70', 'cursor-not-allowed');
                submitLabel.innerText = 'Generando enlace...';

                try {
                    const res = await PayGoldService.generateLink({
                        hotel: hotelKey,
                        amount: finalAmount,
                        referenceId: refId,
                        concept: `Reserva ${refId} - ${clientName}`,
                        customerName: clientName,
                        customerMobile: mobile,
                        customerEmail: emailAddr,
                        expiryDate: expiryDate,
                        depositLabel: 'Garantía MesaChef'
                    });

                    // Copiar al portapapeles
                    if (navigator.clipboard && res.paymentUrl) {
                        navigator.clipboard.writeText(res.paymentUrl).catch(() => {});
                    }

                    okBox.innerHTML = `
                        <div class="font-bold">✅ ¡Enlace PayGold generado con éxito por ${finalAmount.toFixed(2)} €!</div>
                        <div class="text-[11px] font-mono break-all bg-white p-2 rounded border border-emerald-300 text-emerald-900">${res.paymentUrl}</div>
                        <div class="text-[11px] text-emerald-700">Enlace copiado al portapapeles y vinculado a la reserva.</div>
                    `;
                    okBox.classList.remove('hidden');

                    if (typeof config.onSuccess === 'function') {
                        config.onSuccess({
                            paymentUrl: res.paymentUrl,
                            orderId: res.orderId,
                            amount: finalAmount,
                            hotel: hotelKey
                        });
                    }

                    setTimeout(() => {
                        closeModal();
                    }, 1200);

                } catch (err) {
                    errBox.innerText = `❌ ${err.message || 'Error conectando con el TPV Redsys.'}`;
                    errBox.classList.remove('hidden');
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
                    submitLabel.innerText = 'Generar Enlace Redsys';
                }
            });
        }
    };

    window.PayGoldService = PayGoldService;
})(window);
