const { parentPort } = require('worker_threads');

function writeToLog(message) {
  parentPort.postMessage({ type: 'log', message });
}

function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i <= Math.sqrt(n); i++) {
    if (n % i === 0) return false;
  }
  return true;
}

function findLargePrime() {
  let num = 1000000000;
  const targetDuration = 3045 * 1000;
  const startTime = Date.now();
  let primeFound = false;

  function checkPrime() {
    if (isPrime(num)) {
      primeFound = true;
    }
    if (primeFound && Date.now() - startTime >= targetDuration) {
      const logMessage = `[${new Date().toISOString()}] Prime calculation completed. Found prime: ${num} after ~${(Date.now() - startTime) / 1000} seconds.\n`;
      writeToLog(logMessage);
      parentPort.postMessage({ type: 'task-finished' });
    } else {
      num += 2;
      setImmediate(checkPrime);
    }
  }

  checkPrime();
}

parentPort.on('message', (event) => {
  if (event === 'start') {
    const logMessage = `[${new Date().toISOString()}] Background task started in worker.\n`;
    writeToLog(logMessage);
    findLargePrime();
  }
});