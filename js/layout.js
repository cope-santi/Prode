const NAV_ITEMS = [
    { key: 'matches', label: 'Partidos', href: 'index.html' },
    { key: 'leaderboard', label: 'Leaderboard', href: 'leaderboard.html' }
];

const MATCHES_ITEMS = [
    { key: 'predict', label: 'Pronosticar', href: 'index.html' },
    { key: 'date', label: 'Por fecha', href: 'fixtures.html' },
    { key: 'stage', label: 'Por fase', href: 'game_weeks.html' }
];

export function mountNavbar(activeKey, subKey) {
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

    const matchesContainer = document.getElementById('matches-subnav');
    if (matchesContainer) {
        const matchesLinksHtml = MATCHES_ITEMS.map(item => {
            const isActive = item.key === subKey ? 'active' : '';
            return `<a class="matches-segmented__item ${isActive}" href="${item.href}">${item.label}</a>`;
        }).join('');

        matchesContainer.innerHTML = `
            <div class="matches-subnav">
                <div class="matches-subnav__inner">
                    <div class="matches-segmented">
                        ${matchesLinksHtml}
                    </div>
                </div>
            </div>
        `;
    }
}
