const {app, BrowserWindow, ipcMain, Menu} = require('electron')
const path = require('path')
const url = require('url')
const request = require('request')
const cheerio = require('cheerio')
const Datastore = require('nedb')

const SEND_SEARCH_RESULT = 'send-search-result'
const RECEIVE_SEARCH_RESULT = 'receive-search-result'
const SEND_CATEGORY_LIST = 'send-category-list'
const RECEIVE_CATEGORY_LIST = 'receive-category-list'
const SAVE_CONFIG = 'save-config'
const RECEIVE_SAVE_CONFIG_RESULT = 'receive-save-config-result'
const SEND_CONFIG = 'send-config'
const RECEIVE_CONFIG = 'receive-config'
const ERROR = 'error'


// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

const db = new Datastore({ filename: path.join(app.getPath('userData'), 'app.db'), autoload: true })

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({width: 1280, height: 900})

  // Create the Application's main menu
  let template = [{
      label: "Application",
      submenu: [
          { label: "Quit", accelerator: "Command+Q", click: function() { app.quit(); }}
      ]}, {
      label: "Edit",
      submenu: [
          { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
          { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
          { type: "separator" },
          { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
          { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
          { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
          { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
      ]}
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // and load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Open the DevTools.
//  win.webContents.openDevTools()

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  loadConfig(() => {
    createWindow()
  })
})

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

function req (url, onSuccess, onError) {
  let option = {
    method: 'GET',
    url: url
  }

//  console.info("request: " + option.url)
  request(option, (err, res, body) => {
    if (err || res.statusCode !== 200) onError(err)
    else onSuccess(res, cheerio.load(body, {xmlMode:true}))
  })
}

function loadConfig (callback) {
  db.findOne({}, (err, doc) => {
    global.appId = doc ? doc.appId : null;
    callback()
  })
}

ipcMain.on(SEND_CATEGORY_LIST, (event) => {
  req(`https://auctions.yahooapis.jp/AuctionWebService/V2/categoryTree?appid=${global.appId}`,
    (res, $) => {
      let categories = $('ResultSet > Result > ChildCategory').map((_index, item) => {
        return {
          categoryId:   $(item).children('CategoryId').text(),
          categoryName: $(item).children('CategoryName').text(),
          order:        $(item).children('Order').text()
        }
      })
      .get()

      event.sender.send(RECEIVE_CATEGORY_LIST, JSON.stringify(categories))
    },
    (err) => event.sender.send(ERROR)
  )
})

ipcMain.on(SEND_SEARCH_RESULT, (event, payload) => {
  let query = payload.keyword
  let categoryId = parseInt(payload.categoryId)
  let sort = payload.sort
  let itemStatus = payload.itemStatus
  let page = payload.page

  if (!query) return event.sender.send(ERROR, 'キーワードを入力してください')

  let params = { query: query }
  if (categoryId) {
    params['category'] = categoryId
  }
  if (sort) {
    params['sort'] = sort
  }
  if (itemStatus) {
    params['item_status'] = itemStatus
  }
  if (page) {
    params['page'] = page
  }
  let query_string = Object.keys(params).map((v) => {
     return v + '=' + encodeURIComponent(params[v])
  }).join('&')

  req(`https://auctions.yahooapis.jp/AuctionWebService/V2/search?appid=${global.appId}&${query_string}`,
    (res, $) => {
      let totalResultsAvailable = $('ResultSet').attr('totalResultsAvailable')
      let totalResultsReturned = $('ResultSet').attr('totalResultsReturned')
      let firstResultPosition = $('ResultSet').attr('firstResultPosition')

      let results = $('ResultSet > Result > Item').map((_index, item) => {
        return {
          auctionId:      $(item).children('AuctionID').text(),
          title:          $(item).children('Title').text(),
          itemUrl:        $(item).children('ItemUrl').text(),
          auctionItemUrl: $(item).children('AuctionItemUrl').text(),
          image:          $(item).children('Image').text(),
          imageWidth:     $(item).children('Image').attr('width'),
          imageHeight:    $(item).children('Image').attr('height'),
          currentPrice:   $(item).children('CurrentPrice').text(),
          bids:           $(item).children('Bids').text(),
          endTime:        $(item).children('EndTime').text(),
          bidOrBuy:       $(item).children('BidOrBuy').text()
        }
      })
      .get()

      let payload = {
        'totalResultsAvailable': totalResultsAvailable,
        'totalResultsReturned': totalResultsReturned,
        'firstResultPosition': firstResultPosition,
        'results': results
      }

      event.sender.send(RECEIVE_SEARCH_RESULT, JSON.stringify(payload))
    },
    (err) => event.sender.send(ERROR)
  )
})

ipcMain.on(SAVE_CONFIG, (event, payload) => {
  db.update({}, { $set: { appId: payload.appId }}, { upsert: true }, (err, numReplaced) => {
    loadConfig(() => {
      event.sender.send(RECEIVE_SAVE_CONFIG_RESULT, { err: err, numReplaced: numReplaced })
    })
  })
})

ipcMain.on(SEND_CONFIG, (event, payload) => {
  db.findOne({}, (err, doc) => {
    event.sender.send(RECEIVE_CONFIG, doc)
  })
})
