const db = require("../../config/dbConfig");
const customerService = require("./customerService");
const counterService = require("./counterService");
const { createAppError, isValidMetalType } = require("../utils/common");
const {
  METAL_PAYMENT_TYPES,
  METAL_PURITY,
  normalizePaymentEntries,
  normalizeSettlementRates,
  summarizePaymentEntries,
  computeEstimateBalance,
  parseJsonSafe,
  roundMoney,
  roundWeight,
} = require("../utils/sellingPayments");

const REFERENCE_TYPE = "ORDER_BILL";
const VALID_CUSTOMER_TYPES = ["Retail", "Showroom", "Wholesale"];

const parseProducts = (raw) => {
  if (!raw) return ["Gold 24K"];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? arr : ["Gold 24K"];
  } catch {
    return ["Gold 24K"];
  }
};

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

const _derivePaymentMode = (paymentEntries) => {
  const types = new Set((paymentEntries || []).map((entry) => entry.payment_type));
  if (types.size === 0) return "Unpaid";
  if (types.size === 1) return [...types][0];
  return "Mixed";
};

const _extractLegacyMetalFields = (paymentEntries, settlementRates = {}) => {
  const summary = summarizePaymentEntries(paymentEntries);
  const rates = normalizeSettlementRates(settlementRates, {
    "Gold 24K": summary.metalReference["Gold 24K"]?.rate || 0,
    "Gold 22K": summary.metalReference["Gold 22K"]?.rate || 0,
    Silver: summary.metalReference.Silver?.rate || 0,
  });
  return {
    fine_jama: summary.metalTotals["Gold 24K"] || 0,
    rate_10g: rates["Gold 24K"] || 0,
    jama_gold_22k: summary.metalTotals["Gold 22K"] || 0,
    rate_gold_22k: rates["Gold 22K"] || 0,
    jama_silver: summary.metalTotals.Silver || 0,
    rate_silver: rates.Silver || 0,
    cash_amount: summary.moneyTotals.Cash || 0,
    online_amount: summary.moneyTotals["Bank / UPI"] || 0,
    amt_jama: summary.moneyTotals.total || 0,
  };
};

const _buildBalanceSnapshot = (items, paymentEntries, discount, settlementRates = {}) => {
  const computed = computeEstimateBalance({
    items,
    paymentEntries,
    discount,
    settlementRates,
  });

  return {
    required_metal: computed.required_metal,
    metal_received: computed.metal_received,
    metal_due: computed.metal_due,
    metal_due_unsettled: computed.metal_due_unsettled,
    metal_shortfall_settled: computed.metal_shortfall_settled,
    metal_credit: computed.metal_credit,
    settlement_rate: computed.settlement_rate,
    money_paid: computed.money_paid,
    cash_due: computed.cash_due,
    cash_credit: computed.cash_credit,
    labour_total: computed.labour_total,
    labour_after_discount: computed.labour_after_discount,
    discount: computed.discount,
    subtotal: computed.subtotal,
    total_amount: computed.total_amount,
    amount_due: computed.amount_due,
    refund_due: computed.refund_due,
    amount_given: computed.amount_given,
    has_excess_metal: computed.has_excess_metal,
    metal_adjustment_value: computed.metal_adjustment_value,
    settlement_before_money: computed.settlement_before_money,
    report: computed.report,
  };
};

const _computeSummary = (items, paymentEntries, discount = 0, settlementRates = {}) => {
  const balance = _buildBalanceSnapshot(items, paymentEntries, discount, settlementRates);
  const gold24Due = balance.metal_due["Gold 24K"] || 0;
  const gold24Credit = balance.metal_credit["Gold 24K"] || 0;

  return {
    total_pcs: (items || []).reduce((sum, item) => sum + (parseInt(item.pcs, 10) || 0), 0),
    total_weight: roundWeight((items || []).reduce((sum, item) => {
      const pcs = parseInt(item.pcs, 10) || 0;
      const sizeValue = parseFloat(item.size_value) || 0;
      return sum + (sizeValue * pcs);
    }, 0)),
    labour_total: balance.labour_total,
    fine_diff: gold24Due,
    gold_rs: balance.metal_adjustment_value || 0,
    subtotal: balance.subtotal || 0,
    discount: balance.discount,
    total_amount: balance.total_amount || 0,
    amt_baki: balance.amount_due || 0,
    refund_due: balance.refund_due || 0,
    amount_given: balance.amount_given || 0,
    ofg_status: gold24Credit > 0 ? "OF.G AFSL" : "OF.G HDF",
    fine_carry: gold24Credit,
    amt_jama: balance.money_paid,
    balance_snapshot: balance,
  };
};

