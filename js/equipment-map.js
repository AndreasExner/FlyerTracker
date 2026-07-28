/* js/equipment-map.js — Read-only Equipment map, grouped by location */
(function () {
    'use strict';

    const API_BASE = FT_AUTH.getApiBase();
    const markerCountEl = document.getElementById('markerCount');
    const toastEl = document.getElementById('toast');
    const locModal = document.getElementById('eqLocModal');
    const locTitleEl = document.getElementById('eqLocTitle');
    const locSubEl = document.getElementById('eqLocSub');
    const locListEl = document.getElementById('eqLocList');
    let toastTimeout = null;

    function showToast(msg, isError) {
        clearTimeout(toastTimeout);
        toastEl.textContent = msg;
        toastEl.className = 'toast' + (isError ? ' error' : '');
        toastTimeout = setTimeout(() => toastEl.classList.add('hidden'), 3000);
    }

    function escHtml(s) {
        return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    }

    const TYPE_LABELS = { falle: 'Falle', kamera_abo: 'Kamera (Abo)', kamera_sim: 'Kamera (SIM)', sonstiges: 'Sonstiges' };
    function typeNeedsSim(type) { return type === 'falle' || type === 'kamera_sim'; }

    function pill(label, bg, color) {
        return `<span style="font-size:0.6875rem;font-weight:600;padding:0.125rem 0.5rem;border-radius:999px;background:${bg};color:${color};white-space:nowrap;">${label}</span>`;
    }

    function statusBadge(type, dateStr) {
        if (type === 'kamera_abo') return pill('Abo', 'rgba(52,199,89,.18)', '#248a3d');
        if (typeNeedsSim(type)) return simStatusBadge(dateStr);
        return '';
    }

    function simStatusBadge(dateStr) {
        let label, bg, color;
        if (!dateStr) {
            label = 'n/a'; bg = '#f2f2f7'; color = '#8e8e93';
        } else {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const p = String(dateStr).split('-');
            const exp = new Date(+p[0], +p[1] - 1, +p[2]);
            const diffDays = Math.round((exp - today) / 86400000);
            if (diffDays < 0) { label = 'Abgelaufen'; bg = 'rgba(255,59,48,.15)'; color = '#ff3b30'; }
            else if (diffDays <= 7) { label = 'Läuft ab'; bg = 'rgba(255,204,0,.25)'; color = '#b8860b'; }
            else { label = 'Guthaben'; bg = 'rgba(52,199,89,.18)'; color = '#248a3d'; }
        }
        return pill(label, bg, color);
    }

    // ── Standard pin (teardrop) ──────────────────────────────────
    function pinIcon() {
        return L.divIcon({
            className: '',
            html: `<svg width="24" height="36" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#0071e3"/>
                <circle cx="12" cy="12" r="5" fill="#fff"/>
            </svg>`,
            iconSize: [24, 36],
            iconAnchor: [12, 36],
            popupAnchor: [0, -32]
        });
    }

    // ── Init map ─────────────────────────────────────────────────
    const map = L.map('map').setView([51.1657, 10.4515], 6);

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    });
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri, Maxar, Earthstar',
        maxZoom: 19
    });
    const cartoPositron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20
    });

    osmLayer.addTo(map);

    L.control.layers({
        'OSM Straße': osmLayer,
        'CARTO Positron': cartoPositron,
        'Esri Satellit': satelliteLayer
    }, null, { position: 'topright', collapsed: true }).addTo(map);

    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    const clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 40,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false
    });
    map.addLayer(clusterGroup);

    // ── Modal handling ───────────────────────────────────────────
    function openLocModal(group) {
        const first = group.items[0];
        locTitleEl.textContent = first.location || 'Standort';
        const parts = [];
        if (first.userName) parts.push('👤 ' + first.userName);
        parts.push(`${group.lat.toFixed(6)}, ${group.lng.toFixed(6)}`);
        locSubEl.textContent = parts.join(' · ');

        locListEl.innerHTML = group.items.map(item => {
            const details = [];
            const typeLabel = TYPE_LABELS[item.equipmentType];
            if (typeLabel) details.push('🏷️ ' + typeLabel);
            if (item.comment) details.push('💬 ' + escHtml(item.comment));
            if (item.phoneNumber) details.push('📞 ' + escHtml(item.phoneNumber));
            if (typeNeedsSim(item.equipmentType) && item.simExpiryDate) details.push('📅 ' + escHtml(item.simExpiryDate));
            const detailHtml = details.length ? `<small>${details.join(' · ')}</small>` : '';
            return `<div class="eq-loc-item">
                <strong>${escHtml(item.displayName)}${statusBadge(item.equipmentType, item.simExpiryDate)}</strong>
                ${detailHtml}
            </div>`;
        }).join('');

        locModal.classList.add('open');
    }
    function closeLocModal() { locModal.classList.remove('open'); }
    document.getElementById('eqLocClose').addEventListener('click', closeLocModal);
    locModal.addEventListener('click', (e) => { if (e.target === locModal) closeLocModal(); });

    // ── Load & display ───────────────────────────────────────────
    async function loadAndDisplay() {
        try {
            const res = await fetch(`${API_BASE}/manage/equipment`, { headers: FT_AUTH.adminHeaders() });
            if (res.status === 401) { FT_AUTH.sessionExpired(); return; }
            if (!res.ok) throw new Error();

            const items = await res.json();

            // Group by coordinates
            const groups = {};
            items.forEach(item => {
                if (!item.latitude || !item.longitude) return;
                const key = `${item.latitude.toFixed(6)},${item.longitude.toFixed(6)}`;
                if (!groups[key]) groups[key] = { lat: item.latitude, lng: item.longitude, items: [] };
                groups[key].items.push(item);
            });

            const groupList = Object.values(groups);
            markerCountEl.textContent = `${groupList.length} Standort${groupList.length !== 1 ? 'e' : ''}`;

            const bounds = [];
            groupList.forEach(group => {
                const marker = L.marker([group.lat, group.lng], { icon: pinIcon() });
                marker.on('click', () => openLocModal(group));
                clusterGroup.addLayer(marker);
                bounds.push([group.lat, group.lng]);
            });

            if (bounds.length === 0) {
                showToast('Kein Equipment mit Standort vorhanden', false);
                return;
            }
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        } catch {
            showToast('Fehler beim Laden des Equipments', true);
        }
    }

    loadAndDisplay();
})();
