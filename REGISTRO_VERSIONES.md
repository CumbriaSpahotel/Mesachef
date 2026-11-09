# 📋 Registro de Versiones del Sistema MesaChef

Este documento mantiene el registro y control de versiones **único y global** para todo el sistema MesaChef.

> **Regla del Sistema:** Existe **una única versión global** para todo el sistema.
> Cada vez que se realice cualquier modificación en cualquier módulo, pantalla, lógica o estilo:
> 1. Se incrementa el número de versión global del sistema.
> 2. Se actualiza la fecha a la fecha en curso.
> 3. Se registra en este documento la nueva versión, la fecha, los módulos afectados y el detalle de los cambios.
> 4. Se refleja la nueva versión en `package.json` y en las etiquetas de versión visibles de la interfaz (`Matrix vX.Y.Z`).

---

## 📌 Versión Actual del Sistema

- **Versión:** `v10.4.2`
- **Última Actualización:** 09/11/2026
- **Estado General:** Operativo en Producción (Matrix)

---

## 📝 Historial de Versiones

### [v10.4.2] - 09/11/2026
- **Módulos:** Restaurante / Salones
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Simplificacion visual de PayGold en modales de Restaurante y Salones dejando unicamente la barra de acciones rapida

### [v10.4.1] - 09/11/2026
- **Módulos:** Restaurante / Salones / PayGold Service
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Integración directa de pasarela PayGold Redsys con 1 clic para Cumbria Spa & Hotel (FUC 168271567) con modal y reenvio de webhooks

### [v10.4.0] - 09/11/2026
- **Módulos:** Restaurante / Salones / Webhook / Service Worker
- **Tipo de cambio:** MINOR
- **Descripción:**
  - **Restaurante (`restaurante.html` y `js/restaurante.js`)**:
    - Añadida sección completa de *Garantía y Pago PayGold (Eurocaja Rural / Cumbria)* en la ventana modal de edición y creación de reservas.
    - Soporte multi-hotel respetando la configuración activa (`Sercotel Guadiana: 168355840-001` vs `Cumbria Spa&Hotel: TPV Cumbria`).
    - Campos integrados: Cód. Pedido (`RES-XXXXXX`), Fianza/Cobro (€), Estado Garantía (`pendiente`, `enlace_enviado`, `garantizado`), Enlace PayGold Redsys y Datos de Tarjeta de Referencia (últimos 4 dígitos `•••• •••• •••• [XXXX]`, caducidad y marca).
    - Botones de acción: Copiar Cód. Pedido, Copiar Importe, Regenerar Cód., Fianza Cobrada rápida (`⚡`) y WhatsApp PayGold oficial con enlace bancario seguro.
    - Indicador visual verde con tarjeta `💳 •••• XXXX` / `💳 PAGADO` en las tarjetas del planning cuando la fianza está pagada o garantizada.
    - Ocultación automática del panel PayGold si el servicio está marcado como *Incluido*.
  - **Salones (`salones.html` y `js/salones.js`)**:
    - Añadida sección completa de *Garantía y Señal PayGold* en la modal de eventos.
    - Soporte multi-hotel dinámico según el hotel seleccionado.
    - Campos integrados: Cód. Pedido (`EVT-XXXXXX`), Señal Acordada (€), Estado Garantía/Señal, Enlace PayGold Redsys y Datos de Tarjeta de Referencia.
    - Botones de acción: Copiar Cód. Pedido, Copiar Importe, Regenerar Cód., Señal Cobrada rápida (`⚡`) y WhatsApp Señal PayGold con enlace oficial.
    - Indicador visual verde `💳 •••• XXXX` / `💳 PAGADO` en el planning de salones para eventos con señal garantizada o cobrada.
    - Ocultación automática del panel PayGold si el evento está marcado como *Servicios Incluidos*.
  - **Webhook Central Redsys / Eurocaja (`functions/index.js`)**:
    - Enrutador multi-módulo inteligente: procesa notificaciones online para Restaurante (`RES-`), Salones (`EVT-` / `GRP-`), Spa (`SPA-`) y Grandes Eventos (`GE-`).
    - **Registro y confirmación 100% automática del cobro**: al recibir la confirmación bancaria (código `0000-0099`), el webhook actualiza el estado de la reserva/evento a `confirmada`, el estado PayGold a `garantizado`, suma el importe a la fianza/señal pagada, almacena la referencia de tarjeta (`cardLast4`, marca y caducidad) y anota el pago en el historial de cobros.
    - Sincronización cruzada automática entre reservas de restaurante y salones vinculados.
    - Registro de auditoría transversal en la colección Firestore `auditoria_paygold`.
  - **Cache y Service Worker (`sw.js`)**:
    - Actualizado `CACHE_NAME` a `mesachef-matrix-v10.4.0` con purga forzada de cachés antiguas.
    - Sincronizados query params de versión de scripts en `restaurante.html` y `salones.html` a `?v=10.4.0`.

