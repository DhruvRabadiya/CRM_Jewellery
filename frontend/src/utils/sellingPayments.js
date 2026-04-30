export const METAL_PAYMENT_TYPES = ["Gold 24K", "Gold 22K", "Silver"];
export const MONEY_PAYMENT_TYPES = ["Cash", "Bank / UPI"];
export const PAYMENT_TYPE_OPTIONS = [...MONEY_PAYMENT_TYPES, "Metal"];

export const METAL_PURITY = {
  "Gold 24K": "99.99",
  "Gold 22K": "91.67",
  Silver: "99.90",
};

export const roundMoney = (value) => Number(parseFloat(value || 0).toFixed(2));
export const roundWeight = (value) => Number(parseFloat(value || 0).toFixed(4));

export const normalizeSettlementRates = (rawRates = {}, fallbackRates = {}) => {
  const normalized = {};
  METAL_PAYMENT_TYPES.forEach((metalType) => {
    const preferred = roundMoney(rawRates?.[metalType]);
    const fallback = roundMoney(fallbackRates?.[metalType]);
    normalized[metalType] = preferred > 0 ? preferred : fallback;
  });
  return normalized;
};

export const createEmptyMetalMap = () => ({
  "Gold 24K": 0,
  "Gold 22K": 0,
  Silver: 0,
});

export const createEmptyPaymentEntry = () => ({
  payment_type: "Cash",
  amount: "",
  metal_type: "Gold 24K",
  weight: "",
  purity: METAL_PURITY["Gold 24K"],
  reference_rate: "",
});

export const normalizePaymentEntries = (entries = [], legacyBill = null) => {
  const source = Array.isArray(entries) && entries.length > 0
    ? entries
    : legacyBill
      ? [
          ...(parseFloat(legacyBill.cash_amount) > 0 ? [{ payment_type: "Cash", amount: String(legacyBill.cash_amount) }] : []),
          ...(parseFloat(legacyBill.online_amount) > 0 ? [{ payment_type: "Bank / UPI", amount: String(legacyBill.online_amount) }] : []),
          ...(parseFloat(legacyBill.fine_jama) > 0 ? [{ payment_type: "Metal", metal_type: "Gold 24K", weight: String(legacyBill.fine_jama), purity: METAL_PURITY["Gold 24K"], reference_rate: String(legacyBill.rate_10g || "") }] : []),
          ...(parseFloat(legacyBill.jama_gold_22k) > 0 ? [{ payment_type: "Metal", metal_type: "Gold 22K", weight: String(legacyBill.jama_gold_22k), purity: METAL_PURITY["Gold 22K"], reference_rate: String(legacyBill.rate_gold_22k || "") }] : []),
          ...(parseFloat(legacyBill.jama_silver) > 0 ? [{ payment_type: "Metal", metal_type: "Silver", weight: String(legacyBill.jama_silver), purity: METAL_PURITY.Silver, reference_rate: String(legacyBill.rate_silver || "") }] : []),
        ]
      : [];

  return source.map((entry) => {
    const paymentType = entry?.payment_type === "Metal" ? "Metal" : (entry?.payment_type === "Bank / UPI" ? "Bank / UPI" : "Cash");
    const metalType = METAL_PAYMENT_TYPES.includes(entry?.metal_type) ? entry.metal_type : "Gold 24K";
    return {
      payment_type: paymentType,
      amount: paymentType === "Metal" ? "" : String(entry?.amount ?? ""),
      metal_type: metalType,
      weight: paymentType === "Metal" ? String(entry?.weight ?? "") : "",
      purity: paymentType === "Metal" ? String(entry?.purity || METAL_PURITY[metalType]) : "",
      reference_rate: paymentType === "Metal" ? String(entry?.reference_rate ?? "") : "",
    };
  });
};

export const summarizePaymentEntries = (entries = []) => {
  const moneyTotals = {
    Cash: 0,
    "Bank / UPI": 0,
    total: 0,
  };
  const metalTotals = createEmptyMetalMap();
  const metalReference = {};

  (entries || []).forEach((entry) => {
    if (entry.payment_type === "Metal") {
      const metalType = entry.metal_type;
      const weight = roundWeight(entry.weight);
      if (!METAL_PAYMENT_TYPES.includes(metalType) || weight <= 0) return;
      metalTotals[metalType] = roundWeight((metalTotals[metalType] || 0) + weight);
      const rate = roundMoney(entry.reference_rate);
      if (!metalReference[metalType]) metalReference[metalType] = { rate: 0, value: 0 };
      if (rate > 0) {
        metalReference[metalType].rate = rate;
        metalReference[metalType].value = roundMoney((metalReference[metalType].value || 0) + (weight * rate) / 10);
      }
      return;
    }

    const amount = roundMoney(entry.amount);
    if (amount <= 0) return;
    moneyTotals[entry.payment_type] = roundMoney((moneyTotals[entry.payment_type] || 0) + amount);
    moneyTotals.total = roundMoney(moneyTotals.total + amount);
  });

  return { moneyTotals, metalTotals, metalReference };
};