const _validateBillInput = (data, { requireObNo = false } = {}) => {
  if (!data || typeof data !== "object") {
    throw createAppError("Invalid estimate payload", 400, "INVALID_PAYLOAD");
  }

  if (requireObNo) {
    const obNo = parseInt(data.ob_no, 10);
    if (!Number.isInteger(obNo) || obNo <= 0) {
      throw createAppError("Estimate number must be a positive integer", 400, "INVALID_ESTIMATE_NO");
    }
  }

  if (!data.date || !String(data.date).trim()) {
    throw createAppError("Date is required", 400, "DATE_REQUIRED");
  }

  if (!Array.isArray(data.products) || data.products.length === 0) {
    throw createAppError("At least one metal type must be selected", 400, "PRODUCTS_REQUIRED");
  }

  const invalidProducts = data.products.filter((metalType) => !isValidMetalType(metalType));
  if (invalidProducts.length > 0) {
    throw createAppError(`Invalid metal type: ${invalidProducts[0]}`, 400, "INVALID_METAL");
  }

  if (data.customer_type && !VALID_CUSTOMER_TYPES.includes(data.customer_type)) {
    throw createAppError("Invalid customer type", 400, "INVALID_CUSTOMER_TYPE");
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw createAppError("At least one estimate item is required", 400, "ITEMS_REQUIRED");
  }

  data.items.forEach((item, index) => {
    const pcsRaw = Number(item?.pcs);
    if (item?.pcs != null && item?.pcs !== "" && (!Number.isFinite(pcsRaw) || pcsRaw < 0 || !Number.isInteger(pcsRaw))) {
      throw createAppError(`PCS must be a whole number 0 or greater on item ${index + 1}`, 400, "ITEM_PCS_INVALID");
    }
  });

  const nonZeroItems = data.items.filter((item) => (parseInt(item.pcs, 10) || 0) > 0);
  if (nonZeroItems.length === 0) {
    throw createAppError("Enter quantity for at least one size", 400, "PCS_REQUIRED");
  }

  nonZeroItems.forEach((item, index) => {
    if (!isValidMetalType(item.metal_type || "")) {
      throw createAppError(`Invalid metal type on item ${index + 1}`, 400, "INVALID_ITEM_METAL");
    }
    if (!item.category || !String(item.category).trim()) {
      throw createAppError(`Category is required on item ${index + 1}`, 400, "ITEM_CATEGORY_REQUIRED");
    }
    if (!item.size_label || !String(item.size_label).trim()) {
      throw createAppError(`Size label is required on item ${index + 1}`, 400, "ITEM_SIZE_REQUIRED");
    }
    const sizeValue = parseFloat(item.size_value);
    if (!Number.isFinite(sizeValue) || sizeValue <= 0) {
      throw createAppError(`Size value must be greater than 0 on item ${index + 1}`, 400, "ITEM_SIZE_INVALID");
    }
    const lcPp = parseFloat(item.lc_pp);
    if (!Number.isFinite(lcPp) || lcPp < 0) {
      throw createAppError(`Labour charge must be 0 or greater on item ${index + 1}`, 400, "ITEM_LABOUR_INVALID");
    }
  });

  if (data.customer_id != null && data.customer_id !== "") {
    const customerId = parseInt(data.customer_id, 10);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      throw createAppError("Selected customer is invalid", 400, "CUSTOMER_INVALID");
    }
  }

  if (data.settlement_rates && typeof data.settlement_rates === "object") {
    METAL_PAYMENT_TYPES.forEach((metalType) => {
      const rawRate = data.settlement_rates?.[metalType];
      if (rawRate == null || rawRate === "") return;
      const parsedRate = parseFloat(rawRate);
      if (!Number.isFinite(parsedRate) || parsedRate < 0) {
        throw createAppError(`Settlement rate for ${metalType} must be 0 or greater`, 400, "SETTLEMENT_RATE_INVALID");
      }
    });
  }

  if (Array.isArray(data.payment_entries)) {
    data.payment_entries.forEach((entry, index) => {
      const paymentType = String(entry?.payment_type || "").trim();
      if (!["Cash", "Bank / UPI", "Metal"].includes(paymentType)) {
        throw createAppError(`Invalid payment type on entry ${index + 1}`, 400, "PAYMENT_TYPE_INVALID");
      }

      if (paymentType === "Metal") {
        if (!METAL_PAYMENT_TYPES.includes(String(entry?.metal_type || "").trim())) {
          throw createAppError(`Invalid metal type on payment entry ${index + 1}`, 400, "PAYMENT_METAL_INVALID");
        }
        const weight = parseFloat(entry?.weight);
        if (!Number.isFinite(weight) || weight <= 0) {
          throw createAppError(`Metal weight must be greater than 0 on payment entry ${index + 1}`, 400, "PAYMENT_WEIGHT_INVALID");
        }
        const referenceRate = entry?.reference_rate;
        if (referenceRate != null && referenceRate !== "") {
          const parsedRate = parseFloat(referenceRate);
          if (!Number.isFinite(parsedRate) || parsedRate < 0) {
            throw createAppError(`Reference rate must be 0 or greater on payment entry ${index + 1}`, 400, "PAYMENT_RATE_INVALID");
          }
        }
        return;
      }

      const amount = parseFloat(entry?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw createAppError(`Payment amount must be greater than 0 on entry ${index + 1}`, 400, "PAYMENT_AMOUNT_INVALID");
      }
    });
  }

  const paymentEntries = normalizePaymentEntries(data.payment_entries, data);
  if (Array.isArray(data.payment_entries) && data.payment_entries.length > 0 && paymentEntries.length === 0) {
    throw createAppError("At least one valid payment entry is required", 400, "PAYMENT_ENTRY_INVALID");
  }

  paymentEntries.forEach((entry) => {
    if (entry.payment_type === "Metal" && !METAL_PAYMENT_TYPES.includes(entry.metal_type)) {
      throw createAppError(`Invalid metal payment type: ${entry.metal_type}`, 400, "INVALID_METAL_PAYMENT");
    }
  });

  if (data.discount != null && data.discount !== "") {
    const discount = parseFloat(data.discount);
    if (!Number.isFinite(discount) || discount < 0) {
      throw createAppError("Discount cannot be negative", 400, "DISCOUNT_INVALID");
    }
  }

  const hasCustomerDraft = (data.customer_name || "").trim() || (data.customer_phone || "").trim() || (data.customer_address || "").trim();
  if (!data.customer_id && hasCustomerDraft) {
    if (!(data.customer_name || "").trim()) {
      throw createAppError("Customer name is required for a new customer", 400, "CUSTOMER_NAME_REQUIRED");
    }
    if (!(data.customer_address || "").trim()) {
      throw createAppError("Address is required for a new customer", 400, "CUSTOMER_ADDRESS_REQUIRED");
    }
  }

  const moneyEntryExists = paymentEntries.some((entry) => entry.payment_type !== "Metal");
  if (moneyEntryExists) {
    const settlementRates = normalizeSettlementRates(data.settlement_rates, data.settlement_rates);
    const balancePreview = computeEstimateBalance({
      items: nonZeroItems,
      paymentEntries,
      discount: Math.max(0, parseFloat(data.discount) || 0),
      settlementRates,
    });

    const missingRateMetal = METAL_PAYMENT_TYPES.find((metalType) => {
      const shortfall = roundWeight(balancePreview.metal_due?.[metalType] || 0);
      const excess = roundWeight(balancePreview.metal_credit?.[metalType] || 0);
      const rate = roundMoney(settlementRates?.[metalType] || 0);
      return (shortfall > 0 || excess > 0) && rate <= 0;
    });

    if (missingRateMetal) {
      throw createAppError(`Settlement rate is required for ${missingRateMetal} when cash or bank is involved`, 400, "SETTLEMENT_RATE_REQUIRED");
    }
  }

  return paymentEntries;
};

