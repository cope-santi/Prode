const NAV_ITEMS = [
    { key: 'play', label: 'Partidos / Predicciones', href: 'index.html' },
    { key: 'leaderboard', label: 'Leaderboard', href: 'leaderboard.html' },
    { key: 'phases', label: 'Fases', href: 'game_weeks.html' },
    { key: 'calendar', label: 'Calendario', href: 'fixtures.html' }
];

export function mountNavbar(activeKey) {
    const container = document.getElementById('app-navbar');
    if (!container) return;

    const linksHtml = NAV_ITEMS.map(item => {
        const isActive = item.key === activeKey ? 'active' : '';
        return `<a class="topbar__link ${isActive}" href="${item.href}">${item.label}</a>`;
    }).join('');

    container.innerHTML = `
        <nav class="topbar">
            <div class="topbar__inner">
                <a class="topbar__brand" href="index.html">Prode</a>
                <div class="topbar__links">
                    ${linksHtml}
                </div>
                <div class="topbar__spacer"></div>
                <a class="topbar__account" href="crearCuenta.html">Ingresar</a>
            </div>
        </nav>
    `;
}
