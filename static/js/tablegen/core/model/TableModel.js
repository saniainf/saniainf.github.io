// TableModel.js
// Модель данных таблицы. Хранит только ведущие ячейки (top-left) для объединённых областей.
// Для джуниора: ведущая ячейка — это та, у которой есть реальные rowSpan/colSpan. Остальные ячейки
// внутри объединённого диапазона физически в массиве не хранятся.

/**
 * @typedef {Object} TableMeta
 * @property {string} name - Имя таблицы
 * @property {string} [createdUtc]
 * @property {string} [notes]
 */

/**
 * @typedef {Object} TableGrid
 * @property {number} rows
 * @property {number} cols
 */

/**
 * @typedef {Object} TableCell
 * @property {number} r - индекс строки (0-based)
 * @property {number} c - индекс столбца (0-based)
 * @property {string} value - содержимое ячейки (может быть пустой строкой)
 * @property {number} [rowSpan] - высота объединения (>=1)
 * @property {number} [colSpan] - ширина объединения (>=1)
 * @property {string[]} [classes] - список CSS классов
 * @property {Object.<string,string>} [data] - data-* атрибуты (ключ без приставки data-)
 */

/**
 * @typedef {Object} TableDocument
 * @property {number} version - версия схемы JSON (сейчас 1)
 * @property {TableMeta} meta
 * @property {TableGrid} grid
 * @property {TableCell[]} cells
 */

export class TableModel {
  /**
   * @param {TableDocument} doc - десериализованный объект документа таблицы
   * @param {import('../events/EventBus.js').EventBus} eventBus - шина событий
   */
  constructor(doc, eventBus) {
    this.version = doc.version || 1;
    this.meta = { ...doc.meta };
  // Добавляем поддержку количества строк пользовательской шапки (headerRows)
  this.grid = { rows: doc.grid.rows, cols: doc.grid.cols, headerRows: doc.grid.headerRows ? doc.grid.headerRows : 0 };
    // Клонируем ячейки, чтобы избежать мутаций исходного объекта
    this.cells = (doc.cells || []).map(c => ({ ...c }));
    this.bus = eventBus;
    this._rebuildIndex();
  }

  // Строим быстрый индекс для поиска ячейки по координате
  _rebuildIndex() {
    this._index = new Map(); // key: "r,c"
    for (const cell of this.cells) {
      this._index.set(cell.r + ',' + cell.c, cell);
    }
  }

  /**
   * Получить ячейку по координатам (только ведущие)
   * @param {number} r
   * @param {number} c
   * @returns {TableCell|undefined}
   */
  getCell(r, c) {
    return this._index.get(r + ',' + c);
  }

  /**
   * Убедиться что таблица имеет не меньше указанных размеров
   * @param {number} rows
   * @param {number} cols
   */
  ensureSize(rows, cols) {
    let changed = false;
    if (rows > this.grid.rows) { this.grid.rows = rows; changed = true; }
    if (cols > this.grid.cols) { this.grid.cols = cols; changed = true; }
    if (changed) {
      this.bus?.emit('structure:change', { type: 'resize', rows: this.grid.rows, cols: this.grid.cols });
    }
  }

  /**
   * Установить количество строк пользовательской шапки (должно быть в пределах 0..rows).
   * Эти строки будут визуально рендериться в секции thead (после строки нумерации столбцов).
   * @param {number} count
   */
  setHeaderRows(count) {
    const n = Math.max(0, Math.min(this.grid.rows, Number(count) || 0));
    if (n === this.grid.headerRows) return;
    this.grid.headerRows = n;
    this.bus?.emit('structure:change', { type: 'headerRows', headerRows: n });
  }

  /**
   * Установить имя таблицы (meta.name). Пустое имя игнорируем, чтобы не затирать существующее случайно.
   * @param {string} name
   */
  setTableName(name) {
    const newName = (name || '').trim();
    if (!newName || newName === this.meta.name) return;
    const oldName = this.meta.name;
    this.meta.name = newName;
    this.bus?.emit('structure:change', { type: 'meta', field: 'name', oldValue: oldName, newValue: newName });
  }

