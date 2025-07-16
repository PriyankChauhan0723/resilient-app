const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execSync, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');

// Prevent multiple app instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

let mainWindow;

// Log file path
const logDir = path.join('C:', 'Users', 'Priyank', 'resilient-app-logs');
const logFile = path.join(logDir, 'task.log');
const fallbackLogFile = path.join(__dirname, 'task-fallback.log');

// Ensure log directory exists
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (err) {
  try {
    fs.appendFileSync(fallbackLogFile, `[${new Date().toISOString()}] Failed to create log directory: ${err.message}\n`, 'utf8');
  } catch (fallbackErr) {
    // Silently fail in production
  }
}

// Function to write to log file with error handling
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
    mainWindow.show();
    mainWindow.setMenu(null);
  });

  mainWindow.on('close', (event) => {
    event.preventDefault();
    restartApp();
  });
}

function setupAutoStart() {
  const appPath = `"${app.getPath('exe')}"`;
  const appName = app.getName();

  if (os.platform() === 'win32') {
    try {
      execSync(`reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v "${appName}" /t REG_SZ /d "${appPath}" /f`, { stdio: 'ignore' });
    } catch (err) {
      try {
        fs.appendFileSync(fallbackLogFile, `[${new Date().toISOString()}] Failed to set auto-start on Windows: ${err.message}\n`, 'utf8');
      } catch (fallbackErr) {
        // Silently fail in production
      }
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
    } catch (err) {
      try {
        fs.appendFileSync(fallbackLogFile, `[${new Date().toISOString()}] Failed to set auto-start on macOS: ${err.message}\n`, 'utf8');
      } catch (fallbackErr) {
        // Silently fail in production
      }
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
    } catch (err) {
      try {
        fs.appendFileSync(fallbackLogFile, `[${new Date().toISOString()}] Failed to set auto-start on Linux: ${err.message}\n`, 'utf8');
      } catch (fallbackErr) {
        // Silently fail in production
      }
    }
  }
}

function restartApp() {
  const appPath = app.getPath('exe');
  const fallbackPath = path.join(__dirname, '..', '..', 'node_modules', 'electron', 'dist', 'electron' + (process.platform === 'win32' ? '.exe' : ''));
  const executablePath = fs.existsSync(appPath) ? appPath : fallbackPath;

  try {
    spawn(executablePath, [path.join(__dirname, '..', '..')], { detached: true, stdio: 'ignore' });
    app.quit();
  } catch (err) {
    try {
      fs.appendFileSync(fallbackLogFile, `[${new Date().toISOString()}] Failed to restart app: ${err.message}\n`, 'utf8');
    } catch (fallbackErr) {
      // Silently fail in production
    }
  }
}

process.on('SIGINT', () => {
  restartApp();
});
process.on('SIGTERM', () => {
  restartApp();
});

app.on('ready', () => {
  createWindow();
  setupAutoStart();
  writeToLog(`[${new Date().toISOString()}] App started.\n`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.commandLine.appendSwitch('disable-dev-shm-usage');

// Handle background task initiation
ipcMain.on('start-background-task', () => {
  try {
    const logMessage = `[${new Date().toISOString()}] Background task started.\n`;
    writeToLog(logMessage);
    mainWindow.webContents.send('task-started');
    try {
      const background = require('../background/background.js');
      background.startPrimeCalculation(() => {
        mainWindow.webContents.send('task-finished');
      });
    } catch (err) {
      writeToLog(`[${new Date().toISOString()}] Error loading background.js: ${err.message}\n`);
    }
  } catch (err) {
    writeToLog(`[${new Date().toISOString()}] Error starting background task: ${err.message}\n`);
  }
});

// Handle task completion (for backward compatibility)
ipcMain.on('task-completed', () => {
  writeToLog(`[${new Date().toISOString()}] Task completed event received.\n`);
  mainWindow.webContents.send('task-finished');
});