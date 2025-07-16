const fs = require('fs');
const path = require('path');

const logDir = path.join('C:', 'Users', 'Priyank', 'resilient-app-logs');
const logFile = path.join(logDir, 'task.log');
const fallbackLogFile = path.join(__dirname, 'task-fallback.log');

function writeToLog(message) {
  try {
    fs.appendFileSync(logFile, message, 'utf8');
  } catch (err) {
    try {
      fs.appendFileSync(fallbackLogFile, message, 'utf8');
    } catch (fallbackErr) {
      // Silently fail in production
    }
  }
}

function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i <= Math.sqrt(n); i++) {
    if (n % i === 0) return false;
  }
  return true;
}

function findLargePrime(callback) {
  let num = 1000000000;
  const targetDuration = 3045 * 1000; // Minimum duration in milliseconds
  const startTime = Date.now();
  let primeFound = false;

  function checkPrime() {
    if (isPrime(num)) {
      primeFound = true;
    }
    if (primeFound && Date.now() - startTime >= targetDuration) {
      const logMessage = `[${new Date().toISOString()}] Prime calculation completed. Found prime: ${num} after ~${(Date.now() - startTime) / 1000} seconds.\n`;
      writeToLog(logMessage);
      callback();
    } else {
      num += 2;
      setImmediate(checkPrime); // Use setImmediate to avoid blocking the event loop
    }
  }

  checkPrime();
}

function startPrimeCalculation(callback) {
  const logMessage = `[${new Date().toISOString()}] Background task started.\n`;
  writeToLog(logMessage);
  findLargePrime(callback);
}

module.exports = { startPrimeCalculation };