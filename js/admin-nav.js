// js/admin-nav.js
(function() {
    // Shared Hamburger Navigation for Admin pages
    document.addEventListener('DOMContentLoaded', () => {
        // If not logged in or in login view, don't show the menu
        if (!window.FT_AUTH || !localStorage.getItem('ft-admin-token')) return;

        // Container
        const header = document.querySelector('.admin-header');
        if (!header) return;

        // Ensure header is flex explicitly
        header.style.display = 'flex';
        header.style.alignItems = 'center';

        // Add Hamburger Button if not exists
        const btn = document.createElement('button');
        btn.innerHTML = '&#9776;'; // Hamburger char
        btn.className = 'nav-hamburger-btn';
        
        // Remove old 'btn-back'
        const backBtn = header.querySelector('.btn-back');
        if (backBtn) backBtn.style.display = 'none';

        // Add UI nav
        const navHtml = `
            <div id="adminNavOverlay" class="nav-overlay hidden"></div>
            <nav id="adminSideNav" class="side-nav">
                <div class="side-nav-header">Admin-Menü</div>
                <a href="admin.html">Dashboard</a>
                <a href="admin-gpsrecords.html">GPS-Daten</a>
                <a href="admin-map.html">Admin-Karte</a>
                <a href="admin-categories.html">Kategorien</a>
                <a href="#" id="adminNavLogout" style="color:#ff3b30">Abmelden</a>
            </nav>
        `;
        document.body.insertAdjacentHTML('beforeend', navHtml);

        const overlay = document.getElementById('adminNavOverlay');
        const sideNav = document.getElementById('adminSideNav');
        const logoutBtn = document.getElementById('adminNavLogout');

        header.insertBefore(btn, header.firstChild);

        function openNav() {
            overlay.classList.remove('hidden');
            sideNav.classList.add('open');
        }

        function closeNav() {
            overlay.classList.add('hidden');
            sideNav.classList.remove('open');
        }

        btn.addEventListener('click', openNav);
        overlay.addEventListener('click', closeNav);
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                FT_AUTH.logout();
                window.location.href = 'admin.html';
            });
        }
    });
})();
