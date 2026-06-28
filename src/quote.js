(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.GruasQuote = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

  function clean(value) {
    return String(value ?? "").replace(/[<>]/g, "").trim();
  }

  function quoteNumber(folio) {
    const value = clean(folio);
    return value ? `COT-${value}` : "BORRADOR - SIN FOLIO";
  }

  function buildClientQuoteModel(input = {}, calculated = {}) {
    const operationType = input.operationType === "used" ? "Seminuevo proveniente de renta" : "Equipo nuevo";
    return {
      companyName: "Gruas Laguna",
      title: "Cotización",
      quoteNumber: quoteNumber(input.folio),
      quoteDate: clean(input.quoteDate || input.analysisDate),
      validUntil: clean(input.quoteValidUntil),
      clientName: clean(input.clientName),
      contactName: clean(input.clientContactName),
      clientPhone: clean(input.clientPhone),
      clientEmail: clean(input.clientEmail),
      responsible: clean(input.responsible),
      operationType,
      equipmentType: clean(input.equipmentType),
      brand: clean(input.brand),
      model: clean(input.model),
      year: clean(input.year),
      serialNumber: clean(input.serialNumber),
      currentHours: input.operationType === "used" ? clean(input.currentHours) : "",
      condition: input.operationType === "used" ? clean(input.condition) : "",
      clientDescription: clean(input.clientDescription),
      finalPrice: Number(calculated.finalPrice || 0),
      finalPriceText: money.format(Number(calculated.finalPrice || 0)),
      priceLegend: "Precio antes de IVA. IVA no incluido.",
      paymentTerms: clean(input.paymentTerms),
      deliveryEstimate: clean(input.deliveryEstimate),
      warrantyTerms: clean(input.clientWarrantyTerms),
      quoteValidityText: clean(input.quoteValidityText),
      clientCommercialNotes: clean(input.clientCommercialNotes),
      legalLegend: "Este documento es unicamente una cotizacion y no constituye factura, contrato, apartado ni garantia de disponibilidad. Los precios y condiciones estan sujetos a la vigencia indicada, disponibilidad del equipo y autorizacion comercial de Gruas Laguna.",
    };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function row(label, value) {
    if (value === "" || value === null || value === undefined) return "";
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }

  function renderClientQuoteHtml(model) {
    return `
      <article class="client-quote">
        <header class="quote-header">
          <img src="assets/GL2.png" alt="Gruas Laguna" />
          <div>
            <strong>${escapeHtml(model.companyName)}</strong>
            <h1>${escapeHtml(model.title)}</h1>
          </div>
        </header>
        <section class="quote-band">
          <div><span>No.</span><strong>${escapeHtml(model.quoteNumber)}</strong></div>
          <div><span>Fecha</span><strong>${escapeHtml(model.quoteDate)}</strong></div>
          <div><span>Vigencia</span><strong>${escapeHtml(model.validUntil || model.quoteValidityText)}</strong></div>
        </section>
        <section class="quote-section">
          <h2>Cliente</h2>
          <dl>
            ${row("Nombre o razon social", model.clientName)}
            ${row("Contacto", model.contactName)}
            ${row("Telefono", model.clientPhone)}
            ${row("Correo", model.clientEmail)}
            ${row("Responsable Gruas Laguna", model.responsible)}
          </dl>
        </section>
        <section class="quote-section">
          <h2>Equipo cotizado</h2>
          <dl>
            ${row("Tipo de operacion", model.operationType)}
            ${row("Tipo de equipo", model.equipmentType)}
            ${row("Marca", model.brand)}
            ${row("Modelo", model.model)}
            ${row("Ano", model.year)}
            ${row("Numero de serie", model.serialNumber)}
            ${row("Horas actuales", model.currentHours)}
            ${row("Condicion", model.condition)}
          </dl>
          ${model.clientDescription ? `<p class="quote-description">${escapeHtml(model.clientDescription)}</p>` : ""}
        </section>
        <section class="quote-price">
          <span>Precio final cotizado en MXN</span>
          <strong>${escapeHtml(model.finalPriceText)}</strong>
          <p>${escapeHtml(model.priceLegend)}</p>
        </section>
        <section class="quote-section">
          <h2>Condiciones comerciales</h2>
          <dl>
            ${row("Condiciones de pago", model.paymentTerms)}
            ${row("Tiempo y lugar estimado de entrega", model.deliveryEstimate)}
            ${row("Garantia ofrecida", model.warrantyTerms)}
            ${row("Vigencia de cotizacion", model.quoteValidityText)}
            ${row("Observaciones comerciales", model.clientCommercialNotes)}
          </dl>
        </section>
        <footer class="quote-footer">${escapeHtml(model.legalLegend)}</footer>
      </article>
    `;
  }

  return { buildClientQuoteModel, renderClientQuoteHtml };
});