export const computeEstimateBalance = (items = [], paymentEntries = [], discount = 0, settlementRates = {}) => {
  let totalPcs = 0;
  let totalWeight = 0;
  let labourTotal = 0;
  const requiredMetal = createEmptyMetalMap();

  (items || []).forEach((item) => {
    const pcs = parseInt(item.pcs, 10) || 0;
    const sizeValue = parseFloat(item.size_value) || 0;
    const lcPerPiece = parseFloat(item.lc_pp) || 0;
    const weight = roundWeight(sizeValue * pcs);
    totalPcs += pcs;
    totalWeight = roundWeight(totalWeight + weight);
    labourTotal = roundMoney(labourTotal + (lcPerPiece * pcs));
    requiredMetal[item.metal_type || "Gold 24K"] = roundWeight((requiredMetal[item.metal_type || "Gold 24K"] || 0) + weight);
  });

  const paymentSummary = summarizePaymentEntries(paymentEntries);
  const appliedDiscount = roundMoney(Math.min(Math.max(parseFloat(discount) || 0, 0), labourTotal));
  const labourAfterDiscount = roundMoney(Math.max(labourTotal - appliedDiscount, 0));
  const normalizedSettlementRates = normalizeSettlementRates(
    settlementRates,
    Object.fromEntries(
      METAL_PAYMENT_TYPES.map((metalType) => [metalType, paymentSummary.metalReference?.[metalType]?.rate || 0])
    )
  );

  const metalDue = createEmptyMetalMap();
  const metalDueUnsettled = createEmptyMetalMap();
  const metalShortfallSettled = createEmptyMetalMap();
  const metalCredit = createEmptyMetalMap();
  const metalValueDue = createEmptyMetalMap();
  const metalValueCredit = createEmptyMetalMap();
  const settlementRate = {};
  let totalMetalValueDue = 0;
  let totalMetalValueCredit = 0;

  METAL_PAYMENT_TYPES.forEach((metalType) => {
    const diff = roundWeight((requiredMetal[metalType] || 0) - (paymentSummary.metalTotals[metalType] || 0));
    const refRate = normalizedSettlementRates[metalType] || 0;
    settlementRate[metalType] = refRate;
    if (diff >= 0) {
      metalDue[metalType] = diff;
      metalCredit[metalType] = 0;
      metalShortfallSettled[metalType] = refRate > 0 ? diff : 0;
      metalDueUnsettled[metalType] = refRate > 0 ? 0 : diff;
      metalValueDue[metalType] = refRate > 0 ? roundMoney((diff * refRate) / 10) : 0;
      metalValueCredit[metalType] = 0;
    } else {
      metalDue[metalType] = 0;
      metalDueUnsettled[metalType] = 0;
      metalShortfallSettled[metalType] = 0;
      metalCredit[metalType] = roundWeight(Math.abs(diff));
      metalValueDue[metalType] = 0;
      metalValueCredit[metalType] = refRate > 0 ? roundMoney((Math.abs(diff) * refRate) / 10) : 0;
    }
    totalMetalValueDue = roundMoney(totalMetalValueDue + metalValueDue[metalType]);
    totalMetalValueCredit = roundMoney(totalMetalValueCredit + metalValueCredit[metalType]);
  });

  const moneyPaid = paymentSummary.moneyTotals.total;
  const subtotal = roundMoney(labourAfterDiscount + totalMetalValueDue);
  const metalAdjustmentValue = roundMoney(totalMetalValueDue - totalMetalValueCredit);
  const settlementBeforeMoney = roundMoney(labourAfterDiscount + metalAdjustmentValue);
  const totalAmount = roundMoney(Math.max(settlementBeforeMoney, 0));
  const amountDue = roundMoney(Math.max(settlementBeforeMoney - moneyPaid, 0));
  const refundDue = roundMoney(Math.max(moneyPaid - settlementBeforeMoney, 0));
  const hasExcessMetal = METAL_PAYMENT_TYPES.some((metalType) => (metalCredit[metalType] || 0) > 0);
  const amountGiven = refundDue > 0 ? refundDue : 0;

  return {
    totalPcs,
    totalWeight,
    labourTotal,
    labourAfterDiscount,
    discount: appliedDiscount,
    moneyPaid,
    cashDue: amountDue,
    cashCredit: refundDue,
    requiredMetal,
    metalReceived: paymentSummary.metalTotals,
    metalDue,
    metalDueUnsettled,
    metalShortfallSettled,
    metalCredit,
    settlementRate,
    paymentSummary,
    report: {
      metalValueDue,
      totalMetalValueDue,
      metalValueCredit,
      totalMetalValueCredit,
      grandTotalEstimate: subtotal,
      finalPayable: totalAmount,
      balanceDue: amountDue,
      refundDue,
      amountGiven,
    },
    metalWeightTotals: requiredMetal,
    metalDiffs: metalDue,
    metalRsMap: metalValueDue,
    metalValueDue,
    metalValueCredit,
    totalMetalValueDue,
    totalMetalValueCredit,
    goldRs: metalAdjustmentValue,
    metalAdjustmentValue,
    subtotal,
    totalAmount,
    settlementBeforeMoney,
    amountDue,
    refundDue,
    amountGiven,
    hasExcessMetal,
    carryFine: metalCredit["Gold 24K"] || 0,
    ofgStatus: (metalCredit["Gold 24K"] || 0) > 0 ? "OF.G AFSL" : "OF.G HDF",
  };
};
