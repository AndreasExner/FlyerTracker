/**
 * FlyerTracker – Shared Auth Helper
 * Provides API key header and admin token management.
 */
const FT_AUTH = (function () {
    'use strict';

    const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const API_KEY = IS_LOCAL ? 'flyertracker-dev-key-2026' : 'ft-prod-key-8bffad18b4db499c';
    const TOKEN_KEY = 'flyertracker_admin_token';
    const API_BASE = IS_LOCAL ? 'http://localhost:7071/api' : '/api';

    /** Headers for public (non-admin) fetch calls */
    function publicHeaders(extra) {
        return Object.assign({ 'X-API-Key': API_KEY }, extra || {});
    }

    /** Headers for admin fetch calls (includes Bearer token) */
    function adminHeaders(extra) {
        const token = sessionStorage.getItem(TOKEN_KEY);
        return Object.assign({
            'X-API-Key': API_KEY,
            'X-Admin-Token': token || ''
        }, extra || {});
    }

    /** Login → returns token string or null */
    async function login(username, password) {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.token) {
            sessionStorage.setItem(TOKEN_KEY, data.token);
            return data.token;
        }
        return null;
    }

    /** Check if admin token exists and is valid (calls /auth/verify) */
    async function isLoggedIn() {
        const token = sessionStorage.getItem(TOKEN_KEY);
        if (!token) return false;
        try {
            const res = await fetch(`${API_BASE}/auth/verify`, {
                headers: { 'X-API-Key': API_KEY, 'X-Admin-Token': token }
            });
            return res.ok;
        } catch {
            return false;
        }
    }

    function logout() {
        sessionStorage.removeItem(TOKEN_KEY);
    }

    function getApiBase() { return API_BASE; }

    return { publicHeaders, adminHeaders, login, isLoggedIn, logout, getApiBase };
})();
