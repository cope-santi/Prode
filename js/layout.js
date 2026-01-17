const NAV_ITEMS = [
    { key: 'matches', label: 'Partidos', href: 'fixtures.html' },
    { key: 'leaderboard', label: 'Leaderboard', href: 'leaderboard.html' }
];

export function mountNavbar(options = {}) {
    const {
        activeKey = '',
        showAdmin = false,
        showAccount = false
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
    const accountLinkHtml = showAccount
        ? `<a class="topbar__account" href="index.html#auth-ui">Cuenta</a>`
        : '';

    container.innerHTML = `
        <nav class="topbar">
            <div class="topbar__inner">
                <a class="topbar__brand" href="index.html">Prode</a>
                <div class="topbar__links">
                    ${linksHtml}
                    ${adminLinkHtml}
                </div>
                <div class="topbar__spacer"></div>
                ${accountLinkHtml}
            </div>
        </nav>
    `;
}
