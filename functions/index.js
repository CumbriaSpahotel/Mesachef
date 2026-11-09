// functions/index.js
// Cloud Function (2nd Gen) para recibir notificaciones online de Eurocaja Rural / Redsys (PayGold)
// Ecosistema MesaChef: Grandes Eventos (GE-), Restaurante (RES-), Salones (EVT-), Grupos (GRP-) y Spa (SPA-)
// Sercotel Guadiana & Cumbria Spa&Hotel

const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const {
  decodeMerchantParameters,
  parseRedsysResponse,
  parseCardBrand,
  formatExpiryDate,
  verifySignature
} = require('./redsys');

admin.initializeApp();
const db = admin.firestore();

// Opciones globales: región europea (cercana a Redsys España) y límite de instancias
setGlobalOptions({
  region: 'europe-west1',
  maxInstances: 10
});

// Clave secreta opcional para verificación de firma HMAC SHA-256
const REDSYS_SECRET_KEY = process.env.REDSYS_SECRET_KEY || null;

/**
 * Función auxiliar para buscar documentos en colecciones Firestore
 * Admite búsqueda por paygoldRef, referencia o por ID directo
 */
async function findDocInCollection(collectionName, candidates) {
  const colRef = db.collection(collectionName);
  for (const c of candidates) {
    if (!c) continue;
    // 1. Por paygoldRef
    let snap = await colRef.where('paygoldRef', '==', c).limit(1).get();
    if (!snap.empty) return snap.docs[0];

    // 2. Por referencia
    snap = await colRef.where('referencia', '==', c).limit(1).get();
    if (!snap.empty) return snap.docs[0];

    // 3. Por referenciaPaygold (usado en spa/grupos)
    snap = await colRef.where('referenciaPaygold', '==', c).limit(1).get();
    if (!snap.empty) return snap.docs[0];
  }

  // 4. Intento por ID directo de documento
  for (const c of candidates) {
    if (!c || c.length < 5) continue;
    try {
      const doc = await colRef.doc(c).get();
      if (doc.exists) return doc;
    } catch (_) {}
  }
  return null;
}

/**
 * Webhook HTTP central para notificaciones online de Redsys / PayGold Eurocaja
 * URL oficial: https://europe-west1-mesa-chef-prod.cloudfunctions.net/redsysWebhook
 */