### [v10.3.15] - 09/11/2026
- **Módulos:** Grandes Eventos
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Insignias visuales de estado y punto verde de pagado en tabla de participantes de Grandes Eventos

### [v10.3.14] - 09/11/2026
- **Módulos:** Grandes Eventos
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Desbloqueo del campo Cód. Pedido PayGold (`#pPaygoldRef`), retirando el bloqueo `readonly` para permitir edición libre y conciliación manual en caso de discrepancias con el TPV de Eurocaja Rural.
  - Implementación de auto-formateo a mayúsculas y prefijo `GE-` al teclear o pegar códigos de pedido.
  - Nuevo botón de cobro rápido `⚡ Todo` en el Historial de Pagos para abonar de 1 solo clic la totalidad del importe pendiente.
  - Asistente de abono automático al cambiar el Estado de Garantía a `Garantizado / Pagado`, ofreciendo registrar directamente el pago pendiente sin pasos manuales.
  - Alerta de seguridad al pulsar `🔄 Nuevo Cód.` si ya existía un enlace de Eurocaja pegado, evitando la desincronización entre el enlace de pago de Redsys y el pedido de la ficha.
  - Cache buster actualizado en `grandes-eventos.html` a `?v=10.3.14`.

### [v10.3.13] - 03/11/2026
- **Módulos:** Salones / Restaurante
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Jornada editable en eventos vinculados a Grupos y ajuste persistente tras sincronizar. Conserva personas, servicios y vínculo; comprueba disponibilidad al guardar.
  - Los eventos de Sala sin hora se muestran en el cuadrante como ocupación de día completo hasta elegir jornada.

### [v10.3.12] - 03/11/2026
- **Módulos:** Salones
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Soporte de servicios de sala y salones por hotel

### [v10.3.11] - 03/11/2026
- **Módulos:** Salones
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Soporte para meriendas y desayunos en cuadrante y sincronizacion bidireccional de salones con Nexus

### [v10.3.10] - 28/10/2026
- **Módulos:** Grandes Eventos / Menú Fin de Año en PDF & WhatsApp
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Conversión directa y nativa del documento Word oficial *"Menu Fin de Año Guadiana 2026.docx"* a PDF de alta resolución (`Menu_Fin_de_Ano_Guadiana_2026.pdf`).
  - Actualización de los botones de la barra de configuración del evento para enlazar y descargar directamente el PDF oficial (`📄 Menú Fin de Año (PDF)`).
  - Configuración del envío por WhatsApp para adjuntar y enlazar directamente el documento PDF oficial a los clientes.

### [v10.3.9] - 28/10/2026
- **Módulos:** Grandes Eventos / Informes de Impresión (Listado de Participantes)
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Optimización del aprovechamiento de espacio en folio A4 en el Listado de Participantes: reducción de márgenes de página a `10mm 12mm`, ampliación del ancho de la columna de Titular al 34% para evitar saltos de línea antiestéticos en nombres y compactación del encabezado y pie.
  - Sustitución de las etiquetas de texto en la columna de Estado por iconos discretos y elegantes (`✔` en verde para confirmado y `⏳` en ámbar para pendiente), evitando que las celdas se desborden verticalmente.

