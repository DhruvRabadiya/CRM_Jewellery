import api from "./axiosConfig";

export const getStockData = async () => {
  try {
    const response = await api.get("/stock");
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const addStock = async (metalType, weight, description) => {
  try {
    const response = await api.post("/stock/add", {
      metal_type: metalType,
      weight: parseFloat(weight),
      description,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getLossStats = async () => {
  try {
    const response = await api.get("/stock/loss-stats");
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getDetailedScrapAndLoss = async () => {
  try {
    const response = await api.get("/stock/scrap-loss-ledger");
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getPurchases = async () => {
  try {
    const response = await api.get("/stock/purchases");
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const editPurchase = async (id, payload) => {
  try {
    const response = await api.put(`/stock/purchases/${id}`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const deletePurchase = async (id) => {
  try {
    const response = await api.delete(`/stock/purchases/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const addDhalStock = async (metalType, weight, description) => {
  try {
    const response = await api.post("/stock/dhal", {
      metal_type: metalType,
      weight: parseFloat(weight),
      description,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getDhalPurchases = async () => {
  try {
    const response = await api.get("/stock/dhal/purchases");
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const editDhalPurchase = async (id, payload) => {
  try {
    const response = await api.put(`/stock/dhal/purchases/${id}`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const deleteDhalPurchase = async (id) => {
  try {
    const response = await api.delete(`/stock/dhal/purchases/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};
