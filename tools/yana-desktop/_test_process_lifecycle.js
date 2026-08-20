'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const { terminateChild } = require('./process-lifecycle');

class FakeChild extends EventEmitter {
  constructor({ exitOnSignal = null } = {}) {
    super();
    this.exitCode = null;
    this.signalCode = null;
    this.exitOnSignal = exitOnSignal;
    this.signals = [];
  }

  kill(signal) {
    this.signals.push(signal);
    if (signal === this.exitOnSignal) {
      this.signalCode = signal;
      this.emit('exit', null, signal);
    }
    return true;
  }
}

(async () => {
  const graceful = new FakeChild({ exitOnSignal: 'SIGTERM' });
  await terminateChild(graceful, { timeoutMs: 10 });
  assert.deepStrictEqual(graceful.signals, ['SIGTERM']);

  const stubborn = new FakeChild({ exitOnSignal: 'SIGKILL' });
  let forcedCallback;
  const forcedTermination = terminateChild(stubborn, {
    setTimer: (callback) => {
      if (!forcedCallback) forcedCallback = callback;
      return 1;
    },
    clearTimer: () => {},
  });
  forcedCallback();
  await forcedTermination;
  assert.deepStrictEqual(stubborn.signals, ['SIGTERM', 'SIGKILL']);

  const exited = new FakeChild();
  exited.exitCode = 0;
  await terminateChild(exited);
  assert.deepStrictEqual(exited.signals, []);

  console.log('Desktop process lifecycle tests passed: 3');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
