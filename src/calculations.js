(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.GruasCalculator = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const DEFAULT_CONFIG = {
    new: { minimumPct: 12, targetPct: 18, highPct: 25, defaultWarrantyPct: 2, defaultCurrency: "MXN" },
    used: { minimumPct: 18, targetPct: 25, highPct: 35, defaultWarrantyPct: 3, defaultCurrency: "MXN" },
  };

  const moneyFields = [
    "supplierCost", "exchangeRate", "internationalFreight", "transportInsurance", "importTaxes",
    "maneuvers", "nationalTransport", "clientDelivery", "installation", "newOtherCosts",
    "newCommercialCosts", "newCommissionValue", "newWarrantyValue", "originalCost",
    "accumulatedDepreciation", "bookValue", "diagnosticCost", "usedTransport", "repairs",
    "parts", "paint", "tires", "batteries", "labor", "cleaning", "usedDelivery",
    "usedCommercialCosts", "usedCommissionValue", "usedWarrantyValue", "usedOtherCosts",
    "historicalRentalIncome", "historicalMaintenance", "otherHistoricalCosts",
    "expectedMonthlyRent", "expectedOccupancy", "expectedMonthlyMaintenance",
    "expectedMonthlyOtherCosts", "evaluationMonths", "estimatedSaleValueAfter", "proposedPrice",
    "discountValue", "marketLow", "marketAverage", "marketHigh", "monthsInOperation",
  ];

  function n(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function pct(value) {
    return n(value) / 100;
  }

  function round(value) {
    return Math.round((n(value) + Number.EPSILON) * 100) / 100;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(n(value), min), max);
  }

  function validate(input) {
    const errors = [];
    moneyFields.forEach((field) => {
      if (input[field] !== "" && input[field] !== undefined && n(input[field]) < 0) {
        errors.push(`${field}: no acepta valores negativos.`);
      }
    });
    if (input.currency === "USD" && n(input.exchangeRate) <= 0) {
      errors.push("El tipo de cambio es obligatorio cuando la moneda es USD.");
    }
    if (input.expectedOccupancy !== "" && input.expectedOccupancy !== undefined) {
      const occupancy = n(input.expectedOccupancy);
      if (occupancy < 0 || occupancy > 100) errors.push("La ocupacion esperada debe estar entre 0% y 100%.");
    }
    if (!input.responsible) errors.push("El responsable es obligatorio.");
    if (!input.equipmentType) errors.push("El tipo de equipo es obligatorio.");
    return errors;
  }

  function resolveConfig(input, configRows) {
    const type = input.operationType === "used" ? "used" : "new";
    const defaults = DEFAULT_CONFIG[type];
    if (!Array.isArray(configRows)) return { ...defaults };
    const match = configRows.find((row) => {
      const active = row.active === undefined || row.active === true || String(row.active).toLowerCase() === "activo";
      return active && String(row.equipmentType || "").toLowerCase() === String(input.equipmentType || "").toLowerCase();
    });
    if (!match) return { ...defaults };
    return {
      minimumPct: n(match.minimumPct) || defaults.minimumPct,
      targetPct: n(match.targetPct) || defaults.targetPct,
      highPct: n(match.highPct) || defaults.highPct,
      defaultWarrantyPct: n(match.defaultWarrantyPct) || defaults.defaultWarrantyPct,
      defaultCurrency: match.defaultCurrency || defaults.defaultCurrency,
    };
  }

  function variableCost(base, proposedPrice, value, mode) {
    const amount = n(value);
    if (mode === "percentBase") return base * pct(amount);
    if (mode === "percentPrice") return n(proposedPrice) * pct(amount);
    return amount;
  }

  function solvePrice(baseWithoutPriceCosts, marginPct, priceCostPct) {
    const targetMultiplier = 1 + pct(marginPct);
    const denominator = 1 - pct(priceCostPct) * targetMultiplier;
    if (denominator <= 0) return 0;
    return baseWithoutPriceCosts * targetMultiplier / denominator;
  }

  function newBase(input, proposedPrice) {
    const exchangeRate = input.currency === "USD" ? n(input.exchangeRate) : 1;
    const supplierCostMxn = n(input.supplierCost) * exchangeRate;
    const directCosts = [
      "internationalFreight", "transportInsurance", "importTaxes", "maneuvers", "nationalTransport",
      "clientDelivery", "installation", "newOtherCosts", "newCommercialCosts",
    ].reduce((sum, key) => sum + n(input[key]), 0);
    const baseBeforeVariable = supplierCostMxn + directCosts;
    const commission = variableCost(baseBeforeVariable, proposedPrice, input.newCommissionValue, input.newCommissionMode);
    const warranty = variableCost(baseBeforeVariable + commission, proposedPrice, input.newWarrantyValue, input.newWarrantyMode);
    return {
      supplierCostMxn,
      incrementalSaleCosts: directCosts + commission + warranty,
      commission,
      warranty,
      baseBeforeVariable,
      economicBase: baseBeforeVariable + commission + warranty,
      priceCostPct: (input.newCommissionMode === "percentPrice" ? n(input.newCommissionValue) : 0)
        + (input.newWarrantyMode === "percentPrice" ? n(input.newWarrantyValue) : 0),
    };
  }

  function usedBookValues(input) {
    const originalCost = n(input.originalCost);
    let depreciation = n(input.accumulatedDepreciation);
    let bookValue = n(input.bookValue);
    if (originalCost > 0 && depreciation > 0 && bookValue === 0) bookValue = Math.max(originalCost - depreciation, 0);
    if (originalCost > 0 && bookValue > 0 && depreciation === 0) depreciation = Math.max(originalCost - bookValue, 0);
    return { originalCost, depreciation, bookValue };
  }

  function usedBase(input, proposedPrice) {
    const values = usedBookValues(input);
    const reconditioning = [
      "diagnosticCost", "usedTransport", "repairs", "parts", "paint", "tires", "batteries",
      "labor", "cleaning", "usedDelivery", "usedCommercialCosts", "usedOtherCosts",
    ].reduce((sum, key) => sum + n(input[key]), 0);
    const baseBeforeVariable = values.bookValue + reconditioning;
    const commission = variableCost(baseBeforeVariable, proposedPrice, input.usedCommissionValue, input.usedCommissionMode);
    const warranty = variableCost(baseBeforeVariable + commission, proposedPrice, input.usedWarrantyValue, input.usedWarrantyMode);
    return {
      ...values,
      reconditioningCosts: reconditioning,
      incrementalSaleCosts: reconditioning + commission + warranty,
      commission,
      warranty,
      baseBeforeVariable,
      economicBase: baseBeforeVariable + commission + warranty,
      priceCostPct: (input.usedCommissionMode === "percentPrice" ? n(input.usedCommissionValue) : 0)
        + (input.usedWarrantyMode === "percentPrice" ? n(input.usedWarrantyValue) : 0),
    };
  }

  function baseFor(input, proposedPrice) {
    return input.operationType === "used" ? usedBase(input, proposedPrice) : newBase(input, proposedPrice);
  }

  function priceSet(baseData, margins) {
    const baseWithoutPriceCosts = baseData.baseBeforeVariable;
    const priceCostPct = baseData.priceCostPct;
    return {
      minimumPrice: round(solvePrice(baseWithoutPriceCosts, margins.minimumPct, priceCostPct)),
      targetPrice: round(solvePrice(baseWithoutPriceCosts, margins.targetPct, priceCostPct)),
      highPrice: round(solvePrice(baseWithoutPriceCosts, margins.highPct, priceCostPct)),
    };
  }

  function discountValues(input, proposedPrice) {
    const raw = Math.max(n(input.discountValue), 0);
    const amount = input.discountMode === "percent" ? proposedPrice * pct(raw) : raw;
    const percent = proposedPrice > 0 ? (amount / proposedPrice) * 100 : 0;
    return { discountAmount: round(Math.min(amount, proposedPrice)), discountPercent: round(percent) };
  }

  function marketPosition(input, finalPrice) {
    const low = n(input.marketLow);
    const high = n(input.marketHigh);
    if (!low || !high || !finalPrice) return "Sin referencia";
    if (finalPrice < low) return "Debajo del mercado";
    if (finalPrice > high) return "Por encima del mercado";
    return "Dentro del mercado";
  }

  function recommendation(input, comparison) {
    if (input.operationType !== "used") return "No aplica comparativo de renta para equipo nuevo.";
    const hasProjection = n(input.expectedMonthlyRent) > 0 && n(input.evaluationMonths) > 0;
    if (!hasProjection || comparison.sellNowValue <= 0) {
      return "Faltan datos esenciales para emitir una recomendacion financiera.";
    }
    const tolerance = Math.max(Math.abs(comparison.sellNowValue) * 0.03, 1);
    if (Math.abs(comparison.difference) <= tolerance) return "Resultados similares: requiere decision estrategica.";
    return comparison.difference > 0
      ? "Financieramente favorece mantener en renta."
      : "Financieramente favorece vender ahora.";
  }

  function calculate(rawInput, configRows) {
    const input = { ...rawInput };
    const margins = resolveConfig(input, configRows);
    const initialBase = baseFor(input, n(input.proposedPrice));
    const prices = priceSet(initialBase, margins);
    const proposedPrice = n(input.proposedPrice) > 0 ? n(input.proposedPrice) : prices.targetPrice;
    const base = baseFor(input, proposedPrice);
    const adjustedPrices = priceSet(base, margins);
    const discount = discountValues(input, proposedPrice);
    const finalPrice = round(Math.max(proposedPrice - discount.discountAmount, 0));
    const expectedProfit = round(finalPrice - base.economicBase);
    const profitOnCostPct = base.economicBase > 0 ? round((expectedProfit / base.economicBase) * 100) : 0;
    const marginOnSalePct = finalPrice > 0 ? round((expectedProfit / finalPrice) * 100) : 0;
    const maxDiscountAllowed = round(Math.max(proposedPrice - adjustedPrices.minimumPrice, 0));

    const historicalRentalResult = round(n(input.historicalRentalIncome) - n(input.historicalMaintenance) - n(input.otherHistoricalCosts));
    const originalCost = base.originalCost || n(input.originalCost);
    const historicalRecoveryPct = originalCost > 0 ? round((historicalRentalResult / originalCost) * 100) : 0;
    const netSaleIncome = round(finalPrice - (base.incrementalSaleCosts || 0));
    const totalRecoveryPct = originalCost > 0 ? round(((historicalRentalResult + netSaleIncome) / originalCost) * 100) : 0;

    const effectiveMonthlyIncome = round(n(input.expectedMonthlyRent) * clamp(input.expectedOccupancy, 0, 100) / 100);
    const monthlyRentFlow = round(effectiveMonthlyIncome - n(input.expectedMonthlyMaintenance) - n(input.expectedMonthlyOtherCosts));
    const futureRentFlow = round(monthlyRentFlow * n(input.evaluationMonths));
    const keepRentingValue = round(futureRentFlow + n(input.estimatedSaleValueAfter));
    const sellNowValue = round(finalPrice - (base.incrementalSaleCosts || 0));
    const difference = round(keepRentingValue - sellNowValue);
    const monthsToRecoverSale = monthlyRentFlow > 0 && sellNowValue > 0 ? round(sellNowValue / monthlyRentFlow) : null;

    let trafficLight = "Fuera de politica";
    if (profitOnCostPct >= margins.targetPct) trafficLight = "Dentro de politica";
    else if (profitOnCostPct >= margins.minimumPct) trafficLight = "Requiere autorizacion";

    const comparison = { effectiveMonthlyIncome, monthlyRentFlow, futureRentFlow, keepRentingValue, sellNowValue, difference, monthsToRecoverSale };

    return {
      input,
      errors: validate(input),
      margins,
      ...base,
      ...adjustedPrices,
      proposedPrice: round(proposedPrice),
      finalPrice,
      ...discount,
      expectedProfit,
      profitOnCostPct,
      marginOnSalePct,
      maxDiscountAllowed,
      historicalRentalResult,
      historicalRecoveryPct,
      totalRecoveryPct,
      comparison,
      trafficLight,
      marketPosition: marketPosition(input, finalPrice),
      recommendation: recommendation(input, comparison),
    };
  }

  return { DEFAULT_CONFIG, calculate, validate, round, n };
});