  /**
   * Установить значение ячейки. Создаём ячейку если её нет.
   * @param {number} r
   * @param {number} c
   * @param {string} value
   */
  setCellValue(r, c, value) {
    let cell = this.getCell(r, c);
    if (!cell) {
      cell = { r, c, value: '', rowSpan: 1, colSpan: 1 };
      this.cells.push(cell);
      this._index.set(r + ',' + c, cell);
    }
    const oldValue = cell.value;
    cell.value = value;
    this.bus?.emit('cell:change', { r, c, field: 'value', oldValue, newValue: value });
  }

  /**
   * Установить CSS классы ячейки
   * @param {number} r
   * @param {number} c
   * @param {string[]} classes
   */
  setCellClasses(r, c, classes) {
    let cell = this.getCell(r, c);
    if (!cell) {
      cell = { r, c, value: '', rowSpan: 1, colSpan: 1 };
      this.cells.push(cell);
      this._index.set(r + ',' + c, cell);
    }
    const oldValue = cell.classes ? [...cell.classes] : undefined;
    cell.classes = classes && classes.length ? [...classes] : undefined;
    this.bus?.emit('cell:change', { r, c, field: 'classes', oldValue, newValue: cell.classes });
  }

  /**
   * Установить data-* атрибуты
   * @param {number} r
   * @param {number} c
   * @param {Object.<string,string>} data
   */
  setCellData(r, c, data) {
    let cell = this.getCell(r, c);
    if (!cell) {
      cell = { r, c, value: '', rowSpan: 1, colSpan: 1 };
      this.cells.push(cell);
      this._index.set(r + ',' + c, cell);
    }
    const oldValue = cell.data ? { ...cell.data } : undefined;
    cell.data = data && Object.keys(data).length ? { ...data } : undefined;
    this.bus?.emit('cell:change', { r, c, field: 'data', oldValue, newValue: cell.data });
  }

  /**
   * Сериализация в JSON документ
   * Фильтруем тривиальные пустые ячейки (нет значений, классов, data и нет merge)
   * @returns {TableDocument}
   */
  toJSON() {
    return {
      version: this.version,
      meta: { ...this.meta },
  grid: { rows: this.grid.rows, cols: this.grid.cols, headerRows: this.grid.headerRows || 0 },
      cells: this.cells
        .filter(c => c.rowSpan !== 1 || c.colSpan !== 1 || c.value !== '' || (c.classes && c.classes.length) || (c.data && Object.keys(c.data).length))
        .map(c => ({ ...c }))
    };
  }

  /**
   * Глубокое копирование модели (для undo/redo)
   * @returns {TableModel}
   */
  clone() {
    const doc = JSON.parse(JSON.stringify(this.toJSON()));
    return new TableModel(doc, this.bus);
  }

  /**
   * Применяет переданный документ (snapshot) к текущей модели IN-PLACE, не меняя ссылку на объект.
   * Для джуниора: это важно, потому что остальные сервисы (renderer, selectionService и т.д.)
   * держат ссылки на текущий экземпляр модели. Если бы мы сделали new TableModel(), пришлось бы
   * обновлять ссылки повсюду. Здесь мы просто перезаписываем поля.
   * @param {TableDocument} doc Документ из истории / импорта
   * @param {Object} [opts]
   * @param {boolean} [opts.emitEvent=true] Эмитить ли событие structure:change после применения
   * @returns {boolean} Успех применения
   */
  applyDocument(doc, opts = {}) {
    const { emitEvent = true } = opts;
    if (!doc || !doc.grid || typeof doc.grid.rows !== 'number' || typeof doc.grid.cols !== 'number') {
      console.error('[TableModel.applyDocument] Некорректный документ', doc);
      return false;
    }
    // Переносим базовые поля. Клонируем, чтобы избежать непреднамеренных мутаций исходного doc.
    this.version = doc.version || this.version || 1;
    this.meta = doc.meta ? { ...doc.meta } : {};
  this.grid = { rows: doc.grid.rows, cols: doc.grid.cols, headerRows: doc.grid.headerRows ? doc.grid.headerRows : 0 };
    this.cells = Array.isArray(doc.cells) ? doc.cells.map(c => ({ ...c })) : [];
    this._rebuildIndex();
    if (emitEvent) {
      this.bus?.emit('structure:change', { type: 'applyDocument' });
    }
    return true;
  }
}
