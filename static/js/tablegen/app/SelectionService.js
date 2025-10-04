// SelectionService.js
// Управляет выбором ячеек: текущая ведущая ячейка, диапазоны, события для других модулей.

/**
 * SelectionService отвечает за:
 *  - хранение выбранной ведущей ячейки
 *  - визуальное применение класса подсветки
 *  - валидацию (не выбирать скрытые merge-ячейки)
 *  - оповещение через bus.emit('selection:change', {r,c, cell})
 */
export class SelectionService {
  /**
   * @param {TableModel} model
   * @param {TableRenderer} renderer
   * @param {EventBus} bus
   */
  constructor(model, renderer, bus) {
    this.model = model;
    this.renderer = renderer;
    this.bus = bus;
    this.selected = null; // {r,c}
    this.rangeAnchor = null; // {r,c}
    this.rangeActive = null; // {r,c}
    this.rangeMode = false;
    this.rangeCellsCache = [];
  // Клавиатурная навигация использует вспомогательные методы ниже.
  }

  /**
   * Снять текущее выделение
   */
  clear() {
    if (this.selected) {
      const prev = this._findCellElement(this.selected.r, this.selected.c);
      if (prev) prev.classList.remove('tablegen-selected-cell');
      this.selected = null;
      this.bus.emit('selection:change', { r: null, c: null, cell: null });
    }
  }

  /**
   * Выбрать ячейку по DOM элементу (td/любая ячейка с data-r,data-c).
   * Старое имя selectByTd оставлено для обратной совместимости вызовов из других модулей.
   * @param {HTMLElement} el
   */
  selectByTd(el) { // обратная совместимость
    if (!el) return;
    const r = parseInt(el.dataset.r, 10);
    const c = parseInt(el.dataset.c, 10);
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    this.select(r, c);
  }

  /**
   * Выбрать ячейку по координатам
   * @param {number} r
   * @param {number} c
   */
  select(r, c) {
    // Проверка скрытой merge части
    if (!this.model.getCell(r, c) && this.renderer.isCoveredByMerge(r, c)) return;
    const same = this.selected && this.selected.r === r && this.selected.c === c;
    if (!same && this.selected) {
      // Снимаем подсветку со старой ячейки если координаты меняются
      const prev = this._findCellElement(this.selected.r, this.selected.c);
      if (prev) prev.classList.remove('tablegen-selected-cell');
    }
    // Обновляем состояние (даже если same — нужно восстановить класс после полного render())
    this.selected = { r, c };
    const el = this._findCellElement(r, c);
    if (el && !el.classList.contains('tablegen-selected-cell')) {
      el.classList.add('tablegen-selected-cell');
    }
    // Если нет реального диапазона (мульти) — гарантированно убираем остаточный класс range с этой ячейки
    if (el && !this.hasRange()) {
      el.classList.remove('tablegen-range-cell');
    }
    // Очищаем потенциальные «застрявшие» подсветки других ячеек (robustness)
    this._cleanupStaleSelectionHighlights(r, c);
    const cell = this.model.getCell(r, c) || null;
    // Шлём событие только если выбор изменился ИЛИ если раньше подсветка могла пропасть (el получил класс заново)
    if (!same || (same && el)) {
      this.bus.emit('selection:change', { r, c, cell });
    }
  }

  /**
   * Явно пере-применить подсветку текущей выбранной ячейки (используется, если нужно восстановить после массового render()).
   */
  reapplySelection() {
    if (!this.selected) return;
    const { r, c } = this.selected;
    this.select(r, c); // select уже содержит логику повторного применения
  }

  /**
   * Явно пере-применить визуализацию диапазона (если он есть) после полного re-render.
   */
  reapplyRange() {
    if (!this.hasRange()) return;
    this._applyRangeVisual();
  }

  /**
   * Возвращает текущую выбранную ведущую ячейку (или null)
   */
  getSelected() {
    if (!this.selected) return null;
    const cell = this.model.getCell(this.selected.r, this.selected.c) || null;
    return { ...this.selected, cell };
  }

  /**
   * Внутренний поиск элемента ячейки по координатам.
   * Раньше мы искали только td, но после добавления редактируемых ячеек в шапке
   * (которые теперь тоже имеют data-r / data-c) достаточно искать любой элемент с этими data-атрибутами.
   */
  _findCellElement(r, c) {
    return this.renderer.tableEl.querySelector(`[data-r="${r}"][data-c="${c}"]`);
  }

