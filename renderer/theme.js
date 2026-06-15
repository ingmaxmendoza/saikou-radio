// renderer/theme.js
const BUILT_IN_THEMES = ['y2k-silver', 'dark-lcd', 'blueberry-xp']

class ThemeEngine {
  constructor() {
    this._link = null
  }

  apply(themeName, customPath) {
    const link = document.getElementById('theme-link')
    if (!link) return

    if (themeName === 'custom' && customPath) {
      link.href = `file://${customPath}`
    } else if (BUILT_IN_THEMES.includes(themeName)) {
      link.href = `../themes/${themeName}.css`
    } else {
      link.href = `../themes/y2k-silver.css`
    }
  }
}

module.exports = { ThemeEngine, BUILT_IN_THEMES }
