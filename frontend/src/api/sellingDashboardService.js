import api from "./axiosConfig";

export const getSellingDashboard = async () =>
  api.get("/selling/dashboard").then((response) => response.data?.data || response.data);
