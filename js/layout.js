const NAV_ITEMS = [
    { key: 'matches', label: 'Partidos', href: 'fixtures.html' },
    { key: 'leaderboard', label: 'Leaderboard', href: 'leaderboard.html' }
];

const MUSIC_VIDEO_ID = 'X9CsK_nuqdE';
const MUSIC_STORAGE_KEY = 'prodeMusicState';
let youtubeApiPromise = null;
let musicPlayer = null;
let musicTimer = null;

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
}

function mountMusicPlayer(container) {
    const controls = {
        play: container.querySelector('[data-music-action="play"]'),
        pause: container.querySelector('[data-music-action="pause"]'),
        mute: container.querySelector('[data-music-action="mute"]')
    };
    const host = container.querySelector('#music-player-host');
    if (!host || !controls.play || !controls.pause || !controls.mute) return;

    controls.play.addEventListener('click', () => {
        ensurePlayer(host, controls).then(player => {
            player.playVideo();
            saveMusicState({ playing: true });
            updateMusicControls(controls, { playing: true });
        });
    });

    controls.pause.addEventListener('click', () => {
        if (!musicPlayer) return;
        musicPlayer.pauseVideo();
        saveMusicState({ playing: false, time: getPlayerTime() });
        updateMusicControls(controls, { playing: false });
    });

    controls.mute.addEventListener('click', () => {
        ensurePlayer(host, controls).then(player => {
            const nextMuted = !player.isMuted();
            if (nextMuted) {
                player.mute();
            } else {
                player.unMute();
            }
            saveMusicState({ muted: nextMuted });
            updateMusicControls(controls, { muted: nextMuted });
        });
    });

    const savedState = readMusicState();
    updateMusicControls(controls, savedState);
    ensurePlayer(host, controls).then(player => {
        if (savedState.muted) player.mute();
        if (savedState.playing) {
            player.playVideo();
        }
    });
}

function ensurePlayer(host, controls) {
    if (musicPlayer) return Promise.resolve(musicPlayer);

    return loadYouTubeApi().then(() => new Promise(resolve => {
        const savedState = readMusicState();
        const startSeconds = getResumeTime(savedState);
        const playerId = `music-player-${Date.now()}`;
        host.innerHTML = `<div id="${playerId}"></div>`;

        musicPlayer = new window.YT.Player(playerId, {
            width: '200',
            height: '113',
            videoId: MUSIC_VIDEO_ID,
            playerVars: {
                autoplay: savedState.playing ? 1 : 0,
                controls: 0,
                disablekb: 1,
                modestbranding: 1,
                playsinline: 1,
                rel: 0,
                start: Math.max(0, Math.floor(startSeconds))
            },
            events: {
                onReady: event => {
                    if (savedState.muted) event.target.mute();
                    if (startSeconds > 0) event.target.seekTo(startSeconds, true);
                    startMusicTimer();
                    window.addEventListener('beforeunload', persistCurrentMusicState);
                    resolve(event.target);
                },
                onStateChange: event => {
                    const playing = event.data === window.YT.PlayerState.PLAYING;
                    const paused = event.data === window.YT.PlayerState.PAUSED;
                    if (playing || paused) {
                        saveMusicState({ playing, time: getPlayerTime() });
                        updateMusicControls(controls, { playing });
                    }
                }
            }
        });
    }));
}

function loadYouTubeApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (youtubeApiPromise) return youtubeApiPromise;

    youtubeApiPromise = new Promise(resolve => {
        const previousCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (typeof previousCallback === 'function') previousCallback();
            resolve();
        };

        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(script);
        }
    });

    return youtubeApiPromise;
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

function getPlayerTime() {
    if (!musicPlayer || typeof musicPlayer.getCurrentTime !== 'function') return 0;
    return musicPlayer.getCurrentTime() || 0;
}

function startMusicTimer() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = setInterval(() => {
        if (!musicPlayer || typeof musicPlayer.getPlayerState !== 'function') return;
        const playing = musicPlayer.getPlayerState() === window.YT.PlayerState.PLAYING;
        saveMusicState({
            playing,
            muted: typeof musicPlayer.isMuted === 'function' ? musicPlayer.isMuted() : false,
            time: getPlayerTime()
        });
    }, 1000);
}

function persistCurrentMusicState() {
    if (!musicPlayer || typeof musicPlayer.getPlayerState !== 'function') return;
    saveMusicState({
        playing: musicPlayer.getPlayerState() === window.YT.PlayerState.PLAYING,
        muted: typeof musicPlayer.isMuted === 'function' ? musicPlayer.isMuted() : false,
        time: getPlayerTime()
    });
}

function updateMusicControls(controls, patch) {
    const state = { ...readMusicState(), ...patch };
    controls.play.disabled = !!state.playing;
    controls.pause.disabled = !state.playing;
    controls.mute.textContent = state.muted ? 'Sonido' : 'Mute';
    controls.mute.classList.toggle('is-active', !!state.muted);
}
