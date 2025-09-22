// setupDragRangeController.js
// Отвечает за логику выделения диапазона мышью (drag-select).
// Для джуниора: вынесение в модуль упрощает чтение init.js и делает возможной замену реализации.

/**
 * Регистрирует обработчики для выделения диапазона мышью.
 * @param {Object} ctx
 * @param {TableRenderer} ctx.renderer
 * @param {SelectionService} ctx.selectionService
 * @param {InlineEditor} ctx.inlineEditor
 * @returns {{destroy: function():void}}
 */
export function setupDragRangeController(ctx) {
  const { renderer, selectionService, inlineEditor } = ctx;
  const dragState = { active: false, suppressClick: false };

  function onTableClick(e) {
    if (dragState.active) return; // если только что завершили drag — клик игнорируем
    const td = e.target.closest('[data-r][data-c]');
    if (!td) return;
    selectionService.selectByTd(td);
  }

  function onMouseDown(e) {
    const td = e.target.closest('[data-r][data-c]');
    if (!td) return;
    const r = parseInt(td.dataset.r, 10);
    const c = parseInt(td.dataset.c, 10);
    if (Number.isNaN(r) || Number.isNaN(c)) return;

    if (inlineEditor.activeEditor) {
      const { td: editingTd, input } = inlineEditor.activeEditor;
      const sameCell = editingTd === td;
      const clickedInsideInput = e.target === input || editingTd.contains(e.target);
      if (!sameCell) {
        inlineEditor.commitIfAny();
      } else if (clickedInsideInput) {
        dragState.active = false;
        return; // пользователь выделяет текст в input — не запускаем drag
      }
    }
    dragState.active = true;
    dragState.suppressClick = true;
    selectionService.startRange(r, c);
    selectionService.select(r, c);
    e.preventDefault();
  }

  function onMouseOver(e) {
    if (!dragState.active) return;
    const td = e.target.closest('[data-r][data-c]');
    if (!td) return;
    const r = parseInt(td.dataset.r, 10);
    const c = parseInt(td.dataset.c, 10);
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    selectionService.updateRange(r, c);
  }

  function onMouseUp() {
    if (!dragState.active) return;
    dragState.active = false;
    const rect = selectionService.commitRange();
    setTimeout(() => { dragState.suppressClick = false; }, 0);
    if (rect) {
      console.log('Диапазон выбран:', rect);
    }
  }

  renderer.tableEl.addEventListener('click', onTableClick);
  renderer.tableEl.addEventListener('mousedown', onMouseDown);
  renderer.tableEl.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mouseup', onMouseUp);

  return {
    destroy() {
      renderer.tableEl.removeEventListener('click', onTableClick);
      renderer.tableEl.removeEventListener('mousedown', onMouseDown);
      renderer.tableEl.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseup', onMouseUp);
    }
  };
}
