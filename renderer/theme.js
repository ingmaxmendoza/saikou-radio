// renderer/theme.js
const BUILT_IN_THEMES = ['y2k-silver', 'dark-lcd', 'blueberry-xp', 'win98', 'white-on-black', 'green-terminal', 'c64-amber', 'vaporwave', 'warm-sepia', 'catppuccin-mocha', 'ipod-classic', 'marlboro', 'sakura', 'game-boy']

class ThemeEngine {
  apply(themeName, customPath) {
    const link = document.getElementById('theme-link')
    const base98 = document.getElementById('base-98')
    if (!link) return

    const bust = `?v=${Date.now()}`

    if (base98) {
      if (themeName === 'win98') {
        base98.href = `../node_modules/98.css/dist/98.css${bust}`
        base98.disabled = false
      } else {
        base98.disabled = true
        base98.href = ''
      }
    }

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
