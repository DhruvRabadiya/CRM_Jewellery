import api from "./axiosConfig";

const BASE = "/billing/selling";

export const getNextBillNo = () =>
  api.get(`${BASE}/next-no`).then((r) => r.data.data);

export const listSellingBills = () =>
  api.get(BASE).then((r) => r.data.data);

export const getSellingBill = (id) =>
  api.get(`${BASE}/${id}`).then((r) => r.data.data);

export const createSellingBill = (payload) =>
  api.post(BASE, payload).then((r) => r.data.data);

export const updateSellingBill = (id, payload) =>
  api.put(`${BASE}/${id}`, payload).then((r) => r.data.data);

export const deleteSellingBill = (id) =>
  api.delete(`${BASE}/${id}`).then((r) => r.data);
