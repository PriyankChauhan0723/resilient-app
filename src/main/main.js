const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execSync, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const { Worker } = require('worker_threads');
const schedule = require('node-schedule');

// Prevent multiple app instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  writeToLog(`[${new Date().toISOString()}] Second instance detected, quitting.\n`);
  app.quit();
  return;
}

let mainWindow;
let isRestartScheduled = false;
let allowExit = false; 

// Log file path
const logDir = 'D:\\Priyank\\resilient-app\\resilient-app\\resilient-app-logs';
const logFile = path.join(logDir, 'task.log');
const fallbackLogFile = path.join(logDir, 'task-fallback.log');

try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  if (fs.existsSync(path.join(logDir, 'exit.flag'))) {
    fs.unlinkSync(path.join(logDir, 'exit.flag'));
    writeToLog(`[${new Date().toISOString()}] Cleared exit flag on startup.\n`);
  }
} catch (err) {
  try {
    fs.appendFileSync(fallbackLogFile, `[${new Date().toISOString()}] Failed to create log directory or clear exit flag: ${err.message}\n`, 'utf8');
  } catch (fallbackErr) {}
}

function writeToLog(message) {
  try {
    fs.appendFileSync(logFile, message, 'utf8');
  } catch (err) {
    try {
      fs.appendFileSync(fallbackLogFile, message, 'utf8');
    } catch (fallbackErr) {}
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
    frame: true,
    title: 'ResilientApp',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    writeToLog(`[${new Date().toISOString()}] Window ready to show.\n`);
    mainWindow.show();
    mainWindow.setMenu(null);
  });

  mainWindow.on('close', (event) => {
    if (allowExit) {
      writeToLog(`[${new Date().toISOString()}] Window close allowed, exiting app.\n`);
      return;
    }
    if (!isRestartScheduled) {
      event.preventDefault();
      scheduleAppRestart('window close');
    } else {
      writeToLog(`[${new Date().toISOString()}] Close event ignored, restart already scheduled.\n`);
    }
  });
}

function disableAutoStart() {
  try {
    fs.writeFileSync(path.join(logDir, 'exit.flag'), '');
    writeToLog(`[${new Date().toISOString()}] Exit flag created.\n`);
  } catch (err) {
    writeToLog(`[${new Date().toISOString()}] Failed to create exit flag: ${err.message}\n`);
  }
  const appName = app.getName();

  if (os.platform() === 'win32') {
    try {
      execSync(`reg delete HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v "${appName}" /f`, { stdio: 'ignore' });
      writeToLog(`[${new Date().toISOString()}] Auto-start disabled on Windows.\n`);
    } catch (err) {
      writeToLog(`[${new Date().toISOString()}] Failed to disable auto-start on Windows: ${err.message}\n`);
    }
  } else if (os.platform() === 'darwin') {
    const plistPath = path.join(os.homedir(), `Library/LaunchAgents/com.${appName}.autostart.plist`);
    try {
      execSync(`launchctl unload ${plistPath}`);
      fs.unlinkSync(plistPath);
      writeToLog(`[${new Date().toISOString()}] Auto-start disabled on macOS.\n`);
    } catch (err) {
      writeToLog(`[${new Date().toISOString()}] Failed to disable auto-start on macOS: ${err.message}\n`);
    }
  } else if (os.platform() === 'linux') {
    const servicePath = path.join('/etc/systemd/system/', `${appName}.service`);
    try {
      execSync(`systemctl disable ${appName}.service`);
      fs.unlinkSync(servicePath);
      writeToLog(`[${new Date().toISOString()}] Auto-start disabled on Linux.\n`);
    } catch (err) {
      writeToLog(`[${new Date().toISOString()}] Failed to disable auto-start on Linux: ${err.message}\n`);
    }
  }
}

