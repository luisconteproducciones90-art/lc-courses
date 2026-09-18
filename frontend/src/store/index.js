import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authAPI } from '../lib/api';

// ── AUTH STORE ──────────────────────────────────────────
export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        const { data } = await authAPI.login(email, password);
        localStorage.setItem('lc_access_token', data.access);
        localStorage.setItem('lc_refresh_token', data.refresh);
        set({ user: data.user, accessToken: data.access, refreshToken: data.refresh, isLoading: false });
        return data.user;
      },

      register: async (name, email, password) => {
        set({ isLoading: true });
        const { data } = await authAPI.register({ name, email, password });
        localStorage.setItem('lc_access_token', data.access);
        localStorage.setItem('lc_refresh_token', data.refresh);
        set({ user: data.user, accessToken: data.access, refreshToken: data.refresh, isLoading: false });
        return data.user;
      },

      googleLogin: async (credential) => {
        set({ isLoading: true });
        const { data } = await authAPI.google(credential);
        localStorage.setItem('lc_access_token', data.access);
        localStorage.setItem('lc_refresh_token', data.refresh);
        set({ user: data.user, accessToken: data.access, refreshToken: data.refresh, isLoading: false });
        return data.user;
      },

      logout: () => {
        localStorage.removeItem('lc_access_token');
        localStorage.removeItem('lc_refresh_token');
        set({ user: null, accessToken: null, refreshToken: null });
      },

      fetchMe: async () => {
        try {
          const { data } = await authAPI.me();
          set({ user: data.user });
        } catch {
          get().logout();
        }
      },

      isAdmin: () => get().user?.role === 'admin',
      isAuthenticated: () => !!get().user,
    }),
    {
      name: 'lc-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

// ── CART STORE ───────────────────────────────────────────
export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      couponCode: '',
      discountPct: 0,

      addItem: (course) => {
        const { items } = get();
        if (items.find((i) => i.id === course.id)) return false; // ya en carrito
        set({ items: [...items, course] });
        return true;
      },

      removeItem: (courseId) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== courseId) })),

      clearCart: () => set({ items: [], couponCode: '', discountPct: 0 }),

      setCoupon: (code, pct) => set({ couponCode: code, discountPct: pct }),

      subtotal: () => get().items.reduce((s, i) => s + i.price, 0),

      total: () => {
        const sub = get().subtotal();
        return Math.round(sub * (1 - get().discountPct / 100));
      },

      count: () => get().items.length,
    }),
    { name: 'lc-cart' }
  )
);
