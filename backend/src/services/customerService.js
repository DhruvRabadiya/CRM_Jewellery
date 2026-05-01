const db = require("../../config/dbConfig");
const {
  METAL_PAYMENT_TYPES,
  METAL_PURITY,
  createEmptyMetalMap,
  parseJsonSafe,
  roundMoney,
  roundWeight,
} = require("../utils/sellingPayments");

const getAllCustomers = () => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM customers ORDER BY party_name ASC`;
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows || []);
    });
  });
};

const getCustomerById = (id) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM customers WHERE id = ?`;
    db.get(query, [id], (err, row) => {
      if (err) reject(err);
      resolve(row || null);
    });
  });
};

const createCustomer = (party_name, firm_name, address, city, phone_no, telephone_no, customer_type) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO customers (party_name, firm_name, address, city, phone_no, telephone_no, customer_type) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(query, [party_name, firm_name, address, city, phone_no, telephone_no || "", customer_type || "Retail"], function (err) {
      if (err) reject(err);
      resolve(this.lastID);
    });
  });
};

const updateCustomer = (id, party_name, firm_name, address, city, phone_no, telephone_no, customer_type) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE customers SET party_name = ?, firm_name = ?, address = ?, city = ?, phone_no = ?, telephone_no = ?, customer_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(query, [party_name, firm_name, address, city, phone_no, telephone_no || "", customer_type || "Retail", id], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const updateOutstandingBalance = (id, delta) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE customers SET outstanding_balance = MAX(0, outstanding_balance + ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [delta, id],
      function (err) {
        if (err) reject(err);
        resolve(this.changes);
      }
    );
  });
};

