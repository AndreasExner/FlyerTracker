/* js/equipment.js — Equipment-Verwaltung */
(function () {
    'use strict';

    const API = FT_AUTH.getApiBase();
    const roleLevel = FT_AUTH.getRoleLevel();
    const listEl = document.getElementById('eqList');
    const createModal = document.getElementById('createEqModal');
    const editModal = document.getElementById('editEqModal');
    const toastEl = document.getElementById('toast');
    let toastTimeout = null;

    function showToast(msg, ok = true) { clearTimeout(toastTimeout); toastEl.textContent = msg; toastEl.className = 'toast' + (ok ? '' : ' error'); toastTimeout = setTimeout(() => toastEl.classList.add('hidden'), 2500); }
    function showError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.style.display = 'block'; }
    function hideError(id) { const el = document.getElementById(id); el.textContent = ''; el.style.display = 'none'; }
    function openModal(m) { m.classList.add('open'); }
    function closeModal(m) { m.classList.remove('open'); }
    function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

    const TYPE_LABELS = { falle: 'Falle', kamera_abo: 'Kamera (Abo)', kamera_sim: 'Kamera (SIM)', sonstiges: 'Sonstiges' };

    // SIM-Aufladung is only relevant for these types
    function typeNeedsSim(type) { return type === 'falle' || type === 'kamera_sim'; }

    // UID field only relevant for cameras (Abo or SIM)
    function typeIsCamera(type) { return type === 'kamera_abo' || type === 'kamera_sim'; }

    function pill(label, bg, color) {
        return `<span style="font-size:0.6875rem;font-weight:600;padding:0.125rem 0.5rem;border-radius:999px;background:${bg};color:${color};white-space:nowrap;">${label}</span>`;
    }

    // Type-dependent status badge for the list/detail views
    function statusBadge(type, dateStr) {
        if (type === 'kamera_abo') return pill('Abo', 'rgba(52,199,89,.18)', '#248a3d');
        if (typeNeedsSim(type)) return simStatusBadge(dateStr);
        return ''; // sonstiges or unknown → no badge
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

    async function apiCall(url, opts = {}) {
        try { const res = await fetch(url, opts); if (res.status === 401) { FT_AUTH.sessionExpired(); return null; } return res; }
        catch { showToast('Netzwerkfehler', false); return null; }
    }

    /* ── Load list ───────────────────────────── */
    async function loadEquipment() {
        listEl.innerHTML = '<p style="color:#6e6e73;text-align:center;padding:2rem">Lädt…</p>';
        const res = await apiCall(`${API}/manage/equipment`, { headers: FT_AUTH.adminHeaders() });
        if (!res) return;
        if (!res.ok) { showToast('Fehler beim Laden', false); return; }
        const items = await res.json();
        renderList(items);
    }

    function renderList(items) {
        if (!items.length) {
            listEl.innerHTML = '<p style="color:#6e6e73;text-align:center;padding:2rem">Kein Equipment vorhanden.</p>';
            return;
        }
        listEl.innerHTML = items.map(item => {
            const typeLabel = TYPE_LABELS[item.equipmentType] || '';
            const locInfo = item.location ? '📍 ' + esc(item.location) : '';
            const userInfo = item.userName ? '👤 ' + esc(item.userName) : '';
            const commentInfo = item.comment ? esc(item.comment) : '';
            const info = [typeLabel, locInfo, userInfo, commentInfo].filter(Boolean).join(' · ') || 'Keine Details';
            return `
            <div class="eq-card">
                <div class="eq-info">
                    <strong style="display:flex;align-items:center;gap:0.5rem;">${esc(item.displayName)}${statusBadge(item.equipmentType, item.simExpiryDate)}</strong>
                    <small>${info}</small>
                </div>
                <div class="eq-actions">
                    <button class="btn btn-secondary btn-sm" onclick="EQ.edit('${esc(item.rowKey)}','${esc(item.displayName)}','${esc(item.equipmentType || '')}','${esc(item.comment || '')}','${esc(item.userName || '')}','${esc(item.location || '')}',${item.latitude || 0},${item.longitude || 0},'${esc(item.phoneNumber || '')}','${esc(item.simExpiryDate || '')}','${esc(item.uid || '')}')">Details</button>
                </div>
            </div>`;
        }).join('');
    }

    /* ── Create ───────────────────────────────── */
    if (roleLevel >= 3) {
        document.getElementById('addBtn').addEventListener('click', () => {
            document.getElementById('newEqName').value = '';
            document.getElementById('newEqType').value = 'falle';
            document.getElementById('newEqComment').value = '';
            hideError('createEqError');
            openModal(createModal);
        });
    } else {
        document.getElementById('addBtn').style.display = 'none';
    }
    document.getElementById('createEqCancel').addEventListener('click', () => closeModal(createModal));
    document.getElementById('createEqSave').addEventListener('click', async () => {
        const displayName = document.getElementById('newEqName').value.trim();
        if (!displayName) { showError('createEqError', 'Bezeichnung ist Pflicht.'); return; }
        const btn = document.getElementById('createEqSave');
        btn.disabled = true;
        const res = await apiCall(`${API}/manage/equipment`, {
            method: 'POST',
            headers: { ...FT_AUTH.adminHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                displayName,
                equipmentType: document.getElementById('newEqType').value,
                comment: document.getElementById('newEqComment').value.trim() || null
            })
        });
        btn.disabled = false;
        if (!res) return;
        if (res.ok) { closeModal(createModal); showToast('Equipment angelegt'); loadEquipment(); }
        else { const d = await res.json().catch(() => ({})); showError('createEqError', d.error || 'Fehler'); }
    });

    /* ── Edit: location mode handling ─────────── */
    const modeButtons = document.querySelectorAll('.loc-mode-btn');
    const locModeOrt = document.getElementById('locModeOrt');
    const locModeMitglied = document.getElementById('locModeMitglied');
    const locModeEinsatz = document.getElementById('locModeEinsatz');
    const resolvedLocEl = document.getElementById('editEqResolvedLoc');
    const memberSelect = document.getElementById('editEqMemberSelect');
    const einsatzSelect = document.getElementById('editEqEinsatzSelect');
    let currentMode = 'ort';
    let cachedUsers = null;
    let cachedEinsatzRecords = null;

    function setMode(mode) {
        currentMode = mode;
        modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
        locModeOrt.style.display = mode === 'ort' ? '' : 'none';
        locModeMitglied.style.display = mode === 'mitglied' ? '' : 'none';
        locModeEinsatz.style.display = mode === 'einsatz' ? '' : 'none';
        resolvedLocEl.style.display = 'none';
        resolvedLocEl.textContent = '';
    }

    modeButtons.forEach(b => b.addEventListener('click', async () => {
        setMode(b.dataset.mode);
        if (b.dataset.mode === 'mitglied') await loadMembers();
        if (b.dataset.mode === 'einsatz') await loadEinsatzRecords();
    }));

    /* Load users with location for "Mitglied" mode */
    async function loadMembers() {
        if (cachedUsers) return;
        memberSelect.innerHTML = '<option value="">Lädt…</option>';
        const res = await apiCall(`${API}/manage/equipment/members`, { headers: FT_AUTH.adminHeaders() });
        if (!res || !res.ok) { memberSelect.innerHTML = '<option value="">Fehler beim Laden</option>'; return; }
        const users = await res.json();
        cachedUsers = users;
        renderMemberOptions();
    }

    function renderMemberOptions() {
        memberSelect.innerHTML = '<option value="">Mitglied wählen…</option>';
        cachedUsers.forEach((u, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${u.displayName} — ${u.location}`;
            memberSelect.appendChild(opt);
        });
    }

    memberSelect.addEventListener('change', () => {
        const idx = memberSelect.value;
        if (idx === '') { clearLocationFields(); return; }
        const u = cachedUsers[parseInt(idx)];
        document.getElementById('editEqLocation').value = u.location;
        document.getElementById('editEqLat').value = u.latitude;
        document.getElementById('editEqLng').value = u.longitude;
        document.getElementById('editEqUserName').value = u.displayName;
        resolvedLocEl.textContent = `📍 ${u.location} (${u.displayName})`;
        resolvedLocEl.style.display = '';
    });

    /* Load GPS records for "Im Einsatz" mode */
    async function loadEinsatzRecords() {
        if (cachedEinsatzRecords) return;
        einsatzSelect.innerHTML = '<option value="">Lädt…</option>';

        // First load categories to find RowKeys for target categories
        const catRes = await apiCall(`${API}/categories`, { headers: FT_AUTH.publicHeaders() });
        if (!catRes || !catRes.ok) { einsatzSelect.innerHTML = '<option value="">Fehler beim Laden</option>'; return; }
        const categories = await catRes.json();
        const targetNames = ['Standort-Falle', 'Futterstelle/Kamera', 'Entlauf-Ort'];
        const targetKeys = categories.filter(c => targetNames.includes(c.displayName)).map(c => c.rowKey);

        if (targetKeys.length === 0) {
            einsatzSelect.innerHTML = '<option value="">Keine passenden Kategorien gefunden</option>';
            cachedEinsatzRecords = [];
            return;
        }

        // Fetch GPS records filtered by those categories
        const categoryParam = targetKeys.join(',');
        const gpsRes = await apiCall(`${API}/manage/gps-records?pageSize=all&category=${encodeURIComponent(categoryParam)}`, { headers: FT_AUTH.adminHeaders() });
        if (!gpsRes || !gpsRes.ok) { einsatzSelect.innerHTML = '<option value="">Fehler beim Laden</option>'; return; }
        const data = await gpsRes.json();
        cachedEinsatzRecords = (data.records || []).filter(r => r.latitude && r.longitude);
        renderEinsatzOptions();
    }

    /* Build a readable location label even when the GPS record has no address text */
    function einsatzLabel(r) {
        return r.location || [r.category, r.comment].filter(Boolean).join(' – ')
            || `${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}`;
    }

    function renderEinsatzOptions() {
        einsatzSelect.innerHTML = '<option value="">Einsatzort wählen…</option>';
        cachedEinsatzRecords.forEach((r, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = [r.lostDog || '–', r.category, r.comment].filter(Boolean).join(' · ');
            einsatzSelect.appendChild(opt);
        });
    }

    einsatzSelect.addEventListener('change', () => {
        const idx = einsatzSelect.value;
        if (idx === '') { clearLocationFields(); return; }
        const r = cachedEinsatzRecords[parseInt(idx)];
        const label = einsatzLabel(r);
        document.getElementById('editEqLocation').value = label;
        document.getElementById('editEqLat').value = r.latitude;
        document.getElementById('editEqLng').value = r.longitude;
        document.getElementById('editEqUserName').value = r.lostDog || '';
        resolvedLocEl.textContent = `📍 ${label} (${r.lostDog || '–'})`;
        resolvedLocEl.style.display = '';
    });

    function clearLocationFields() {
        document.getElementById('editEqLocation').value = '';
        document.getElementById('editEqLat').value = '';
        document.getElementById('editEqLng').value = '';
        document.getElementById('editEqUserName').value = '';
        resolvedLocEl.style.display = 'none';
        resolvedLocEl.textContent = '';
    }

    /* ── Edit ─────────────────────────────────── */
    let editTarget = '';
    window.EQ = window.EQ || {};
    EQ.edit = function (rowKey, displayName, equipmentType, comment, userName, location, lat, lng, phoneNumber, simExpiryDate, uid) {
        editTarget = rowKey;
        document.getElementById('editEqName').value = displayName;
        document.getElementById('editEqType').value = equipmentType || 'sonstiges';
        document.getElementById('editEqComment').value = comment || '';
        document.getElementById('editEqLocation').value = location;
        document.getElementById('editEqLat').value = lat || '';
        document.getElementById('editEqLng').value = lng || '';
        document.getElementById('editEqUserName').value = userName || '';
        document.getElementById('editEqPhone').value = phoneNumber || '';
        document.getElementById('editEqSimExpiry').value = simExpiryDate || '';
        document.getElementById('editEqUid').value = uid || '';
        setUidEditable(false);
        hideError('editEqError');
        // Disable name/comment/type for PowerUser
        document.getElementById('editEqName').disabled = roleLevel < 3;
        document.getElementById('editEqComment').disabled = roleLevel < 3;
        document.getElementById('editEqType').disabled = roleLevel < 3;
        // Show SIM field only for relevant types
        updateSimRowVisibility();
        // Show UID field only for cameras and Manager+
        updateUidRowVisibility();
        // Phone field not needed for Kamera (Abo)
        updatePhoneRowVisibility();
        // Delete only for Manager+
        document.getElementById('editEqDelete').style.display = roleLevel >= 3 ? '' : 'none';
        // Reset to "Ort" mode, clear caches
        cachedUsers = null;
        cachedEinsatzRecords = null;
        setMode('ort');
        openModal(editModal);
    };

    function updateSimRowVisibility() {
        const type = document.getElementById('editEqType').value;
        document.getElementById('editEqSimRow').style.display = typeNeedsSim(type) ? '' : 'none';
        document.getElementById('editEqSmsRow').style.display = (type === 'falle' && roleLevel >= 3) ? 'flex' : 'none';
    }
    function updateUidRowVisibility() {
        const type = document.getElementById('editEqType').value;
        document.getElementById('editEqUidRow').style.display = (typeIsCamera(type) && roleLevel >= 3) ? '' : 'none';
    }
    function updatePhoneRowVisibility() {
        const type = document.getElementById('editEqType').value;
        document.getElementById('editEqPhoneRow').style.display = (type === 'kamera_abo') ? 'none' : '';
    }
    document.getElementById('editEqType').addEventListener('change', () => { updateSimRowVisibility(); updateUidRowVisibility(); updatePhoneRowVisibility(); });
    function setUidEditable(editable) {
        const input = document.getElementById('editEqUid');
        const btn = document.getElementById('editEqUidEdit');
        input.readOnly = !editable;
        btn.textContent = editable ? 'Fertig' : 'Bearbeiten';
        if (editable) { input.focus(); input.select(); }
    }
    document.getElementById('editEqUidEdit').addEventListener('click', () => {
        setUidEditable(document.getElementById('editEqUid').readOnly);
    });
    document.getElementById('editEqUid').addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
    });
    document.getElementById('editEqUid').addEventListener('click', async (e) => {
        if (!e.target.readOnly) return; // in edit mode: allow cursor placement, no copy
        const uid = e.target.value.trim();
        if (!uid) return;
        try {
            await navigator.clipboard.writeText(uid);
            showToast('UID kopiert: ' + uid);
        } catch {
            showToast('Kopieren nicht möglich', false);
        }
    });
    document.getElementById('editEqTopup').addEventListener('click', async () => {
        const phone = document.getElementById('editEqPhone').value.trim();
        if (phone) {
            try {
                await navigator.clipboard.writeText(phone);
                showToast('Rufnummer kopiert: ' + phone);
            } catch {
                showToast('Kopieren nicht möglich', false);
            }
        } else {
            showToast('Keine Rufnummer hinterlegt', false);
        }
        window.open('https://www.congstaraufladen.de/shop/topup/congstar', '_blank', 'noopener');
    });
    function sendSms(text) {
        const phone = document.getElementById('editEqPhone').value.trim();
        if (!phone) { showToast('Keine Rufnummer hinterlegt', false); return; }
        window.location.href = 'sms:' + encodeURIComponent(phone) + '?&body=' + encodeURIComponent(text);
    }
    document.getElementById('editEqSmsArm').addEventListener('click', () => sendSms('1234#OFF#'));
    document.getElementById('editEqSmsDisarm').addEventListener('click', () => sendSms('1234#ON#'));
    document.getElementById('editEqCancel').addEventListener('click', () => closeModal(editModal));
    document.getElementById('editEqSave').addEventListener('click', async () => {
        const displayName = document.getElementById('editEqName').value.trim();
        if (!displayName) { showError('editEqError', 'Bezeichnung darf nicht leer sein.'); return; }
        const phoneNumber = document.getElementById('editEqPhone').value.trim();
        if (phoneNumber && !/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
            showError('editEqError', 'Telefonnummer muss im E.164-Format sein (z. B. +491234567890).');
            return;
        }
        const btn = document.getElementById('editEqSave');
        btn.disabled = true;
        const eqType = document.getElementById('editEqType').value;
        const res = await apiCall(`${API}/manage/equipment/${encodeURIComponent(editTarget)}`, {
            method: 'PUT',
            headers: { ...FT_AUTH.adminHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                displayName,
                equipmentType: eqType,
                comment: document.getElementById('editEqComment').value.trim() || null,
                userName: document.getElementById('editEqUserName').value.trim() || null,
                location: document.getElementById('editEqLocation').value.trim() || null,
                latitude: parseFloat(document.getElementById('editEqLat').value) || null,
                longitude: parseFloat(document.getElementById('editEqLng').value) || null,
                phoneNumber: phoneNumber || '',
                simExpiryDate: typeNeedsSim(eqType) ? (document.getElementById('editEqSimExpiry').value.trim() || '') : '',
                uid: (typeIsCamera(eqType) && roleLevel >= 3) ? document.getElementById('editEqUid').value.trim().toUpperCase() : null
            })
        });
        btn.disabled = false;
        if (!res) return;
        if (res.ok) { closeModal(editModal); showToast('Equipment aktualisiert'); loadEquipment(); }
        else { const d = await res.json().catch(() => ({})); showError('editEqError', d.error || 'Fehler'); }
    });

    /* ── Delete (from detail modal) ───────────── */
    if (roleLevel >= 3) {
        document.getElementById('editEqDelete').addEventListener('click', async () => {
            const name = document.getElementById('editEqName').value.trim();
            if (!confirm(`"${name}" wirklich löschen?`)) return;
            const res = await apiCall(`${API}/manage/equipment/${encodeURIComponent(editTarget)}`, {
                method: 'DELETE', headers: FT_AUTH.adminHeaders()
            });
            if (!res) return;
            if (res.ok) { closeModal(editModal); showToast('Equipment gelöscht'); loadEquipment(); }
            else { showToast('Fehler beim Löschen', false); }
        });
    }

    /* ── Location search (Nominatim, city-level) ── */
    async function searchLocation(inputId, latId, lngId) {
        const input = document.getElementById(inputId);
        const q = input.value.trim();
        if (q.length < 2) { showToast('Mindestens 2 Zeichen', false); return; }
        try {
            const params = new URLSearchParams({ q, format: 'json', addressdetails: '1', countrycodes: 'de,nl', limit: '5', featuretype: 'city' });
            const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'Accept-Language': 'de' } });
            const results = await res.json();
            if (results.length === 0) { showToast('Kein Ort gefunden', false); return; }
            const r = results[0];
            const city = r.address?.city || r.address?.town || r.address?.village || r.address?.municipality || r.display_name.split(',')[0];
            input.value = city;
            document.getElementById(latId).value = r.lat;
            document.getElementById(lngId).value = r.lon;
            // Clear UserName when using manual Ort mode
            document.getElementById('editEqUserName').value = '';
            showToast(`📍 ${city}`);
        } catch { showToast('Fehler bei der Ortssuche', false); }
    }

    document.getElementById('editEqLocationSearch').addEventListener('click', () => searchLocation('editEqLocation', 'editEqLat', 'editEqLng'));

    /* ── Init ─────────────────────────────────── */
    loadEquipment();
})();
