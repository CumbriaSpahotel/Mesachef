(function (root) {
  'use strict';
  const isRestaurant = value => String(value || '').trim().toLowerCase() === 'restaurante';
  const jornadas = ['todo', 'mañana', 'tarde', 'almuerzo', 'cena', 'desayuno', 'merienda', 'sala'];
  function applyJornadaOverride(event) {
    if (!jornadas.includes(event.jornadaOverride) || event.jornadaOverrideHotel !== event.hotel || event.jornadaOverrideFecha !== event.fecha) return event;
    return {...event, detalles: {...event.detalles, jornada: event.jornadaOverride}, ...(event._isFromSalones ? {turno: event.jornadaOverride} : {})};
  }
  async function changeLinkedSalon(db, bookingId, salon, expectedSalon, jornada, expectedJornada) {
    if (jornada !== undefined && !jornadas.includes(jornada)) throw new Error('Selecciona una jornada válida.');
    if (!bookingId || !salon) throw new Error('Selecciona un salón.');
    const source = db.collection('reservas_salones').doc(bookingId);
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(source);
      if (!snapshot.exists) throw new Error('No se encuentra el evento original.');
      const event = snapshot.data();
      if (event.desvinculado || event.vinculoRoto) throw new Error('El evento ya está desvinculado. Vuelve a abrirlo.');
      if (event.salon !== expectedSalon) throw new Error('La ubicación ha cambiado. Cierra y vuelve a abrir la reserva.');
      const currentJornada = applyJornadaOverride(event).detalles?.jornada || 'todo';
      if (expectedJornada !== undefined && currentJornada !== expectedJornada) throw new Error('La jornada ha cambiado. Cierra y vuelve a abrir la reserva.');
      const jornadaChanged = jornada !== undefined && jornada !== currentJornada;
      if (event.salon === salon && !jornadaChanged) return;
      const update = {updated_at: new Date().toISOString()};
      if (event.salon !== salon) Object.assign(update, {salon, salonOverride: salon, salonOverrideHotel: event.hotel});
      if (jornadaChanged) Object.assign(update, {
        'detalles.jornada': jornada, jornadaOverride: jornada,
        jornadaOverrideHotel: event.hotel, jornadaOverrideFecha: event.fecha
      });
      transaction.update(source, update);
      const mirror = db.collection('reservas_restaurante').doc('salon_' + bookingId);
      if (isRestaurant(salon)) {
        const details = {...applyJornadaOverride(event).detalles, ...(jornada !== undefined ? {jornada} : {})};
        transaction.set(mirror, {
          hotel: event.hotel, referencia: event.reservaId || bookingId,
          fecha: event.fecha, espacio: 'Restaurante', nombre: event.cliente || '',
          hora: details.hora || '', turno: details.jornada || 'cena',
          pax: (details.pax_adultos || 0) + (details.pax_ninos || 0), ninos: details.pax_ninos || 0,
          estado: event.estado, servicioIncluido: !!details.incluido,
          salonBookingId: bookingId, _isFromSalones: true,
          jornadaOverride: details.jornada || null, jornadaOverrideHotel: event.hotel, jornadaOverrideFecha: event.fecha,
          updatedAt: new Date().toISOString()
        }, {merge: true});
      } else if (isRestaurant(event.salon)) {
        transaction.delete(mirror);
      }
    });
  }
  async function returnToEvents(db, bookingId, salon) {
    if (!bookingId || !salon || isRestaurant(salon)) throw new Error('Selecciona un salón de Eventos.');
    const source = db.collection('reservas_salones').doc(bookingId);
    const mirrors = await db.collection('reservas_restaurante').where('salonBookingId', '==', bookingId).get();
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(source);
      if (!snapshot.exists) throw new Error('No se encuentra el evento original.');
      if (!isRestaurant(snapshot.data().salon)) throw new Error('La ubicación ha cambiado. Cierra y vuelve a abrir la reserva.');
      transaction.update(source, {salon, updated_at: new Date().toISOString()});
      const refs = new Map();
      mirrors.forEach(doc => refs.set(doc.id, doc.ref));
      refs.set('salon_' + bookingId, db.collection('reservas_restaurante').doc('salon_' + bookingId));
      refs.forEach(ref => transaction.delete(ref));
    });
  }
  const api = {isRestaurant, returnToEvents, changeLinkedSalon, applyJornadaOverride};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EventLocation = api;
})(typeof window !== 'undefined' ? window : globalThis);
