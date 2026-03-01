import api from "./axiosConfig";

const API_URL = "/melting";

export const startMelt = async (metalType, issueWeight) => {
  try {
    const response = await api.post(`${API_URL}/start`, {
      metal_type: metalType,
      issue_weight: parseFloat(issueWeight),
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const completeMelt = async (processId, returnWeight, scrapWeight) => {
  try {
    const response = await api.post(`${API_URL}/complete`, {
      process_id: processId,
      return_weight: parseFloat(returnWeight),
      scrap_weight: parseFloat(scrapWeight),
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getRunningMelts = async () => {
  try {
    const response = await api.get(`${API_URL}/running`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getAllMelts = async () => {
  try {
    const response = await api.get(`${API_URL}/all`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getCompletedMelts = async () => {
  try {
    const response = await api.get(`${API_URL}/completed`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getMeltById = async (id) => {
  try {
    const response = await api.get(`${API_URL}/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const updateMelt = async (id, data) => {
  try {
    const response = await api.put(`${API_URL}/${id}`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const updateCompletedMelt = async (id, data) => {
  try {
    const response = await api.put(`${API_URL}/${id}/completed`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const deleteMelt = async (id) => {
  try {
    const response = await api.delete(`${API_URL}/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};
