const NAV_ITEMS = [
    { key: 'matches', label: 'Partidos', href: 'fixtures.html' },
    { key: 'leaderboard', label: 'Leaderboard', href: 'leaderboard.html' }
];

const MUSIC_SRC = '/mp3.mp3?v=local-audio-1';
const MUSIC_STORAGE_KEY = 'prodeMusicState';
let musicAudio = null;
let musicTimer = null;
let shellFrame = null;
let shellLoader = null;
let autoplayUnlockBound = false;

export function mountNavbar(options = {}) {
    const {
        activeKey = '',
        showAdmin = false
    } = options;
    const container = document.getElementById('app-navbar');
    if (!container) return;

    if (isEmbeddedPage()) {
        container.hidden = true;
        document.documentElement.classList.add('is-embedded-page');
        mountEmbeddedNavigation();
        return;
    }

    const linksHtml = NAV_ITEMS.map(item => {
        const isActive = item.key === activeKey ? 'active' : '';
        return `<a class="topbar__link ${isActive}" href="${item.href}" data-shell-link>${item.label}</a>`;
    }).join('');
    const adminLinkHtml = showAdmin
        ? `<a class="topbar__link ${activeKey === 'admin' ? 'active' : ''}" href="admin.html" data-shell-link>Admin</a>`
        : '';

    container.innerHTML = `
        <nav class="topbar">
            <div class="topbar__inner">
                <a class="topbar__brand" href="index.html" data-shell-link>Prode</a>
                <div class="topbar__links">
                    ${linksHtml}
                    ${adminLinkHtml}
                </div>
                <div class="topbar__spacer"></div>
                <div class="topbar-music" aria-label="Controles de musica">
                    <span class="topbar-music__label">Musica</span>
                    <button class="topbar-music__control" type="button" data-music-action="play">Play</button>
                    <button class="topbar-music__control" type="button" data-music-action="pause">Pausa</button>
                    <button class="topbar-music__control" type="button" data-music-action="mute">Mute</button>
                    <div id="music-player-host" class="topbar-music__host" aria-hidden="true"></div>
                </div>
            </div>
        </nav>
    `;

    mountMusicPlayer(container);
    mountPersistentShell(container);
}

function isEmbeddedPage() {
    return new URLSearchParams(window.location.search).get('embedded') === '1';
}

function mountPersistentShell(navbarContainer) {
    window.history.replaceState({ shellPath: normalizePath(window.location.pathname) }, '', window.location.href);

    document.addEventListener('click', event => {
        const link = event.target.closest('a[href]');
        if (!link || !shouldOpenInShell(link)) return;

        event.preventDefault();
        openInShell(link.getAttribute('href'), { pushState: true });
    });

    window.addEventListener('popstate', event => {
        if (event.state && event.state.shellPath) {
            openInShell(event.state.shellPath, { pushState: false });
        }
    });

    window.addEventListener('message', event => {
        if (event.origin !== window.location.origin) return;
        if (!event.data || event.data.type !== 'prode-shell-path') return;
        setActiveNav(event.data.path);
        window.history.replaceState({ shellPath: event.data.path }, '', event.data.publicUrl || event.data.path);
    });

    navbarContainer.addEventListener('click', event => {
        const link = event.target.closest('[data-shell-link]');
        if (!link) return;
        setActiveNav(link.getAttribute('href'));
    });
}

function mountEmbeddedNavigation() {
    postEmbeddedPath();
    document.addEventListener('click', event => {
        const link = event.target.closest('a[href]');
        if (!link || !shouldOpenInShell(link)) return;

        event.preventDefault();
        const url = new URL(link.getAttribute('href'), window.location.href);
        window.location.href = buildEmbeddedUrl(normalizePath(url.pathname), url.search, url.hash);
    });
}

function postEmbeddedPath() {
    if (window.parent === window) return;
    window.parent.postMessage({
        type: 'prode-shell-path',
        path: normalizePath(window.location.pathname),
        publicUrl: buildPublicUrl(window.location.href)
    }, window.location.origin);
}

function shouldOpenInShell(link) {
    if (link.target && link.target !== '_self') return false;
    if (link.hasAttribute('download')) return false;

    const rawHref = link.getAttribute('href') || '';
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
        return false;
    }

    const url = new URL(rawHref, window.location.href);
    if (url.origin !== window.location.origin) return false;
    if (!url.pathname.endsWith('.html') && url.pathname !== '/' && url.pathname !== '') return false;

    const currentPath = normalizePath(window.location.pathname);
    const nextPath = normalizePath(url.pathname);
    if (currentPath === nextPath && url.hash) return false;

    return true;
}

