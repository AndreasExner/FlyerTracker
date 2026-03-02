(function () {
    'use strict';

    // In production (SWA), API is at /api. Locally, Azure Functions runs on port 7071.
    const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const API_BASE = IS_LOCAL ? 'http://localhost:7071/api' : '/api';
    const API_KEY = IS_LOCAL ? 'flyertracker-dev-key-2026' : 'ft-prod-key-8bffad18b4db499c';
    const STORAGE_KEY_NAME = 'flyertracker_userName';
    const STORAGE_KEY_LOCATION = 'flyertracker_lostDog';

    const userNameEl = document.getElementById('userName');
    const lostDogEl = document.getElementById('lostDog');
    const saveBtnEl = document.getElementById('saveBtn');
    const toastEl = document.getElementById('toast');

    let toastTimeout = null;

    // ── Initialisation ───────────────────────────────────────────────
    async function init() {
        await Promise.all([loadNames(), loadLostDogs()]);
        restoreSelections();
        updateButtonState();

        userNameEl.addEventListener('change', onSelectionChange);
        lostDogEl.addEventListener('change', onSelectionChange);
        saveBtnEl.addEventListener('click', onSaveLocation);
    }

    // ── Load dropdown data ───────────────────────────────────────────
    async function loadNames() {
        try {
            userNameEl.classList.add('loading');
            const res = await fetch(`${API_BASE}/names`, { headers: { 'X-API-Key': API_KEY } });
            if (!res.ok) throw new Error('Fehler beim Laden der Namen');
            const names = await res.json();
            names.forEach(n => {
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = n;
                userNameEl.appendChild(opt);
            });
        } catch (err) {
            console.error(err);
            showToast('Namen konnten nicht geladen werden', true);
        } finally {
            userNameEl.classList.remove('loading');
        }
    }

    async function loadLostDogs() {
        try {
            lostDogEl.classList.add('loading');
            const res = await fetch(`${API_BASE}/lost-dogs`, { headers: { 'X-API-Key': API_KEY } });
            if (!res.ok) throw new Error('Fehler beim Laden der Hunde');
            const dogs = await res.json();
            dogs.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d;
                opt.textContent = d;
                lostDogEl.appendChild(opt);
            });
        } catch (err) {
            console.error(err);
            showToast('Hunde konnten nicht geladen werden', true);
        } finally {
            lostDogEl.classList.remove('loading');
        }
    }

    // ── Selection persistence (localStorage) ─────────────────────────
    function restoreSelections() {
        const savedName = localStorage.getItem(STORAGE_KEY_NAME);
        const savedLoc = localStorage.getItem(STORAGE_KEY_LOCATION);
        if (savedName) userNameEl.value = savedName;
        if (savedLoc) lostDogEl.value = savedLoc;
    }

    function persistSelections() {
        localStorage.setItem(STORAGE_KEY_NAME, userNameEl.value);
        localStorage.setItem(STORAGE_KEY_LOCATION, lostDogEl.value);
    }

    function onSelectionChange() {
        persistSelections();
        updateButtonState();
    }

    function updateButtonState() {
        saveBtnEl.disabled = !(userNameEl.value && lostDogEl.value);
    }

    // ── Save GPS location ────────────────────────────────────────────
    async function onSaveLocation() {
        if (saveBtnEl.disabled) return;

        saveBtnEl.classList.add('saving');
        saveBtnEl.textContent = 'WIRD GESPEICHERT…';

        try {
            const position = await getCurrentPosition();
            const payload = {
                name: userNameEl.value,
                lostDog: lostDogEl.value,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: new Date().toISOString()
            };

            const res = await fetch(`${API_BASE}/save-location`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Speichern fehlgeschlagen');

            showToast('Standort gespeichert ✓');
        } catch (err) {
            console.error(err);
            if (err.code === 1) {
                showToast('GPS-Zugriff verweigert. Bitte Standort freigeben.', true);
            } else if (err.code === 2) {
                showToast('Standort nicht verfügbar.', true);
            } else if (err.code === 3) {
                showToast('GPS-Zeitüberschreitung.', true);
            } else {
                showToast('Fehler beim Speichern.', true);
            }
        } finally {
            saveBtnEl.classList.remove('saving');
            saveBtnEl.textContent = 'STANDORT SPEICHERN';
        }
    }

    function getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation wird nicht unterstützt'));
                return;
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            });
        });
    }

    // ── Toast ────────────────────────────────────────────────────────
    function showToast(message, isError = false) {
        if (toastTimeout) clearTimeout(toastTimeout);
        toastEl.textContent = message;
        toastEl.className = isError ? 'toast error' : 'toast';
        toastTimeout = setTimeout(() => {
            toastEl.classList.add('hidden');
        }, 3000);
    }

    // ── Start ────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);
})();
