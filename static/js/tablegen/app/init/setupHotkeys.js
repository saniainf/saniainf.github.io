// setupHotkeys.js
// Отвечает за регистрацию горячих клавиш undo/redo.
// Для джуниора: вынос в отдельный модуль уменьшает размер init.js и делает возможной
// замену или расширение горячих клавиш без правок точки входа.


/**
 * Регистрирует обработчик клавиатуры для undo/redo.
 * Ctrl+Z  / Cmd+Z      -> undo
 * Ctrl+Y  / Cmd+Y      -> redo
 * Ctrl+Shift+Z / Cmd+Shift+Z -> redo
 * @param {Object} ctx Контекст
 * @param {HistoryService} ctx.history История изменений
 * @param {TableModel} ctx.model Текущая модель (будет обновляться полями при undo/redo)
 * @param {InlineEditor} ctx.inlineEditor Inline редактор — нужно отменять редактирование при переключении состояний
 * @param {RenderScheduler} ctx.scheduler Планировщик рендера
 * @param {EventBus} ctx.bus Шина событий (используется при создании новой модели для восстановления индексирования)
 * @returns {{destroy: function():void}} Для возможности отписки при демонтаже
 */
export function setupHotkeys(ctx) {
  const { history, model, inlineEditor, scheduler, bus } = ctx;

  // Локальный helper больше не нужен: используем публичный метод model.applyDocument(doc, { emitEvent:false })
  // чтобы не генерировать лишнее событие structure:change (рендер инициируем вручную через scheduler.request()).

  function handleKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey; // поддержка Mac (Cmd)
    if (!mod) return;

    // Для независимости от раскладки используем e.code (физическая клавиша) и дополнительный fallback по символам.
    // Объяснение:
    //  - При английской раскладке Z -> e.key === 'z', e.code === 'KeyZ'
    //  - При русской раскладке та же физическая клавиша даёт e.key === 'я', но e.code сохранит 'KeyZ'
    //  - Аналогично для Y: на русской раскладке физическая Y даёт 'н', но e.code === 'KeyY'
    const code = e.code; // 'KeyZ', 'KeyY', ...
    const key = e.key;   // раскладко-зависимое значение

    // Вычисляем флаги логически на основе кода клавиши или допустимых символов (англ/рус регистронезависимо).
    const isZ = code === 'KeyZ' || key === 'z' || key === 'Z' || key === 'я' || key === 'Я';
    const isY = code === 'KeyY' || key === 'y' || key === 'Y' || key === 'н' || key === 'Н';

    // Undo: Ctrl+Z / Cmd+Z (Shift не зажат)
    if (!e.shiftKey && isZ) {
      e.preventDefault();
      const doc = history.undo();
      if (doc) {
        history.restore((d) => {
          if (inlineEditor.activeEditor) inlineEditor.cancelIfAny();
          model.applyDocument(d, { emitEvent: false });
          scheduler.request(); // вручную инициируем перерисовку без лишнего события
        }, doc);
      }
      return;
    }

    // Redo: Ctrl+Y / Cmd+Y ИЛИ Ctrl+Shift+Z / Cmd+Shift+Z (учитываем обе раскладки)
    if (isY || (isZ && e.shiftKey)) {
      e.preventDefault();
      const doc = history.redo();
      if (doc) {
        history.restore((d) => {
          if (inlineEditor.activeEditor) inlineEditor.cancelIfAny();
          model.applyDocument(d, { emitEvent: false });
          scheduler.request();
        }, doc);
      }
    }
  }

  document.addEventListener('keydown', handleKeyDown);

  return {
    destroy() {
      document.removeEventListener('keydown', handleKeyDown);
    }
  };
}
