// init.js
// Точка входа новой реализации TableGen.
// Здесь создаём EventBus, начальную модель и вешаем обработчик paste.

import { EventBus } from '../core/events/EventBus.js';
import { TableModel } from '../core/model/TableModel.js';
// Парсеры и применение вставки теперь инкапсулированы в ClipboardPasteService
import { handleClipboardPaste } from '../core/services/ClipboardPasteService.js';
import { runPasteTests } from '../tests/pasteService.test.js';
import { toJson } from '../integration/export/toJson.js';
import { mergeRange, splitCell, splitAllInRange } from '../core/services/MergeService.js';
import { HistoryService } from '../core/services/HistoryService.js';
import { parseTableJson, applyImportedDocument } from '../integration/import/fromJson.js';
// Новые модули декомпозиции
import { TableRenderer } from './TableRenderer.js';
import { InlineEditor } from './InlineEditor.js';
import { SidePanel } from './SidePanel.js';
import { HistoryDebounceRecorder } from './HistoryDebounce.js';
import { SelectionService } from './SelectionService.js';
import { ValidationService } from '../core/services/ValidationService.js';

// Для джуниора: эта функция будет вызвана после загрузки страницы (например через <script type="module">)
export function initTableGen(rootElementId) {
  // 1. Создаём шину событий
  const bus = new EventBus();

  // 2. Создаём начальный документ (пустая 5x5 таблица как пример)
  const initialDoc = {
    version: 1,
    meta: { name: 'NewTable', createdUtc: new Date().toISOString() },
    grid: { rows: 5, cols: 5 },
    cells: []
  };

  // 3. Модель и валидация
  const model = new TableModel(initialDoc, bus);
  const validator = new ValidationService(model);
  const history = new HistoryService(50);
  // Первая запись истории
  history.record(model);

  // ------------------------------------------------------------
  // Отложенная запись истории вынесена в HistoryDebounceRecorder
  const debounced = new HistoryDebounceRecorder(history, model);

  // 4. Рендерер таблицы вынесен
  const root = document.getElementById(rootElementId);
  if (!root) { console.error('[initTableGen] Не найден root элемент', rootElementId); return { model, bus }; }
  const renderer = new TableRenderer(model, bus);
  root.appendChild(renderer.tableEl);

  // 5. Подписываемся на события изменения
  const rerenderAndRecord = () => { renderer.render(); debounced.schedule(); };
  bus.on('cell:change', rerenderAndRecord);
  bus.on('structure:change', rerenderAndRecord);
  bus.on('paste', rerenderAndRecord);
  bus.on('merge', rerenderAndRecord);
  bus.on('split', rerenderAndRecord);

  // ДОПОЛНИТЕЛЬНО: сохраняем визуальное выделение после перерендера таблицы.
  // Проблема: при изменении classes / data-* происходит полный render(), DOM заменяется, и CSS-класс
  // подсветки выбранной ячейки теряется. SelectionService хранит координаты, поэтому мы можем применить
  // подсветку повторно. Используем requestAnimationFrame, чтобы выполнить повторное применение
  // после того как браузер вставит новый DOM.
  const reapplyAfterRender = () => {
    // Для джуниора: после полного render() DOM таблицы пересоздаётся, поэтому мы
    // должны восстановить и одиночное выделение, и выделение диапазона (если активно).
    requestAnimationFrame(() => {
      selectionService.reapplySelection();
      selectionService.reapplyRange();
    });
  };
  bus.on('cell:change', reapplyAfterRender);
  bus.on('structure:change', reapplyAfterRender);
  bus.on('paste', reapplyAfterRender);
  bus.on('merge', reapplyAfterRender);
  bus.on('split', reapplyAfterRender);

  // 6. Обработчик вставки из буфера (для всей страницы — можно сузить область)
  document.addEventListener('paste', (e) => {
    const meta = handleClipboardPaste(e, model);
    if (meta) {
      // Для джуниора: meta содержит тип вставки и размеры вставленного блока.
      // Можно в будущем использовать для авто-выделения диапазона.
      // Сейчас никаких доп.действий не требуется — события paste / cell:change уже вызовут render.
    }
  });

  // 7. Кнопка экспорта (временно)
  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Экспорт JSON (console)';
  exportBtn.addEventListener('click', () => {
    const json = toJson(model);
    console.log('EXPORT JSON:\n', json);
  });
  root.appendChild(exportBtn);

  // 7.1 Импорт JSON (textarea + кнопка)
  // Для джуниора: минимальный UI — при желании потом заменим на модальное окно / drag&drop.
  const importContainer = document.createElement('div');
  importContainer.className = 'tablegen-import-block';
  const importArea = document.createElement('textarea');
  importArea.placeholder = 'Вставьте сюда JSON таблицы и нажмите "Импорт JSON"';
  importArea.rows = 4;
  importArea.style.width = '400px';
  importArea.style.display = 'block';
  importArea.style.marginTop = '8px';
  const importBtn = document.createElement('button');
  importBtn.textContent = 'Импорт JSON';
  importBtn.addEventListener('click', () => {
    const raw = importArea.value.trim();
    if (!raw) {
      console.warn('Пустая строка JSON для импорта');
      return;
    }
    const res = parseTableJson(raw);
    if (!res.ok) {
      console.error('Ошибка импорта JSON:', res.error);
      return;
    }
    
    // Валидация импортируемого документа
    const docValidation = validator.validateDocument(res.doc);
    if (!docValidation.valid) {
      console.error('Ошибки валидации документа:', docValidation.errors);
      alert(`Документ содержит ошибки:\n${docValidation.errors.join('\n')}`);
      return;
    }
    
    // Применяем документ
    history.restore(() => {
      applyImportedDocument(model, res.doc, bus);
    }, res.doc);
    // Добавляем снимок после импорта как новая вершина истории
    history.record(model);
    importArea.value = '';
    console.log('Импорт завершён');
  });
  importContainer.appendChild(importArea);
  importContainer.appendChild(importBtn);
  root.appendChild(importContainer);

  // 7.2 Сервис выбора + панель
  const selectionService = new SelectionService(model, renderer, bus);
  // Логика одиночного клика остаётся, но теперь она не должна сбрасывать активный drag.
  renderer.tableEl.addEventListener('click', (e) => {
    if (dragState.active) return; // если только что завершили drag — клик игнорируем
    const td = e.target.closest('td');
    if (!td) return;
    selectionService.selectByTd(td);
  });

  // ---------------- Drag range selection ----------------
  // Для джуниора: реализуем выделение диапазона мышью — удерживаем кнопку и тянем по ячейкам.
  const dragState = { active: false };

  renderer.tableEl.addEventListener('mousedown', (e) => {
    const td = e.target.closest('td');
    if (!td) return;
    const r = parseInt(td.dataset.r, 10);
    const c = parseInt(td.dataset.c, 10);
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    // ЛОГИКА ЗАВЕРШЕНИЯ РЕДАКТИРОВАНИЯ:
    // Раньше мы всегда вызывали commitIfAny() при любом mousedown, что мешало выделять текст мышкой внутри input.
    // Новое правило:
    //  - Если клик пришёлся по текущей редактируемой ячейке (или по самому input) — НЕ завершаем редактирование.
    //  - Если клик по другой ячейке — сначала коммитим ввод, затем начинаем выделение.
    if (inlineEditor.activeEditor) {
      const { td: editingTd } = inlineEditor.activeEditor;
      // Проверяем: тот же TD?
      const sameCell = editingTd === td;
      // Клик потенциально по input (чтобы можно было выделять текст):
      const clickedInsideInput = e.target === inlineEditor.activeEditor.input || editingTd.contains(e.target);
      if (!sameCell) {
        // Другая ячейка — фиксируем введённое значение
        inlineEditor.commitIfAny();
      } else {
        // Та же ячейка: если клик по input или внутри неё — даём возможность нативного выделения текста
        if (clickedInsideInput) {
          // Прерываем начало drag-выделения таблицы — пользователь скорее всего хочет выделить текст
          dragState.active = false;
          return; // Не запускаем выделение диапазона
        }
      }
    }
    dragState.active = true;
    dragState.suppressClick = true; // чтобы click не перeselect сразу одну ячейку
    selectionService.startRange(r, c);
    // Также выделим anchor как текущую одиночную (для SidePanel – контекст)
    selectionService.select(r, c);
    e.preventDefault();
  });

  renderer.tableEl.addEventListener('mouseover', (e) => {
    if (!dragState.active) return;
    const td = e.target.closest('td');
    if (!td) return;
    const r = parseInt(td.dataset.r, 10);
    const c = parseInt(td.dataset.c, 10);
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    selectionService.updateRange(r, c);
  });

  document.addEventListener('mouseup', () => {
    if (!dragState.active) return;
    dragState.active = false;
    // Подтверждаем диапазон
    const rect = selectionService.commitRange();
    // Через небольшой timeout разрешим click (если он будет)
    setTimeout(() => { dragState.suppressClick = false; }, 0);
    if (rect) {
      console.log('Диапазон выбран:', rect);
    }
  });

  // Заменяем старые демо-кнопки merge/split на реальные по диапазону
  // Удаляем существующие mergeBtn / splitBtn блок
  // 8. Кнопка тестового объединения (закомментировано — заменяем новой кнопкой)
  // const mergeBtn = ... (удалено)
  // 9. Кнопка split ведущей (удалено) 

  const actionsBar = document.createElement('div');
  actionsBar.style.marginTop = '8px';

  const mergeRangeBtn = document.createElement('button');
  mergeRangeBtn.textContent = 'Объединить выделение';
  mergeRangeBtn.addEventListener('click', () => {
    const rect = selectionService.getRange();
    if (!rect) {
      console.warn('Нет диапазона для merge');
      return;
    }
    const { r1, c1, r2, c2 } = rect;
    const validation = validator.validateMergeOperation(r1, c1, r2, c2);
    if (!validation.ok) {
      alert('Нельзя объединить: ' + validation.error);
      return;
    }
    const res = mergeRange(model, r1, c1, r2, c2);
    if (!res.ok) {
      alert('Merge ошибка: ' + res.error);
      return;
    }
    // После объединения очищаем диапазон, оставляем выделенной ведущую
    selectionService.clearRange();
    selectionService.select(r1, c1);
  });
  actionsBar.appendChild(mergeRangeBtn);

  // Единая кнопка разъединения: если есть диапазон -> разъединить все в диапазоне, иначе -> разъединить одну выбранную ведущую.
  // Для джуниора: ранее было две разных кнопки:
  //  - "Разъединить (ведущая)" — split только одной текущей ведущей ячейки.
  //  - "Разъединить все в диапазоне" — split всех объединений внутри выделенного прямоугольника.
  // Объединяем их в одну кнопку "Разъединить" с условием:
  //  1) Если активен диапазон (selectionService.getRange() вернёт объект) — выполняем массовый splitAllInRange.
  //  2) Иначе — split только текущей выбранной ведущей ячейки.
  // Это упрощает интерфейс и делает поведение более предсказуемым.
  const unifiedSplitBtn = document.createElement('button');
  unifiedSplitBtn.textContent = 'Разъединить';
  unifiedSplitBtn.style.marginLeft = '6px';
  unifiedSplitBtn.addEventListener('click', () => {
    // 1. Проверяем есть ли у нас выделенный диапазон.
    const rect = selectionService.getRange();
    if (rect) {
      // Массовое разъединение всего диапазона
      const { r1, c1, r2, c2 } = rect;
      const res = splitAllInRange(model, r1, c1, r2, c2);
      if (res.ok) {
        console.log('[splitAllInRange] Разъединено областей:', res.processed);
        // После разъединения очищаем диапазон и выделяем первую ячейку
        selectionService.clearRange();
        selectionService.select(r1, c1);
      } else {
        alert('Split ошибка: ' + res.error);
      }
      return;
    }
    // 2. Диапазона нет — значит пользователь хочет разъединить текущую ведущую.
    // Диапазона нет — работаем с одной ячейкой
    const sel = selectionService.getSelected();
    if (!sel) { alert('Нет выбранной ячейки'); return; }
    const res = splitCell(model, sel.r, sel.c);
    if (!res.ok) { alert('Split ошибка: ' + res.error); return; }
    selectionService.clearRange();
    selectionService.select(sel.r, sel.c);
  });
  actionsBar.appendChild(unifiedSplitBtn);

  root.appendChild(actionsBar);

  // ---------------- Inline редактирование ячейки ----------------
  // Для джуниора: используем делегирование событий — один обработчик на <table>, вместо навешивания на каждую ячейку.
  // Inline редактирование вынесено
  const inlineEditor = new InlineEditor(model, renderer, history, selectionService);

  // ---------------- SidePanel ----------------
  // Для джуниора: ранее в return мы возвращали переменную sidePanel, но сам объект не создавался,
  // из-за чего возникал ReferenceError. Теперь создаём экземпляр SidePanel и крепим его в DOM.
  const sidePanel = new SidePanel(model, renderer, selectionService, bus, validator);
  // Добавляем панель под actionsBar
  root.appendChild(sidePanel.rootEl);

  // Горячие клавиши Undo/Redo
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey; // поддержка Mac (Cmd)
    if (!mod) return;
    // Ctrl+Z / Cmd+Z
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      const doc = history.undo();
      if (doc) {
        history.restore((d) => {
          // Если редактировали ячейку — отменяем режим редактирования
          if (inlineEditor.activeEditor) inlineEditor.cancelIfAny();
          // Пересоздаём модель на месте: переносим основные поля
          const newModel = new TableModel(d, bus);
          model.version = newModel.version;
            model.meta = newModel.meta;
            model.grid = newModel.grid;
            model.cells = newModel.cells;
            model._rebuildIndex();
          renderer.render();
        }, doc);
      }
      return;
    }
    // Ctrl+Y или Ctrl+Shift+Z — redo
    if (e.key === 'y' || (e.key === 'Z' && e.shiftKey)) {
      e.preventDefault();
      const doc = history.redo();
      if (doc) {
        history.restore((d) => {
          if (inlineEditor.activeEditor) inlineEditor.cancelIfAny();
          const newModel = new TableModel(d, bus);
          model.version = newModel.version;
            model.meta = newModel.meta;
            model.grid = newModel.grid;
            model.cells = newModel.cells;
            model._rebuildIndex();
          renderer.render();
        }, doc);
      }
    }
  });

  renderer.render();

  // В самом конце init добавим кнопку для ручного запуска тестов
  const testBtn = document.createElement('button');
  testBtn.textContent = 'Run Paste Tests';
  testBtn.addEventListener('click', () => {
    try {
      runPasteTests();
    } catch (e) {
      console.error('Ошибки в тестах вставки', e);
      alert('Тесты вставки: ошибки, см. консоль');
      return;
    }
    alert('Тесты вставки прошли успешно (см. консоль)');
  });
  document.body.appendChild(testBtn);

  return { model, bus, render: () => renderer.render(), history, inlineEditor, sidePanel, selectionService, validator };
}
