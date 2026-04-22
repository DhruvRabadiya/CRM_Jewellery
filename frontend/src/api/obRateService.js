import axios from "./axiosConfig";

// Returns all ob_labour_rates rows: { id, metal_type, size_label, size_value,
//   lc_pp_retail, lc_pp_showroom, lc_pp_wholesale, is_custom, sort_order }
export const getObRates = () =>
  axios.get("/ob-rates").then((r) => r.data?.data || r.data || []);

// updates: [{ id, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale }]
export const bulkUpdateObRates = (updates) =>
  axios.put("/ob-rates/bulk", { updates }).then((r) => r.data?.data || r.data);

// Add a new rate row for a metal+size combination
// data: { metal_type, size_label, size_value?, lc_pp_retail, lc_pp_showroom, lc_pp_wholesale }
export const addObRate = (data) =>
  axios.post("/ob-rates", data).then((r) => r.data?.data || r.data);

// Delete a rate row by id
export const deleteObRate = (id) =>
  axios.delete(`/ob-rates/${id}`).then((r) => r.data);