  /** Начать выделение диапазона (anchor) */
  startRange(r, c) {
    // Сбрасываем предыдущий диапазон
    this.clearRange();
    this.rangeAnchor = { r, c };
    this.rangeActive = { r, c };
    this.rangeMode = true;
    this._applyRangeVisual();
  }

  /** Обновить активную точку диапазона (при движении мышью) */
  updateRange(r, c) {
    if (!this.rangeMode || !this.rangeAnchor) return;
    // Если координаты не меняются — пропускаем
    if (this.rangeActive && this.rangeActive.r === r && this.rangeActive.c === c) return;
    this.rangeActive = { r, c };
    this._applyRangeVisual();
  }

  /** Завершить диапазон и зафиксировать событие */
  commitRange() {
    if (!this.rangeMode || !this.rangeAnchor || !this.rangeActive) return null;
    const rect = this.getRangeRect();
    const cells = this._collectRangeCells(rect);
    this.bus.emit('selection:range', { ...rect, cells });
    return rect;
  }

  /** Отменить текущий диапазон */
  cancelRange() {
    this.clearRange();
  }

  /** Получить прямоугольник текущего диапазона */
  getRangeRect() {
    if (!this.rangeAnchor || !this.rangeActive) return null;
    const r1 = Math.min(this.rangeAnchor.r, this.rangeActive.r);
    const r2 = Math.max(this.rangeAnchor.r, this.rangeActive.r);
    const c1 = Math.min(this.rangeAnchor.c, this.rangeActive.c);
    const c2 = Math.max(this.rangeAnchor.c, this.rangeActive.c);
    return { r1, c1, r2, c2 };
  }

  /** Очистить визуальное и логическое состояние диапазона */
  clearRange() {
    // Убираем классы
    if (this.rangeCellsCache.length) {
      for (const td of this.rangeCellsCache) {
        td.classList.remove('tablegen-range-cell');
      }
    }
    this.rangeCellsCache = [];
    this.rangeAnchor = null;
    this.rangeActive = null;
    this.rangeMode = false;
  }

