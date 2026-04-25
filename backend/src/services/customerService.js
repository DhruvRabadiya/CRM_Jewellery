const db = require("../../config/dbConfig");

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

const getCustomerStatementSummary = (entries = []) => {
  const grouped = [];
  const groupedMap = new Map();
  let runningBalance = 0;

  entries.forEach((row) => {
    const amountDelta = parseFloat(row.amount_delta) || 0;
    const weightDelta = parseFloat(row.weight_delta) || 0;
    const transactionType =
      row.transaction_type ||
      (row.reference_type === "ORDER_BILL" ? "Estimate" : row.line_type?.startsWith("PAYMENT") ? "Payment" : "Adjustment");
    const entryMode = row.payment_mode || (row.line_type === "PAYMENT_ONLINE" ? "Online" : row.line_type === "PAYMENT_CASH" ? "Cash" : "");
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
        payment_mode: entryMode,
        notes: row.notes || "",
        debit_amount: 0,
        credit_amount: 0,
        raw_amount_delta: 0,
        metal_movements: [],
      });
      grouped.push(groupedMap.get(groupKey));
    }

    const group = groupedMap.get(groupKey);
    group.raw_amount_delta = parseFloat((group.raw_amount_delta + amountDelta).toFixed(2));

    if (amountDelta > 0) {
      group.debit_amount = parseFloat((group.debit_amount + amountDelta).toFixed(2));
    } else if (amountDelta < 0) {
      group.credit_amount = parseFloat((group.credit_amount + Math.abs(amountDelta)).toFixed(2));
    }

    if (row.metal_type && weightDelta !== 0) {
      group.metal_movements.push({
        metal_type: row.metal_type,
        weight_delta: weightDelta,
        metal_purity: row.metal_purity || "",
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
      runningBalance = parseFloat((runningBalance + row.debit_amount - row.credit_amount).toFixed(2));
      const txnNet = parseFloat((row.debit_amount - row.credit_amount).toFixed(2));
      let paymentStatus = "Completed";

      if (row.transaction_type === "Estimate" || row.transaction_type === "Sale") {
        if (txnNet > 0 && row.credit_amount === 0) {
          paymentStatus = "Pending";
        } else if (txnNet > 0 && row.credit_amount > 0) {
          paymentStatus = "Partial";
        } else {
          paymentStatus = "Completed";
        }
      } else if (row.transaction_type === "Payment" && row.credit_amount > 0) {
        paymentStatus = "Completed";
      }

      return {
        ...row,
        running_balance: runningBalance,
        payment_status: paymentStatus,
      };
    });

  const totalDebit = statement.reduce((sum, row) => sum + (parseFloat(row.debit_amount) || 0), 0);
  const totalCredit = statement.reduce((sum, row) => sum + (parseFloat(row.credit_amount) || 0), 0);

  return {
    statement,
    summary: {
      total_payable: parseFloat(totalDebit.toFixed(2)),
      total_paid: parseFloat(totalCredit.toFixed(2)),
      remaining_balance: Math.max(parseFloat((totalDebit - totalCredit).toFixed(2)), 0),
    },
  };
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

// Look up a customer by exact phone number. Returns row or null.
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

// Find-or-create a customer by phone number. Used by auto-create during billing.
// Only creates when phone + party_name are both provided. Returns the customer row (existing or new).
const findOrCreateByPhone = async ({ party_name, phone_no, address, city, firm_name, telephone_no, customer_type }) => {
  const trimmedPhone = (phone_no || "").toString().trim();
  const trimmedName = (party_name || "").toString().trim();
  if (!trimmedPhone || !trimmedName) return null;

  const existing = await getCustomerByPhone(trimmedPhone);
  if (existing) return existing;

  const newId = await createCustomer(
    trimmedName,
    firm_name || trimmedName,
    address || "",
    city || "",
    trimmedPhone,
    telephone_no || "",
    customer_type || "Retail"
  );
  return await getCustomerById(newId);
};

const getCustomerLedger = (id) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT *
       FROM customer_ledger_entries
       WHERE customer_id = ?
       ORDER BY entry_date ASC, id ASC`,
      [id],
      (err, rows) => {
        if (err) return reject(err);

        let runningAmountBalance = 0;
        const runningMetalBalances = { "Gold 24K": 0, "Gold 22K": 0, Silver: 0 };

        const entries = (rows || []).map((row) => {
          const amountDelta = parseFloat(row.amount_delta) || 0;
          const weightDelta = parseFloat(row.weight_delta) || 0;
          runningAmountBalance = parseFloat((runningAmountBalance + amountDelta).toFixed(2));

          if (row.metal_type) {
            runningMetalBalances[row.metal_type] = parseFloat(
              ((runningMetalBalances[row.metal_type] || 0) + weightDelta).toFixed(4)
            );
          }

          return {
            ...row,
            amount_delta: amountDelta,
            weight_delta: weightDelta,
            running_amount_balance: runningAmountBalance,
            running_metal_balances: { ...runningMetalBalances },
          };
        });

        const statement = getCustomerStatementSummary(entries);

        resolve({
          entries,
          summary: {
            outstanding_amount: Math.max(runningAmountBalance, 0),
            metal_balances: runningMetalBalances,
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
    const adjustmentDirection = payload.adjustment_direction === "debit" ? "debit" : "credit";

    if (!entryDate) {
      throw new Error("Transaction date is required");
    }
    if (!["Payment", "Adjustment"].includes(transactionType)) {
      throw new Error("Invalid transaction type");
    }
    if (amount <= 0) {
      throw new Error("Amount must be greater than zero");
    }

    let lineType = "ADJUSTMENT";
    let amountDelta = 0;
    let cashLedgerMode = "";

    if (transactionType === "Payment") {
      cashLedgerMode = paymentMode === "Online" ? "Online" : "Cash";
      lineType = cashLedgerMode === "Online" ? "PAYMENT_ONLINE" : "PAYMENT_CASH";
      amountDelta = -amount;
    } else {
      lineType = adjustmentDirection === "debit" ? "ADJUSTMENT_DEBIT" : "ADJUSTMENT_CREDIT";
      amountDelta = adjustmentDirection === "debit" ? amount : -amount;
    }

    const referenceType = "CUSTOMER_LEDGER";
    const { lastID } = await run(
      `INSERT INTO customer_ledger_entries
        (customer_id, entry_date, reference_type, reference_no, transaction_type, payment_mode, line_type, amount_delta, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId,
        entryDate,
        referenceType,
        referenceNo,
        transactionType,
        transactionType === "Payment" ? cashLedgerMode : "",
        lineType,
        amountDelta,
        notes,
      ]
    );

    if (transactionType === "Payment") {
      await run(
        `INSERT INTO counter_cash_ledger
          (entry_date, reference_type, reference_id, reference_no, mode, amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [entryDate, referenceType, lastID, referenceNo, cashLedgerMode, amount, notes || "Customer payment"]
      );
    }

    await run(
      `UPDATE customers
          SET outstanding_balance = MAX(0, outstanding_balance + ?),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [amountDelta, customerId]
    );

    return lastID;
  });

module.exports = {
  getAllCustomers,
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
