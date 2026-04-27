const METAL_PAYMENT_TYPES = ["Gold 24K", "Gold 22K", "Silver"];
const MONEY_PAYMENT_TYPES = ["Cash", "Bank / UPI"];
const PAYMENT_TYPES = [...MONEY_PAYMENT_TYPES, "Metal"];

const METAL_PURITY = {
  "Gold 24K": "99.99",
  "Gold 22K": "91.67",
  Silver: "99.90",
};

const createEmptyMetalMap = () => ({
  "Gold 24K": 0,
  "Gold 22K": 0,
  Silver: 0,
});

const roundMoney = (value) => parseFloat((parseFloat(value) || 0).toFixed(2));
const roundWeight = (value) => parseFloat((parseFloat(value) || 0).toFixed(4));

const normalizeSettlementRates = (rawRates = {}, fallbackRates = {}) => {
  const normalized = {};
  METAL_PAYMENT_TYPES.forEach((metalType) => {
    const preferred = roundMoney(rawRates?.[metalType]);
    const fallback = roundMoney(fallbackRates?.[metalType]);
    normalized[metalType] = preferred > 0 ? preferred : fallback;
  });
  return normalized;
};

const parseJsonSafe = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
};

const buildLegacyPaymentEntries = (data = {}) => {
  const entries = [];
  const cash = Math.max(0, parseFloat(data.cash_amount) || parseFloat(data.amt_jama) || 0);
  const bank = Math.max(0, parseFloat(data.online_amount) || 0);

  if (cash > 0) {
    entries.push({
      payment_type: "Cash",
      amount: roundMoney(cash),
    });
  }

  if (bank > 0) {
    entries.push({
      payment_type: "Bank / UPI",
      amount: roundMoney(bank),
    });
  }

  const legacyMetals = [
    {
      metal_type: "Gold 24K",
      weight: parseFloat(data.fine_jama) || 0,
      purity: METAL_PURITY["Gold 24K"],
      reference_rate: parseFloat(data.rate_10g) || 0,
    },
    {
      metal_type: "Gold 22K",
      weight: parseFloat(data.jama_gold_22k) || 0,
      purity: METAL_PURITY["Gold 22K"],
      reference_rate: parseFloat(data.rate_gold_22k) || 0,
    },
    {
      metal_type: "Silver",
      weight: parseFloat(data.jama_silver) || 0,
      purity: METAL_PURITY.Silver,
      reference_rate: parseFloat(data.rate_silver) || 0,
    },
  ];

  legacyMetals.forEach((entry) => {
    if ((entry.weight || 0) > 0) {
      entries.push({
        payment_type: "Metal",
        metal_type: entry.metal_type,
        weight: roundWeight(entry.weight),
        purity: entry.purity,
        reference_rate: roundMoney(entry.reference_rate),
      });
    }
  });

  return entries;
};

const normalizePaymentEntries = (rawEntries, legacyData = {}) => {
  const source = Array.isArray(rawEntries) && rawEntries.length > 0
    ? rawEntries
    : buildLegacyPaymentEntries(legacyData);

  return source
    .map((entry) => {
      const paymentType = String(entry?.payment_type || "").trim();
      if (!PAYMENT_TYPES.includes(paymentType)) return null;

      if (paymentType === "Metal") {
        const metalType = String(entry?.metal_type || "").trim();
        const weight = roundWeight(entry?.weight);
        if (!METAL_PAYMENT_TYPES.includes(metalType) || weight <= 0) return null;

        return {
          payment_type: "Metal",
          metal_type: metalType,
          weight,
          purity: String(entry?.purity || METAL_PURITY[metalType] || "").trim(),
          reference_rate: roundMoney(entry?.reference_rate),
        };
      }

      const amount = roundMoney(entry?.amount);
      if (amount <= 0) return null;

      return {
        payment_type: paymentType,
        amount,
      };
    })
    .filter(Boolean);
};

const summarizePaymentEntries = (entries = []) => {
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
      metalTotals[metalType] = roundWeight((metalTotals[metalType] || 0) + (entry.weight || 0));
      if (!metalReference[metalType]) {
        metalReference[metalType] = { rate: 0, value: 0 };
      }
      const rate = roundMoney(entry.reference_rate);
      if (rate > 0) {
        metalReference[metalType].rate = rate;
        metalReference[metalType].value = roundMoney(
          metalReference[metalType].value + ((entry.weight || 0) * rate) / 10
        );
      }
      return;
    }

    moneyTotals[entry.payment_type] = roundMoney(
      (moneyTotals[entry.payment_type] || 0) + (entry.amount || 0)
    );
    moneyTotals.total = roundMoney(moneyTotals.total + (entry.amount || 0));
  });

  return {
    moneyTotals,
    metalTotals,
    metalReference,
  };
};