function setupAutoStart() {
  const appPath = `"${app.getPath('exe')}"`;
  const appName = app.getName();
  const monitorScriptPath = `"${path.join(__dirname, '..', '..', 'restart-monitor.js')}"`;

  if (os.platform() === 'win32') {
    try {
      execSync(`reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v "${appName}" /t REG_SZ /d "node ${monitorScriptPath}" /f`, { stdio: 'ignore' });
      writeToLog(`[${new Date().toISOString()}] Auto-start set to use restart-monitor.js on Windows.\n`);
    } catch (err) {
      writeToLog(`[${new Date().toISOString()}] Failed to set auto-start on Windows: ${err.message}\n`);
    }
  } else if (os.platform() === 'darwin') {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
                    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
                    <plist version="1.0">
                    <dict>
                      <key>Label</key>
                      <string>com.${appName}.autostart</string>
                      <key>ProgramArguments</key>
                      <array>
                        <string>${appPath}</string>
                      </array>
                      <key>RunAtLoad</key>
                      <true/>
                      <key>KeepAlive</key>
                      <true/>
                    </dict>
                    </plist>`;
    const plistPath = path.join(os.homedir(), `Library/LaunchAgents/com.${appName}.autostart.plist`);
    try {
      fs.writeFileSync(plistPath, plist);
      execSync(`launchctl load ${plistPath}`);
      writeToLog(`[${new Date().toISOString()}] Auto-start set on macOS.\n`);
    } catch (err) {
      writeToLog(`[${new Date().toISOString()}] Failed to set auto-start on macOS: ${err.message}\n`);
    }
  } else if (os.platform() === 'linux') {
    const service = `[Unit]
                      Description=${appName} Auto Restart
                      After=network.target
                      [Service]
                      ExecStart=${appPath}
                      Restart=always
                      RestartSec=3
                      [Install]
                      WantedBy=multi-user.target`;
    const servicePath = path.join('/etc/systemd/system/', `${appName}.service`);
    try {
      fs.writeFileSync(servicePath, service);
      execSync(`systemctl enable ${appName}.service`);
      execSync(`systemctl start ${appName}.service`);
      writeToLog(`[${new Date().toISOString()}] Auto-start set on Linux.\n`);
    } catch (err) {
      writeToLog(`[${new Date().toISOString()}] Failed to set auto-start on Linux: ${err.message}\n`);
    }
  }
}

function scheduleAppRestart(trigger) {
  if (isRestartScheduled) {
    writeToLog(`[${new Date().toISOString()}] Restart already scheduled, ignoring trigger: ${trigger}.\n`);
    return;
  }

  isRestartScheduled = true;
  const logMessage = `[${new Date().toISOString()}] Scheduling app restart due to ${trigger}.\n`;
  writeToLog(logMessage);

  // 1-second delay
  schedule.scheduleJob(new Date(Date.now() + 1000), () => {
    const appPath = app.getPath('exe');
    const fallbackPath = path.join(__dirname, '..', '..', 'node_modules', 'electron', 'dist', 'electron' + (process.platform === 'win32' ? '.exe' : ''));
    const executablePath = fs.existsSync(appPath) ? appPath : fallbackPath;

    try {
      spawn(executablePath, [path.join(__dirname, '..', '..')], { detached: true, stdio: 'ignore' });
      writeToLog(`[${new Date().toISOString()}] App restarted successfully.\n`);
      app.quit();
    } catch (err) {
      writeToLog(`[${new Date().toISOString()}] Failed to restart app: ${err.message}\n`);
      isRestartScheduled = false; // Allow retry on failure
    }
  });
}

process.on('SIGINT', () => {
  writeToLog(`[${new Date().toISOString()}] SIGINT received, scheduling restart.\n`);
  if (!allowExit) {
    scheduleAppRestart('SIGINT');
  } else {
    writeToLog(`[${new Date().toISOString()}] SIGINT received, exiting app.\n`);
    app.quit();
  }
});

process.on('SIGTERM', () => {
  writeToLog(`[${new Date().toISOString()}] SIGTERM received from Task Manager or system, scheduling restart.\n`);
  if (!allowExit) {
    scheduleAppRestart('SIGTERM');
  } else {
    writeToLog(`[${new Date().toISOString()}] SIGTERM received, exiting app.\n`);
    app.quit();
  }
});

app.on('ready', () => {
  createWindow();
  setupAutoStart();
  writeToLog(`[${new Date().toISOString()}] App started.\n`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    writeToLog(`[${new Date().toISOString()}] All windows closed, quitting app.\n`);
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    writeToLog(`[${new Date().toISOString()}] App activated, creating window.\n`);
    createWindow();
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    writeToLog(`[${new Date().toISOString()}] Second instance detected, focusing existing window.\n`);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.commandLine.appendSwitch('disable-dev-shm-usage');

// Handle background task initiation
ipcMain.on('start-background-task', () => {
  try {
    const logMessage = `[${new Date().toISOString()}] Background task initiated in main process.\n`;
    writeToLog(logMessage);
    mainWindow.webContents.send('task-started');

    const worker = new Worker(path.join(__dirname, '..', 'background', 'worker.js'));

    worker.on('message', (msg) => {
      if (msg.type === 'log') {
        writeToLog(msg.message);
      } else if (msg.type === 'task-finished') {
        mainWindow.webContents.send('task-finished');
        worker.terminate();
      }
    });

    worker.on('error', (err) => {
      writeToLog(`[${new Date().toISOString()}] Worker error: ${err.message}\n`);
    });

    worker.on('exit', (code) => {
      writeToLog(`[${new Date().toISOString()}] Worker exited with code: ${code}\n`);
    });

    worker.postMessage('start');
  } catch (err) {
    writeToLog(`[${new Date().toISOString()}] Error starting background task: ${err.message}\n`);
  }
});

// Handle task completion 
ipcMain.on('task-completed', () => {
  writeToLog(`[${new Date().toISOString()}] Task completed event received.\n`);
  mainWindow.webContents.send('task-finished');
});

// Handle exit request
ipcMain.on('exit-app', () => {
  writeToLog(`[${new Date().toISOString()}] Exit app requested via IPC.\n`);
  allowExit = true;
  disableAutoStart();
  mainWindow.close();
  app.quit();
});