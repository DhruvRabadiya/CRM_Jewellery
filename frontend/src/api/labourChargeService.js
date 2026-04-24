import api from "./axiosConfig";

// Backend mounts this module at /api/labour-charges (see backend/src/app.js).
// axiosConfig already prepends /api via VITE_API_URL, so BASE is relative.
const BASE = "/labour-charges";

export const getLabourCharges = (metal) =>
  api.get(BASE, { params: metal ? { metal } : {} }).then((r) => r.data.data);

// Returns grouped structure: { [metal_type]: { [category]: [sizeRows...] } }
export const getLabourChargesGrouped = () =>
  api.get(BASE, { params: { grouped: 1 } }).then((r) => r.data.data);

export const createLabourCharge = (payload) =>
  api.post(BASE, payload).then((r) => r.data.data);

export const updateLabourCharge = (id, payload) =>
  api.put(`${BASE}/${id}`, payload).then((r) => r.data.data);

// Bulk rate update. Payload: [{ id, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale }, ...]
export const bulkUpdateLabourCharges = (updates) =>
  api.put(`${BASE}/bulk`, updates).then((r) => r.data.data);

export const deleteLabourCharge = (id) =>
  api.delete(`${BASE}/${id}`).then((r) => r.data);
