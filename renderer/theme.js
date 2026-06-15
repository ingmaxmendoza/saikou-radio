// renderer/theme.js
const BUILT_IN_THEMES = ['y2k-silver', 'dark-lcd', 'blueberry-xp']

class ThemeEngine {
  constructor() {
    this._link = null
  }

  apply(themeName, customPath) {
    if (this._link) {
      this._link.remove()
      this._link = null
    }

    const link = document.createElement('link')
    link.rel = 'stylesheet'

    if (themeName === 'custom' && customPath) {
      link.href = `file://${customPath}`
    } else if (BUILT_IN_THEMES.includes(themeName)) {
      link.href = `../themes/${themeName}.css`
    } else {
      link.href = `../themes/y2k-silver.css`
    }

    document.head.appendChild(link)
    this._link = link
  }
}

module.exports = { ThemeEngine, BUILT_IN_THEMES }
