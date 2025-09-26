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
import { setupRowColSelection } from './init/setupRowColSelection.js';
// Реестр предопределённых классов и data-* атрибутов (core + project)
// Переходим к динамической модели: проектный реестр (project registry) передаётся извне (HTML) или через options.
// Здесь импортируем только CORE_REGISTRY. Слияние выполняем локально.
import { CORE_REGISTRY } from '../config/registry.core.js';
import { mergeCoreAndProject } from '../config/registry.index.js';

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
/**
 * Инициализация TableGen.
 * Теперь поддерживает опциональный внешне переданный projectRegistry, чтобы базовый код оставался общим,
 * а кастомные классы/атрибуты подмешивались из разных HTML файлов.
 * @param {string} rootElementId id контейнера
 * @param {{projectRegistry?: Object, registry?: Object}} [options] Доп.параметры
 */
export function initTableGen(rootElementId, options = {}) {
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
  // --- Реестр ---
  // Приоритеты получения проектного реестра:
  // 1. options.registry (если передали уже готовый final registry)
  // 2. options.projectRegistry (только проектная часть поверх core)
  // 3. window.TABLEGEN_PROJECT_REGISTRY (глобал, определённый в HTML)
  // 4. Пустой (только core)
  let finalRegistry;
  if (options.registry) {
    finalRegistry = options.registry;
  } else {
    const project = options.projectRegistry || (typeof window !== 'undefined' && window.TABLEGEN_PROJECT_REGISTRY) || null;
    finalRegistry = mergeCoreAndProject(CORE_REGISTRY, project);
  }
  validator.initRegistry(finalRegistry);
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

  // 7. Глобальная вставка Ctrl+V отключена (по требованиям текущей версии). Вставка значений выполняется
  // только через внутренний буфер Ctrl+C / Ctrl+V (см. setupHotkeys расширенный функционал copy/paste значений).

  // 8. UI модуль Импорт / Экспорт JSON
  const importExport = setupImportExportUI({ model, history, validator, bus });
  root.appendChild(importExport.element);

  // 9. Контроллер drag-выделения диапазона (мышью) — учитывает активный inline редактор
  const dragController = setupDragRangeController({ renderer, selectionService, inlineEditor });

  // 10. SidePanel: теперь создаём раньше ActionBar, чтобы ActionBar шёл строго под ней
  const sidePanel = new SidePanel(model, renderer, selectionService, bus, validator, { horizontal: true });
  if (root.firstChild) {
    root.insertBefore(sidePanel.rootEl, root.firstChild);
  } else {
    root.appendChild(sidePanel.rootEl);
  }

  // 11. Панель действий (merge / split / вставки) перемещена ПОД SidePanel
  const actionsBar = setupActionBar({ model, selectionService, validator, bus });
  root.insertBefore(actionsBar.element, renderer.tableEl);

  // 12. Горячие клавиши (Undo/Redo) — поддержка разных раскладок клавиатуры
  const hotkeys = setupHotkeys({ history, model, inlineEditor, scheduler, bus, selectionService });

  // 13. Выбор целой строки/столбца по клику на заголовок
  const rowColSelection = setupRowColSelection({ selectionService, renderer });

  // 14. Первый синхронный рендер: показываем таблицу без задержки animation frame
  scheduler.flush();

  // 15. Тестовые кнопки (dev only) — легко отключить при сборке в продакшн
  const testButtons = setupTestButtons(document.body);

  return { model, bus, render: () => scheduler.flush(), history, inlineEditor, sidePanel, selectionService, validator, scheduler, hotkeys, rowColSelection, testButtons, registry: finalRegistry };
}
