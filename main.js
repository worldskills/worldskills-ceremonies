const { app, BrowserWindow } = require('electron')

if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  const win = new BrowserWindow({
    autoHideMenuBar: true,
    width: 800,
    height: 600,
  })
  win.loadFile('control.html')
}

app.whenReady().then(() => {
  createWindow()
})