exports.redsysWebhook = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  // Manejo de peticiones GET para comprobación de salud / estado
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'active',
      service: 'MesaChef Matrix Multi-Module PayGold Webhook (2nd Gen)',
      version: 'v10.4.0',
      timestamp: new Date().toISOString(),
      modules: ['Grandes Eventos (GE-)', 'Restaurante (RES-)', 'Salones/Eventos (EVT-)', 'Grupos (GRP-)', 'Spa (SPA-)'],
      fucExpected: '168355840',
      terminalExpected: '001'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const body = req.body || {};
    const merchantParamsRaw = body.Ds_MerchantParameters;
    const receivedSignature = body.Ds_Signature;

    if (!merchantParamsRaw) {
      console.warn('[PayGold Webhook] Petición POST recibida sin Ds_MerchantParameters');
      return res.status(400).send('Falta Ds_MerchantParameters');
    }

    // 1. Decodificar parámetros de Redsys
    const params = decodeMerchantParameters(merchantParamsRaw);
    const order = (params.Ds_Order || '').trim();
    const amountCents = parseInt(params.Ds_Amount, 10) || 0;
    const amountEuros = amountCents / 100;
    const responseCode = params.Ds_Response;
    const authCode = params.Ds_AuthorisationCode || '';
    const merchantCode = params.Ds_MerchantCode;
    const terminal = params.Ds_Terminal;
    const cardRaw = params.Ds_Card_Number || '';
    const brandCode = params.Ds_Card_Brand || '';
    const expiryRaw = params.Ds_ExpiryDate || '';

    console.log(`[PayGold Webhook] Notificación recibida para Pedido: ${order}, Importe: ${amountEuros}€, FUC: ${merchantCode}, Resp: ${responseCode}`);

    // 2. Comprobar firma si la clave secreta está configurada
    const cumbriaFuc = '168271567';
    const cumbriaKey = 'T4o7OH9D6UTSo9B9xr2iRaP6I+7s4U8D';
    const secretKeyToUse = (merchantCode === cumbriaFuc) ? cumbriaKey : (REDSYS_SECRET_KEY || null);

    if (secretKeyToUse) {
      const sigCheck = verifySignature(merchantParamsRaw, receivedSignature, secretKeyToUse, order);
      if (!sigCheck.verified) {
        console.error('[PayGold Webhook] Error en la verificación de firma Redsys:', sigCheck);
        return res.status(403).send('Firma no válida');
      }
    }

    // 3. Evaluar respuesta del banco (0000 - 0099 = Aprobado)
    const result = parseRedsysResponse(responseCode);

    // Preparar lista de candidatos flexibles (con o sin prefijo, base sin versión, etc.)
    const baseOrder = order.replace(/-\d+$/, '');
    const cleanDigits = order.replace(/\D/g, '');
    const candidates = [
      order,
      order.replace(/^[A-Z]+-/, ''),
      baseOrder,
      baseOrder.replace(/^[A-Z]+-/, ''),
      cleanDigits
    ].filter(Boolean);

    let matchedDoc = null;
    let matchedModule = null; // 'restaurante' | 'salones' | 'grandes-eventos' | 'spa'

    // 4. Estrategia de búsqueda inteligente por prefijo
    if (order.startsWith('RES-') || order.startsWith('RST-')) {
      matchedDoc = await findDocInCollection('reservas_restaurante', candidates);
      if (matchedDoc) matchedModule = 'restaurante';
    } else if (order.startsWith('EVT-') || order.startsWith('GRP-')) {
      matchedDoc = await findDocInCollection('reservas_salones', candidates);
      if (matchedDoc) matchedModule = 'salones';
    } else if (order.startsWith('SPA-')) {
      matchedDoc = await findDocInCollection('citas_spa', candidates);
      if (matchedDoc) matchedModule = 'spa';
    } else if (order.startsWith('GE-')) {
      matchedDoc = await findDocInCollection('participantes_eventos', candidates);
      if (matchedDoc) matchedModule = 'grandes-eventos';
    }

    // Respaldo transversal si aún no se encuentra por prefijo
    if (!matchedDoc) {
      matchedDoc = await findDocInCollection('participantes_eventos', candidates);
      if (matchedDoc) matchedModule = 'grandes-eventos';
    }
    if (!matchedDoc) {
      matchedDoc = await findDocInCollection('reservas_restaurante', candidates);
      if (matchedDoc) matchedModule = 'restaurante';
    }
    if (!matchedDoc) {
      matchedDoc = await findDocInCollection('reservas_salones', candidates);
      if (matchedDoc) matchedModule = 'salones';
    }

    // 5. Registrar siempre en la colección central de auditoría
    await db.collection('auditoria_paygold').add({
      modulo: matchedModule || 'desconocido',
      order,
      amount: amountEuros,
      responseCode,
      success: result.success,
      description: result.description,
      authCode,
      merchantCode,
      terminal,
      docId: matchedDoc ? matchedDoc.id : null,
      rawParams: params,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 6. Actualizar la reserva según el módulo si se encontró coincidencia
    if (matchedDoc) {
      const docData = matchedDoc.data();
      const cardLast4 = cardRaw ? cardRaw.slice(-4) : (docData.cardLast4 || '');
      const cardBrand = parseCardBrand(brandCode) || (docData.cardBrand || 'Visa');
      const cardExpiry = formatExpiryDate(expiryRaw) || (docData.cardExpiry || '');
      const todayIso = new Date().toISOString().split('T')[0];

      if (result.success) {
        const currentPagos = Array.isArray(docData.pagos) ? [...docData.pagos] : [];
        const alreadyRecorded = currentPagos.some(p => p.authCode === authCode && p.order === order);

        if (!alreadyRecorded) {
          currentPagos.push({
            date: todayIso,
            amount: amountEuros,
            method: 'PayGold Eurocaja',
            authCode: authCode,
            order: order,
            notes: `Pago automático Redsys (${result.description})`
          });
        }

        const updateData = {
          paygoldStatus: 'garantizado',
          pagos: currentPagos,
          cardLast4: cardLast4,
          cardBrand: cardBrand,
          cardExpiry: cardExpiry,
          paygoldConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastPaygoldResult: {
            code: responseCode,
            authCode: authCode,
            amount: amountEuros,
            order: order,
            updatedAt: new Date().toISOString()
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Reglas específicas por módulo
        if (matchedModule === 'restaurante') {
          updateData.estado = 'confirmada';
          updateData.fianzaPagada = (docData.fianzaPagada || 0) + amountEuros;
          await matchedDoc.ref.update(updateData);

          // Si está vinculado con salones, sincronizar también
          if (docData.salonBookingId) {
            try {
              await db.collection('reservas_salones').doc(docData.salonBookingId).set({
                estado: 'confirmada',
                paygoldStatus: 'garantizado',
                updated_at: new Date().toISOString()
              }, { merge: true });
            } catch (eSync) {
              console.warn('[PayGold Webhook] Error sincronizando con reservas_salones:', eSync);
            }
          }
          console.log(`[PayGold Webhook] Reserva de Restaurante ${matchedDoc.id} (${docData.nombre}) actualizada con éxito a CONFIRMADA / GARANTIZADA`);

        } else if (matchedModule === 'salones') {
          updateData.estado = 'confirmada';
          updateData.senalPagada = (docData.senalPagada || 0) + amountEuros;
          updateData.updated_at = new Date().toISOString();
          await matchedDoc.ref.update(updateData);
          console.log(`[PayGold Webhook] Evento de Salones ${matchedDoc.id} (${docData.cliente}) actualizado con éxito a CONFIRMADO / GARANTIZADO`);

        } else if (matchedModule === 'spa') {
          updateData.estadoPago = 'pagado';
          updateData.importePagado = amountEuros;
          await matchedDoc.ref.update(updateData);
          console.log(`[PayGold Webhook] Cita de Gest-Spa ${matchedDoc.id} actualizada con éxito a PAGADA`);

        } else {
          // Grandes Eventos
          await matchedDoc.ref.update(updateData);
          console.log(`[PayGold Webhook] Participante de Grandes Eventos ${matchedDoc.id} (${docData.titular}) actualizado con éxito a GARANTIZADO`);
        }

      } else {
        // Pago denegado o cancelado
        await matchedDoc.ref.update({
          paygoldStatus: 'denegado',
          paygoldLastError: {
            code: responseCode,
            description: result.description,
            order: order,
            attemptedAt: new Date().toISOString()
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.warn(`[PayGold Webhook] Pedido ${order} marcado como DENEGADO en módulo ${matchedModule}: ${result.description}`);
      }
    } else {
      console.warn(`[PayGold Webhook] No se encontró reserva/participante en Firestore para el pedido: ${order}`);
    }

    // Redsys requiere respuesta HTTP 200 con "OK"
    return res.status(200).send('OK');
  } catch (error) {
    console.error('[PayGold Webhook] Error interno procesando notificación Redsys:', error);
    return res.status(200).send('OK');
  }
});
