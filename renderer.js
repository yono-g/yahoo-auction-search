const {ipcRenderer, shell} = require('electron')

const SEND_SEARCH_RESULT = 'send-search-result'
const RECEIVE_SEARCH_RESULT = 'receive-search-result'
const SEND_CATEGORY_LIST = 'send-category-list'
const RECEIVE_CATEGORY_LIST = 'receive-category-list'
const SAVE_CONFIG = 'save-config'
const RECEIVE_SAVE_CONFIG_RESULT = 'receive-save-config-result'
const SEND_CONFIG = 'send-config'
const RECEIVE_CONFIG = 'receive-config'
const ERROR = 'error'

function delegateEvents () {
  let searchButtonEl = document.querySelector('#doSearch')
  if (searchButtonEl) {
    searchButtonEl.onclick = doSearch
    searchButtonEl.disabled = false
  }

  let toastButtonEl = document.querySelector('.toast > button')
  if (toastButtonEl) {
    toastButtonEl.onclick = function (event) {
      event.target.parentNode.style.display = 'none'
    }
  }

  let configButtonEl = document.querySelector('#openConfig')
  if (configButtonEl) {
    configButtonEl.onclick = openConfig
  }

  let modalClearButtonEl = document.querySelector('.modal .btn-clear');
  if (modalClearButtonEl) {
    modalClearButtonEl.onclick = closeConfig
  }

  let saveConfigButtonEl = document.querySelector('#saveConfig')
  if (saveConfigButtonEl) {
    saveConfigButtonEl.onclick = saveConfig
  }

  document.querySelectorAll('a').forEach(el => {
    el.onclick = openUrlWithBrowser
  })
}

function launchApp () {
  delegateEvents()

  ipcRenderer.send(SEND_CATEGORY_LIST)
  ipcRenderer.once(RECEIVE_CATEGORY_LIST, (_event, payload) => {
    let categories = JSON.parse(payload)
    let categorySelectEl = document.querySelector('select[name="category"]')
    if (!categorySelectEl) return

    categories.forEach((item) => {
      let optionEl = document.createElement('option')
      optionEl.setAttribute('value', item.categoryId)
      optionEl.innerHTML = item.categoryName
      categorySelectEl.appendChild(optionEl)
    })
  })

  ipcRenderer.on(ERROR, (_event, message) => {
    let toast = document.querySelector('.toast')
    if (toast) {
      let childSpanEl = toast.querySelector('span')
      if (childSpanEl) {
        childSpanEl.innerText = message ? message : 'データの取得に失敗しました。'
      }
      toast.style.display = 'block'
    }

    toggleLoadingClass(false)
  })
}

function toggleLoadingClass (loadingOn = true) {
  let el = document.querySelector('#doSearch')
  if (loadingOn) {
    el.classList.add('loading')
    el.disabled = true
  }
  else {
    el.classList.remove('loading')
    el.disabled = false
  }
}

function toJstLocaleString (endTime) {
  let date = new Date(+new Date(endTime) + 60 * 9)

  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  ].join('/') + ' ' + date.toLocaleTimeString()
}

function toMoneyAmountString (value) {
  if (!value) return '----'
  return parseInt(value).toLocaleString('ja-JP', { style: 'currency', currency: 'JPY' })
}

function openUrlWithBrowser (event) {
  event.preventDefault()
  event.stopPropagation()

  let url = event.target.getAttribute('href')
  shell.openExternal(url)
}

