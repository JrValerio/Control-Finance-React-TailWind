import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 8000,
});

export const getApiHealth = async () => {
  const { data } = await api.get("/health");
  return data;
};