const deleteCustomer = (id) => {
  return new Promise((resolve, reject) => {
    const query = `DELETE FROM customers WHERE id = ?`;
    db.run(query, [id], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
  });
};

const groupMetalDelta = (bucket, metalType, value, direction) => {
  if (!metalType || !value) return;
  if (!bucket[metalType]) bucket[metalType] = { debit: 0, credit: 0 };
  bucket[metalType][direction] = roundWeight((bucket[metalType][direction] || 0) + Math.abs(value));
};

const formatGroupedPaymentMode = (modes) => {
  if (!modes || modes.size === 0) return "";
  if (modes.size === 1) return [...modes][0];
  return "Mixed";
};

const getDisplayPaymentMode = (row) => {
  if (!row) return "";
  if (row.line_type === "PAYMENT_CASH") return "Cash";
  if (row.line_type === "PAYMENT_BANK") return "Bank / UPI";
  if (row.line_type === "PAYMENT_METAL") return "Metal";
  return "";
};

const syncOutstandingBalance = async (run, customerId) => {
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

const getCustomerStatementSummary = (entries = []) => {
  const grouped = [];
  const groupedMap = new Map();
  let runningCashBalance = 0;
  const runningMetalBalances = createEmptyMetalMap();

  entries.forEach((row) => {
    const amountDelta = roundMoney(row.amount_delta);
    const weightDelta = roundWeight(row.weight_delta);
    const transactionType =
      row.transaction_type ||
      (row.reference_type === "ORDER_BILL" ? "Estimate" : row.line_type?.startsWith("PAYMENT") ? "Payment" : "Adjustment");
    const entryMode = getDisplayPaymentMode(row);
    const groupKey =
      row.reference_id && row.reference_type === "ORDER_BILL"
        ? `${row.reference_type}:${row.reference_id}`
        : `entry:${row.id}`;

    if (!groupedMap.has(groupKey)) {
      groupedMap.set(groupKey, {
        id: groupKey,
        transaction_date: row.entry_date,
        transaction_type: transactionType,
        reference_type: row.reference_type,
        reference_id: row.reference_id,
        reference_no: row.reference_no || "",
        payment_mode: "",
        notes: row.notes || "",
        debit_amount: 0,
        credit_amount: 0,
        cash_received: 0,
        bank_received: 0,
        cash_returned: 0,
        metal_debits: {},
        metal_credits: {},
        metal_movements: [],
        payment_modes: new Set(),
        order_bill_balance_snapshot: row.order_bill_balance_snapshot || null,
        order_bill_amount_due: roundMoney(row.order_bill_amount_due),
        order_bill_refund_due: roundMoney(row.order_bill_refund_due),
      });
      grouped.push(groupedMap.get(groupKey));
    }

    const group = groupedMap.get(groupKey);
    if (entryMode) group.payment_modes.add(entryMode);
    if (!group.order_bill_balance_snapshot && row.order_bill_balance_snapshot) {
      group.order_bill_balance_snapshot = row.order_bill_balance_snapshot;
    }

    if (amountDelta > 0) {
      group.debit_amount = roundMoney(group.debit_amount + amountDelta);
    } else if (amountDelta < 0) {
      group.credit_amount = roundMoney(group.credit_amount + Math.abs(amountDelta));
    }

    if (row.line_type === "PAYMENT_CASH" && amountDelta < 0) {
      group.cash_received = roundMoney(group.cash_received + Math.abs(amountDelta));
    }
    if (row.line_type === "PAYMENT_BANK" && amountDelta < 0) {
      group.bank_received = roundMoney(group.bank_received + Math.abs(amountDelta));
    }
    if (row.line_type === "REFUND_CASH_OUT" && amountDelta > 0) {
      group.cash_returned = roundMoney(group.cash_returned + amountDelta);
    }

    if (row.metal_type && weightDelta !== 0) {
      if (weightDelta > 0) groupMetalDelta(group.metal_debits, row.metal_type, weightDelta, "debit");
      if (weightDelta < 0) groupMetalDelta(group.metal_credits, row.metal_type, weightDelta, "credit");
      group.metal_movements.push({
        metal_type: row.metal_type,
        metal_purity: row.metal_purity || "",
        reference_rate: roundMoney(row.reference_rate),
        weight_delta: weightDelta,
      });
    }
  });

  const statement = grouped
    .sort((a, b) => {
      if (a.transaction_date === b.transaction_date) {
        return String(a.reference_no || a.id).localeCompare(String(b.reference_no || b.id));
      }
      return String(a.transaction_date).localeCompare(String(b.transaction_date));
    })
    .map((row) => {
      runningCashBalance = roundMoney(runningCashBalance + row.debit_amount - row.credit_amount);

      const nextMetalBalances = { ...runningMetalBalances };
      METAL_PAYMENT_TYPES.forEach((metalType) => {
        const debit = roundWeight(row.metal_debits?.[metalType]?.debit || 0);
        const credit = roundWeight(row.metal_credits?.[metalType]?.credit || 0);
        nextMetalBalances[metalType] = roundWeight((nextMetalBalances[metalType] || 0) + debit - credit);
      });

      Object.assign(runningMetalBalances, nextMetalBalances);

      const hasMetalDue = METAL_PAYMENT_TYPES.some((metalType) => (nextMetalBalances[metalType] || 0) > 0);
      const rowHasPartialMetal = METAL_PAYMENT_TYPES.some((metalType) => {
        const debit = row.metal_debits?.[metalType]?.debit || 0;
        const credit = row.metal_credits?.[metalType]?.credit || 0;
        return debit > 0 && credit > 0 && credit < debit;
      });

      let paymentStatus = "Completed";
      const billSnapshot = row.order_bill_balance_snapshot || null;
      if (row.reference_type === "ORDER_BILL" && billSnapshot) {
        const hasAmountDue = roundMoney(billSnapshot.amount_due || row.order_bill_amount_due || 0) > 0;
        const hasMetalDue = METAL_PAYMENT_TYPES.some(
          (metalType) => roundWeight(billSnapshot.metal_due_unsettled?.[metalType] || 0) > 0
        );
        const hasPaymentActivity =
          roundMoney(billSnapshot.money_paid || 0) > 0 ||
          METAL_PAYMENT_TYPES.some((metalType) => roundWeight(billSnapshot.metal_received?.[metalType] || 0) > 0);

        if (hasAmountDue || hasMetalDue) {
          paymentStatus = hasPaymentActivity ? "Partial" : "Pending";
        }
      } else if (["Estimate", "Sale"].includes(row.transaction_type)) {
        const hasCashDue = row.debit_amount > row.credit_amount;
        if (hasCashDue || hasMetalDue) {
          paymentStatus = row.credit_amount > 0 || rowHasPartialMetal ? "Partial" : "Pending";
        }
      }

      const {
        payment_modes,
        order_bill_balance_snapshot,
        order_bill_amount_due,
        order_bill_refund_due,
        ...serializableRow
      } = row;

      return {
        ...serializableRow,
        payment_mode: formatGroupedPaymentMode(row.payment_modes),
        running_balance: runningCashBalance,
        running_cash_balance: runningCashBalance,
        running_metal_balances: { ...nextMetalBalances },
        payment_status: paymentStatus,
      };
    });

  const totalDebit = statement.reduce((sum, row) => sum + (row.debit_amount || 0), 0);
  const totalCredit = statement.reduce((sum, row) => sum + (row.credit_amount || 0), 0);

  return {
    statement,
    summary: {
      total_payable: roundMoney(totalDebit),
      total_paid: roundMoney(totalCredit),
      remaining_balance: Math.max(roundMoney(totalDebit - totalCredit), 0),
      metal_balances: { ...runningMetalBalances },
    },
  };
};

const getAllCustomersPaginated = (search, page, limit) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
  const offset = (safePage - 1) * safeLimit;

  return new Promise((resolve, reject) => {
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      const countSql = `SELECT COUNT(*) AS total FROM customers
                        WHERE party_name LIKE ? OR firm_name LIKE ? OR city LIKE ? OR phone_no LIKE ?`;
      const dataSql = `SELECT * FROM customers
                        WHERE party_name LIKE ? OR firm_name LIKE ? OR city LIKE ? OR phone_no LIKE ?
                        ORDER BY party_name ASC LIMIT ? OFFSET ?`;

      db.get(countSql, [term, term, term, term], (err, countRow) => {
        if (err) return reject(err);
        const total = countRow?.total || 0;
        db.all(dataSql, [term, term, term, term, safeLimit, offset], (err2, rows) => {
          if (err2) return reject(err2);
          resolve({ customers: rows || [], total, page: safePage, limit: safeLimit });
        });
      });
    } else {
      db.get(`SELECT COUNT(*) AS total FROM customers`, [], (err, countRow) => {
        if (err) return reject(err);
        const total = countRow?.total || 0;
        db.all(
          `SELECT * FROM customers ORDER BY party_name ASC LIMIT ? OFFSET ?`,
          [safeLimit, offset],
          (err2, rows) => {
            if (err2) return reject(err2);
            resolve({ customers: rows || [], total, page: safePage, limit: safeLimit });
          }
        );
      });
    }
  });
};

