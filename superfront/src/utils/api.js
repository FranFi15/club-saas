import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:4000/api', 
});

api.interceptors.request.use(
  (config) => {
    // Buscamos el token tal como lo guardaste en tu Login.jsx
    const token = localStorage.getItem('adminToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;