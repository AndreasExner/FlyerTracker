(function () {
    'use strict';

    const API_BASE = FT_AUTH.getApiBase();

    const listEl = document.getElementById('categoryList');
    const inputEl = document.getElementById('newCategory');
    const addBtn = document.getElementById('addBtn');
    const toastEl = document.getElementById('toast');
    let toastTimeout = null;

    async function loadCategories() {
        listEl.innerHTML = '<li style="color:#6e6e73">Lädt…</li>';
        try {
            const res = await fetch(`${API_BASE}/manage/categories`, { headers: FT_AUTH.adminHeaders() });
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
            li.innerHTML = `<span class="item-name">${esc(item.name)}</span>`;
            const btn = document.createElement('button');
            btn.className = 'btn btn-danger btn-sm';
            btn.textContent = 'Löschen';
            btn.addEventListener('click', () => deleteCategory(item.rowKey, item.name));
            li.appendChild(btn);
            listEl.appendChild(li);
        });
    }

    async function addCategory() {
        const name = inputEl.value.trim();
        if (!name) return;
        addBtn.disabled = true;
        try {
            const res = await fetch(`${API_BASE}/manage/categories`, {
                method: 'POST',
                headers: FT_AUTH.adminHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ name })
            });
            if (res.status === 401) { FT_AUTH.logout(); location.href = 'admin.html'; return; }
            if (!res.ok) throw new Error();
            inputEl.value = '';
            showToast(`„${name}" hinzugefügt`);
            await loadCategories();
        } catch {
            showToast('Fehler beim Hinzufügen', true);
        } finally {
            addBtn.disabled = false;
            inputEl.focus();
        }
    }

    async function deleteCategory(rowKey, name) {
        if (!confirm(`„${name}" wirklich löschen?`)) return;
        try {
            const res = await fetch(`${API_BASE}/manage/categories/${encodeURIComponent(rowKey)}`, {
                method: 'DELETE',
                headers: FT_AUTH.adminHeaders()
            });
            if (res.status === 401) { FT_AUTH.logout(); location.href = 'admin.html'; return; }
            if (!res.ok) throw new Error();
            showToast(`„${name}" gelöscht`);
            await loadCategories();
        } catch {
            showToast('Fehler beim Löschen', true);
        }
    }

    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addCategory(); });
    addBtn.addEventListener('click', addCategory);

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

    loadCategories();
})();
