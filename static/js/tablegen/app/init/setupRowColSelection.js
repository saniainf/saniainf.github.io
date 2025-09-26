// setupRowColSelection.js
// Делегированный обработчик кликов по номерам строк и столбцов для полного выделения.
// Для джуниора: мы не навешиваем обработчик на каждую ячейку заголовка, а слушаем один click
// на <table> и определяем по class / data-* что именно нажали.

/**
 * Инициализирует обработчики выбора целых строк / столбцов.
 * @param {Object} ctx
 * @param {import('../SelectionService.js').SelectionService} ctx.selectionService
 * @param {import('../TableRenderer.js').TableRenderer} ctx.renderer
 * @returns {{destroy:Function}}
 */
export function setupRowColSelection(ctx) {
  const { selectionService, renderer } = ctx;
  const table = renderer.tableEl;

  function onClick(e) {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    // Клик по номеру столбца (thead) — th с class 'tablegen-col-header' и data-col
    if (target.classList.contains('tablegen-col-header') && target.dataset.col) {
      const col = parseInt(target.dataset.col, 10);
      if (!Number.isNaN(col)) {
        selectionService.selectFullColumn(col);
        e.preventDefault();
        return;
      }
    }
    // Клик по номеру строки (th в tbody или в headerRows) — class 'tablegen-row-header' и data-row
    if (target.classList.contains('tablegen-row-header') && target.dataset.row) {
      const row = parseInt(target.dataset.row, 10);
      if (!Number.isNaN(row)) {
        selectionService.selectFullRow(row);
        e.preventDefault();
        return;
      }
    }
  }

  table.addEventListener('click', onClick);

  return {
    destroy() { table.removeEventListener('click', onClick); }
  };
}
