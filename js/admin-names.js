(function () {
    'use strict';

    const API_BASE = FT_AUTH.getApiBase();

    const listEl = document.getElementById('nameList');
    const inputEl = document.getElementById('newName');
    const addBtn = document.getElementById('addBtn');
    const toastEl = document.getElementById('toast');
    let toastTimeout = null;

    async function loadNames() {
        listEl.innerHTML = '<li style="color:#6e6e73">Lädt…</li>';
        try {
            const res = await fetch(`${API_BASE}/manage/names`, { headers: FT_AUTH.adminHeaders() });
            if (res.status === 401) { FT_AUTH.sessionExpired(); return; }
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
            li.innerHTML = `<span class="item-name">${esc(item.name)}</span>`;
            const btn = document.createElement('button');
            btn.className = 'btn btn-danger btn-sm';
            btn.textContent = 'Löschen';
            btn.addEventListener('click', () => deleteName(item.rowKey, item.name));
            li.appendChild(btn);
            listEl.appendChild(li);
        });
    }

    async function addName() {
        const name = inputEl.value.trim();
        if (!name) {
            inputEl.style.borderColor = '#ff3b30';
            inputEl.style.boxShadow = '0 0 0 3px rgba(255,59,48,.12)';
            inputEl.focus();
            setTimeout(() => { inputEl.style.borderColor = ''; inputEl.style.boxShadow = ''; }, 2000);
            return;
        }
        addBtn.disabled = true;
        try {
            const res = await fetch(`${API_BASE}/manage/names`, {
                method: 'POST',
                headers: FT_AUTH.adminHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ name })
            });
            if (res.status === 401) { FT_AUTH.sessionExpired(); return; }
            if (!res.ok) throw new Error();
            inputEl.value = '';
            showToast(`„${name}" hinzugefügt`);
            await loadNames();
        } catch {
            showToast('Fehler beim Hinzufügen', true);
        } finally {
            addBtn.disabled = false;
            inputEl.focus();
        }
    }

    async function deleteName(rowKey, name) {
        if (!confirm(`„${name}" wirklich löschen?`)) return;
        try {
            const res = await fetch(`${API_BASE}/manage/names/${encodeURIComponent(rowKey)}`, {
                method: 'DELETE',
                headers: FT_AUTH.adminHeaders()
            });
            if (res.status === 401) { FT_AUTH.sessionExpired(); return; }
            if (!res.ok) throw new Error();
            showToast(`„${name}" gelöscht`);
            await loadNames();
        } catch {
            showToast('Fehler beim Löschen', true);
        }
    }

    // Enter key to add
    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addName(); });
    addBtn.addEventListener('click', addName);

    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    }

    function showToast(msg, isError) {
        clearTimeout(toastTimeout);
        toastEl.textContent = msg;
        toastEl.className = 'toast' + (isError ? ' error' : '');
        toastTimeout = setTimeout(() => toastEl.classList.add('hidden'), 2500);
    }

    loadNames();
})();
