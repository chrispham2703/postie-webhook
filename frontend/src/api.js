import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

export function setToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

// Expired/invalid token: clear it and force back to the login screen instead
// of leaving the user stuck on a dead error screen.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('postie_token');
      setToken(null);
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export default api;
