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
