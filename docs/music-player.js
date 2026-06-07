// YAMTAM Music Player — shared across all pages
(function () {
  const DEFAULT_VID = 'aKSJAcG4V4o';
  const DEFAULT_TRACKS = [
    'aKSJAcG4V4o','KeoAfgsM8o4','def8pw8Z0DE','oy2CxxQCuhw',
    'w1wdiibZTl8','JCn0hoILmyw','fuXfT4Rv_WM',
  ];

  let _player = null;
  let _muted   = localStorage.getItem('site-mute') === '1';
  let _resumeBtn = null;
  let _pendingPlay = false;   // click happened before player ready

  function getVid()     { return localStorage.getItem('music-vid') || DEFAULT_VID; }
  function getOffset()  { return parseFloat(localStorage.getItem('music-offset') || '0'); }
  function wasPlaying() { return localStorage.getItem('music-playing') === '1'; }

  // ── Save state on page unload ─────────────────────────────────────────────
  window.addEventListener('beforeunload', () => {
    if (!_player || typeof _player.getCurrentTime !== 'function') return;
    try {
      localStorage.setItem('music-offset', _player.getCurrentTime());
      const st = _player.getPlayerState();
      localStorage.setItem('music-playing', st === 1 || st === 3 ? '1' : '0');
    } catch (e) {}
  });

  // ── Resume button ─────────────────────────────────────────────────────────
  function _showResumeBtn() {
    if (_resumeBtn || window._customToggleMute) return;
    _resumeBtn = document.createElement('button');
    _resumeBtn.id = 'music-resume-btn';
    _resumeBtn.innerHTML = '▶ nhạc';
    Object.assign(_resumeBtn.style, {
      position: 'fixed', bottom: '72px', right: '18px', zIndex: '9999',
      background: 'hsla(155, 52%, 28%, .92)', color: '#fff',
      border: 'none', borderRadius: '20px', padding: '7px 14px',
      fontSize: '13px', fontWeight: '600', cursor: 'pointer',
      boxShadow: '0 2px 12px rgba(0,0,0,.25)', backdropFilter: 'blur(6px)',
      transition: 'opacity .2s',
    });
    _resumeBtn.addEventListener('click', _doPlay);
    document.body.appendChild(_resumeBtn);
  }

  function _hideResumeBtn() {
    if (!_resumeBtn) return;
    _resumeBtn.style.opacity = '0';
    setTimeout(() => { _resumeBtn && _resumeBtn.remove(); _resumeBtn = null; }, 220);
  }

  // ── Core play / pause helpers ─────────────────────────────────────────────
  function _doPlay() {
    if (!_player || typeof _player.playVideo !== 'function') {
      _pendingPlay = true;   // execute once player is ready
      return;
    }
    _player.playVideo();
    if (!_muted) _player.unMute();
    _hideResumeBtn();
  }

  function _doPause() {
    if (!_player || typeof _player.pauseVideo !== 'function') return;
    _player.pauseVideo();
  }

  // ── Sync button icon ──────────────────────────────────────────────────────
  function _syncBtn() {
    if (window._customToggleMute) return; // music.html / io.html manage their own
    const btn = document.getElementById('mute-btn');
    if (!btn) return;
    const playing = _player &&
      typeof _player.getPlayerState === 'function' &&
      _player.getPlayerState() === 1;
    // If button has a separate icon span (#yt-icon), update only that
    const iconEl = document.getElementById('yt-icon');
    if (iconEl) {
      iconEl.textContent = playing ? '⏸' : '▶';
    } else {
      btn.textContent = playing ? '⏸' : '▶';
    }
    btn.title = playing ? 'Dừng nhạc YT' : 'Phát nhạc YouTube';
  }

  // ── toggleMute = play/pause on regular pages ──────────────────────────────
  if (!window._customToggleMute) {
    window.toggleMute = function () {
      if (!_player || typeof _player.getPlayerState !== 'function') {
        _pendingPlay = true;    // player not ready yet — play when ready
        return;
      }
      const st = _player.getPlayerState();
      if (st === 1 || st === 3) {
        _doPause();
        localStorage.setItem('music-playing', '0');
      } else {
        _doPlay();
        localStorage.setItem('music-playing', '1');
      }
      setTimeout(_syncBtn, 150);
    };
  }

  // Real mute toggle (used by music.html via toggleMuteLocal)
  window.toggleMuteOnly = function () {
    const muted = localStorage.getItem('site-mute') !== '1';
    localStorage.setItem('site-mute', muted ? '1' : '0');
    _muted = muted;
    if (_player) _muted ? _player.mute() : _player.unMute();
  };

  // ── Player init ───────────────────────────────────────────────────────────
  function _initPlayer() {
    if (_player) return;   // already created
    const el = document.getElementById('yt-player');
    if (!el) return;

    _player = new YT.Player('yt-player', {
      videoId: getVid(),
      playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
      events: {
        onReady: function (e) {
          // Restore position
          const off = getOffset();
          if (off > 3) e.target.seekTo(off, true);

          const shouldPlay = _pendingPlay || wasPlaying();
          _pendingPlay = false;

          if (shouldPlay) {
            e.target.playVideo();
            if (_muted) {
              e.target.mute();
            } else {
              e.target.setVolume(0);
              let v = 0;
              const fade = setInterval(() => {
                v = Math.min(100, v + 6);
                e.target.setVolume(v);
                if (v >= 100) clearInterval(fade);
              }, 90);
            }
            // Check if browser blocked autoplay
            setTimeout(() => {
              const st = e.target.getPlayerState();
              if (st !== 1 && st !== 3) _showResumeBtn();
            }, 1000);
          }

          _syncBtn();
        },

        onStateChange: function (e) {
          if (e.data === YT.PlayerState.PLAYING) {
            localStorage.setItem('music-playing', '1');
            _hideResumeBtn();
          }
          if (e.data === YT.PlayerState.PAUSED) {
            localStorage.setItem('music-playing', '0');
          }
          if (e.data === YT.PlayerState.ENDED) {
            e.target.playVideo();
          }
          _syncBtn();
        },

        onError: function () {
          const raw    = JSON.parse(localStorage.getItem('music-tracks') || 'null');
          const tracks = raw
            ? raw.map(t => (typeof t === 'object' ? t.id : t))
            : DEFAULT_TRACKS;
          const cur = getVid();
          const idx = tracks.indexOf(cur);
          const next = tracks[(idx < 0 ? 0 : idx + 1) % tracks.length];
          if (next && next !== cur) _loadTrack(next, true);
        }
      }
    });
  }

  // Handle YT API ready — works whether API loads fresh OR from cache
  function _onYTReady() {
    if (window.YT && window.YT.Player) {
      _initPlayer();
    }
  }

  // If YT API already available (cached page nav), call immediately
  if (window.YT && window.YT.Player) {
    _onYTReady();
  } else {
    // Otherwise wait for callback
    const _prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      _prev && _prev();
      _onYTReady();
    };
  }

  // ── Track management ──────────────────────────────────────────────────────
  function _loadTrack(vid, fromStart) {
    localStorage.setItem('music-vid', vid);
    if (fromStart) localStorage.setItem('music-offset', '0');
    if (_player && typeof _player.loadVideoById === 'function') {
      _player.loadVideoById({ videoId: vid, startSeconds: fromStart ? 0 : getOffset() });
      if (_muted) _player.mute();
    }
  }

  // Sync track change from other tabs / music.html
  window.addEventListener('storage', (e) => {
    if (e.key === 'music-vid' && e.newValue) _loadTrack(e.newValue, true);
  });

  // ── Public API ────────────────────────────────────────────────────────────
  window._musicMute       = function (m) { _muted = m; if (_player) _muted ? _player.mute() : _player.unMute(); };
  window._pauseMusic      = _doPause;
  window._resumeMusic     = _doPlay;
  window._getMusicPlaying = function () { return _player?.getPlayerState?.() === 1; };
  window._getMusicPlayer  = function () { return _player; };
  window._loadMusicTrack  = _loadTrack;

  document.addEventListener('DOMContentLoaded', _syncBtn);
})();