const computeEstimateBalance = ({ items = [], paymentEntries = [], discount = 0, settlementRates = {} }) => {
  let totalPcs = 0;
  let totalWeight = 0;
  let labourTotal = 0;
  const requiredMetal = createEmptyMetalMap();

  (items || []).forEach((item) => {
    const pcs = parseInt(item.pcs, 10) || 0;
    const sizeValue = parseFloat(item.size_value) || 0;
    const lcPerPiece = parseFloat(item.lc_pp) || 0;
    const weight = roundWeight(sizeValue * pcs);
    const labour = roundMoney(lcPerPiece * pcs);
    const metalType = item.metal_type || "Gold 24K";

    totalPcs += pcs;
    totalWeight = roundWeight(totalWeight + weight);
    labourTotal = roundMoney(labourTotal + labour);
    requiredMetal[metalType] = roundWeight((requiredMetal[metalType] || 0) + weight);
  });

  const paymentSummary = summarizePaymentEntries(paymentEntries);
  const moneyPaid = roundMoney(paymentSummary.moneyTotals.total);
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
  let reportMetalValueDueTotal = 0;
  let reportMetalValueCreditTotal = 0;

  METAL_PAYMENT_TYPES.forEach((metalType) => {
    const due = roundWeight((requiredMetal[metalType] || 0) - (paymentSummary.metalTotals[metalType] || 0));
    const refRate = normalizedSettlementRates[metalType] || 0;
    settlementRate[metalType] = refRate;
    if (due >= 0) {
      metalDue[metalType] = due;
      metalCredit[metalType] = 0;
      metalShortfallSettled[metalType] = refRate > 0 ? due : 0;
      metalDueUnsettled[metalType] = refRate > 0 ? 0 : due;
      metalValueDue[metalType] = refRate > 0 ? roundMoney((due * refRate) / 10) : 0;
      metalValueCredit[metalType] = 0;
    } else {
      metalDue[metalType] = 0;
      metalDueUnsettled[metalType] = 0;
      metalShortfallSettled[metalType] = 0;
      metalCredit[metalType] = roundWeight(Math.abs(due));
      metalValueDue[metalType] = 0;
      metalValueCredit[metalType] = refRate > 0 ? roundMoney((Math.abs(due) * refRate) / 10) : 0;
    }
    reportMetalValueDueTotal = roundMoney(reportMetalValueDueTotal + (metalValueDue[metalType] || 0));
    reportMetalValueCreditTotal = roundMoney(reportMetalValueCreditTotal + (metalValueCredit[metalType] || 0));
  });

  const subtotal = roundMoney(labourAfterDiscount + reportMetalValueDueTotal);
  const metalAdjustment = roundMoney(reportMetalValueDueTotal - reportMetalValueCreditTotal);
  const settlementBeforeMoney = roundMoney(labourAfterDiscount + metalAdjustment);
  const finalPayable = roundMoney(Math.max(settlementBeforeMoney, 0));
  const balanceDue = roundMoney(Math.max(settlementBeforeMoney - moneyPaid, 0));
  const refundDue = roundMoney(Math.max(moneyPaid - settlementBeforeMoney, 0));
  const hasExcessMetal = METAL_PAYMENT_TYPES.some((metalType) => (metalCredit[metalType] || 0) > 0);
  const amountGiven = hasExcessMetal ? refundDue : 0;

  return {
    total_pcs: totalPcs,
    total_weight: totalWeight,
    labour_total: labourTotal,
    labour_after_discount: labourAfterDiscount,
    discount: appliedDiscount,
    money_paid: moneyPaid,
    cash_due: balanceDue,
    cash_credit: refundDue,
    subtotal,
    total_amount: finalPayable,
    amount_due: balanceDue,
    refund_due: refundDue,
    amount_given: amountGiven,
    has_excess_metal: hasExcessMetal,
    metal_adjustment_value: metalAdjustment,
    settlement_before_money: settlementBeforeMoney,
    required_metal: requiredMetal,
    metal_received: paymentSummary.metalTotals,
    metal_due: metalDue,
    metal_due_unsettled: metalDueUnsettled,
    metal_shortfall_settled: metalShortfallSettled,
    metal_credit: metalCredit,
    settlement_rate: settlementRate,
    payment_summary: paymentSummary,
    report: {
      metal_value_due: metalValueDue,
      total_metal_value_due: reportMetalValueDueTotal,
      metal_value_credit: metalValueCredit,
      total_metal_value_credit: reportMetalValueCreditTotal,
      grand_total_estimate: subtotal,
      final_payable: finalPayable,
      balance_due: balanceDue,
      refund_due: refundDue,
      amount_given: amountGiven,
    },
  };
};

module.exports = {
  METAL_PAYMENT_TYPES,
  MONEY_PAYMENT_TYPES,
  PAYMENT_TYPES,
  METAL_PURITY,
  createEmptyMetalMap,
  roundMoney,
  roundWeight,
  parseJsonSafe,
  buildLegacyPaymentEntries,
  normalizePaymentEntries,
  normalizeSettlementRates,
  summarizePaymentEntries,
  computeEstimateBalance,
};
