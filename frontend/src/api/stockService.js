import axios from "axios";

const API_URL = "http://localhost:3000/api/stock";

// 1. Get Dashboard Data (Gold & Silver Stock)
export const getStockData = async () => {
  try {
    const response = await axios.get(API_URL);
    return response.data;
  } catch (error) {
    console.error("Error fetching stock data", error);
    throw error;
  }
};

// 2. Add Opening Stock (Purchase)
export const addStock = async (metalType, weight, description) => {
  try {
    const response = await axios.post(`${API_URL}/add`, {
      metal_type: metalType,
      weight: parseFloat(weight),
      description,
    });
    return response.data;
  } catch (error) {
    console.error("Error adding stock", error);
    throw error;
  }
};
