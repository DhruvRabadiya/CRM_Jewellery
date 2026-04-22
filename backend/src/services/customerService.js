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
};