const _resolveCustomerId = async (data) => {
  if (data.customer_id != null && data.customer_id !== "") {
    const customerId = parseInt(data.customer_id, 10);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      throw createAppError("Selected customer is invalid", 400, "CUSTOMER_INVALID");
    }
    const customer = await customerService.getCustomerById(customerId);
    if (!customer) {
      throw createAppError("Selected customer does not exist", 400, "CUSTOMER_NOT_FOUND");
    }
    return customer.id;
  }
  const phone = (data.customer_phone || "").toString().trim();
  const name = (data.customer_name || "").toString().trim();
  if (!phone || !name) return null;
  const customer = await customerService.findOrCreateByPhone({
    party_name: name,
    phone_no: phone,
    address: data.customer_address || "",
    city: data.customer_city || "",
    firm_name: data.customer_firm || "",
    telephone_no: data.customer_telephone || "",
    customer_type: data.customer_type || "Retail",
  });
  return customer ? customer.id : null;
};

const getNextObNo = () =>
  new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(MAX(ob_no), 0) + 1 AS next_no FROM order_bills`,
      [],
      (err, row) => {
        if (err) return reject(err);
        resolve(row.next_no);
      }
    );
  });

const _decorateBillRow = (row) => {
  const paymentEntries = normalizePaymentEntries(parseJsonSafe(row.payment_entries, []), row);
  const balanceSnapshot =
    parseJsonSafe(row.balance_snapshot, null) ||
    _buildBalanceSnapshot([], paymentEntries, row.discount);

  return {
    ...row,
    products: parseProducts(row.products),
    payment_entries: paymentEntries,
    balance_snapshot: balanceSnapshot,
  };
};

const listBills = ({ date } = {}) =>
  new Promise((resolve, reject) => {
    const filters = [];
    const params = [];

    if (date && String(date).trim()) {
      filters.push("b.date = ?");
      params.push(String(date).trim());
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    db.all(
      `SELECT b.*, c.party_name AS customer_party_name
         FROM order_bills b
         LEFT JOIN customers c ON b.customer_id = c.id
         ${whereClause}
        ORDER BY b.date DESC, b.ob_no DESC`,
      params,
      (err, rows) => {
        if (err) return reject(err);
        resolve((rows || []).map(_decorateBillRow));
      }
    );
  });

const getBillById = (id) =>
  new Promise((resolve, reject) => {
    db.get(
      `SELECT b.*, c.party_name AS customer_party_name
         FROM order_bills b
         LEFT JOIN customers c ON b.customer_id = c.id
        WHERE b.id = ?`,
      [id],
      (err, bill) => {
        if (err) return reject(err);
        if (!bill) return resolve(null);
        db.all(
          `SELECT * FROM order_bill_items WHERE bill_id = ? ORDER BY metal_type, category, sort_order`,
          [id],
          (err2, items) => {
            if (err2) return reject(err2);
            const paymentEntries = normalizePaymentEntries(parseJsonSafe(bill.payment_entries, []), bill);
            const balanceSnapshot =
              parseJsonSafe(bill.balance_snapshot, null) ||
              _buildBalanceSnapshot(items || [], paymentEntries, bill.discount);

            resolve({
              ...bill,
              products: parseProducts(bill.products),
              items: (items || []).map((i) => ({
                ...i,
                metal_type: i.metal_type || "Gold 24K",
              })),
              payment_entries: paymentEntries,
              balance_snapshot: balanceSnapshot,
            });
          }
        );
      }
    );
  });

const _insertItems = async (run, billId, items) => {
  for (const [i, item] of items.entries()) {
    const pcs = parseInt(item.pcs, 10) || 0;
    const sizeValue = parseFloat(item.size_value) || 0;
    const weight = roundWeight(sizeValue * pcs);
    const lcPp = parseFloat(item.lc_pp) || 0;
    const tLc = roundMoney(lcPp * pcs);
    await run(
      `INSERT INTO order_bill_items
        (bill_id, metal_type, category, size_label, size_value, pcs, weight, lc_pp, t_lc, is_custom, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        billId,
        item.metal_type || "Gold 24K",
        item.category || "Standard",
        item.size_label || "",
        sizeValue,
        pcs,
        weight,
        lcPp,
        tLc,
        item.is_custom ? 1 : 0,
        item.sort_order != null ? item.sort_order : i,
      ]
    );
  }
};

