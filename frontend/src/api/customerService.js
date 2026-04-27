import api from "./axiosConfig";

const API_URL = "/customers";

export const getCustomers = async (search = "") => {
  try {
    const params = search ? { search } : {};
    const response = await api.get(API_URL, { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

/**
 * Paginated customer fetch used by the Ledger page.
 * Returns { data: { customers, total, page, limit } }
 */
export const getCustomersPaginated = async (search = "", page = 1, limit = 15) => {
  try {
    const params = { paginate: "true", page, limit };
    if (search) params.search = search;
    const response = await api.get(API_URL, { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getCustomerById = async (id) => {
  try {
    const response = await api.get(`${API_URL}/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getCustomerLedger = async (id) => {
  try {
    const response = await api.get(`${API_URL}/${id}/ledger`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const createCustomerLedgerEntry = async (id, payload) => {
  try {
    const response = await api.post(`${API_URL}/${id}/ledger/entries`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const createCustomer = async (payload) => {
  try {
    const response = await api.post(API_URL, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const updateCustomer = async (id, payload) => {
  try {
    const response = await api.put(`${API_URL}/${id}`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const deleteCustomer = async (id) => {
  try {
    const response = await api.delete(`${API_URL}/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};
