// YAMTAM Music Player — shared across all pages
(function () {
  const DEFAULT_VID = 'aKSJAcG4V4o';
  let _player = null;
  let _muted = localStorage.getItem('site-mute') === '1';
  let _resumeBtn = null;
  let _unlockHandlerAdded = false;

  function getVid()    { return localStorage.getItem('music-vid') || DEFAULT_VID; }
  function getOffset() { return parseFloat(localStorage.getItem('music-offset') || '0'); }
  function wasPlaying(){ return localStorage.getItem('music-playing') === '1'; }

  // Save exact position + playing state before leaving page
  window.addEventListener('beforeunload', () => {
    if (_player && typeof _player.getCurrentTime === 'function') {
      try {
        localStorage.setItem('music-offset', _player.getCurrentTime());
        const st = _player.getPlayerState();
        localStorage.setItem('music-playing', st === 1 || st === 3 ? '1' : '0');
      } catch (e) {}
    }
  });

  // ── Resume button (shown when autoplay is blocked) ────────────────────────
  function _showResumeBtn() {
    if (_resumeBtn) return;
    _resumeBtn = document.createElement('button');
    _resumeBtn.id = 'music-resume-btn';
    _resumeBtn.innerHTML = '▶ nhạc';
    Object.assign(_resumeBtn.style, {
      position: 'fixed', bottom: '72px', right: '18px', zIndex: '9999',
      background: 'hsla(155 52% 28% / .92)', color: '#fff',
      border: 'none', borderRadius: '20px', padding: '7px 14px',
      fontSize: '13px', fontWeight: '600', cursor: 'pointer',
      boxShadow: '0 2px 12px rgba(0,0,0,.25)', backdropFilter: 'blur(6px)',
      transition: 'opacity .2s', letterSpacing: '.02em',
    });
    _resumeBtn.addEventListener('click', () => {
      if (_player && typeof _player.playVideo === 'function') {
        _player.playVideo();
        if (!_muted) _player.unMute();
      }
      _hideResumeBtn();
    });
    document.body.appendChild(_resumeBtn);
  }

  function _hideResumeBtn() {
    if (!_resumeBtn) return;
    _resumeBtn.style.opacity = '0';
    setTimeout(() => { _resumeBtn && _resumeBtn.remove(); _resumeBtn = null; }, 220);
  }

  // After a user interaction on page, try to autoplay silently
  function _addUnlockListener() {
    if (_unlockHandlerAdded) return;
    _unlockHandlerAdded = true;
    const events = ['click', 'touchstart', 'keydown'];
    function unlock() {
      if (_player && typeof _player.getPlayerState === 'function') {
        const st = _player.getPlayerState();
        if (st !== 1 && st !== 3) { // not playing or buffering
          _player.playVideo();
          if (!_muted) _player.unMute();
          _hideResumeBtn();
        }
      }
      events.forEach(ev => document.removeEventListener(ev, unlock));
    }
    events.forEach(ev => document.addEventListener(ev, unlock, { passive: true }));
  }

  // YouTube IFrame API callback
  window.onYouTubeIframeAPIReady = function () {
    _player = new YT.Player('yt-player', {
      videoId: getVid(),
      playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
      events: {
        onReady: function (e) {
          const off = getOffset();
          if (off > 3) e.target.seekTo(off, true);
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
          _syncBtn();

          // Check if autoplay was actually allowed after 900ms
          // (browsers block silently — player stays at UNSTARTED=-1 or CUED=5)
          setTimeout(() => {
            const st = e.target.getPlayerState();
            if (st !== 1 && st !== 3) { // not playing/buffering
              if (wasPlaying()) {
                // Was playing before nav — show resume button
                _showResumeBtn();
                // Also try to unlock on first interaction
                _addUnlockListener();
              }
            } else {
              localStorage.setItem('music-playing', '1');
            }
          }, 900);
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
          const tracks = JSON.parse(localStorage.getItem('music-tracks') || 'null') || DEFAULT_TRACKS;
          const cur = getVid();
          const idx = tracks.findIndex(t => t.id === cur);
          const next = tracks[(idx + 1) % tracks.length];
          if (next && next.id !== cur) _loadTrack(next.id, true);
        }
      }
    });
  };

  const DEFAULT_TRACKS = [
    'aKSJAcG4V4o','KeoAfgsM8o4','def8pw8Z0DE','oy2CxxQCuhw',
    'w1wdiibZTl8','JCn0hoILmyw','fuXfT4Rv_WM',
  ];

  function _loadTrack(vid, fromStart) {
    localStorage.setItem('music-vid', vid);
    if (fromStart) localStorage.setItem('music-offset', '0');
    if (_player && typeof _player.loadVideoById === 'function') {
      _player.loadVideoById({ videoId: vid, startSeconds: fromStart ? 0 : getOffset() });
      if (_muted) _player.mute();
    }
  }

  window.addEventListener('storage', (e) => {
    if (e.key === 'music-vid' && e.newValue) _loadTrack(e.newValue, true);
  });

  window._musicMute = function (muted) {
    _muted = muted;
    if (_player) _muted ? _player.mute() : _player.unMute();
  };

  // Sync play/pause button icon — only on pages without a custom player UI
  // (music.html and io.html manage their own button icons)
  function _syncBtn() {
    if (window._customToggleMute) return; // hands-off on custom pages
    const btn = document.getElementById('mute-btn');
    if (!btn) return;
    const playing = _player && typeof _player.getPlayerState === 'function'
      && _player.getPlayerState() === 1;
    btn.textContent = playing ? '⏸' : '▶';
    btn.title = playing ? 'Dừng nhạc' : 'Phát nhạc';
  }

  // On regular pages: toggleMute = play/pause
  // On custom pages (music.html, io.html): their own toggleMute is used
  if (!window._customToggleMute) {
    window.toggleMute = function () {
      if (!_player || typeof _player.getPlayerState !== 'function') return;
      const st = _player.getPlayerState();
      if (st === 1 || st === 3) { // playing or buffering → pause
        _player.pauseVideo();
        localStorage.setItem('music-playing', '0');
      } else {                    // paused/stopped → play
        _player.playVideo();
        localStorage.setItem('music-playing', '1');
        _hideResumeBtn();
      }
      setTimeout(_syncBtn, 100);
    };
  }

  // Mute toggle — called by music.html / io.html directly
  window.toggleMuteOnly = function () {
    const muted = localStorage.getItem('site-mute') !== '1';
    localStorage.setItem('site-mute', muted ? '1' : '0');
    _muted = muted;
    if (_player) _muted ? _player.mute() : _player.unMute();
  };

  window._pauseMusic  = function () { if (_player?.pauseVideo) _player.pauseVideo(); };
  window._resumeMusic = function () { if (_player?.playVideo)  _player.playVideo(); };
  window._getMusicPlaying = function () {
    return _player?.getPlayerState?.() === 1;
  };
  window._getMusicPlayer  = function () { return _player; };
  window._loadMusicTrack  = _loadTrack;

  document.addEventListener('DOMContentLoaded', _syncBtn);
})();
