import axios from "./axiosConfig";

const BASE = "/estimates";

export const getNextObNo = () =>
  axios.get(`${BASE}/next-no`).then((r) => r.data?.data || r.data);

export const listOrderBills = (params = {}) =>
  axios.get(BASE, { params }).then((r) => r.data?.data || r.data || []);

export const getOrderBill = (id) =>
  axios.get(`${BASE}/${id}`).then((r) => r.data?.data || r.data);

export const createOrderBill = (payload) =>
  axios.post(BASE, payload).then((r) => r.data?.data || r.data);

export const validateOrderBillStock = (payload) =>
  axios.post(`${BASE}/validate-stock`, payload).then((r) => r.data?.data || r.data);

export const updateOrderBill = (id, payload) =>
  axios.put(`${BASE}/${id}`, payload).then((r) => r.data?.data || r.data);

export const deleteOrderBill = (id) =>
  axios.delete(`${BASE}/${id}`).then((r) => r.data?.data || r.data);