### [v10.3.8] - 28/10/2026
- **Módulos:** Grandes Eventos / Menú Fin de Año 2026 & WhatsApp
- **Tipo de cambio:** MINOR
- **Descripción:**
  - Creación de la página web oficial responsive e interactiva del menú de gala: `menu-fin-de-ano-2026.html`, basada en el documento oficial *"Menu Fin de Año Guadiana 2026.docx"* con imágenes, alérgenos, bodega, cotillón con DJ, menú infantil y descarga en PDF.
  - Inclusión en la barra de configuración del evento en `grandes-eventos.html` de los botones:
    - `🍽️ Menú Fin de Año`: Acceso directo para visualizar la carta digital.
    - `📱 Menú WhatsApp`: Modal integrado para enviar el enlace y ficha del menú directamente por WhatsApp a cualquier cliente o grupo.

### [v10.3.7] - 28/10/2026
- **Módulos:** Grandes Eventos / Modal de Participante & PayGold
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Ocultación automática del bloque completo de Garantía y Pago PayGold (Eurocaja Rural) cuando la casilla *"✓ Servicio Incluido (sin cargo)"* está activada.
  - Inclusión de aviso informativo amigable (*"Servicio Incluido (Sin Cargo) - No requiere cobro ni garantía PayGold"*) en sustitución de la sección bancaria.
  - Asignación automática de estado `garantizado` para reservas con servicio incluido al guardar.

### [v10.3.6] - 28/10/2026
- **Módulos:** Grandes Eventos / Informes de Impresión (Listado de Participantes)
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Ajuste en el resumen de cabecera y pie de página del Listado de Participantes impreso: el cómputo de "Confirmados" y "Pendientes" ahora contabiliza estrictamente el número de **personas/comensales** (pax) y no el número de reservas.
  - Eliminación absoluta de cualquier término monetario o de pago en el Listado de Participantes; las reservas con servicio incluido o saldo cubierto se presentan limpiamente como `✅ Confirmado`.
  - Presentación clara en cabecera: `Total Personas: X (Ad / Ni) | Personas Confirmadas: Y | Personas Pendientes: Z`.

### [v10.3.5] - 28/10/2026
- **Módulos:** Grandes Eventos / Informes de Impresión
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Corrección en los informes impresos (Lista de Participantes e Informe Financiero): los participantes marcados con "Servicio Incluido" se computan y reflejan automáticamente como `✅ Confirmado (Incluido)` y pagados al 100%, sumando correctamente a los comensales confirmados y a la recaudación sin computar como saldo pendiente.

### [v10.3.4] - 28/10/2026
- **Módulos:** Grandes Eventos / Informes de Impresión
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Rediseño de los informes de impresión según su propósito operativo y confidencialidad:
    - **Lista de Participantes:** Eliminadas las columnas y cifras económicas (`Pagado` / `Pendiente` en €) para el personal de sala y puerta; sustituidas por columna de estado operativo (`✅ Confirmado` / `⏳ Pendiente`), total de comensales por reserva, mesa y observaciones/alérgenos, con bloque de resumen de asistencia al inicio y pie de tabla.
    - **Distribución de Mesas:** Incorporación de desglose de adultos/niños y observaciones de sala por comensal.
    - **Informe Económico y Financiero:** Reporte exclusivo con el desglose de facturación prevista, recaudación cobrada, saldo pendiente por reserva y sumatorios totales al pie de tabla.

### [v10.3.3] - 28/10/2026
- **Módulos:** Grandes Eventos / Manuales de Usuario
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Incorporación en todos los manuales (Word, HTML interactivo y Markdown) del Paso 5 específico con la captura oficial de Eurocaja Rural (Redsys Canales) donde se activa la casilla "Notificar resultado a la siguiente URL" y se introduce la URL destino del Webhook.
  - Documentación del procedimiento ante modificaciones de comensales e importes mediante el botón `🔄 Nuevo Cód.` para evitar el error de pedido repetido en Redsys.

