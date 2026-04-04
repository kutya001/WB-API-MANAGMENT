---
applyTo: "Sidebar.html,WB_manager.html"
description: "Use when editing Sidebar.html or WB_manager.html — the Google Apps Script HtmlService UI for WB Учёт. Covers google.script.run patterns, tab/page structure, button conventions, Settings form, and token management."
---

# UI-конвенции (Sidebar + WB Manager)

## Файлы

| Файл | Назначение | Размер | Открывается |
|---|---|---|---|
| `Sidebar.html` | Боковая панель Google Sheets | 380px | `showSidebar()` |
| `WB_manager.html` | Полноценный веб-интерфейс (PC + мобильный) | 1100×700 (модальный) / fullscreen (web app) | `showWbManager()` / `doGet()` |

## Sidebar.html — 3 вкладки

- **⚡ Действия** — кнопки запуска + состояние листов (объединено)
- **⚙️ Настройки** — токены API + параметры загрузки
- **📖 Справка** — описание полей в формате таблицы (столбец, название, описание)

## WB_manager.html — 6 страниц (sidebar nav)

- **📊 Обзор** — Dashboard: кабинеты, состояние листов, кнопка "Обновить всё"
- **⚡ Действия** — all action buttons in card grid layout
- **📋 Листы** — sheets table with row count + last update
- **🔑 Токены** — token management (add/remove/validate)
- **⚙️ Настройки** — settings form in 2-column grid
- **📖 Справка** — collapsible schema docs per sheet

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
<!-- Sidebar.html -->
<button class="btn btn-secondary" data-func="loadModuleName" onclick="run('loadModuleName')">
  <span class="icon">📦</span> Описание действия
</button>

<!-- WB_manager.html -->
<button class="btn btn-secondary btn-sm" data-func="loadModuleName" onclick="run('loadModuleName')">📦 Описание</button>
```

## Настройки

- Ключи настроек из `DEFAULT_SETTINGS` (`00_Config.js`)
- Sidebar/Manager читает через `getSidebarData()`, сохраняет через `saveSettingsFromSidebar()`
- SETTINGS_META определяется в обоих HTML-файлах (дублируется)

## Токены

- Управление токенами — во вкладке Настройки (Sidebar) или на странице Токены (Manager)
- Backend: `getApiKeysForSidebar()`, `addApiKeyFromSidebar()`, `removeApiKeyFromSidebar()`, `validateApiToken()`

## Открытие Manager из Sidebar

```javascript
function openManager() {
  google.script.run.showWbManager();
}
```
