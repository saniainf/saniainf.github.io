// SelectionService.js
// Сервис выбора ячеек. Управляет текущей выделенной ячейкой и оповещает других через EventBus.
// Для джуниора: вынесение логики выбора упрощает InlineEditor и SidePanel.

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
   * Выбрать ячейку по DOM td
   * @param {HTMLTableCellElement} td
   */
  selectByTd(td) {
    if (!td) return;
    const r = parseInt(td.dataset.r, 10);
    const c = parseInt(td.dataset.c, 10);
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
   * Явно пере-применить визуализацию диапазона (если он есть).
   * Для джуниора: при полном перерисовывании таблицы (<table> пересоздаётся) мы теряем DOM-элементы
   * с классами выделения диапазона. Поэтому после render() нужно вызвать этот метод, чтобы снова
   * пробежаться по координатам диапазона и навесить CSS-классы. Важно: мы не пересчитываем сам диапазон,
   * а только визуально восстанавливаем его исходя из сохранённых координат anchor/active.
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
   * Внутренний поиск td по координатам
   */
  _findCellElement(r, c) {
    return this.renderer.tableEl.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
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
        td.classList.remove('tablegen-range-border-top');
        td.classList.remove('tablegen-range-border-bottom');
        td.classList.remove('tablegen-range-border-left');
        td.classList.remove('tablegen-range-border-right');
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
        td.classList.remove('tablegen-range-border-top');
        td.classList.remove('tablegen-range-border-bottom');
        td.classList.remove('tablegen-range-border-left');
        td.classList.remove('tablegen-range-border-right');
      }
      this.rangeCellsCache = [];
    }
    const rect = this.getRangeRect();
    if (!rect) return;
    const cells = this._collectRangeCells(rect);
    this.rangeCellsCache = cells;

    // Добавляем базовый класс
    for (const td of cells) {
      td.classList.add('tablegen-range-cell');
    }

    // Добавляем рамки по периметру (чтобы выделение было визуально чётким)
    for (const td of cells) {
      const r = parseInt(td.dataset.r, 10);
      const c = parseInt(td.dataset.c, 10);
      if (r === rect.r1) td.classList.add('tablegen-range-border-top');
      if (r === rect.r2) td.classList.add('tablegen-range-border-bottom');
      if (c === rect.c1) td.classList.add('tablegen-range-border-left');
      if (c === rect.c2) td.classList.add('tablegen-range-border-right');
    }
  }

  /** Есть ли активный диапазон */
  hasRange() {
    return !!(this.rangeMode && this.rangeAnchor && this.rangeActive);
  }

  /** Получить координаты диапазона или null */
  getRange() {
    return this.getRangeRect();
  }
}
