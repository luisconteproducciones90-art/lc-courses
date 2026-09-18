import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Adjuntar JWT en cada request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('lc_access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh cuando el token expira (401)
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem('lc_refresh_token');
        if (!refresh) throw new Error('no refresh');
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
          { refresh }
        );
        localStorage.setItem('lc_access_token', data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch {
        localStorage.removeItem('lc_access_token');
        localStorage.removeItem('lc_refresh_token');
        window.location.href = '/auth';
      }
    }
    return Promise.reject(err);
  }
);

// ── AUTH ────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (email, password) => api.post('/auth/login', { email, password }),
  google: (credential) => api.post('/auth/google', { credential }),
  me: () => api.get('/auth/me'),
  refresh: (token) => api.post('/auth/refresh', { refresh: token }),
};

// ── COURSES ──────────────────────────────────────────────
export const coursesAPI = {
  list: (params) => api.get('/courses', { params }),
  detail: (slug) => api.get(`/courses/${slug}`),
  create: (data) => api.post('/courses', data),
  update: (id, data) => api.patch(`/courses/${id}`, data),
};

// ── ENROLLMENTS ──────────────────────────────────────────
export const enrollmentsAPI = {
  myEnrollments: () => api.get('/enrollments'),
  lessons: (courseId) => api.get(`/enrollments/${courseId}/lessons`),
  updateProgress: (courseId, data) => api.post(`/enrollments/${courseId}/progress`, data),
};

// ── PAYMENTS ─────────────────────────────────────────────
export const paymentsAPI = {
  createPreference: (items, coupon_code) =>
    api.post('/payments/preference', { items, coupon_code }),
  getOrder: (orderId) => api.get(`/payments/order/${orderId}`),
  manualPayment: (order_id, proof) =>
    api.post('/payments/manual', { order_id, payment_proof: proof }),
};

// ── CERTIFICATES ─────────────────────────────────────────
export const certificatesAPI = {
  list: () => api.get('/certificates'),
  generate: (course_id) => api.post('/certificates/generate', { course_id }),
  download: (certNumber) => api.get(`/certificates/${certNumber}/download`),
  verify: (certNumber) => api.get(`/certificates/verify/${certNumber}`),
};

// ── UPLOADS ──────────────────────────────────────────────
export const uploadsAPI = {
  getVideoUploadUrl: (content_type, extension) =>
    api.post('/uploads/video-url', { content_type, extension }),
  getThumbnailUploadUrl: (extension) =>
    api.post('/uploads/thumbnail-url', { extension }),
  getStreamUrl: (lessonId) => api.get(`/uploads/stream/${lessonId}`),
};

// ── ADMIN ────────────────────────────────────────────────
export const adminAPI = {
  stats: () => api.get('/admin/stats'),
  students: (params) => api.get('/admin/students', { params }),
  orders: (params) => api.get('/admin/orders', { params }),
  approveOrder: (id) => api.patch(`/admin/orders/${id}/approve`),
  toggleStudent: (id, is_active) => api.patch(`/admin/students/${id}`, { is_active }),
  createCoupon: (data) => api.post('/admin/coupons', data),
  coupons: () => api.get('/admin/coupons'),
  massEmail: (data) => api.post('/admin/emails/mass', data),
};

export default api;
