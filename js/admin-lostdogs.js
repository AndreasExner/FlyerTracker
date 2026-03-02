(function () {
    'use strict';

    const API_BASE = FT_AUTH.getApiBase();

    const listEl = document.getElementById('dogList');
    const inputEl = document.getElementById('newDog');
    const addBtn = document.getElementById('addBtn');
    const toastEl = document.getElementById('toast');
    let toastTimeout = null;

    async function loadDogs() {
        listEl.innerHTML = '<li style="color:#6e6e73">Lädt…</li>';
        try {
            const res = await fetch(`${API_BASE}/manage/lost-dogs`, { headers: FT_AUTH.adminHeaders() });
            if (res.status === 401) { FT_AUTH.logout(); location.href = 'admin.html'; return; }
            if (!res.ok) throw new Error();
            const items = await res.json();
            renderList(items);
        } catch {
            listEl.innerHTML = '<li style="color:#ff3b30">Fehler beim Laden</li>';
        }
    }

    function renderList(items) {
        listEl.innerHTML = '';
        if (items.length === 0) {
            listEl.innerHTML = '<li style="color:#6e6e73">Keine Einträge</li>';
            return;
        }
        items.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="item-name">${esc(item.location)}</span>`;
            const btn = document.createElement('button');
            btn.className = 'btn btn-danger btn-sm';
            btn.textContent = 'Löschen';
            btn.addEventListener('click', () => deleteDog(item.rowKey, item.location));
            li.appendChild(btn);
            listEl.appendChild(li);
        });
    }

    async function addDog() {
        const location = inputEl.value.trim();
        if (!location) return;
        addBtn.disabled = true;
        try {
            const res = await fetch(`${API_BASE}/manage/lost-dogs`, {
                method: 'POST',
                headers: FT_AUTH.adminHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ location })
            });
            if (res.status === 401) { FT_AUTH.logout(); location.href = 'admin.html'; return; }
            if (!res.ok) throw new Error();
            inputEl.value = '';
            showToast(`„${location}" hinzugefügt`);
            await loadDogs();
        } catch {
            showToast('Fehler beim Hinzufügen', true);
        } finally {
            addBtn.disabled = false;
            inputEl.focus();
        }
    }

    async function deleteDog(rowKey, location) {
        if (!confirm(`„${location}" wirklich löschen?`)) return;
        try {
            const res = await fetch(`${API_BASE}/manage/lost-dogs/${encodeURIComponent(rowKey)}`, {
                method: 'DELETE',
                headers: FT_AUTH.adminHeaders()
            });
            if (res.status === 401) { FT_AUTH.logout(); location.href = 'admin.html'; return; }
            if (!res.ok) throw new Error();
            showToast(`„${location}" gelöscht`);
            await loadDogs();
        } catch {
            showToast('Fehler beim Löschen', true);
        }
    }

    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addDog(); });
    addBtn.addEventListener('click', addDog);

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function showToast(msg, isError) {
        clearTimeout(toastTimeout);
        toastEl.textContent = msg;
        toastEl.className = 'toast' + (isError ? ' error' : '');
        toastTimeout = setTimeout(() => toastEl.classList.add('hidden'), 2500);
    }

    loadDogs();
})();
