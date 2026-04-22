import api from "./axiosConfig";

const API_URL = "/svg";

export const getSvgInventory = async () => {
  try {
    const response = await api.get(`${API_URL}/inventory`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const addToSvg = async (payload) => {
  try {
    const response = await api.post(`${API_URL}/add`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const removeFromSvg = async (payload) => {
  try {
    const response = await api.post(`${API_URL}/remove`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getSvgHistory = async (limit = 50) => {
  try {
    const response = await api.get(`${API_URL}/history`, { params: { limit } });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};
