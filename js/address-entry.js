/* js/address-entry.js — Manuelle Adresseingabe (Nominatim + Minikarte) */
(function () {
    'use strict';

    const API_BASE = FT_AUTH.getApiBase();

    const addressInput = document.getElementById('addressInput');
    const searchAddressBtn = document.getElementById('searchAddressBtn');
    const searchResultsEl = document.getElementById('searchResults');
    const miniMapWrap = document.getElementById('miniMapWrap');
    const entryFields = document.getElementById('entryFields');
    const entryNameEl = document.getElementById('entryName');
    const entryDogEl = document.getElementById('entryDog');
    const entryCategoryEl = document.getElementById('entryCategory');
    const entryCommentEl = document.getElementById('entryComment');
    const entryTimestampEl = document.getElementById('entryTimestamp');
    const coordsDisplayEl = document.getElementById('coordsDisplay');
    const saveEntryBtn = document.getElementById('saveEntryBtn');
    const toastEl = document.getElementById('toast');

    const LAST_DOG_KEY = 'lostdogtracer_lastDog';
    const LAST_NAME_KEY = 'lostdogtracer_lastName';
    const LAST_CAT_KEY = 'lostdogtracer_category';

    let toastTimeout = null;
    let miniMap = null;
    let miniMarker = null;
    let selectedCoords = null;

    function showToast(msg, isError) {
        clearTimeout(toastTimeout);
        toastEl.textContent = msg;
        toastEl.className = 'toast' + (isError ? ' error' : '');
        toastTimeout = setTimeout(() => toastEl.classList.add('hidden'), 2500);
    }

    /** Load Name / Hund / Kategorie dropdowns for the entry form */
    async function loadEntryDropdowns() {
        try {
            const hdrs = FT_AUTH.publicHeaders();
            const [namesRes, dogsRes, catsRes] = await Promise.all([
                fetch(`${API_BASE}/user-names`, { headers: hdrs }),
                fetch(`${API_BASE}/lost-dogs`, { headers: hdrs }),
                fetch(`${API_BASE}/categories`, { headers: hdrs })
            ]);
            const names = await namesRes.json();
            const dogs = await dogsRes.json();
            const cats = await catsRes.json();

            names.filter(n => (n.rowKey || n).toLowerCase() !== 'admin').forEach(n => { const o = document.createElement('option'); o.value = n.rowKey || n; o.textContent = n.displayName || n; entryNameEl.appendChild(o); });
            dogs.forEach(d => { const o = document.createElement('option'); o.value = d.rowKey || d; o.textContent = d.displayName || d; entryDogEl.appendChild(o); });
            cats.forEach(c => { const o = document.createElement('option'); o.value = c.rowKey || c; o.textContent = c.displayName || c; entryCategoryEl.appendChild(o); });
            restoreSelections();
        } catch (e) {
            console.error('Failed to load entry dropdowns', e);
            showToast('Dropdown-Daten konnten nicht geladen werden', true);
        }
    }

    /** Preselect the last used values; the name falls back to the logged-in user */
    function restoreSelections() {
        entryNameEl.value = localStorage.getItem(LAST_NAME_KEY) ?? FT_AUTH.getUserName();
        entryDogEl.value = localStorage.getItem(LAST_DOG_KEY) ?? '';
        entryCategoryEl.value = localStorage.getItem(LAST_CAT_KEY) ?? '';
        updateSaveBtn();
    }

    function persistSelections() {
        try {
            localStorage.setItem(LAST_NAME_KEY, entryNameEl.value);
            localStorage.setItem(LAST_DOG_KEY, entryDogEl.value);
            localStorage.setItem(LAST_CAT_KEY, entryCategoryEl.value);
        } catch { /* storage blocked */ }
    }

    /** Set timestamp field to current local time */
    function setDefaultTimestamp() {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        entryTimestampEl.value = now.toISOString().slice(0, 16);
    }

    /** Search Nominatim for address (DE + NL) */
    async function searchAddress() {
        const q = addressInput.value.trim();
        if (q.length < 3) { showToast('Bitte mindestens 3 Zeichen eingeben', true); return; }

        searchAddressBtn.disabled = true;
        searchAddressBtn.textContent = '⏳';

        try {
            const params = new URLSearchParams({
                q,
                format: 'json',
                addressdetails: '1',
                countrycodes: 'de,nl',
                limit: '5'
            });
            const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
                headers: { 'Accept-Language': 'de' }
            });
            const results = await res.json();

            if (results.length === 0) {
                showToast('Keine Ergebnisse gefunden', true);
                searchResultsEl.classList.add('hidden');
                return;
            }

            searchResultsEl.innerHTML = '';
            results.forEach(r => {
                const li = document.createElement('li');
                li.textContent = r.display_name;
                li.addEventListener('click', () => selectResult(r));
                searchResultsEl.appendChild(li);
            });
            searchResultsEl.classList.remove('hidden');
        } catch {
            showToast('Fehler bei der Adresssuche', true);
        } finally {
            searchAddressBtn.disabled = false;
            searchAddressBtn.textContent = 'Suchen';
        }
    }

    /** User picked a result → show map + form fields */
    function selectResult(result) {
        selectedCoords = { lat: parseFloat(result.lat), lon: parseFloat(result.lon) };
        searchResultsEl.classList.add('hidden');
        addressInput.value = result.display_name;

        // Show / init mini map
        miniMapWrap.classList.remove('hidden');
        if (!miniMap) {
            miniMap = L.map('miniMap').setView([selectedCoords.lat, selectedCoords.lon], 16);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(miniMap);
        } else {
            miniMap.setView([selectedCoords.lat, selectedCoords.lon], 16);
        }

        if (miniMarker) miniMarker.remove();
        miniMarker = L.marker([selectedCoords.lat, selectedCoords.lon], { draggable: true }).addTo(miniMap);
        miniMarker.bindPopup(result.display_name).openPopup();
        miniMarker.on('dragend', () => {
            const pos = miniMarker.getLatLng();
            selectedCoords = { lat: pos.lat, lon: pos.lng };
            coordsDisplayEl.textContent = `📍 ${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lon.toFixed(6)}`;
        });

        // Show entry fields
        entryFields.classList.remove('hidden');
        coordsDisplayEl.textContent = `📍 ${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lon.toFixed(6)}`;
        setDefaultTimestamp();
        updateSaveBtn();

        // Leaflet needs resize after container becomes visible
        setTimeout(() => miniMap.invalidateSize(), 150);
    }

    function updateSaveBtn() {
        saveEntryBtn.disabled = !(selectedCoords && entryNameEl.value && entryDogEl.value && entryCategoryEl.value);
    }

    /** Save the entry via existing save-location endpoint */
    async function saveEntry() {
        if (saveEntryBtn.disabled) return;
        saveEntryBtn.disabled = true;
        saveEntryBtn.textContent = 'Wird gespeichert…';

        try {
            const payload = {
                name: entryNameEl.value,
                lostDog: entryDogEl.value,
                category: entryCategoryEl.value,
                comment: entryCommentEl.value.trim(),
                latitude: selectedCoords.lat,
                longitude: selectedCoords.lon,
                accuracy: 0,
                timestamp: new Date(entryTimestampEl.value).toISOString()
            };

            const res = await fetch(`${API_BASE}/save-location`, {
                method: 'POST',
                headers: FT_AUTH.publicHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error();

            showToast('Eintrag gespeichert ✓');

            // Reset form
            selectedCoords = null;
            addressInput.value = '';
            entryCommentEl.value = '';
            coordsDisplayEl.textContent = '';
            miniMapWrap.classList.add('hidden');
            entryFields.classList.add('hidden');
            searchResultsEl.classList.add('hidden');
            if (miniMarker) { miniMarker.remove(); miniMarker = null; }
        } catch {
            showToast('Fehler beim Speichern', true);
        } finally {
            saveEntryBtn.textContent = 'Eintrag speichern';
            updateSaveBtn();
        }
    }

    searchAddressBtn.addEventListener('click', searchAddress);
    addressInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchAddress(); } });
    entryNameEl.addEventListener('change', () => { persistSelections(); updateSaveBtn(); });
    entryDogEl.addEventListener('change', () => { persistSelections(); updateSaveBtn(); });
    entryCategoryEl.addEventListener('change', () => { persistSelections(); updateSaveBtn(); });
    saveEntryBtn.addEventListener('click', saveEntry);

    /* ── Init ─────────────────────────────────────── */
    loadEntryDropdowns();
})();
