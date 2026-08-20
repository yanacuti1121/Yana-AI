'use strict';

function terminateChild(child, {
  gracefulSignal = 'SIGTERM',
  forceSignal = 'SIGKILL',
  timeoutMs = 3000,
  forceTimeoutMs = 1000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimer(timer);
      child.removeListener?.('exit', finish);
      child.removeListener?.('error', finish);
      resolve();
    };

    child.once('exit', finish);
    child.once('error', finish);
    timer = setTimer(() => {
      if (child.exitCode !== null || child.signalCode !== null) return finish();
      try {
        if (!child.kill(forceSignal)) return finish();
      } catch {
        return finish();
      }
      if (settled) return;
      timer = setTimer(finish, forceTimeoutMs);
    }, timeoutMs);

    try {
      if (!child.kill(gracefulSignal)) finish();
    } catch {
      finish();
    }
  });
}

module.exports = { terminateChild };