const searchCustomers = (searchTerm) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM customers WHERE party_name LIKE ? OR firm_name LIKE ? OR city LIKE ? OR phone_no LIKE ? ORDER BY party_name ASC`;
    const term = `%${searchTerm}%`;
    db.all(query, [term, term, term, term], (err, rows) => {
      if (err) reject(err);
      resolve(rows || []);
    });
  });
};

const getCustomerByPhone = (phone_no) => {
  return new Promise((resolve, reject) => {
    if (!phone_no) return resolve(null);
    db.get(
      `SELECT * FROM customers WHERE phone_no = ? LIMIT 1`,
      [String(phone_no).trim()],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
};

const findOrCreateByPhone = async ({ party_name, phone_no, address, city, firm_name, telephone_no, customer_type }) => {
  const trimmedPhone = (phone_no || "").toString().trim();
  const trimmedName = (party_name || "").toString().trim();
  if (!trimmedPhone || !trimmedName) return null;

  const existing = await getCustomerByPhone(trimmedPhone);
  if (existing) return existing;

  // Only auto-create a CRM record when enough detail is provided (address or city).
  // Estimate quick-entry supplies name + phone only — in that case we look up only,
  // never auto-create an incomplete record.  The estimate stores the details inline.
  const hasEnoughDetail = (address || "").toString().trim() || (city || "").toString().trim();
  if (!hasEnoughDetail) return null;

  const newId = await createCustomer(
    trimmedName,
    (firm_name || trimmedName).toString().trim(),
    (address || "").toString().trim(),
    (city || "").toString().trim(),
    trimmedPhone,
    (telephone_no || "").toString().trim(),
    customer_type || "Retail"
  );
  return await getCustomerById(newId);
};

const getCustomerLedger = (id) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT *
       FROM (
         SELECT
           cle.*,
           ob.balance_snapshot AS order_bill_balance_snapshot_raw,
           ob.amt_baki AS order_bill_amount_due,
           ob.refund_due AS order_bill_refund_due
         FROM customer_ledger_entries cle
         LEFT JOIN order_bills ob
           ON cle.reference_type = 'ORDER_BILL'
          AND cle.reference_id = ob.id
         WHERE cle.customer_id = ?
       )
       ORDER BY entry_date ASC, id ASC`,
      [id],
      (err, rows) => {
        if (err) return reject(err);

        let runningAmountBalance = 0;
        const runningMetalBalances = createEmptyMetalMap();

        const entries = (rows || []).map((row) => {
          const amountDelta = roundMoney(row.amount_delta);
          const weightDelta = roundWeight(row.weight_delta);
          runningAmountBalance = roundMoney(runningAmountBalance + amountDelta);

          if (row.metal_type) {
            runningMetalBalances[row.metal_type] = roundWeight(
              (runningMetalBalances[row.metal_type] || 0) + weightDelta
            );
          }

          return {
            ...row,
            amount_delta: amountDelta,
            weight_delta: weightDelta,
            reference_rate: roundMoney(row.reference_rate),
            order_bill_balance_snapshot: parseJsonSafe(row.order_bill_balance_snapshot_raw, null),
            order_bill_amount_due: roundMoney(row.order_bill_amount_due),
            order_bill_refund_due: roundMoney(row.order_bill_refund_due),
            running_amount_balance: runningAmountBalance,
            running_metal_balances: { ...runningMetalBalances },
          };
        });

        const statement = getCustomerStatementSummary(entries);

        resolve({
          entries,
          summary: {
            outstanding_amount: Math.max(runningAmountBalance, 0),
            metal_balances: { ...runningMetalBalances },
          },
          statement: statement.statement,
          ledger_summary: statement.summary,
        });
      }
    );
  });
};