const _deleteAccountingEntries = async (run, billId) => {
  await run(
    `DELETE FROM customer_ledger_entries WHERE reference_type = ? AND reference_id = ?`,
    [REFERENCE_TYPE, billId]
  );
  await run(
    `DELETE FROM counter_cash_ledger WHERE reference_type = ? AND reference_id = ?`,
    [REFERENCE_TYPE, billId]
  );
  await run(
    `DELETE FROM stock_transactions WHERE reference_type = ? AND reference_id = ?`,
    [REFERENCE_TYPE, billId]
  );
};

const _applyOutstandingDelta = async (run, customerId, delta) => {
  if (!customerId) return;
  const row = await new Promise((resolve, reject) => {
    db.get(
      `SELECT ROUND(COALESCE(SUM(amount_delta), 0), 2) AS outstanding_balance
         FROM customer_ledger_entries
        WHERE customer_id = ?`,
      [customerId],
      (err, result) => {
        if (err) return reject(err);
        resolve(result || { outstanding_balance: 0 });
      }
    );
  });

  await run(
    `UPDATE customers
        SET outstanding_balance = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [Math.max(roundMoney(row?.outstanding_balance || 0), 0), customerId]
  );
};

const _insertAccountingEntries = async (
  run, billId, obNo, date, customerId, summary, paymentEntries
) => {
  if (customerId) {
    const labourDue = roundMoney(Math.max(summary.labour_total - summary.discount, 0));
    if (labourDue > 0) {
      await run(
        `INSERT INTO customer_ledger_entries
          (customer_id, entry_date, reference_type, reference_id, reference_no, transaction_type, line_type, amount_delta, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId, date, REFERENCE_TYPE, billId, String(obNo),
          "Estimate", "LABOUR_DEBIT", labourDue, `Labour on estimate #${obNo}`,
        ]
      );
    }

    for (const metalType of METAL_PAYMENT_TYPES) {
      const unresolvedDueWeight = roundWeight(summary.balance_snapshot.metal_due_unsettled?.[metalType] || 0);
      const metalReceivedWeight = roundWeight(summary.balance_snapshot.metal_received?.[metalType] || 0);
      const requiredWeight      = roundWeight(summary.balance_snapshot.required_metal?.[metalType] || 0);
      // Derive net diff to choose debit formula:
      // • Shortfall (received < required): debit = unsettled + received  → net = unsettled (cash-settled portion excluded)
      // • Excess or exact (received >= required): debit = required        → net = required − received = −|excess| or 0
      const rawDiff = roundWeight(requiredWeight - metalReceivedWeight);
      const metalDebitWeight = rawDiff > 0
        ? roundWeight(unresolvedDueWeight + metalReceivedWeight)
        : requiredWeight;

      if (metalDebitWeight > 0) {
        const debitNote = unresolvedDueWeight > 0
          ? `${metalType} on estimate #${obNo} (${unresolvedDueWeight.toFixed(4)}g pending, ${metalReceivedWeight.toFixed(4)}g received)`
          : `${metalType} on estimate #${obNo} (${metalReceivedWeight.toFixed(4)}g received)`;
        await run(
          `INSERT INTO customer_ledger_entries
            (customer_id, entry_date, reference_type, reference_id, reference_no, transaction_type, payment_mode, line_type, metal_type, metal_purity, weight_delta, amount_delta, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            customerId, date, REFERENCE_TYPE, billId, String(obNo),
            "Estimate", "Metal", "METAL_DEBIT", metalType, METAL_PURITY[metalType] || "",
            metalDebitWeight, 0, debitNote,
          ]
        );
      }

      const metalShortfallValue = roundMoney(summary.balance_snapshot.report?.metal_value_due?.[metalType] || 0);
      if (metalShortfallValue > 0) {
        await run(
          `INSERT INTO customer_ledger_entries
            (customer_id, entry_date, reference_type, reference_id, reference_no, transaction_type, payment_mode, line_type, metal_type, metal_purity, reference_rate, amount_delta, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
          [
            customerId, date, REFERENCE_TYPE, billId, String(obNo),
            "Estimate", "Metal", "METAL_VALUE_DEBIT", metalType, METAL_PURITY[metalType] || "",
            roundMoney(summary.balance_snapshot.settlement_rate?.[metalType] || 0), metalShortfallValue,
            `${metalType} shortfall value on estimate #${obNo}`,
          ]
        );
      }

      const metalExcessValue = roundMoney(summary.balance_snapshot.report?.metal_value_credit?.[metalType] || 0);
      if (metalExcessValue > 0) {
        await run(
          `INSERT INTO customer_ledger_entries
            (customer_id, entry_date, reference_type, reference_id, reference_no, transaction_type, payment_mode, line_type, metal_type, metal_purity, reference_rate, amount_delta, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
          [
            customerId, date, REFERENCE_TYPE, billId, String(obNo),
            "Estimate", "Metal", "METAL_VALUE_CREDIT", metalType, METAL_PURITY[metalType] || "",
            roundMoney(summary.balance_snapshot.settlement_rate?.[metalType] || 0), -metalExcessValue,
            `${metalType} excess value adjustment on estimate #${obNo}`,
          ]
        );
      }
    }

    if (summary.amount_given > 0) {
      await run(
        `INSERT INTO customer_ledger_entries
          (customer_id, entry_date, reference_type, reference_id, reference_no, transaction_type, payment_mode, line_type, amount_delta, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId, date, REFERENCE_TYPE, billId, String(obNo),
          "Refund", "Cash", "REFUND_CASH_OUT", roundMoney(summary.amount_given),
          `Cash returned to customer on estimate #${obNo}`,
        ]
      );

      await run(
        `INSERT INTO counter_cash_ledger
          (entry_date, reference_type, reference_id, reference_no, mode, amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          date, REFERENCE_TYPE, billId, String(obNo), "Cash", -roundMoney(summary.amount_given),
          `Cash returned on Estimate #${obNo}`,
        ]
      );
    }

    for (const entry of paymentEntries) {
      if (entry.payment_type === "Metal") {
        await run(
          `INSERT INTO customer_ledger_entries
            (customer_id, entry_date, reference_type, reference_id, reference_no, transaction_type, payment_mode, line_type, metal_type, metal_purity, reference_rate, weight_delta, amount_delta, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            customerId, date, REFERENCE_TYPE, billId, String(obNo),
            "Payment", "Metal", "PAYMENT_METAL", entry.metal_type, entry.purity || METAL_PURITY[entry.metal_type] || "",
            roundMoney(entry.reference_rate), -roundWeight(entry.weight), 0,
            `${entry.metal_type} payment on estimate #${obNo}`,
          ]
        );

        await run(
          `INSERT INTO stock_transactions
            (date, metal_type, transaction_type, weight, description, reference_type, reference_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            date, entry.metal_type, "ESTIMATE_METAL_IN", roundWeight(entry.weight),
            `Customer metal received on Estimate #${obNo}`,
            REFERENCE_TYPE, billId,
          ]
        );
        continue;
      }

      await run(
        `INSERT INTO customer_ledger_entries
          (customer_id, entry_date, reference_type, reference_id, reference_no, transaction_type, payment_mode, line_type, amount_delta, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId, date, REFERENCE_TYPE, billId, String(obNo),
          "Payment", entry.payment_type, entry.payment_type === "Cash" ? "PAYMENT_CASH" : "PAYMENT_BANK",
          -roundMoney(entry.amount), `${entry.payment_type} payment on estimate #${obNo}`,
        ]
      );

      await run(
        `INSERT INTO counter_cash_ledger
          (entry_date, reference_type, reference_id, reference_no, mode, amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          date, REFERENCE_TYPE, billId, String(obNo), entry.payment_type, roundMoney(entry.amount),
          `Estimate #${obNo} payment`,
        ]
      );
    }
  } else {
    if (summary.amount_given > 0) {
      await run(
        `INSERT INTO counter_cash_ledger
          (entry_date, reference_type, reference_id, reference_no, mode, amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          date, REFERENCE_TYPE, billId, String(obNo), "Cash", -roundMoney(summary.amount_given),
          `Cash returned on Estimate #${obNo}`,
        ]
      );
    }

    for (const entry of paymentEntries) {
      if (entry.payment_type === "Metal") {
        await run(
          `INSERT INTO stock_transactions
            (date, metal_type, transaction_type, weight, description, reference_type, reference_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            date, entry.metal_type, "ESTIMATE_METAL_IN", roundWeight(entry.weight),
            `Customer metal received on Estimate #${obNo}`,
            REFERENCE_TYPE, billId,
          ]
        );
      } else {
        await run(
          `INSERT INTO counter_cash_ledger
            (entry_date, reference_type, reference_id, reference_no, mode, amount, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            date, REFERENCE_TYPE, billId, String(obNo), entry.payment_type, roundMoney(entry.amount),
            `Estimate #${obNo} payment`,
          ]
        );
      }
    }
  }
};

