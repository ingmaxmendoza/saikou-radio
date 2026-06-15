'use strict';

const { ipcRenderer } = require('electron')

document.addEventListener('DOMContentLoaded', async () => {
  const api = window.saikouAPI

  // ── Element refs ──────────────────────────────────────────────────────────
  const themeLink        = document.getElementById('theme-link');
  const fadeSeconds      = document.getElementById('fade-seconds');
  const fadeSecondsVal   = document.getElementById('fade-seconds-val');
  const breakInterval    = document.getElementById('break-interval');
  const loopCb           = document.getElementById('loop');
  const shuffleCb        = document.getElementById('shuffle');
  const ttsEngine        = document.getElementById('tts-engine');
  const ttsVoice         = document.getElementById('tts-voice');
  const personalityArea  = document.getElementById('personality-phrases');
  const jinglesEnabled   = document.getElementById('jingles-enabled');
  const jinglesFolder    = document.getElementById('jingles-folder');
  const browseJingles    = document.getElementById('browse-jingles');
  const themeSelect      = document.getElementById('theme');
  const customCssRow     = document.getElementById('custom-css-row');
  const customThemePath  = document.getElementById('custom-theme-path');
  const browseCustomCss  = document.getElementById('browse-custom-css');
  const alwaysOnTop      = document.getElementById('always-on-top');
  const saveBtn          = document.getElementById('save-btn');
  const cancelBtn        = document.getElementById('cancel-btn');

  // ── Load settings ─────────────────────────────────────────────────────────
  let settings;
  try {
    settings = await api.getSettings();
  } catch (err) {
    console.error('Failed to load settings:', err);
    alert('Failed to load settings');
    return;
  }

  const fv = settings.fadeSeconds ?? 2;
  fadeSeconds.value         = fv;
  fadeSecondsVal.textContent = fv + 's';
  fadeSeconds.addEventListener('input', () => {
    fadeSecondsVal.textContent = fadeSeconds.value + 's';
  });
  breakInterval.value       = settings.breakInterval ?? 15;
  loopCb.checked            = !!settings.loop;
  shuffleCb.checked         = !!settings.shuffle;
  ttsEngine.value           = settings.ttsEngine ?? 'edge';
  personalityArea.value     = (settings.personalityPhrases ?? []).join('\n');
  jinglesEnabled.checked    = !!settings.jinglesEnabled;
  jinglesFolder.value       = settings.jinglesFolder ?? '';
  themeSelect.value         = settings.theme ?? 'y2k-silver';
  customThemePath.value     = settings.customThemePath ?? '';
  alwaysOnTop.checked       = !!settings.alwaysOnTop;

  // ── Voice dropdown ────────────────────────────────────────────────────────
  async function populateVoices(engine, currentVoice) {
    ttsVoice.innerHTML = '<option value="">Loading…</option>';
    const voices = await api.listVoices(engine).catch(() => []);
    ttsVoice.innerHTML = '';
    if (voices.length === 0) {
      ttsVoice.innerHTML = '<option value="">No voices found</option>';
      return;
    }
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.culture}, ${v.gender})`;
      ttsVoice.appendChild(opt);
    });
    ttsVoice.value = currentVoice || voices[0].name;
  }

  await populateVoices(settings.ttsEngine ?? 'edge', settings.ttsVoice ?? '');

  ttsEngine.addEventListener('change', () => {
    populateVoices(ttsEngine.value, '');
  });

  // Apply theme to this window immediately
  applyTheme(themeSelect.value, customThemePath.value);
  toggleCustomCssRow(themeSelect.value);

  // ── Jingles enabled checkbox ──────────────────────────────────────────────
  browseJingles.disabled = !jinglesEnabled.checked;
  jinglesEnabled.addEventListener('change', () => {
    browseJingles.disabled = !jinglesEnabled.checked;
  });

  // ── Theme select change ───────────────────────────────────────────────────
  themeSelect.addEventListener('change', () => {
    const val = themeSelect.value;
    toggleCustomCssRow(val);
    applyTheme(val, customThemePath.value);
  });

  function toggleCustomCssRow(val) {
    customCssRow.style.display = (val === 'custom') ? 'flex' : 'none';
  }

  function applyTheme(val, customPath) {
    const bust = `?v=${Date.now()}`
    if (val === 'custom' && customPath) {
      themeLink.href = `file://${customPath}${bust}`;
    } else {
      themeLink.href = `../themes/${val}.css${bust}`;
    }
  }

  // ── Browse buttons ────────────────────────────────────────────────────────
  browseJingles.addEventListener('click', async () => {
    const folder = await api.openFolderDialog();
    if (folder) jinglesFolder.value = folder;
  });

  browseCustomCss.addEventListener('click', async () => {
    const file = await api.openFileDialog({
      filters: [{ name: 'CSS Files', extensions: ['css'] }],
    });
    if (file) {
      customThemePath.value = file;
      applyTheme('custom', file);
    }
  });

  // ── Save ──────────────────────────────────────────────────────────────────
  saveBtn.addEventListener('click', async () => {
    const phrases = personalityArea.value
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const newSettings = {
      fadeSeconds:        parseFloat(fadeSeconds.value) || 0,
      breakInterval:      parseInt(breakInterval.value, 10) || 15,
      loop:               loopCb.checked,
      shuffle:            shuffleCb.checked,
      ttsEngine:          ttsEngine.value,
      ttsVoice:           ttsVoice.value,
      personalityPhrases: phrases,
      jinglesEnabled:     jinglesEnabled.checked,
      jinglesFolder:      jinglesFolder.value,
      theme:              themeSelect.value,
      customThemePath:    customThemePath.value,
      alwaysOnTop:        alwaysOnTop.checked,
    };

    await api.saveSettings(newSettings);
    ipcRenderer.send('settings:notify-reload')
    window.close();
  });

  // ── Cancel ────────────────────────────────────────────────────────────────
  cancelBtn.addEventListener('click', () => {
    window.close();
  });
});
