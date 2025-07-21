const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logDir = 'D:\\Priyank\\resilient-app\\resilient-app-logs';
const logFile = path.join(logDir, 'task.log');
const exitFlagFile = path.join(logDir, 'exit.flag');

function writeToLog(message) {
  try { fs.appendFileSync(logFile, message, 'utf8'); } catch (_){}
}

function shouldExit() {
  return fs.existsSync(exitFlagFile);
}

function startApp() {
  if (shouldExit()) {
    writeToLog(`[${new Date().toISOString()}] Exit flag detected, monitor stopping.\n`);
    process.exit(0);
  }

  const electronPath = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
  const appDir = path.join(__dirname);

  let appProc = spawn(electronPath, [appDir], { detached: true, stdio: 'ignore' });
  writeToLog(`[${new Date().toISOString()}] Started Electron with PID: ${appProc.pid}\n`);

  appProc.on('exit', (code) => {
    writeToLog(`[${new Date().toISOString()}] Electron exited with code: ${code}. Restarting...\n`);
    setTimeout(startApp, 1000);
  });

  appProc.on('error', err => {
    writeToLog(`[${new Date().toISOString()}] Monitor error: ${err.message}. Retrying...\n`);
    setTimeout(startApp, 1000);
  });
}

startApp();