const createBill = async (data) => {
  const paymentEntries = _validateBillInput(data);
  const obNo = data.ob_no ? parseInt(data.ob_no, 10) : await getNextObNo();
  const existing = await new Promise((resolve, reject) =>
    db.get(`SELECT id FROM order_bills WHERE ob_no = ?`, [obNo], (err, row) => err ? reject(err) : resolve(row))
  );
  if (existing) {
    throw createAppError(`Estimate No. ${obNo} already exists. Please use a different number.`, 409, "ESTIMATE_NO_CONFLICT");
  }

  const hasMetalPayment = paymentEntries.some((entry) => entry.payment_type === "Metal");
  const hasCustomerHint = !!(data.customer_id || ((data.customer_phone || "").trim() && (data.customer_name || "").trim()));
  if (hasMetalPayment && !hasCustomerHint) {
    throw createAppError("Metal payment requires a customer. Please select or add one.", 400, "CUSTOMER_REQUIRED_FOR_METAL_PAYMENT");
  }

  const discount = Math.max(0, parseFloat(data.discount) || 0);
  const settlementRates = normalizeSettlementRates(data.settlement_rates, data.settlement_rates);
  const summary = _computeSummary(data.items || [], paymentEntries, discount, settlementRates);
  const productsJson = JSON.stringify(
    Array.isArray(data.products) && data.products.length ? data.products : ["Gold 24K"]
  );
  const legacyFields = _extractLegacyMetalFields(paymentEntries, settlementRates);
  const resolvedCustomerId = await _resolveCustomerId(data);

  if (hasMetalPayment && !resolvedCustomerId) {
    throw createAppError("Metal payment requires a resolvable customer. Please select or add one.", 400, "CUSTOMER_RESOLUTION_REQUIRED");
  }

  return db.runTransaction(async (run) => {
    await counterService.assertStockAvailable(data.items || []);
    const { lastID } = await run(
      `INSERT INTO order_bills
        (ob_no, date, product, products,
         customer_id, customer_name, customer_city, customer_address, customer_phone, customer_type,
         fine_jama, rate_10g, jama_gold_22k, rate_gold_22k, jama_silver, rate_silver,
         amt_jama, cash_amount, online_amount, payment_mode, payment_entries, balance_snapshot,
         total_pcs, total_weight, labour_total, fine_diff, gold_rs,
         subtotal, discount, total_amount, amt_baki, refund_due, ofg_status, fine_carry)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        obNo, data.date, data.product || "", productsJson,
        resolvedCustomerId || null,
        data.customer_name || "",
        data.customer_city || "",
        data.customer_address || "",
        data.customer_phone || "",
        data.customer_type || "Retail",
        legacyFields.fine_jama, legacyFields.rate_10g,
        legacyFields.jama_gold_22k, legacyFields.rate_gold_22k,
        legacyFields.jama_silver, legacyFields.rate_silver,
        legacyFields.amt_jama, legacyFields.cash_amount, legacyFields.online_amount,
        _derivePaymentMode(paymentEntries), JSON.stringify(paymentEntries), JSON.stringify(summary.balance_snapshot),
        summary.total_pcs, summary.total_weight, summary.labour_total, summary.fine_diff, summary.gold_rs,
        summary.subtotal, summary.discount, summary.total_amount, summary.amt_baki, summary.refund_due,
        summary.ofg_status, summary.fine_carry,
      ]
    );

    await _insertItems(run, lastID, data.items || []);
    await counterService.reserveEstimateStock(run, lastID, obNo, data.date, data.items || []);
    await _insertAccountingEntries(run, lastID, obNo, data.date, resolvedCustomerId, summary, paymentEntries);
    if (resolvedCustomerId) {
      await _applyOutstandingDelta(run, resolvedCustomerId);
    }
    return lastID;
  });
};

const updateBill = async (id, data) => {
  const paymentEntries = _validateBillInput(data, { requireObNo: true });
  const obNo = parseInt(data.ob_no, 10);
  const conflict = await new Promise((resolve, reject) =>
    db.get(`SELECT id FROM order_bills WHERE ob_no = ? AND id != ?`, [obNo, id], (err, row) => err ? reject(err) : resolve(row))
  );
  if (conflict) {
    throw createAppError(`Estimate No. ${obNo} already exists. Please use a different number.`, 409, "ESTIMATE_NO_CONFLICT");
  }

  const discount = Math.max(0, parseFloat(data.discount) || 0);
  const settlementRates = normalizeSettlementRates(data.settlement_rates, data.settlement_rates);
  const summary = _computeSummary(data.items || [], paymentEntries, discount, settlementRates);
  const productsJson = JSON.stringify(
    Array.isArray(data.products) && data.products.length ? data.products : ["Gold 24K"]
  );
  const legacyFields = _extractLegacyMetalFields(paymentEntries, settlementRates);
  const resolvedCustomerId = await _resolveCustomerId(data);
  const hasMetalPayment = paymentEntries.some((entry) => entry.payment_type === "Metal");
  if (hasMetalPayment && !resolvedCustomerId) {
    throw createAppError("Metal payment requires a resolvable customer. Please select or add one.", 400, "CUSTOMER_RESOLUTION_REQUIRED");
  }

  return db.runTransaction(async (run, get) => {
    const oldBill = await get(`SELECT customer_id FROM order_bills WHERE id = ?`, [id]);
    if (!oldBill) throw createAppError("Estimate not found", 404, "ESTIMATE_NOT_FOUND");

    await counterService.releaseEstimateStock(run, id);
    await counterService.assertStockAvailable(data.items || []);

    await run(
      `UPDATE order_bills SET
         ob_no=?, date=?, product=?, products=?,
         customer_id=?, customer_name=?, customer_city=?, customer_address=?, customer_phone=?, customer_type=?,
         fine_jama=?, rate_10g=?, jama_gold_22k=?, rate_gold_22k=?, jama_silver=?, rate_silver=?,
         amt_jama=?, cash_amount=?, online_amount=?, payment_mode=?, payment_entries=?, balance_snapshot=?,
         total_pcs=?, total_weight=?, labour_total=?, fine_diff=?, gold_rs=?,
         subtotal=?, discount=?, total_amount=?, amt_baki=?, refund_due=?, ofg_status=?, fine_carry=?
       WHERE id=?`,
      [
        obNo, data.date, data.product || "", productsJson,
        resolvedCustomerId || null,
        data.customer_name || "",
        data.customer_city || "",
        data.customer_address || "",
        data.customer_phone || "",
        data.customer_type || "Retail",
        legacyFields.fine_jama, legacyFields.rate_10g,
        legacyFields.jama_gold_22k, legacyFields.rate_gold_22k,
        legacyFields.jama_silver, legacyFields.rate_silver,
        legacyFields.amt_jama, legacyFields.cash_amount, legacyFields.online_amount,
        _derivePaymentMode(paymentEntries), JSON.stringify(paymentEntries), JSON.stringify(summary.balance_snapshot),
        summary.total_pcs, summary.total_weight, summary.labour_total, summary.fine_diff, summary.gold_rs,
        summary.subtotal, summary.discount, summary.total_amount, summary.amt_baki, summary.refund_due,
        summary.ofg_status, summary.fine_carry,
        id,
      ]
    );

    await run(`DELETE FROM order_bill_items WHERE bill_id = ?`, [id]);
    await _insertItems(run, id, data.items || []);
    await counterService.reserveEstimateStock(run, id, obNo, data.date, data.items || []);

    await _deleteAccountingEntries(run, id);
    await _insertAccountingEntries(run, id, obNo, data.date, resolvedCustomerId, summary, paymentEntries);

    const customerIdsToSync = new Set(
      [oldBill.customer_id, resolvedCustomerId].filter((customerId) => Number.isInteger(customerId) && customerId > 0)
    );
    for (const customerId of customerIdsToSync) {
      await _applyOutstandingDelta(run, customerId);
    }
  });
};

const deleteBill = (id) =>
  db.runTransaction(async (run, get) => {
    const bill = await get(`SELECT customer_id FROM order_bills WHERE id = ?`, [id]);
    if (!bill) return 0;

    await _deleteAccountingEntries(run, id);
    await counterService.releaseEstimateStock(run, id);

    await run(`DELETE FROM order_bill_items WHERE bill_id = ?`, [id]);
    const result = await run(`DELETE FROM order_bills WHERE id = ?`, [id]);
    if (bill.customer_id) {
      await _applyOutstandingDelta(run, bill.customer_id);
    }
    return result.changes || 0;
  });

const validateStock = async (data = {}) => {
  return counterService.getStockValidation(data.items || [], {
    reference_id: data.estimate_id || null,
  });
};

module.exports = {
  getNextObNo,
  listBills,
  getBillById,
  createBill,
  updateBill,
  deleteBill,
  validateStock,
  _computeSummary,
};
