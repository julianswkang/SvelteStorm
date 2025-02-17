const { app, BrowserWindow, dialog, ipcMain, nativeTheme, webContents } = require('electron');
const createApplicationMenu = require('./application-menu');
const path = require('path');
const fs = require('fs')
const os = require('os');
const pty = require('node-pty');

//dialog is basically an electron modal pop up displaying an error message 
//ipcMain is an event emitter that handles messages from the a renderer process
//pty returns a terminal object which allows reading and writing (used with xterm)
require('@electron/remote/main').initialize();
require('@electron/remote/main').enable(webContents);

let userFile = ''

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  // eslint-disable-line global-require
  app.quit();
}

const windows = new Set();
const openFiles = new Map();

//app.on is a start of the main process that controls the lifecycle events 
app.on('ready', () => {
  
  createApplicationMenu();
  createWindow();
});

//testing to see if on mac, don't close all the windows
app.on('window-all-closed', () => {
  if (process.platform === 'darwin') {
    return false;
  }
});

//activate occurs when the application is activated or run for the first time
//returns an event 

app.on('activate', (event, hasVisibleWindows) => {
  if (!hasVisibleWindows) { createWindow(); }
});

const increaseFontSize = exports.increaseFontSize = () => {
  fontSize++;
}  

const decreaseFontSize = exports.decreaseFontSize = () => {
  fontSize--;
} 

//still in development mode 

const createWindow = exports.createWindow = () => {
  
  process.env.NODE_ENV = 'development';

let x, y;
//getFocusedWindow returns the browser window or null
  const currentWindow = BrowserWindow.getFocusedWindow();

  if (currentWindow) {
    const [currentWindowX, currentWindowY] = currentWindow.getPosition();
    x = currentWindowX + 10;
    y = currentWindowY + 10;
  }

  
  // But if you want to keep the abilities of using Node.js and Electron APIs, 
  // you have to rename the symbols in the page before including other libraries:
  //window.nodeRequire = require; in html file 

  let newWindow = new BrowserWindow({ x, y, show: false, webPreferences: {

    nodeIntegration: true,
    contextIsolation: false,
  }});

  //theme for the menu bar on top
  nativeTheme.themeSource = 'dark'


  newWindow.loadURL(`file://${path.join(__dirname, '../public/index.html')}`);

  newWindow.once('ready-to-show', () => {
    newWindow.show();
  });

  newWindow.on('focus', createApplicationMenu);

  //save changes dialog modal message

  newWindow.on('close', (event) => {
    if (newWindow.isDocumentEdited()) {
      event.preventDefault();

      const result = dialog.showMessageBox(newWindow, {
        type: 'warning',
        title: 'Quit with Unsaved Changes?',
        message: 'Your changes will be lost permanently if you do not save.',
        buttons: [
          'Quit Anyway',
          'Cancel',
        ],
        cancelId: 1,
        defaultId: 0
      });

      if (result === 0) newWindow.destroy();
    }
  });

  //chokidar is a library that watches the files
  let watcher;
  if (process.env.NODE_ENV === 'development') {
    watcher = require('chokidar').watch(path.join(__dirname, '../public'), { ignoreInitial: true });
    watcher.on('change', () => {
      newWindow.reload();
    });
  }

  newWindow.on('closed', () => {
    if (watcher) {
      watcher.close();
     }
    windows.delete(newWindow);
    createApplicationMenu();
    newWindow = null;
  });

  var shell = os.platform() === "win32" ? "powershell.exe" : "bash";
  var ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-color',
          cols: 80,
          rows: 24,
          cwd: process.env.HOME,
          env: process.env
      });
    
    ptyProcess.onData((data) => {
      newWindow.webContents.send("terminal-incData", data);
    });

    ipcMain.on("terminal-into", (event, data)=> {
      ptyProcess.write(data);
    })

require('electron-reload')(__dirname, {
  electron: path.join(__dirname, '../node_modules', '.bin', 'electron'),
  awaitWriteFinish: true
});

  windows.add(newWindow);
  return newWindow;
};


const getFileFromUser = exports.getFileFromUser = async (targetWindow) => {
  const files = await dialog.showOpenDialog(targetWindow, {
    properties: ['openFile'],
  });

  userFile = files

  if(files) {
    if (files) { openFile(targetWindow, files.filePaths[0]); }
  }
}

const openFile = exports.openFile = (targetWindow, file) => {
  
  const content = fs.readFileSync(file).toString();
  app.addRecentDocument(file);
  targetWindow.webContents.send('file-opened', file, content);
  createApplicationMenu();
};

const getFolderFromUser = exports.getFolderFromUser = async (targetWindow) => {
  const files = await dialog.showOpenDialog(targetWindow, {
    properties: ['openDirectory'],
  });

  if(files) {
    console.log(files.filePaths)
    if (files) { openFolder(targetWindow, files.filePaths); }
  }
}

const createProjectFromUser = exports.createProjectFromUser = async (targetWindow) => {
  console.log('running createProject method')
  const folderName = await dialog.showSaveDialog(targetWindow, {
    title: 'Create Project',
    properties: ['createDirectory'],
  });


  if(folderName.filePath && !fs.existsSync(folderName.filePath)){
    await fs.mkdirSync(folderName.filePath);

    openFolder(targetWindow, folderName.filePath);

  }
}

const openFolder = exports.openFolder = (targetWindow, folder) => {
  const content = folder
  console.log('contents',content)
  targetWindow.webContents.send('folder-opened', folder, content);
  createApplicationMenu();
};

const saveFile = exports.saveFile = (targetWindow) => {


  ipcMain.on('synchronous-message', (event, arg) => {
    if(arg.file === undefined) { 
      fs.writeFileSync(userFile.filePaths[0], arg.content)
      openFile(targetWindow, userFile.filePaths[0]);
    } else {
      fs.writeFileSync(arg.file, arg.content)
      openFile(targetWindow, arg.file);
    }
    
  })

 };

ipcMain.handle('saveFileFromUser', saveFile)

ipcMain.handle('getFileFromUser', getFileFromUser)

ipcMain.handle('getFolderFromUser', getFolderFromUser)

ipcMain.handle('increaseFontSize', increaseFontSize)

ipcMain.handle('decreaseFontSize', decreaseFontSize)

ipcMain.handle('createProjectFromUser', createProjectFromUser)