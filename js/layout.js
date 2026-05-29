const NAV_ITEMS = [
    { key: 'matches', label: 'Partidos', href: 'fixtures.html' },
    { key: 'leaderboard', label: 'Leaderboard', href: 'leaderboard.html' }
];

const MUSIC_VIDEO_ID = 'X9CsK_nuqdE';

export function mountNavbar(options = {}) {
    const {
        activeKey = '',
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
    container.innerHTML = `
        <nav class="topbar">
            <div class="topbar__inner">
                <a class="topbar__brand" href="index.html">Prode</a>
                <div class="topbar__links">
                    ${linksHtml}
                    ${adminLinkHtml}
                </div>
                <div class="topbar__spacer"></div>
                <div class="topbar-music">
                    <button class="topbar-music__button" type="button" aria-expanded="false" aria-controls="music-player-panel">
                        <span class="topbar-music__icon" aria-hidden="true">♪</span>
                        <span>Musica</span>
                    </button>
                    <div class="topbar-music__panel" id="music-player-panel" hidden></div>
                </div>
            </div>
        </nav>
    `;
    mountMusicPlayer(container);
}

function mountMusicPlayer(container) {
    const button = container.querySelector('.topbar-music__button');
    const panel = container.querySelector('#music-player-panel');
    if (!button || !panel) return;

    button.addEventListener('click', () => {
        const willOpen = panel.hidden;
        panel.hidden = !willOpen;
        button.setAttribute('aria-expanded', String(willOpen));
        button.classList.toggle('is-active', willOpen);

        if (willOpen && !panel.querySelector('iframe')) {
            const iframe = document.createElement('iframe');
            iframe.className = 'topbar-music__iframe';
            iframe.src = `https://www.youtube-nocookie.com/embed/${MUSIC_VIDEO_ID}?autoplay=1&rel=0`;
            iframe.title = 'Musica del Prode';
            iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
            iframe.allowFullscreen = true;
            panel.appendChild(iframe);
        }
    });
}
