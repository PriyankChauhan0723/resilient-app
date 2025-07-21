# ResilientApp

An Electron-based application that restarts on close, runs a background task, and maintains UI responsiveness across Windows, macOS, and Linux.

## How to Run the App

### Prerequisites
- Node.js (v18 or later) and npm installed.

### Installation
1. Clone the repository or download the source code:
   ```bash
   git clone https://github.com/PriyankChauhan0723/resilient-app.git
   cd resilient-app
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running on Each OS
- **Windows**:
  - Run the app in development mode:
    ```bash
    npm start
    ```
  - Build and install for production:
    ```bash
    npm run build
    ```
    - Install the generated `.exe` file from the `dist` folder.
- **macOS**:
  - Run in development mode:
    ```bash
    npm start
    ```
  - Build and install for production:
    ```bash
    npm run build
    ```
    - Install the generated `.dmg` file from the `dist` folder and drag the app to the Applications folder.
- **Linux**:
  - Run in development mode:
    ```bash
    npm start
    ```
  - Build and install for production:
    ```bash
    npm run build
    ```
    - Run the generated `.AppImage` file from the `dist` folder (may require executable permissions: `chmod +x ResilientApp.AppImage`).

After installation or running `npm start`, the app will launch automatically on system boot (configured during the first run) and display a window with a clock, a "Start Background Task" button, a progress bar, and a success message.

## Self-Restart Mechanism per OS

The app is designed to restart itself when closed or terminated, with OS-specific implementations:

- **Windows**:
  - Achieved by adding an entry to the `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` registry key during the first run. This ensures the app relaunches on user logon.
  - When the window is closed, the app spawns a new instance using `child_process.spawn` with the executable path and quits the current process, triggering the restart.
- **macOS**:
  - Implemented using a Launch Agent plist file (`~/Library/LaunchAgents/com.resilient-app.autostart.plist`) created on the first run, with `RunAtLoad` and `KeepAlive` set to `true`. This keeps the app running and relaunches it on login or crash.
  - The `close` event spawns a new instance and quits, leveraging the Launch Agent to restart.
- **Linux**:
  - Utilizes a Systemd service file (`/etc/systemd/system/resilient-app.service`) created on the first run, with `Restart=always` and `WantedBy=multi-user.target`. This ensures the app restarts on system boot or failure.
  - The `close` event triggers a new spawn and quit, with Systemd handling the restart.

In all cases, the `restartApp` function uses `child_process.spawn` with a fallback executable path to ensure reliability across development and production environments.

## Additional Notes
- Logs are written to `~/resilient-app-logs/task.log` for monitoring task start and completion.
- Build output is stored in the `dist` directory.
