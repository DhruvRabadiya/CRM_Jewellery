import axios from "./axiosConfig";

export const getNextObNo = () =>
  axios.get("/order-bills/next-no").then((r) => r.data?.data || r.data);

export const listOrderBills = () =>
  axios.get("/order-bills").then((r) => r.data?.data || r.data || []);

export const getOrderBill = (id) =>
  axios.get(`/order-bills/${id}`).then((r) => r.data?.data || r.data);

export const createOrderBill = (payload) =>
  axios.post("/order-bills", payload).then((r) => r.data?.data || r.data);

export const updateOrderBill = (id, payload) =>
  axios.put(`/order-bills/${id}`, payload).then((r) => r.data?.data || r.data);

export const deleteOrderBill = (id) =>
  axios.delete(`/order-bills/${id}`).then((r) => r.data?.data || r.data);
