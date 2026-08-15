export function shouldHideWindowOnClose(isQuitting, hasTray = true) {
  return !isQuitting && hasTray
}

export function createTrayMenuTemplate({
  locale = 'en',
  showWindow,
  hideWindow,
  checkForUpdates,
  quit,
}) {
  const isChinese = locale.toLowerCase().startsWith('zh')

  const template = [
    {
      label: isChinese ? '打开 DeepSeek Harness' : 'Open DeepSeek Harness',
      click: showWindow,
    },
    {
      label: isChinese ? '隐藏窗口' : 'Hide Window',
      click: hideWindow,
    },
  ]

  if (checkForUpdates) {
    template.push(
      { type: 'separator' },
      {
        label: isChinese ? '检查更新…' : 'Check for Updates…',
        click: checkForUpdates,
      },
    )
  }

  template.push({ type: 'separator' }, {
    label: isChinese ? '退出' : 'Quit',
    click: quit,
  })

  return template
}
