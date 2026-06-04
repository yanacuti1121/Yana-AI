// YAMTAM Music Player — shared across all pages
(function () {
  const DEFAULT_VID = 'aKSJAcG4V4o';
  let _player = null;
  let _muted = localStorage.getItem('site-mute') === '1';

  function getVid() { return localStorage.getItem('music-vid') || DEFAULT_VID; }
  function getOffset() { return parseFloat(localStorage.getItem('music-offset') || '0'); }

  // Save exact position before leaving page
  window.addEventListener('beforeunload', () => {
    if (_player && typeof _player.getCurrentTime === 'function') {
      try { localStorage.setItem('music-offset', _player.getCurrentTime()); } catch (e) {}
    }
  });

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
            // Fade in volume 0→100 over 1.5s to mask init stutter
            e.target.setVolume(0);
            let v = 0;
            const fade = setInterval(() => {
              v = Math.min(100, v + 6);
              e.target.setVolume(v);
              if (v >= 100) clearInterval(fade);
            }, 90);
          }
          _syncBtn();
        },
        onStateChange: function (e) {
          if (e.data === YT.PlayerState.ENDED) e.target.playVideo();
        },
        onError: function () {
          // Video unavailable — skip to next track in list
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

  // Change track — called from music.html or storage event
  function _loadTrack(vid, fromStart) {
    localStorage.setItem('music-vid', vid);
    if (fromStart) localStorage.setItem('music-offset', '0');
    if (_player && typeof _player.loadVideoById === 'function') {
      _player.loadVideoById({ videoId: vid, startSeconds: fromStart ? 0 : getOffset() });
      if (_muted) _player.mute();
    }
  }

  // Listen for track change from other tabs / music.html
  window.addEventListener('storage', (e) => {
    if (e.key === 'music-vid' && e.newValue) _loadTrack(e.newValue, true);
  });

  // Global toggleMute — works for all pages
  // io.html calls this too (merged), sfx handled separately via _sfxMute
  window._musicMute = function (muted) {
    _muted = muted;
    if (_player) _muted ? _player.mute() : _player.unMute();
    _syncBtn();
  };

  function _syncBtn() {
    const btn = document.getElementById('mute-btn');
    if (!btn) return;
    btn.textContent = _muted ? '🔇' : '🔊';
    btn.classList && btn.classList.toggle('muted', _muted);
  }

  // Default toggleMute for pages without custom logic
  if (!window._customToggleMute) {
    window.toggleMute = function () {
      _muted = !_muted;
      localStorage.setItem('site-mute', _muted ? '1' : '0');
      window._musicMute(_muted);
    };
  }

  // Pause / resume
  window._pauseMusic = function () {
    if (_player && typeof _player.pauseVideo === 'function') _player.pauseVideo();
  };
  window._resumeMusic = function () {
    if (_player && typeof _player.playVideo === 'function') _player.playVideo();
  };
  window._getMusicPlaying = function () {
    if (!_player || typeof _player.getPlayerState !== 'function') return false;
    return _player.getPlayerState() === 1; // YT.PlayerState.PLAYING
  };

  // Expose player for music.html
  window._getMusicPlayer = function () { return _player; };
  window._loadMusicTrack = _loadTrack;

  document.addEventListener('DOMContentLoaded', _syncBtn);
})();