function openInShell(rawHref, options = {}) {
    const { pushState = true } = options;
    const url = new URL(rawHref, window.location.href);
    const publicPath = normalizePath(url.pathname);
    const frameUrl = buildEmbeddedUrl(publicPath, url.search, url.hash);
    const publicUrl = buildPublicUrl(url.href);
    const frame = ensureShellFrame();

    showShellLoader();
    frame.src = frameUrl;
    setActiveNav(publicPath);

    if (pushState) {
        window.history.pushState({ shellPath: publicPath }, '', publicUrl);
    }
}

function ensureShellFrame() {
    if (shellFrame) return shellFrame;

    const shell = document.createElement('main');
    shell.className = 'app-shell';
    shell.setAttribute('aria-label', 'Contenido de la aplicacion');

    shellLoader = document.createElement('div');
    shellLoader.className = 'app-shell__loader';
    shellLoader.textContent = 'Cargando...';

    shellFrame = document.createElement('iframe');
    shellFrame.className = 'app-shell__frame';
    shellFrame.title = 'Contenido del Prode';
    shellFrame.setAttribute('data-shell-frame', 'true');
    shellFrame.addEventListener('load', () => {
        hideOriginalPageContent(shell);
        hideShellLoader();
    });

    shell.appendChild(shellLoader);
    shell.appendChild(shellFrame);
    document.body.appendChild(shell);

    document.documentElement.classList.add('app-shell-active');
    document.body.classList.add('app-shell-active');
    return shellFrame;
}

function hideOriginalPageContent(shell) {
    Array.from(document.body.children).forEach(child => {
        if (child.id === 'app-navbar' || child === shell) return;
        child.classList.add('app-shell-hidden');
        child.setAttribute('aria-hidden', 'true');
    });
}

function showShellLoader() {
    if (!shellLoader) return;
    shellLoader.hidden = false;
}

function hideShellLoader() {
    if (!shellLoader) return;
    shellLoader.hidden = true;
}

function buildEmbeddedUrl(pathname, search = '', hash = '') {
    const url = new URL(pathname, window.location.origin);
    if (search) {
        const params = new URLSearchParams(search);
        params.forEach((value, key) => url.searchParams.set(key, value));
    }
    url.searchParams.set('embedded', '1');
    url.searchParams.set('v', 'persistent-shell-4');
    url.hash = hash || '';
    return url.pathname + url.search + url.hash;
}

function buildPublicUrl(rawHref) {
    const url = new URL(rawHref, window.location.origin);
    url.searchParams.delete('embedded');
    url.searchParams.delete('v');
    return url.pathname + url.search + url.hash;
}

function normalizePath(pathname) {
    const path = pathname && pathname !== '/' ? pathname : '/index.html';
    return path.startsWith('/') ? path : `/${path}`;
}

function setActiveNav(rawHref) {
    const targetPath = normalizePath(new URL(rawHref || '/index.html', window.location.origin).pathname);
    document.querySelectorAll('.topbar__link, .topbar__brand').forEach(link => {
        const linkPath = normalizePath(new URL(link.getAttribute('href') || '/index.html', window.location.origin).pathname);
        link.classList.toggle('active', linkPath === targetPath);
    });
}