### [v10.3.2] - 28/10/2026
- **Módulos:** Grandes Eventos / Backend Webhook
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Inclusión en el modal de reserva de la URL de Notificación Online oficial del Webhook Redsys con botón de copiado rápido (`btnCopyWebhookUrl`) para configurar el TPV de Eurocaja Rural.
  - Implementación del botón `🔄 Nuevo Cód.` (`btnRegenPaygoldRef`) para generar automáticamente nuevos códigos o versiones correlativas (`GE-XXXXXX-2`) ante ampliaciones de comensales o reenvíos de enlaces sin colisionar con pedidos anteriores en Redsys.
  - Mejora en la Cloud Function del Webhook para resolver pedidos con sufijo de versión de forma flexible sin perder la trazabilidad de la reserva.

### [v10.3.1] - 28/10/2026
- **Módulos:** Grandes Eventos
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Corrección en el modal de reserva: eliminación del atributo HTML `required` en el campo del enlace PayGold para permitir guardar y dar de alta la reserva antes de entrar al TPV de Eurocaja Rural. La validación obligatoria se mantiene activa exclusivamente al pulsar el botón de envío de WhatsApp PayGold.

### [v10.3.0] - 28/10/2026
- **Módulos:** Backend (Cloud Functions) / Grandes Eventos / PayGold Eurocaja
- **Tipo de cambio:** MINOR
- **Descripción:**
  - Implementación de Cloud Function 2nd Gen para Webhook de notificación online asíncrona de Redsys (`redsysWebhook` en `europe-west1`).
  - Decodificación y validación automática de parámetros `Ds_MerchantParameters` (Base64/JSON) y verificación de códigos de autorización (0000-0099).
  - Sincronización en tiempo real con Firestore (`participantes_eventos`): cambio de estado a `garantizado`, registro contable en `pagos`, extracción segura de últimos 4 dígitos y caducidad, y guardado en colección de auditoría `auditoria_paygold`.
  - Configuración del proyecto Firebase `mesa-chef-prod` en plan Blaze con activación de APIs Cloud Build, Cloud Functions y Artifact Registry.

### [v10.2.2] - 28/10/2026
- **Módulos:** Grandes Eventos
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Enlace directo al manual de recepción en cabecera de evento, política estricta de caducidad exacta y sección de seguridad anti-filtraciones RGPD/PCI-DSS

### [v10.2.1] - 28/10/2026
- **Módulos:** Grandes Eventos
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Ampliación del modal de participante a 1260px y corrección de visibilidad y estilos con colores dinámicos en el selector de Estado Garantía

### [v10.2.0] - 28/10/2026
- **Módulos:** Grandes Eventos
- **Tipo de cambio:** MINOR
- **Descripción:**
  - Rediseño panorámico adaptable de 2 columnas (1040px) en modal de participante y enlace PayGold obligatorio para confirmación WhatsApp

### [v10.1.3] - 28/10/2026
- **Módulos:** Grandes Eventos
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Incorporación de política de límite de pago y cancelación no reembolsable en plantilla WhatsApp e invalidación de caché de scripts

### [v10.1.2] - 28/10/2026
- **Módulos:** Grandes Eventos
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Detección dinámica del nombre del evento en plantilla WhatsApp y botones de copiado rápido de importe y descripción para Eurocaja Rural PayGold

### [v10.1.1] - 28/10/2026
- **Módulos:** Grandes Eventos
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Corrección de enlace al Portal de Administración TPV Virtual Redsys Canales (Eurocaja Rural)

### [v10.1.0] - 28/10/2026
- **Módulos:** Grandes Eventos
- **Tipo de cambio:** MINOR
- **Descripción:**
  - Integración de Garantía y Pago PayGold (Eurocaja Rural) con fecha de cargo, avisos en tiempo real, protección PCI-DSS y confirmación por WhatsApp para Sercotel Guadiana

### [v10.0.1] - 27/10/2026
- **Módulos:** Varios módulos
- **Tipo de cambio:** PATCH
- **Descripción:**
  - Prueba de bump automático

### [v10.0.0] - 27/10/2026
- **Módulos:** Sistema Completo
- **Tipo de cambio:** Unificación de versión
- **Descripción:** 
  - Establecimiento de versión única global para todos los módulos de MesaChef (`v10.0.0`).
  - Creación del registro centralizado de versiones y control de cambios.
  - Definición de política de incremento de versión global ante cualquier cambio en cualquier módulo.