function renderSearchResult (payload) {
  let searchResultEl = document.querySelector('#searchResult')
  let paginationEl = document.querySelector('#pagination')
  let toastEl = document.querySelector('.toast')

  // clear
  while (searchResultEl.firstChild) {
    searchResultEl.removeChild(searchResultEl.firstChild)
  }
  while (paginationEl.firstChild) {
    paginationEl.removeChild(paginationEl.firstChild)
  }
  toastEl.style.display = 'none'

  let rowFr = document.querySelector('#searchResultRowTemplate')
  payload.results.forEach((result) => {
    let rowEl = document.importNode(rowFr.content, true)

    let imgEl = document.createElement('img')
    imgEl.setAttribute('src', result.image)
    imgEl.setAttribute('width', result.imageWidth)
    imgEl.setAttribute('height', result.imageHeight)

    let anchorEl = document.createElement('a')
    anchorEl.setAttribute('href', result.auctionItemUrl)
    anchorEl.onclick = openUrlWithBrowser
    anchorEl.innerText = result.title

    rowEl.querySelector('[name=image]').appendChild(imgEl)
    rowEl.querySelector('[name=title]').appendChild(anchorEl)
    rowEl.querySelector('[name=bids]').innerText = result.bids
    rowEl.querySelector('[name=currentPrice]').innerText = toMoneyAmountString(result.currentPrice)
    rowEl.querySelector('[name=bidOrBuy]').innerText = toMoneyAmountString(result.bidOrBuy)
    rowEl.querySelector('[name=endTime]').innerText = toJstLocaleString(result.endTime)
    searchResultEl.appendChild(rowEl)
  })

  let totalResults = parseInt(payload.totalResultsAvailable)
  let totalResultsReturned = parseInt(payload.totalResultsReturned)
  let firstResultPosition = parseInt(payload.firstResultPosition)
  let totalPages = Math.ceil(totalResults / 20)
  let currentPage = Math.ceil(firstResultPosition / 20)
  let currentRange = firstResultPosition + ' - ' + (firstResultPosition + totalResultsReturned - 1)

  document.querySelector('strong[name=totalResults]').innerText = totalResults
  document.querySelector('strong[name=totalPages]').innerText = totalPages
  document.querySelector('strong[name=currentPage]').innerText = currentPage
  document.querySelector('strong[name=currentRange]').innerText = currentRange

  let pItemFr = document.querySelector('#paginationItemTemplate')
  for (let i = -4; i <= 4; i++) {
    let page = currentPage + i
    if (page <= 0 || page > totalPages) continue

    let pItemEl = document.importNode(pItemFr.content, true)
    pItemEl.querySelector('a').innerText = page
    if (page === currentPage) {
      pItemEl.querySelector('li').classList.add('active')
    }
    paginationEl.appendChild(pItemEl)
    paginationEl.querySelector('li:last-child').onclick = doSearchByPagination
  }
}

function doSearch (event, page = null) {
  event.preventDefault()

  toggleLoadingClass()

  let searchFormEl = document.forms.searchForm
  if (!searchFormEl) return

  let keyword = searchFormEl.keyword.value
  let categoryId = searchFormEl.category.value
  let sort = searchFormEl.sort.value
  let itemStatus = searchFormEl.item_status.value

  let payload = {
    keyword: keyword,
    categoryId: categoryId,
    sort: sort,
    itemStatus: itemStatus,
    page: page
  }

  ipcRenderer.send(SEND_SEARCH_RESULT, payload)
  ipcRenderer.once(RECEIVE_SEARCH_RESULT, (_event, payload) => {
    renderSearchResult(JSON.parse(payload))
    toggleLoadingClass(false)
  })
}

function doSearchByPagination (event) {
  doSearch(event, parseInt(event.target.innerText))
  window.scrollTo(0, 0)
}

function openConfig (event) {
  let modalEl = document.querySelector('.modal')

  ipcRenderer.send(SEND_CONFIG)
  ipcRenderer.once(RECEIVE_CONFIG, (_, payload) => {
    let appId = payload ? payload.appId : ''
    let configFormEl = document.forms.configForm
    configFormEl.app_id.value = appId

    modalEl.classList.add('active')
  })
}

function closeConfig (event) {
  let modalEl = document.querySelector('.modal')
  modalEl.classList.remove('active');
}

function saveConfig (event) {
  let configFormEl = document.forms.configForm
  let appId = configFormEl.app_id.value
  let payload = {
    appId: appId
  }

  ipcRenderer.send(SAVE_CONFIG, payload)
  ipcRenderer.once(RECEIVE_SAVE_CONFIG_RESULT, (_, __) => {
    window.location.reload()
  })
}

window.onload = launchApp
