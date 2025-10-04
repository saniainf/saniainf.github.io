// setupActionBar.js
// Создание панели действий (merge / split / вставка / удаление строк и столбцов). Выносит UI-команды из init.js.

import { mergeRange, splitCell, splitAllInRange } from '../../core/services/MergeService.js';

/**
 * Создаёт панель действий с кнопками merge / split.
 * @param {Object} ctx Контекст таблицы
 * @param {TableModel} ctx.model
 * @param {SelectionService} ctx.selectionService
 * @param {ValidationService} ctx.validator
 * @returns {{element: HTMLDivElement}}
 */
export function setupActionBar(ctx) {
  const { model, selectionService, validator, bus } = ctx; // добавляем bus для batch
  const actionsBar = document.createElement('div');
  actionsBar.className = 'tablegen-actions-bar';
  // Добавляем tailwind классы для визуального блока: flex wrap gap и лёгкая подложка
  actionsBar.classList.add('flex','flex-wrap','items-center','gap-2','p-2','bg-white','border','border-gray-200','rounded');

  // Кнопка объединения диапазона
  const mergeRangeBtn = document.createElement('button');
  mergeRangeBtn.textContent = 'Merge →|←';
  // Применяем базовый tailwind стиль
  // Делаем стиль единообразным для всех кнопок панели: используем только базовый tg-btn
  mergeRangeBtn.classList.add('tg-btn');
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
    selectionService.clearRange();
    selectionService.select(r1, c1);
  });
  actionsBar.appendChild(mergeRangeBtn);

  // Универсальная кнопка split
  const unifiedSplitBtn = document.createElement('button');
  unifiedSplitBtn.textContent = 'Split ←|→';
  unifiedSplitBtn.classList.add('tg-btn');
  unifiedSplitBtn.addEventListener('click', () => {
    const rect = selectionService.getRange();
    if (rect) {
      const { r1, c1, r2, c2 } = rect;
      const res = splitAllInRange(model, r1, c1, r2, c2);
      if (res.ok) {
        console.log('[splitAllInRange] Разъединено областей:', res.processed);
        selectionService.clearRange();
        selectionService.select(r1, c1);
      } else {
        alert('Split ошибка: ' + res.error);
      }
      return;
    }
    const sel = selectionService.getSelected();
    if (!sel) { alert('Нет выбранной ячейки'); return; }
    const res = splitCell(model, sel.r, sel.c);
    if (!res.ok) { alert('Split ошибка: ' + res.error); return; }
    selectionService.clearRange();
    selectionService.select(sel.r, sel.c);
  });
  actionsBar.appendChild(unifiedSplitBtn);

  // --- ВСТАВКА СТРОК / СТОЛБЦОВ ---
  // Общая утилита получения координаты опорной точки (r1,c1) если есть диапазон
  function getAnchor() {
    const range = selectionService.getRange();
    if (range) return { r: range.r1, c: range.c1 };
    const sel = selectionService.getSelected();
    if (!sel) return { r: 0, c: 0 };
    // Если выделена ведущая объединённая ячейка и у неё rowSpan/colSpan >1, она остаётся якорем.
    return { r: sel.r, c: sel.c };
  }
  // Функции вычисления индексов вставки с учётом merge блока выбранной ведущей ячейки
  function resolveDownIndex(anchor) {
    // Если текущая выбранная ведущая ячейка имеет rowSpan>1 — вставляем после нижней границы блока
    const cell = model.getCell(anchor.r, anchor.c);
    if (cell && (cell.rowSpan || 1) > 1) {
      return cell.r + (cell.rowSpan || 1); // индекс строки ниже блока
    }
    return anchor.r + 1; // обычный случай
  }
  function resolveRightIndex(anchor) {
    const cell = model.getCell(anchor.r, anchor.c);
    if (cell && (cell.colSpan || 1) > 1) {
      return cell.c + (cell.colSpan || 1); // столбец сразу после блока
    }
    return anchor.c + 1;
  }

  // После структурной операции сбрасываем диапазон и выбираем anchor
  function postStructureSelect(anchor) {
    selectionService.clearRange();
    selectionService.select(anchor.r, anchor.c);
  }
  // Кнопка: вставить строку ВВЕРХ (перед текущей/anchor.r)
  const addRowUpBtn = document.createElement('button');
  addRowUpBtn.textContent = '+Row ↑';
  addRowUpBtn.classList.add('tg-btn');
  addRowUpBtn.addEventListener('click', () => {
    const anchor = getAnchor();
    bus.batch(() => {
      model.insertRows(anchor.r, 1);
      postStructureSelect(anchor); // Координаты anchor.r сохраняют относительную позицию
    });
  });
  actionsBar.appendChild(addRowUpBtn);

  // Кнопка: вставить строку ВНИЗ (после anchor.r) => index = anchor.r + 1
  const addRowDownBtn = document.createElement('button');
  addRowDownBtn.textContent = '+Row ↓';
  addRowDownBtn.classList.add('tg-btn');
  addRowDownBtn.addEventListener('click', () => {
    const anchor = getAnchor();
    bus.batch(() => {
      const insertIndex = resolveDownIndex(anchor);
      model.insertRows(insertIndex, 1);
      postStructureSelect(anchor);
    });
  });
  actionsBar.appendChild(addRowDownBtn);

  // Кнопка: вставить столбец СЛЕВА (перед anchor.c)
  const addColLeftBtn = document.createElement('button');
  addColLeftBtn.textContent = '+Col ←';
  addColLeftBtn.classList.add('tg-btn');
  addColLeftBtn.addEventListener('click', () => {
    const anchor = getAnchor();
    bus.batch(() => {
      model.insertColumns(anchor.c, 1);
      postStructureSelect(anchor);
    });
  });
  actionsBar.appendChild(addColLeftBtn);

  // Кнопка: вставить столбец СПРАВА (после anchor.c)
  const addColRightBtn = document.createElement('button');
  addColRightBtn.textContent = '+Col →';
  addColRightBtn.classList.add('tg-btn');
  addColRightBtn.addEventListener('click', () => {
    const anchor = getAnchor();
    bus.batch(() => {
      const insertIndex = resolveRightIndex(anchor);
      model.insertColumns(insertIndex, 1);
      postStructureSelect(anchor);
    });
  });
  actionsBar.appendChild(addColRightBtn);

  // --- УДАЛЕНИЕ СТРОК / СТОЛБЦОВ ---
  function deleteAnchorRow() {
    const range = selectionService.getRange();
    let anchor;
    if (range) {
      // По требованию: если есть range — сначала сворачиваем к ведущей ячейке (r1,c1)
      anchor = { r: range.r1, c: range.c1 };
      selectionService.clearRange();
      selectionService.select(anchor.r, anchor.c);
    } else {
      const sel = selectionService.getSelected();
      if (!sel) return;
      anchor = { r: sel.r, c: sel.c };
    }
    bus.batch(() => {
      const res = model.deleteRows(anchor.r, 1);
      if (!res.ok) {
        alert('Удаление строки отклонено: ' + res.reason);
        return;
      }
      // Корректируем координату выбора после удаления
      let newR = anchor.r;
      if (newR >= model.grid.rows) newR = model.grid.rows - 1;
      selectionService.select(newR, anchor.c);
    });
  }
  function deleteAnchorColumn() {
    const range = selectionService.getRange();
    let anchor;
    if (range) {
      anchor = { r: range.r1, c: range.c1 };
      selectionService.clearRange();
      selectionService.select(anchor.r, anchor.c);
    } else {
      const sel = selectionService.getSelected();
      if (!sel) return;
      anchor = { r: sel.r, c: sel.c };
    }
    bus.batch(() => {
      const res = model.deleteColumns(anchor.c, 1);
      if (!res.ok) {
        alert('Удаление столбца отклонено: ' + res.reason);
        return;
      }
      let newC = anchor.c;
      if (newC >= model.grid.cols) newC = model.grid.cols - 1;
      selectionService.select(anchor.r, newC);
    });
  }
  const delRowBtn = document.createElement('button');
  delRowBtn.textContent = '-Row';
  delRowBtn.classList.add('tg-btn');
  delRowBtn.addEventListener('click', deleteAnchorRow);
  actionsBar.appendChild(delRowBtn);

  const delColBtn = document.createElement('button');
  delColBtn.textContent = '-Col';
  delColBtn.classList.add('tg-btn');
  delColBtn.addEventListener('click', deleteAnchorColumn);
  actionsBar.appendChild(delColBtn);

  return { element: actionsBar };
}
