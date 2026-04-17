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

const createCustomer = (party_name, firm_name, address, city, phone_no, telephone_no) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO customers (party_name, firm_name, address, city, phone_no, telephone_no) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(query, [party_name, firm_name, address, city, phone_no, telephone_no || ""], function (err) {
      if (err) reject(err);
      resolve(this.lastID);
    });
  });
};

const updateCustomer = (id, party_name, firm_name, address, city, phone_no, telephone_no) => {
  return new Promise((resolve, reject) => {
    const query = `UPDATE customers SET party_name = ?, firm_name = ?, address = ?, city = ?, phone_no = ?, telephone_no = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(query, [party_name, firm_name, address, city, phone_no, telephone_no || "", id], function (err) {
      if (err) reject(err);
      resolve(this.changes);
    });
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

module.exports = {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  searchCustomers,
};
