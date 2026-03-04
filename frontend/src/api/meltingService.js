import api from "./axiosConfig";

const API_URL = "/melting";

export const startMelt = async (metalType, issueWeight, issuePieces = 0) => {
  try {
    const response = await api.post(`${API_URL}/start`, {
      metal_type: metalType,
      issue_weight: parseFloat(issueWeight),
      issue_pieces: issuePieces,
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const completeMelt = async (
  processId,
  returnWeight,
  scrapWeight,
  returnPieces = 0,
) => {
  try {
    const response = await api.post(`${API_URL}/complete`, {
      process_id: processId,
      return_weight: parseFloat(returnWeight),
      scrap_weight: parseFloat(scrapWeight),
      return_pieces: returnPieces,
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
    const response = await api.get(API_URL);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const editMelt = async (id, updates) => {
  try {
    const response = await api.put(`${API_URL}/${id}`, updates);
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
