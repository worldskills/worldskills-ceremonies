const { app, BrowserWindow } = require('electron')

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 600,
  })
  win.loadFile('control.html')
}

app.whenReady().then(() => {
  createWindow()
})
