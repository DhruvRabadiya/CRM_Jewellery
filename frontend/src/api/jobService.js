import axios from "axios";
import api from "./axiosConfig";

const API_URL = "/api";

export const getCombinedProcesses = async () => {
  try {
    // using api instance from axiosConfig if possible, else direct axios
    const response = await api.get(`/jobs/combined`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const createProcess = async (stage, payload) => {
  try {
    const endpoint = stage.toLowerCase();
    const response = await api.post(`/${endpoint}/create`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const startProcess = async (stage, payload) => {
  try {
    const endpoint = stage.toLowerCase();
    const response = await api.post(`/${endpoint}/start`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const completeProcess = async (stage, payload) => {
  try {
    const endpoint = stage.toLowerCase();
    const response = await api.post(`/${endpoint}/complete`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getNextJobId = async () => {
  try {
    const response = await api.get(`/jobs/next-id`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const editProcess = async (stage, processId, payload) => {
  try {
    const endpoint = stage.toLowerCase();
    const response = await api.put(`/${endpoint}/${processId}/edit`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const deleteProcess = async (stage, processId) => {
  try {
    const endpoint = stage.toLowerCase();
    const response = await api.delete(`/${endpoint}/${processId}/delete`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const revertProcess = async (stage, processId) => {
  try {
    const endpoint = stage.toLowerCase();
    const response = await api.post(`/${endpoint}/${processId}/revert`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};
