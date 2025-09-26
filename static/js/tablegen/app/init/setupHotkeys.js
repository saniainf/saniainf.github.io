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
  const { history, model, inlineEditor, scheduler, bus, selectionService } = ctx;

  // Внутренний буфер для копирования значения ячейки (только текст, без классов / data / merge).
  // Новая логика:
  //  - Ctrl+C: всегда ТОЛЬКО копирует value выбранной ячейки в буфер.
  //  - Ctrl+V: если буфер не пуст и есть выбранная ячейка — вставляет значение (model.setCellValue).
  //  - В редактируемом input (inlineEditor.activeEditor) не вмешиваемся — пусть работает нативное копирование/вставка.
  let _copyBuffer = null; // { value:string }
  let _copySource = null; // 'r,c' последней скопированной ячейки (чтобы отличить повторное копирование от вставки)

  // Локальный helper больше не нужен: используем публичный метод model.applyDocument(doc, { emitEvent:false })
  // чтобы не генерировать лишнее событие structure:change (рендер инициируем вручную через scheduler.request()).

  function handleKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey; // поддержка Mac (Cmd)
    // Клавиатурная навигация (Этап 1): стрелки и Shift+стрелки для диапазона
    const arrowKeys = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
    if (arrowKeys.includes(e.key) && !mod) {
      // Если активен inline редактор — не перехватываем (даём курсору двигаться в тексте)
      if (inlineEditor.activeEditor) return;
      e.preventDefault();
      const dirMap = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right' };
      const dir = dirMap[e.key];
      if (e.shiftKey) {
        selectionService.extendRange(dir);
      } else {
        selectionService.clearRangeIfAny();
        selectionService.moveSelection(dir);
      }
      return; // больше ничего не обрабатывать для этого keydown
    }
    // Обработка очистки (Delete / Backspace) не требует ctrl/meta
    if (!mod) {
      // Очистка значений: Delete или Backspace (если не в inline input)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inlineEditor.activeEditor) {
        const sel = selectionService.getSelected?.();
        let rangeRect = null;
        if (typeof selectionService.hasRange === 'function' && selectionService.hasRange() && typeof selectionService.getRange === 'function') {
          rangeRect = selectionService.getRange();
        }
        if (!sel && !rangeRect) return; // нечего очищать
        e.preventDefault();
        // Группируем изменения чтобы получить один snapshot истории
        if (bus && typeof bus.batch === 'function') {
          bus.batch(() => {
            if (rangeRect) {
              const { r1, c1, r2, c2 } = rangeRect;
              for (let r = r1; r <= r2; r++) {
                for (let c = c1; c <= c2; c++) {
                  // Пропускаем покрытые merge и не создаём новую ячейку если её нет (value уже по умолчанию '')
                  const covered = !model.getCell(r, c) && selectionService.renderer && selectionService.renderer.isCoveredByMerge(r, c);
                  if (covered) continue;
                  const cell = model.getCell(r, c);
                  if (cell && cell.value !== '') {
                    model.setCellValue(r, c, '');
                  }
                }
              }
            } else if (sel) {
              const cell = model.getCell(sel.r, sel.c);
              if (cell && cell.value !== '') {
                model.setCellValue(sel.r, sel.c, '');
              }
            }
          });
        } else {
          // fallback без batch
            if (rangeRect) {
              const { r1, c1, r2, c2 } = rangeRect;
              for (let r = r1; r <= r2; r++) {
                for (let c = c1; c <= c2; c++) {
                  const covered = !model.getCell(r, c) && selectionService.renderer && selectionService.renderer.isCoveredByMerge(r, c);
                  if (covered) continue;
                  const cell = model.getCell(r, c);
                  if (cell && cell.value !== '') model.setCellValue(r, c, '');
                }
              }
            } else if (sel) {
              const cell = model.getCell(sel.r, sel.c);
              if (cell && cell.value !== '') model.setCellValue(sel.r, sel.c, '');
            }
        }
        return;
      }
      // Если нет модификатора и не обрабатывали очистку — дальше не идём (undo/redo/copy/paste требуют ctrl/meta)
      if (!mod) return;
    }

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

    // COPY (Ctrl+C) — только копирование в буфер
    if (!e.shiftKey && (code === 'KeyC' || e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С')) {
      if (inlineEditor.activeEditor) return; // даём нативному копированию работать внутри input
      e.preventDefault();
      const sel = selectionService.getSelected?.();
      if (!sel) return;
      const cell = model.getCell(sel.r, sel.c);
      const cellValue = cell ? cell.value : '';
      _copyBuffer = { value: cellValue };
      _copySource = sel.r + ',' + sel.c;
      bus?.emit('clipboard:copy', { r: sel.r, c: sel.c, value: cellValue });
      return; // не пропускаем дальше
    }

    // PASTE (Ctrl+V) — вставка значения из буфера (только value)
    if (!e.shiftKey && (code === 'KeyV' || e.key === 'v' || e.key === 'V' || e.key === 'м' || e.key === 'М')) {
      if (inlineEditor.activeEditor) return; // внутри input не мешаем
      if (!_copyBuffer) return; // нечего вставлять
      e.preventDefault();
      const sel = selectionService.getSelected?.();
      // Проверяем есть ли активный диапазон (hasRange) и получаем его прямоугольник
      let rangeRect = null;
      if (typeof selectionService.hasRange === 'function' && selectionService.hasRange() && typeof selectionService.getRange === 'function') {
        rangeRect = selectionService.getRange();
      }
      if (rangeRect) {
        // Вставка в диапазон: заливаем все доступные (не покрытые merge) координаты
        const { r1, c1, r2, c2 } = rangeRect;
        let count = 0;
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            // Пропускаем координаты, которые покрыты merge (не ведущие). renderer доступен через selectionService.
            const covered = !model.getCell(r, c) && selectionService.renderer && selectionService.renderer.isCoveredByMerge(r, c);
            if (covered) continue;
            // setCellValue меняет только поле value; rowSpan/colSpan/классы/data не трогаются.
            model.setCellValue(r, c, _copyBuffer.value);
            count++;
          }
        }
        bus?.emit('clipboard:paste', { from: _copySource, range: { r1, c1, r2, c2 }, cells: count, newValue: _copyBuffer.value });
      } else {
        if (!sel) return;
        const cell = model.getCell(sel.r, sel.c);
        const oldValue = cell ? cell.value : '';
        model.setCellValue(sel.r, sel.c, _copyBuffer.value);
        bus?.emit('clipboard:paste', { from: _copySource, to: sel.r + ',' + sel.c, newValue: _copyBuffer.value, oldValue });
      }
      return;
    }

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