// ============================================
// Background music (local mp3, no video/YouTube)
// ============================================
function mountMusicPlayer(container) {
    const controls = {
        play: container.querySelector('[data-music-action="play"]'),
        pause: container.querySelector('[data-music-action="pause"]'),
        mute: container.querySelector('[data-music-action="mute"]')
    };
    const host = container.querySelector('#music-player-host');
    if (!host || !controls.play || !controls.pause || !controls.mute) return;

    const audio = ensureAudio(host);
    audio._controls = controls; // keep the sync handlers pointed at the latest buttons
    const savedState = readMusicState();
    audio.muted = !!savedState.muted;

    // Resume playback position once metadata (duration) is known.
    const applyResume = () => {
        const resumeTime = getResumeTime(savedState);
        if (resumeTime > 0 && Number.isFinite(resumeTime)) {
            const duration = audio.duration;
            try {
                audio.currentTime = (duration && Number.isFinite(duration)) ? (resumeTime % duration) : resumeTime;
            } catch (error) {
                /* setting currentTime before it's seekable can throw; ignore */
            }
        }
    };
    if (audio.readyState >= 1) applyResume();
    else audio.addEventListener('loadedmetadata', applyResume, { once: true });

    updateMusicControls(controls, { playing: !audio.paused, muted: audio.muted });

    controls.play.addEventListener('click', () => {
        audio.play()
            .then(() => {
                saveMusicState({ playing: true });
                updateMusicControls(controls, { playing: true });
            })
            .catch(error => console.warn('No se pudo reproducir la musica:', error));
    });

    controls.pause.addEventListener('click', () => {
        audio.pause();
        saveMusicState({ playing: false, time: audio.currentTime });
        updateMusicControls(controls, { playing: false });
    });

    controls.mute.addEventListener('click', () => {
        audio.muted = !audio.muted;
        saveMusicState({ muted: audio.muted });
        updateMusicControls(controls, { muted: audio.muted });
    });

    // Audio-level listeners and timers must be wired only once, even if the navbar
    // is re-mounted; they always target the latest controls via audio._controls.
    if (!audio._wired) {
        audio._wired = true;
        audio.addEventListener('play', () => updateMusicControls(audio._controls, { playing: true }));
        audio.addEventListener('pause', () => updateMusicControls(audio._controls, { playing: false }));
        startMusicTimer();
        window.addEventListener('beforeunload', persistCurrentMusicState);
    }

    // Best-effort resume: browsers block autoplay until a user gesture, so if it
    // is blocked we start it on the first page interaction instead.
    if (savedState.playing && audio.paused) {
        tryPlayMusic(audio, controls);
    }
}

function tryPlayMusic(audio, controls) {
    return audio.play()
        .then(() => {
            saveMusicState({ playing: true });
            updateMusicControls(controls, { playing: true });
        })
        .catch(() => {
            saveMusicState({ playing: true });
            updateMusicControls(controls, { playing: false });
            bindAutoplayUnlock(audio, controls);
        });
}

function bindAutoplayUnlock(audio, controls) {
    if (autoplayUnlockBound) return;
    autoplayUnlockBound = true;

    const unlock = () => {
        audio.play()
            .then(() => {
                saveMusicState({ playing: true });
                updateMusicControls(controls, { playing: true });
                cleanup();
            })
            .catch(() => {
                updateMusicControls(controls, { playing: false });
            });
    };

    const cleanup = () => {
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
        document.removeEventListener('touchstart', unlock);
    };

    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
    document.addEventListener('touchstart', unlock, { passive: true });
}

function ensureAudio(host) {
    if (!musicAudio) {
        musicAudio = new Audio(MUSIC_SRC);
        musicAudio.loop = true;
        musicAudio.preload = 'auto';
    }
    if (musicAudio.parentNode !== host) {
        host.appendChild(musicAudio); // (re)attach to the current navbar host
    }
    return musicAudio;
}

function readMusicState() {
    try {
        return {
            playing: true,
            muted: false,
            time: 0,
            updatedAt: Date.now(),
            ...JSON.parse(localStorage.getItem(MUSIC_STORAGE_KEY) || '{}')
        };
    } catch (error) {
        return { playing: true, muted: false, time: 0, updatedAt: Date.now() };
    }
}

function saveMusicState(patch) {
    const current = readMusicState();
    const next = {
        ...current,
        ...patch,
        updatedAt: Date.now()
    };
    localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(next));
}

function getResumeTime(state) {
    const baseTime = Number(state.time || 0);
    if (!state.playing || !state.updatedAt) return baseTime;
    const elapsed = (Date.now() - Number(state.updatedAt)) / 1000;
    return baseTime + Math.max(0, elapsed);
}

function startMusicTimer() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = setInterval(() => {
        if (!musicAudio) return;
        saveMusicState({
            playing: !musicAudio.paused,
            muted: musicAudio.muted,
            time: musicAudio.currentTime || 0
        });
    }, 1000);
}

function persistCurrentMusicState() {
    if (!musicAudio) return;
    saveMusicState({
        playing: !musicAudio.paused,
        muted: musicAudio.muted,
        time: musicAudio.currentTime || 0
    });
}

function updateMusicControls(controls, patch) {
    const state = { ...readMusicState(), ...patch };
    controls.play.disabled = !!state.playing;
    controls.pause.disabled = !state.playing;
    controls.mute.textContent = state.muted ? 'Sonido' : 'Mute';
    controls.mute.classList.toggle('is-active', !!state.muted);
}
