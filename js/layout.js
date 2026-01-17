const NAV_ITEMS = [
    { key: 'matches', label: 'Partidos', href: 'fixtures.html' },
    { key: 'leaderboard', label: 'Leaderboard', href: 'leaderboard.html' }
];

export function mountNavbar(options = {}) {
    const {
        activeKey = '',
        accountLabel = 'Ingresar',
        accountHref = 'crearCuenta.html',
        showAdmin = false
    } = options;
    const container = document.getElementById('app-navbar');
    if (!container) return;

    const linksHtml = NAV_ITEMS.map(item => {
        const isActive = item.key === activeKey ? 'active' : '';
        return `<a class="topbar__link ${isActive}" href="${item.href}">${item.label}</a>`;
    }).join('');
    const adminLinkHtml = showAdmin
        ? `<a class="topbar__link ${activeKey === 'admin' ? 'active' : ''}" href="admin.html">Admin</a>`
        : '';
    const accountClass = activeKey === 'account' ? 'topbar__account active' : 'topbar__account';

    container.innerHTML = `
        <nav class="topbar">
            <div class="topbar__inner">
                <a class="topbar__brand" href="fixtures.html">Prode</a>
                <div class="topbar__links">
                    ${linksHtml}
                    ${adminLinkHtml}
                </div>
                <div class="topbar__spacer"></div>
                <a class="${accountClass}" href="${accountHref}">${accountLabel}</a>
            </div>
        </nav>
    `;
}
