// setupActionBar.js
// Отвечает за создание панели действий (merge / split).
// Для джуниора: вынос в отдельный модуль снижает размер init.js и изолирует UI-команды.

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
  const { model, selectionService, validator } = ctx;
  const actionsBar = document.createElement('div');
  actionsBar.className = 'tablegen-actions-bar';
  actionsBar.style.marginTop = '8px';

  // Кнопка объединения диапазона
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
    selectionService.clearRange();
    selectionService.select(r1, c1);
  });
  actionsBar.appendChild(mergeRangeBtn);

  // Универсальная кнопка split
  const unifiedSplitBtn = document.createElement('button');
  unifiedSplitBtn.textContent = 'Разъединить';
  unifiedSplitBtn.style.marginLeft = '6px';
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

  return { element: actionsBar };
}
