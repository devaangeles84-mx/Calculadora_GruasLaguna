(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.GruasCalculator = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const DEFAULT_CONFIG = {
    new: { minimumPct: 12, targetPct: 18, highPct: 25, defaultWarrantyPct: 2, defaultCurrency: "MXN" },
    used: { minimumPct: 18, targetPct: 25, highPct: 35, defaultWarrantyPct: 3, defaultCurrency: "MXN", usefulLifeYears: 10, residualPercentage: 30 },
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
    "expectedMonthlyOtherCosts", "evaluationMonths", "estimatedSaleValueAfter", "futureManualSaleValue", "proposedPrice",
    "discountValue", "marketLow", "marketAverage", "marketHigh", "monthsInOperation",
    "usefulLifeYears", "residualPercentage", "manualBookValue",
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

  function hasValue(value) {
    return value !== "" && value !== undefined && value !== null;
  }

  function isManualBookValueEnabled(input) {
    return input.useManualBookValue === true || input.useManualBookValue === "true" || input.useManualBookValue === "on";
  }

  function isManualFutureValueEnabled(input) {
    return input.useManualFutureSaleValue === true || input.useManualFutureSaleValue === "true" || input.useManualFutureSaleValue === "on";
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function completeMonthsBetween(startValue, endValue) {
    const start = parseDate(startValue);
    const end = parseDate(endValue);
    if (!start || !end || start > end) return 0;
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (end.getDate() < start.getDate()) months -= 1;
    return Math.max(months, 0);
  }

  function addMonths(dateValue, monthsToAdd) {
    const date = parseDate(dateValue);
    if (!date) return "";
    const result = new Date(date);
    const day = result.getDate();
    result.setMonth(result.getMonth() + Math.max(Math.trunc(n(monthsToAdd)), 0));
    if (result.getDate() < day) result.setDate(0);
    return result.toISOString().slice(0, 10);
  }

  function validationDetails(input) {
    const errors = [];
    const warnings = [];
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
    if (input.discountMode === "percent" && n(input.discountValue) > 100) {
      warnings.push("El descuento porcentual se limita a 100%.");
    }
    if (!input.responsible) errors.push("El responsable es obligatorio.");
    if (!input.equipmentType) errors.push("El tipo de equipo es obligatorio.");
    if (input.operationType === "new" && n(input.supplierCost) <= 0) {
      errors.push("El costo del proveedor debe ser mayor que cero para equipo nuevo.");
    }
    if (input.operationType === "used") {
      const originalCost = n(input.originalCost);
      const acquisitionDate = parseDate(input.acquisitionDate);
      const analysisDate = parseDate(input.analysisDate);
      if (originalCost <= 0) errors.push("El costo original debe ser mayor que cero para seminuevo.");
      if (!input.acquisitionDate) errors.push("La fecha de adquisicion o puesta en operacion es obligatoria para seminuevo.");
      if (acquisitionDate && analysisDate && acquisitionDate > analysisDate) {
        errors.push("La fecha de adquisicion no puede ser posterior a la fecha del analisis.");
      }
      if (n(input.usefulLifeYears) <= 0) errors.push("La vida util estimada debe ser mayor que cero.");
      if (!hasValue(input.residualPercentage) || n(input.residualPercentage) < 0 || n(input.residualPercentage) > 100) {
        errors.push("El valor residual debe estar entre 0% y 100%.");
      }
      if (isManualBookValueEnabled(input)) {
        if (n(input.manualBookValue) <= 0) errors.push("El valor manual autorizado debe ser mayor que cero.");
        if (!String(input.manualAdjustmentReason || "").trim()) {
          errors.push("El motivo del ajuste manual es obligatorio.");
        }
        if (!String(input.manualAuthorizedBy || "").trim()) {
          errors.push("La persona que autorizo el valor manual es obligatoria.");
        }
        if (!input.manualAuthorizationDate) {
          errors.push("La fecha de autorizacion del valor manual es obligatoria.");
        }
        warnings.push("Existe un ajuste manual autorizado; el valor manual se usara como base del analisis.");
      }
      if (isManualFutureValueEnabled(input)) {
        if (n(input.futureManualSaleValue) <= 0) errors.push("El valor futuro manual autorizado debe ser mayor que cero.");
        if (!String(input.futureManualReason || "").trim()) errors.push("El motivo del valor futuro manual es obligatorio.");
        if (!String(input.futureManualAuthorizedBy || "").trim()) errors.push("La persona que autorizo el valor futuro manual es obligatoria.");
        if (!input.futureManualAuthorizationDate) errors.push("La fecha de autorizacion del valor futuro manual es obligatoria.");
        warnings.push("Existe un valor futuro manual autorizado; se usara en el comparativo de renta.");
      }
      if (originalCost > 0 && hasValue(input.accumulatedDepreciation) && hasValue(input.bookValue)
        && Math.abs(originalCost - n(input.accumulatedDepreciation) - n(input.bookValue)) > 1) {
        warnings.push("Costo original, depreciacion acumulada y valor en libros no coinciden.");
      }
    }
    const hasMarket = ["marketLow", "marketAverage", "marketHigh"].some((field) => hasValue(input[field]) && n(input[field]) > 0);
    if (hasMarket) {
      const low = n(input.marketLow);
      const average = n(input.marketAverage);
      const high = n(input.marketHigh);
      if (!String(input.marketSource || "").trim()) errors.push("La fuente o referencia de mercado es obligatoria cuando se captura informacion de mercado.");
      if (!input.marketDate) errors.push("La fecha de consulta de mercado es obligatoria cuando se captura informacion de mercado.");
      if (!(low > 0 && average > 0 && high > 0)) {
        errors.push("Capture precio de mercado bajo, promedio y alto para validar el rango.");
      } else if (!(low <= average && average <= high)) {
        errors.push("El mercado debe cumplir: precio bajo <= precio promedio <= precio alto.");
      }
    }
    return { errors, warnings };
  }

  function validate(input) {
    return validationDetails(input).errors;
  }

  function isActive(row) {
    const active = row.active ?? row.EstadoActivo ?? row.estadoActivo;
    return active === undefined || active === true || String(active).toLowerCase() === "activo";
  }

  function sameText(left, right) {
    return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
  }

  function resolveConfig(input, configRows) {
    const type = input.operationType === "used" ? "used" : "new";
    const defaults = DEFAULT_CONFIG[type];
    if (!Array.isArray(configRows)) return { ...defaults };
    const activeRows = configRows.filter((row) => isActive(row) && sameText(row.operationType, type));
    const match = activeRows.find((row) => sameText(row.equipmentType, input.equipmentType))
      || activeRows.find((row) => sameText(row.equipmentType, "Todos"));
    if (!match) return { ...defaults };
    return {
      minimumPct: match.minimumPct !== "" && match.minimumPct !== undefined ? n(match.minimumPct) : defaults.minimumPct,
      targetPct: match.targetPct !== "" && match.targetPct !== undefined ? n(match.targetPct) : defaults.targetPct,
      highPct: match.highPct !== "" && match.highPct !== undefined ? n(match.highPct) : defaults.highPct,
      defaultWarrantyPct: match.defaultWarrantyPct !== "" && match.defaultWarrantyPct !== undefined ? n(match.defaultWarrantyPct) : defaults.defaultWarrantyPct,
      defaultCurrency: match.defaultCurrency || defaults.defaultCurrency,
      usefulLifeYears: match.usefulLifeYears !== "" && match.usefulLifeYears !== undefined ? n(match.usefulLifeYears) : defaults.usefulLifeYears,
      residualPercentage: match.residualPercentage !== "" && match.residualPercentage !== undefined ? n(match.residualPercentage) : defaults.residualPercentage,
    };
  }

  function variableCost(base, proposedPrice, value, mode) {
    const amount = n(value);
    if (mode === "percentBase") return base * pct(amount);
    if (mode === "percentPrice") return n(proposedPrice) * pct(amount);
    return amount;
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

  function depreciationEstimate(input, config) {
    const originalCost = n(input.originalCost);
    const usefulLifeYears = n(config.usefulLifeYears) || DEFAULT_CONFIG.used.usefulLifeYears;
    const residualPercentage = hasValue(config.residualPercentage) ? n(config.residualPercentage) : DEFAULT_CONFIG.used.residualPercentage;
    const safeResidualPercentage = clamp(residualPercentage, 0, 100);
    const elapsedMonths = completeMonthsBetween(input.acquisitionDate, input.analysisDate);
    const residualValue = round(originalCost * pct(safeResidualPercentage));
    const depreciableBase = round(Math.max(originalCost - residualValue, 0));
    const usefulLifeMonths = usefulLifeYears > 0 ? usefulLifeYears * 12 : 0;
    const rawMonthlyDepreciation = usefulLifeMonths > 0 ? depreciableBase / usefulLifeMonths : 0;
    const monthlyDepreciation = round(rawMonthlyDepreciation);
    const estimatedDepreciation = round(Math.min(rawMonthlyDepreciation * elapsedMonths, depreciableBase));
    const automaticBookValue = round(Math.max(originalCost - estimatedDepreciation, residualValue));
    const manualEnabled = isManualBookValueEnabled(input);
    const manualBookValue = manualEnabled ? n(input.manualBookValue) : 0;
    const selectedBookValue = manualEnabled ? manualBookValue : automaticBookValue;

    return {
      depreciationMethod: "Lineal interno",
      acquisitionDate: input.acquisitionDate || "",
      analysisDate: input.analysisDate || "",
      usefulLifeYears,
      residualPercentage: safeResidualPercentage,
      elapsedMonths,
      elapsedYears: round(elapsedMonths / 12),
      residualValue,
      depreciableBase,
      monthlyDepreciation,
      estimatedDepreciation,
      automaticBookValue,
      manualBookValueEnabled: manualEnabled,
      manualBookValue,
      manualAdjustmentReason: input.manualAdjustmentReason || "",
      manualAuthorizedBy: input.manualAuthorizedBy || "",
      manualAuthorizationDate: input.manualAuthorizationDate || "",
      selectedBookValue,
      depreciationDisclaimer: "Estimacion interna para analisis comercial; no representa un valor contable o fiscal oficial",
    };
  }

  function legacyBookValues(input) {
    const originalCost = n(input.originalCost);
    let depreciation = n(input.accumulatedDepreciation);
    let bookValue = n(input.bookValue);
    if (originalCost > 0 && hasValue(input.accumulatedDepreciation) && bookValue === 0) bookValue = Math.max(originalCost - depreciation, 0);
    if (originalCost > 0 && bookValue > 0 && depreciation === 0) depreciation = Math.max(originalCost - bookValue, 0);
    return { originalCost, depreciation, bookValue };
  }

  function usedBookValues(input, config) {
    const estimate = depreciationEstimate(input, config);
    if (n(input.originalCost) > 0 && input.acquisitionDate && input.analysisDate) {
      return {
        originalCost: n(input.originalCost),
        depreciation: estimate.estimatedDepreciation,
        bookValue: estimate.selectedBookValue,
        ...estimate,
      };
    }
    const legacy = legacyBookValues(input);
    return {
      ...estimate,
      ...legacy,
      automaticBookValue: legacy.bookValue,
      selectedBookValue: legacy.bookValue,
      depreciation: legacy.depreciation,
    };
  }

  function usedBase(input, proposedPrice, config) {
    const values = usedBookValues(input, config);
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

  function baseFor(input, proposedPrice, config) {
    return input.operationType === "used" ? usedBase(input, proposedPrice, config || DEFAULT_CONFIG.used) : newBase(input, proposedPrice);
  }

  function solvePriceForMargin(input, marginPct) {
    const multiplier = 1 + pct(marginPct);
    const config = resolveConfig(input, input.__configRows);
    const baseAtZero = baseFor(input, 0, config).economicBase;
    if (baseAtZero <= 0 || multiplier <= 0) return 0;

    const difference = (price) => {
      const base = baseFor(input, price, config).economicBase;
      return price - (base * multiplier);
    };

    let low = 0;
    let high = Math.max(baseAtZero * multiplier, 1);
    let guard = 0;
    while (difference(high) < 0 && guard < 80) {
      high *= 2;
      guard += 1;
      if (!Number.isFinite(high) || high > 1e15) return 0;
    }
    if (difference(high) < 0) return 0;

    for (let index = 0; index < 100; index += 1) {
      const mid = (low + high) / 2;
      if (difference(mid) >= 0) high = mid;
      else low = mid;
    }
    return round(high);
  }

  function priceSet(input, margins) {
    return {
      minimumPrice: solvePriceForMargin(input, margins.minimumPct),
      targetPrice: solvePriceForMargin(input, margins.targetPct),
      highPrice: solvePriceForMargin(input, margins.highPct),
    };
  }

  function discountValues(input, proposedPrice) {
    const raw = input.discountMode === "percent" ? clamp(input.discountValue, 0, 100) : Math.max(n(input.discountValue), 0);
    const amount = input.discountMode === "percent" ? proposedPrice * pct(raw) : raw;
    const percent = proposedPrice > 0 ? (amount / proposedPrice) * 100 : 0;
    return { discountAmount: round(Math.min(amount, proposedPrice)), discountPercent: round(Math.min(percent, 100)) };
  }

  function marketPosition(input, finalPrice) {
    const low = n(input.marketLow);
    const high = n(input.marketHigh);
    if (!low || !high || !finalPrice) return "Sin referencia";
    if (finalPrice < low) return "Debajo del mercado";
    if (finalPrice > high) return "Por encima del mercado";
    return "Dentro del mercado";
  }

  function futureSaleEstimate(input, config) {
    const originalCost = n(input.originalCost);
    const usefulLifeYears = n(config.usefulLifeYears) || DEFAULT_CONFIG.used.usefulLifeYears;
    const residualPercentage = hasValue(config.residualPercentage) ? n(config.residualPercentage) : DEFAULT_CONFIG.used.residualPercentage;
    const safeResidualPercentage = clamp(residualPercentage, 0, 100);
    const futureEvaluationDate = addMonths(input.analysisDate, input.evaluationMonths);
    const projectedElapsedMonths = completeMonthsBetween(input.acquisitionDate, futureEvaluationDate);
    const residualValue = round(originalCost * pct(safeResidualPercentage));
    const depreciableBase = round(Math.max(originalCost - residualValue, 0));
    const usefulLifeMonths = usefulLifeYears > 0 ? usefulLifeYears * 12 : 0;
    const rawMonthlyDepreciation = usefulLifeMonths > 0 ? depreciableBase / usefulLifeMonths : 0;
    const futureEstimatedDepreciation = round(Math.min(rawMonthlyDepreciation * projectedElapsedMonths, depreciableBase));
    const automaticFutureSaleValue = round(Math.max(originalCost - futureEstimatedDepreciation, residualValue));
    const manualEnabled = isManualFutureValueEnabled(input);
    const manualValue = manualEnabled ? n(input.futureManualSaleValue) : 0;
    return {
      futureEvaluationDate,
      projectedElapsedMonths,
      projectedElapsedYears: round(projectedElapsedMonths / 12),
      futureResidualValue: residualValue,
      automaticFutureSaleValue,
      futureManualSaleValueEnabled: manualEnabled,
      futureManualSaleValue: manualValue,
      futureManualReason: input.futureManualReason || "",
      futureManualAuthorizedBy: input.futureManualAuthorizedBy || "",
      futureManualAuthorizationDate: input.futureManualAuthorizationDate || "",
      selectedFutureSaleValue: manualEnabled ? manualValue : automaticFutureSaleValue,
      futureSaleDisclaimer: "Estimacion comercial interna; no garantiza el precio futuro de mercado",
    };
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
    if (input.operationType === "used") {
      input.usefulLifeYears = margins.usefulLifeYears;
      input.residualPercentage = margins.residualPercentage;
    }
    input.__configRows = configRows;
    const prices = priceSet(input, margins);
    const proposedPrice = n(input.proposedPrice) > 0 ? n(input.proposedPrice) : prices.targetPrice;
    const base = baseFor(input, proposedPrice, margins);
    const discount = discountValues(input, proposedPrice);
    const finalPrice = round(Math.max(proposedPrice - discount.discountAmount, 0));
    const expectedProfit = round(finalPrice - base.economicBase);
    const profitOnCostPct = base.economicBase > 0 ? round((expectedProfit / base.economicBase) * 100) : 0;
    const marginOnSalePct = finalPrice > 0 ? round((expectedProfit / finalPrice) * 100) : 0;
    const maxDiscountAllowed = round(Math.max(proposedPrice - prices.minimumPrice, 0));

    const historicalRentalResult = round(n(input.historicalRentalIncome) - n(input.historicalMaintenance) - n(input.otherHistoricalCosts));
    const originalCost = base.originalCost || n(input.originalCost);
    const historicalRecoveryPct = originalCost > 0 ? round((historicalRentalResult / originalCost) * 100) : 0;
    const netSaleIncome = round(finalPrice - (base.incrementalSaleCosts || 0));
    const totalRecoveryPct = originalCost > 0 ? round(((historicalRentalResult + netSaleIncome) / originalCost) * 100) : 0;

    const effectiveMonthlyIncome = round(n(input.expectedMonthlyRent) * clamp(input.expectedOccupancy, 0, 100) / 100);
    const monthlyRentFlow = round(effectiveMonthlyIncome - n(input.expectedMonthlyMaintenance) - n(input.expectedMonthlyOtherCosts));
    const futureSale = input.operationType === "used" ? futureSaleEstimate(input, margins) : {
      selectedFutureSaleValue: n(input.estimatedSaleValueAfter),
      automaticFutureSaleValue: n(input.estimatedSaleValueAfter),
    };
    const futureRentFlow = round(monthlyRentFlow * n(input.evaluationMonths));
    const keepRentingValue = round(futureRentFlow + n(futureSale.selectedFutureSaleValue));
    const sellNowValue = round(finalPrice - (base.incrementalSaleCosts || 0));
    const difference = round(keepRentingValue - sellNowValue);
    const monthsToRecoverSale = monthlyRentFlow > 0 && sellNowValue > 0 ? round(sellNowValue / monthlyRentFlow) : null;

    let trafficLight = "Fuera de politica";
    if (profitOnCostPct >= margins.targetPct) trafficLight = "Dentro de politica";
    else if (profitOnCostPct >= margins.minimumPct) trafficLight = "Requiere autorizacion";

    const comparison = { effectiveMonthlyIncome, monthlyRentFlow, futureRentFlow, keepRentingValue, sellNowValue, difference, monthsToRecoverSale };
    const details = validationDetails(input);

    return {
      input: Object.fromEntries(Object.entries(input).filter(([key]) => key !== "__configRows")),
      errors: details.errors,
      warnings: details.warnings,
      margins,
      ...base,
      ...prices,
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
      ...futureSale,
      comparison,
      trafficLight,
      marketPosition: marketPosition(input, finalPrice),
      recommendation: recommendation(input, comparison),
    };
  }

  return { DEFAULT_CONFIG, calculate, validate, validationDetails, resolveConfig, round, n };
});
