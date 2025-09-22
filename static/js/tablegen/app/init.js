// init.js
// Точка входа TableGen — отвечает за инициализацию всех сервисов, модели, рендера,
// горячих клавиш, UI модулей и тестовых кнопок. Логика сведена к последовательному
// созданию компонентов без бизнес‑правил, чтобы другие модули были независимыми.

import { EventBus } from '../core/events/EventBus.js';
import { TableModel } from '../core/model/TableModel.js';
// Парсеры и применение вставки теперь инкапсулированы в ClipboardPasteService
import { handleClipboardPaste } from '../core/services/ClipboardPasteService.js';
// Тестовый UI вынесен в setupTestButtons
import { setupTestButtons } from './init/setupTestButtons.js';
// Вынесенные модули UI
import { setupActionBar } from './init/setupActionBar.js';
import { setupImportExportUI } from './init/setupImportExportUI.js';
import { setupDragRangeController } from './init/setupDragRangeController.js';
import { HistoryService } from '../core/services/HistoryService.js';
import { parseTableJson, applyImportedDocument } from '../integration/import/fromJson.js';
// Новые модули декомпозиции
import { TableRenderer } from './TableRenderer.js';
import { InlineEditor } from './InlineEditor.js';
import { SidePanel } from './SidePanel.js';
import { HistoryDebounceRecorder } from './HistoryDebounce.js';
import { SelectionService } from './SelectionService.js';
import { ValidationService } from '../core/services/ValidationService.js';
import { RenderScheduler } from './RenderScheduler.js';
import { setupHotkeys } from './init/setupHotkeys.js';

/**
 * Инициализирует редактор таблиц TableGen внутри DOM элемента по его id.
 * Создаёт модель, систему событий, сервис выделения, историю, рендерер и подключает
 * вспомогательные UI модули (панель действий, панель атрибутов, импорт/экспорт, hotkeys).
 * Возвращает набор ссылок для интеграционных сценариев или тестов.
 * @param {string} rootElementId id DOM элемента-контейнера, куда будет смонтирована таблица
 * @returns {{
 *   model: import('../core/model/TableModel.js').TableModel,
 *   bus: import('../core/events/EventBus.js').EventBus,
 *   render: Function,
 *   history: import('../core/services/HistoryService.js').HistoryService,
 *   inlineEditor: any,
 *   sidePanel: any,
 *   selectionService: any,
 *   validator: any,
 *   scheduler: import('./RenderScheduler.js').RenderScheduler,
 *   hotkeys: any,
 *   testButtons: any
 * }} Объект с ключевыми сервисами (упрощает доступ из внешнего кода / консоли)
 */
export function initTableGen(rootElementId) {
  // 1. Шина событий: централизованная подписка/emit для всех сервисов
  const bus = new EventBus();

  // 2. Начальный документ: минимальная таблица 5x5 без значений
  const initialDoc = {
    version: 1,
    meta: { name: 'NewTable', createdUtc: new Date().toISOString() },
    grid: { rows: 5, cols: 5 },
    cells: []
  };

  // 3. Модель (данные таблицы) + сервис валидации структуры / операций
  const model = new TableModel(initialDoc, bus);
  const validator = new ValidationService(model);
  const history = new HistoryService(50);
  // Первая запись истории: фиксируем стартовое состояние
  history.record(model);

  // HistoryDebounceRecorder: сглаживает частые события, чтобы не засорять стек истории.
  // Слушает batch:flush и пишет snapshot немедленно после групповой операции.
  const debounced = new HistoryDebounceRecorder(history, model, 75, bus);

  // 4. Рендерер таблицы: отвечает только за построение DOM на основе модели
  const root = document.getElementById(rootElementId);
  if (!root) { console.error('[initTableGen] Не найден root элемент', rootElementId); return { model, bus }; }
  const renderer = new TableRenderer(model, bus);
  root.appendChild(renderer.tableEl);

  // 5. RenderScheduler: гарантирует 1 перерисовку за кадр + восстановление выделения после render
  const selectionService = new SelectionService(model, renderer, bus);
  const scheduler = new RenderScheduler(renderer, selectionService);
  const scheduleAndRecord = () => { scheduler.request(); debounced.schedule(); };
  bus.on('cell:change', scheduleAndRecord);
  bus.on('structure:change', scheduleAndRecord);
  bus.on('paste', scheduleAndRecord);
  bus.on('merge', scheduleAndRecord);
  bus.on('split', scheduleAndRecord);

  // 6. InlineEditor: управление редактированием содержимого ячеек (dblclick / Enter / Esc)
  // Создаётся до контроллера диапазона, так как drag логика должна знать об активном редакторе.
  const inlineEditor = new InlineEditor(model, renderer, history, selectionService, scheduler, bus);

  // 7. Обработчик вставки из буфера: перехватывает системный paste и делегирует парсинг сервису
  document.addEventListener('paste', (e) => {
    const meta = handleClipboardPaste(e, model);
    if (meta) {
      // meta может использоваться в будущем для расширений (например авто-выделение вставленного диапазона)
    }
  });

  // 8. UI модуль Импорт / Экспорт JSON
  const importExport = setupImportExportUI({ model, history, validator, bus });
  root.appendChild(importExport.element);

  // 9. Контроллер drag-выделения диапазона (мышью) — учитывает активный inline редактор
  const dragController = setupDragRangeController({ renderer, selectionService, inlineEditor });

  // 10. Панель действий (merge / split): предоставляет кнопки объединения и разделения ячеек,
  // проверяет валидность текущего диапазона через ValidationService перед выполнением операции
  const actionsBar = setupActionBar({ model, selectionService, validator });
  root.appendChild(actionsBar.element);

  // 11. SidePanel: редактирование CSS классов и data-* атрибутов текущей ячейки или диапазона
  const sidePanel = new SidePanel(model, renderer, selectionService, bus, validator);
  root.appendChild(sidePanel.rootEl);

  // 12. Горячие клавиши (Undo/Redo) — поддержка разных раскладок клавиатуры
  const hotkeys = setupHotkeys({ history, model, inlineEditor, scheduler, bus });

  // 13. Первый синхронный рендер: показываем таблицу без задержки animation frame
  scheduler.flush();

  // 14. Тестовые кнопки (dev only) — легко отключить при сборке в продакшн
  const testButtons = setupTestButtons(document.body);

  return { model, bus, render: () => scheduler.flush(), history, inlineEditor, sidePanel, selectionService, validator, scheduler, hotkeys, testButtons };
}
