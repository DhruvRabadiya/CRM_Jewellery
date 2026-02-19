import axios from "axios";

const API_URL = "http://localhost:3000/api/jobs";

export const getActiveJobs = async () => {
  try {
    const response = await axios.get(`${API_URL}/active`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const createJob = async (
  jobNumber,
  metalType,
  targetProduct,
  issueWeight,
) => {
  try {
    const response = await axios.post(`${API_URL}/create`, {
      job_number: jobNumber,
      metal_type: metalType,
      target_product: targetProduct,
      issue_weight: parseFloat(issueWeight),
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const completeStep = async (
  jobId,
  stepName,
  issueWeight,
  returnWeight,
  scrapWeight,
  returnPieces,
) => {
  try {
    const response = await axios.post(`${API_URL}/step`, {
      job_id: jobId,
      step_name: stepName,
      issue_weight: parseFloat(issueWeight),
      return_weight: parseFloat(returnWeight),
      scrap_weight: parseFloat(scrapWeight),
      return_pieces: parseInt(returnPieces) || 0,
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getJobDetails = async (jobId) => {
  try {
    const response = await axios.get(`${API_URL}/${jobId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};
export const getNextJobId = async () => {
  try {
    const response = await axios.get(`${API_URL}/next-id`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};