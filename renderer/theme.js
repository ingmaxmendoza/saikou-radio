// renderer/theme.js
const BUILT_IN_THEMES = ['y2k-silver', 'dark-lcd', 'blueberry-xp']

class ThemeEngine {
  constructor() {
    this._link = null
  }

  apply(themeName, customPath) {
    const link = document.getElementById('theme-link')
    if (!link) return

    const bust = `?v=${Date.now()}`
    if (themeName === 'custom' && customPath) {
      link.href = `file://${customPath}${bust}`
    } else if (BUILT_IN_THEMES.includes(themeName)) {
      link.href = `../themes/${themeName}.css${bust}`
    } else {
      link.href = `../themes/y2k-silver.css${bust}`
    }
  }
}

module.exports = { ThemeEngine, BUILT_IN_THEMES }
