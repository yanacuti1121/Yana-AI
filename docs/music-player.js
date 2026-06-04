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
          if (off > 5) e.target.seekTo(off, true);
          if (_muted) e.target.mute();
          e.target.playVideo();
          _syncBtn();
        },
        onStateChange: function (e) {
          // Auto-replay if ended
          if (e.data === YT.PlayerState.ENDED) e.target.playVideo();
        }
      }
    });
  };

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
