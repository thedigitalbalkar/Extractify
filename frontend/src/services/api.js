import axios from "axios";

const rawBaseUrl =
  import.meta.env.VITE_API_BASE_URL || "https://extractify-29j4.onrender.com";
const normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, "");
const apiBaseUrl = normalizedBaseUrl.endsWith("/api")
  ? normalizedBaseUrl
  : `${normalizedBaseUrl}/api`;

const api = axios.create({
  baseURL: apiBaseUrl,
});

export default api;
