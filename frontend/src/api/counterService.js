import api from "./axiosConfig";

const API_URL = "/counter";

export const getCounterInventory = async () => {
  try {
    const response = await api.get(`${API_URL}/inventory`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const sendToCounter = async (payload) => {
  try {
    const response = await api.post(`${API_URL}/send`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const returnFromCounter = async (payload) => {
  try {
    const response = await api.post(`${API_URL}/return`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};