const createLedgerEntry = (customerId, payload) =>
  db.runTransaction(async (run) => {
    const entryDate = (payload.entry_date || "").trim();
    const transactionType = (payload.transaction_type || "").trim();
    const notes = (payload.notes || "").trim();
    const referenceNo = (payload.reference_no || "").trim();
    const paymentMode = (payload.payment_mode || "").trim();
    const amount = Math.max(0, parseFloat(payload.amount) || 0);
    const weight = Math.max(0, parseFloat(payload.weight) || 0);
    const balanceType = payload.balance_type === "Metal" ? "Metal" : "Money";
    const adjustmentDirection = payload.adjustment_direction === "debit" ? "debit" : "credit";
    const metalType = String(payload.metal_type || "").trim();
    const metalPurity = String(payload.metal_purity || METAL_PURITY[metalType] || "").trim();
    const referenceRate = roundMoney(payload.reference_rate);

    if (!entryDate) {
      throw new Error("Transaction date is required");
    }
    if (!["Payment", "Adjustment"].includes(transactionType)) {
      throw new Error("Invalid transaction type");
    }

    let lineType = "ADJUSTMENT";
    let amountDelta = 0;
    let weightDelta = 0;
    let cashLedgerMode = "";
    let effectivePaymentMode = "";

    if (transactionType === "Payment") {
      if (paymentMode === "Metal") {
        if (!METAL_PAYMENT_TYPES.includes(metalType)) {
          throw new Error("Valid metal type is required");
        }
        if (weight <= 0) {
          throw new Error("Metal weight must be greater than zero");
        }
        lineType = "PAYMENT_METAL";
        effectivePaymentMode = "Metal";
        weightDelta = -roundWeight(weight);
      } else {
        if (amount <= 0) {
          throw new Error("Amount must be greater than zero");
        }
        cashLedgerMode = paymentMode === "Bank / UPI" ? "Bank / UPI" : "Cash";
        effectivePaymentMode = cashLedgerMode;
        lineType = cashLedgerMode === "Bank / UPI" ? "PAYMENT_BANK" : "PAYMENT_CASH";
        amountDelta = -roundMoney(amount);
      }
    } else if (balanceType === "Metal") {
      if (!METAL_PAYMENT_TYPES.includes(metalType)) {
        throw new Error("Valid metal type is required");
      }
      if (weight <= 0) {
        throw new Error("Metal weight must be greater than zero");
      }
      effectivePaymentMode = "Metal";
      lineType = adjustmentDirection === "debit" ? "ADJUSTMENT_METAL_DEBIT" : "ADJUSTMENT_METAL_CREDIT";
      weightDelta = adjustmentDirection === "debit" ? roundWeight(weight) : -roundWeight(weight);
    } else {
      if (amount <= 0) {
        throw new Error("Amount must be greater than zero");
      }
      lineType = adjustmentDirection === "debit" ? "ADJUSTMENT_DEBIT" : "ADJUSTMENT_CREDIT";
      amountDelta = adjustmentDirection === "debit" ? roundMoney(amount) : -roundMoney(amount);
    }

    const referenceType = "CUSTOMER_LEDGER";
    const { lastID } = await run(
      `INSERT INTO customer_ledger_entries
        (customer_id, entry_date, reference_type, reference_no, transaction_type, payment_mode, line_type, metal_type, metal_purity, reference_rate, weight_delta, amount_delta, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId,
        entryDate,
        referenceType,
        referenceNo,
        transactionType,
        effectivePaymentMode,
        lineType,
        effectivePaymentMode === "Metal" ? metalType : "",
        effectivePaymentMode === "Metal" ? metalPurity : "",
        effectivePaymentMode === "Metal" ? referenceRate : 0,
        weightDelta,
        amountDelta,
        notes,
      ]
    );

    if (transactionType === "Payment" && cashLedgerMode) {
      await run(
        `INSERT INTO counter_cash_ledger
          (entry_date, reference_type, reference_id, reference_no, mode, amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [entryDate, referenceType, lastID, referenceNo, cashLedgerMode, roundMoney(amount), notes || "Customer payment"]
      );
    }

    await syncOutstandingBalance(run, customerId);

    return lastID;
  });

module.exports = {
  getAllCustomers,
  getAllCustomersPaginated,
  getCustomerById,
  getCustomerByPhone,
  findOrCreateByPhone,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  searchCustomers,
  updateOutstandingBalance,
  getCustomerLedger,
  createLedgerEntry,
};
