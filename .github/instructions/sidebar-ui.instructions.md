---
applyTo: "Sidebar.html"
description: "Use when editing Sidebar.html — the Google Apps Script HtmlService sidebar UI for WB Учёт. Covers google.script.run patterns, tab structure, button conventions, and Settings form integration."
---

# Sidebar.html — UI-конвенции

## Структура

Sidebar.html содержит 4 вкладки:
- **Действия** — кнопки для запуска функций GAS
- **Листы** — обзор состояния листов
- **Настройки** — форма параметров (даты, лимиты)
- **Справка** — описание полей (из МЕТАДАННЫЕ)

## Вызов GAS из JavaScript

```html
<script>
  function run(funcName) {
    google.script.run
      .withSuccessHandler(result => { /* ... */ })
      .withFailureHandler(error => { /* ... */ })
      .runFromSidebar(funcName);
  }
</script>
```

- Все функции вызываются через `runFromSidebar()` (whitelist в `12_Menu.js`)
- Новую функцию нужно добавить в массив `allowed` в `runFromSidebar()`

## Добавление кнопки

```html
<div class="section-title">📦 Секция</div>
<button class="btn btn-secondary" onclick="run('loadModuleName')">
  <span class="icon">📦</span> Описание действия
</button>
```

## Настройки

- Ключи настроек берутся из `DEFAULT_SETTINGS` в `00_Config.js`
- Sidebar читает/сохраняет через `getSettingsMap()` / `saveSettingsFromSidebar()`