  /** Собрать td ячейки внутри диапазона */
  _collectRangeCells({ r1, c1, r2, c2 }) {
    const tds = [];
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        // Пропускаем скрытые merge ячейки
        if (!this.model.getCell(r, c) && this.renderer.isCoveredByMerge(r, c)) continue;
        const td = this._findCellElement(r, c);
        if (td) tds.push(td);
      }
    }
    return tds;
  }

  /** Применить визуальную подсветку диапазона */
  _applyRangeVisual() {
    // Сначала очищаем предыдущий диапазон
    if (this.rangeCellsCache.length) {
      for (const td of this.rangeCellsCache) {
        td.classList.remove('tablegen-range-cell');
      }
      this.rangeCellsCache = [];
    }
    const rect = this.getRangeRect();
    if (!rect) return;
    // Если диапазон формально существует как anchor==active (1x1) — не подсвечиваем его как range.
    // Таким образом одиночный клик не оставляет tablegen-range-cell.
    if (!(this.hasRange())) return;
    const cells = this._collectRangeCells(rect);
    this.rangeCellsCache = cells;

    // Добавляем базовый класс
    for (const td of cells) {
      td.classList.add('tablegen-range-cell');
    }

    // Рамки больше не используются — оставляем только заливку класса tablegen-range-cell.
  }

  // Удалён ранний вариант hasRange (ниже в файле есть финальный, учитывающий протяжённость диапазона)

  /** Получить координаты диапазона или null */
  getRange() {
    return this.getRangeRect();
  }

  /**
   * Выделить полностью одну строку как диапазон (range) + установить выбранную ячейку на первый столбец.
   * @param {number} r Индекс строки
   */
  selectFullRow(r) {
    if (r < 0 || r >= this.model.grid.rows) return;
    // Сбрасываем предыдущее выделение диапазона
    this.clearRange();
    // Выбираем первую видимую ячейку строки как selected
    this.select(r, 0);
    // Устанавливаем диапазон от (r,0) до (r, lastCol)
    this.rangeAnchor = { r, c: 0 };
    this.rangeActive = { r, c: this.model.grid.cols - 1 };
    this.rangeMode = true;
    this._applyRangeVisual();
  }

  /**
   * Выделить полностью один столбец как диапазон (range) + установить выбранную ячейку на первую строку (после шапки если она есть).
   * @param {number} c Индекс столбца
   */
  selectFullColumn(c) {
    if (c < 0 || c >= this.model.grid.cols) return;
    this.clearRange();
    // Начальная строка для выбора — 0 (включая шапку, чтобы поведение было единообразным).
    this.select(0, c);
    this.rangeAnchor = { r: 0, c };
    this.rangeActive = { r: this.model.grid.rows - 1, c };
    this.rangeMode = true;
    this._applyRangeVisual();
  }

  /**
   * Переместить выделение на соседнюю ячейку по направлению.
   * direction: 'up'|'down'|'left'|'right'
   */
  moveSelection(direction) {
    if (!this.selected) return;
    // Если был активный диапазон (например, созданный мышью), при обычном перемещении (без Shift)
    // очищаем его, чтобы не оставался визуальный прямоугольник прошлого выделения.
    this.clearRangeIfAny();
    const target = this._resolveNavigationTarget(this.selected.r, this.selected.c, direction, /*rangeMode*/ false);
    if (!target) return;
    this.select(target.r, target.c);
    this._scrollIntoView(target.r, target.c);
  }

  /** Расширить или начать диапазон в заданном направлении (Shift + стрелка) */
  extendRange(direction) {
    if (!this.selected) return;
    if (!this.hasRange()) {
      // Начинаем новый диапазон с anchor = текущая выбранная ячейка
      this.rangeAnchor = { r: this.selected.r, c: this.selected.c };
      this.rangeActive = { r: this.selected.r, c: this.selected.c };
      this.rangeMode = true;
    }
    // Используем ту же логику навигации, но не меняем selected (активная точка диапазона движется). 
    const nav = this._resolveNavigationTarget(this.rangeActive.r, this.rangeActive.c, direction, /*rangeMode*/ true);
    if (!nav) return;
    this.rangeActive = { r: nav.r, c: nav.c };
    this._applyRangeVisual();
    // Эмитим событие чтобы SidePanel и другие подписчики обновились
    const rect = this.getRangeRect();
    const cells = this._collectRangeCells(rect);
    this.bus.emit('selection:range', { ...rect, cells });
    this._scrollIntoView(nav.r, nav.c);
  }

  /** Сброс диапазона при обычном движении без Shift */
  clearRangeIfAny() {
    if (this.hasRange()) this.clearRange();
  }

  /** Есть ли выделение диапазона (реальное, не только anchor) */
  hasRange() {
    return !!(this.rangeMode && this.rangeAnchor && this.rangeActive && (this.rangeAnchor.r !== this.rangeActive.r || this.rangeAnchor.c !== this.rangeActive.c));
  }

  /** Прокрутить выбранную координату в видимую область */
  _scrollIntoView(r, c) {
    const el = this._findCellElement(r, c);
    if (!el) return;
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* безопасно игнорируем */ }
  }

  /**
   * Удаляет лишние элементы с классом .tablegen-selected-cell кроме текущей.
   * Это страховка от возможных расхождений, если внешние модули модифицировали DOM.
   * @param {number} r
   * @param {number} c
   */
  _cleanupStaleSelectionHighlights(r, c) {
    if (!this.renderer || !this.renderer.tableEl) return;
    const nodes = this.renderer.tableEl.querySelectorAll('.tablegen-selected-cell');
    if (!nodes || nodes.length <= 1) return;
    for (const node of nodes) {
      const rr = parseInt(node.dataset.r, 10);
      const cc = parseInt(node.dataset.c, 10);
      if (rr !== r || cc !== c) node.classList.remove('tablegen-selected-cell');
    }
  }

  /**
   * Определить целевую координату навигации с учётом merged блоков.
   * Логика:
   *  1. Сначала берём «обычный» сосед (r+/-1 или c+/-1).
   *  2. Если это ведущая ячейка (или не merge вовсе) — возвращаем её.
   *  3. Если это покрытая (внутренняя) часть merge-блока:
   *     3.1 Если мы сейчас на ведущей ячейке ЭТОГО ЖЕ блока и движемся внутрь — перепрыгиваем КРАЙ блока (полностью выходим за пределы merge).
   *     3.2 Если мы снаружи блока — входим в блок через его ведущую ячейку (owner.r, owner.c).
   *  4. При выходе за пределы блока (п.3.1) может случиться, что новая координата снова находится внутри другого блока (его покрытая часть). В таком случае повторяем обработку (цикл, ограниченный по числу итераций для безопасности).
   *  5. Если попытка выйти «за границы» таблицы — возвращаем null.
   * @param {number} r Текущая строка
   * @param {number} c Текущий столбец
   * @param {'up'|'down'|'left'|'right'} direction
   * @param {boolean} rangeMode true если вызвано из extendRange (выделяем активную точку диапазона)
   * @returns {{r:number,c:number}|null}
   */
  _resolveNavigationTarget(r, c, direction, rangeMode) {
    // Вычисляем базовый шаг
    let nr = r, nc = c;
    if (direction === 'up') nr = r - 1; else if (direction === 'down') nr = r + 1; else if (direction === 'left') nc = c - 1; else if (direction === 'right') nc = c + 1;
    // Проверка границ сразу — если вне таблицы, навигация невозможна
    if (nr < 0 || nr >= this.model.grid.rows || nc < 0 || nc >= this.model.grid.cols) return null;

    // Вспомогательные функции внутри для читабельности
    const isLeading = (rr, cc) => {
      const cell = this.model.getCell(rr, cc);
      if (!cell) return false;
      const rs = cell.rowSpan || 1;
      const cs = cell.colSpan || 1;
      return rs > 1 || cs > 1; // ведущая merge (или обычная если оба =1, но для merge логики нужно именно rs>1||cs>1)
    };
    const findOwner = (rr, cc) => {
      // Если координата не покрыта merge — возвращаем null
      if (!this.renderer.isCoveredByMerge(rr, cc)) return null;
      // Линейный поиск по ведущим ячейкам (их обычно мало). Ищем ту, чья область покрывает (rr,cc).
      for (const cell of this.model.cells) {
        const rs = cell.rowSpan || 1; const cs = cell.colSpan || 1;
        if (rs === 1 && cs === 1) continue; // не merge
        if (rr >= cell.r && rr < cell.r + rs && cc >= cell.c && cc < cell.c + cs) return cell;
      }
      return null; // теоретически не должно случиться
    };
    const currentCell = this.model.getCell(r, c);
    const currentIsLeadingMerge = currentCell && ((currentCell.rowSpan || 1) > 1 || (currentCell.colSpan || 1) > 1);

    // Итерационный процесс: максимум 5 попыток (должно хватить даже при каскаде соседних merge блоков)
    for (let i = 0; i < 5; i++) {
      const targetCell = this.model.getCell(nr, nc);
      const covered = !targetCell && this.renderer.isCoveredByMerge(nr, nc);
      if (!covered) {
        // Не покрыто: либо обычная ячейка, либо ведущая merge, либо пустая (создать можно позднее) — можно переходить
        return { r: nr, c: nc };
      }
      // covered === true
      const owner = findOwner(nr, nc);
      if (!owner) return null; // аномалия
      const ownerRect = { r1: owner.r, r2: owner.r + (owner.rowSpan || 1) - 1, c1: owner.c, c2: owner.c + (owner.colSpan || 1) - 1 };
      const weAreOwner = currentIsLeadingMerge && currentCell.r === owner.r && currentCell.c === owner.c;
      if (weAreOwner) {
        // Мы стоим на ведущей ячейке ЭТОГО блока и двигаемся внутрь -> перепрыгиваем блок целиком
        if (direction === 'right') {
          nc = ownerRect.c2 + 1;
          if (nc >= this.model.grid.cols) return null;
        } else if (direction === 'left') {
          nc = ownerRect.c1 - 1;
          if (nc < 0) return null;
        } else if (direction === 'down') {
          nr = ownerRect.r2 + 1;
          if (nr >= this.model.grid.rows) return null;
        } else if (direction === 'up') {
          nr = ownerRect.r1 - 1;
          if (nr < 0) return null;
        }
        // Продолжим цикл — проверим новую координату (вдруг она покрыта другим merge)
        continue;
      } else {
        // Мы стоим вне блока и хотим войти в него -> переходим на ведущую ячейку блока
        nr = owner.r; nc = owner.c;
        return { r: nr, c: nc };
      }
    }
    return null; // не нашли корректную точку (маловероятно)
  }
}
