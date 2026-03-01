import axios from "axios";

const API_URL = "http://localhost:5000/api/jobs";

export const getFinishedGoods = async () => {
  try {
    const response = await axios.get(`${API_URL}/finished`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};