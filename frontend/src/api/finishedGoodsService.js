import api from "./axiosConfig";

const API_URL = "/jobs";

export const getFinishedGoods = async () => {
  try {
    const response = await api.get(`${API_URL}/finished`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};