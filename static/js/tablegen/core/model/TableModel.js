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
    // Добавляем поддержку количества строк пользовательской шапки (headerRows).
    // columnSizes (ЕДИНСТВЕННАЯ АКТУАЛЬНАЯ СХЕМА): массив объектов { v:number, u:'px'|'ratio' }.
    // Обратной совместимости со старым форматом {mode, values} больше НЕТ —
    // если придёт что‑то отличное от массива корректных объектов, настройка будет проигнорирована.
    let normalizedColumnSizes = null;
    if (Array.isArray(doc.grid.columnSizes)) {
      normalizedColumnSizes = doc.grid.columnSizes
        .filter(x => x && typeof x.v === 'number' && (x.u === 'px' || x.u === 'ratio'))
        .map(x => ({ v: x.v, u: x.u }));
      // Если после фильтрации массив опустел, просто храним null (будет трактоваться как размеры по умолчанию)
      if (!normalizedColumnSizes.length) normalizedColumnSizes = null;
    }
    this.grid = {
      rows: doc.grid.rows,
      cols: doc.grid.cols,
      headerRows: doc.grid.headerRows ? doc.grid.headerRows : 0,
      columnSizes: normalizedColumnSizes
    };
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
    if (cols > this.grid.cols) {
      // Расширяем массив columnSizes значениями по умолчанию (1 ratio)
      if (this.grid.columnSizes) {
        for (let i = this.grid.cols; i < cols; i++) {
          this.grid.columnSizes.push({ v: 1, u: 'ratio' });
        }
      }
      this.grid.cols = cols;
      changed = true;
    }
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
      grid: {
        rows: this.grid.rows,
        cols: this.grid.cols,
        headerRows: this.grid.headerRows || 0,
        ...(this.grid.columnSizes ? { columnSizes: this.grid.columnSizes.map(cs => ({ v: cs.v, u: cs.u })) } : {})
      },
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
   * Вставить строки перед индексом index.
   * Алгоритм:
   *  1. Валидация index/count.
   *  2. Для каждой ведущей ячейки:
   *     - если cell.r >= index -> сдвигаем вниз: cell.r += count
   *     - иначе если index <= cell.r + (rowSpan-1) -> вставка внутрь merge блока -> увеличиваем rowSpan += count
   *  3. Увеличиваем grid.rows.
   *  4. Перестраиваем индекс, эмитим structure:change.
   * @param {number} index Позиция вставки (0..rows)
   * @param {number} [count=1] Кол-во вставляемых строк
   * @returns {boolean}
   */
  insertRows(index, count = 1) {
    count = Number(count) || 1;
    if (count <= 0) return false;
    if (index < 0) index = 0;
    if (index > this.grid.rows) index = this.grid.rows; // вставка в конец
    if (count === 0) return false;
    // Проходим по всем ведущим ячейкам
    for (const cell of this.cells) {
      const rs = cell.rowSpan || 1;
      const bottom = cell.r + rs - 1;
      if (cell.r >= index) {
        // Сдвигаем целиком блок вниз
        cell.r += count;
      } else if (index <= bottom) {
        // Вставка внутрь вертикального диапазона блока -> расширяем вниз
        cell.rowSpan = rs + count;
      }
    }
    this.grid.rows += count;
    this._rebuildIndex();
    this.bus?.emit('structure:change', { type: 'insertRows', index, count, rows: this.grid.rows });
    return true;
  }

  /**
   * Вставить столбцы перед индексом index.
   * Алгоритм аналогичен строкам.
   * Дополнительно обрабатываем columnSizes (если есть) — вставляем новые дефолтные размеры.
   * @param {number} index Позиция вставки (0..cols)
   * @param {number} [count=1] Кол-во вставляемых столбцов
   * @returns {boolean}
   */
  insertColumns(index, count = 1) {
    count = Number(count) || 1;
    if (count <= 0) return false;
    if (index < 0) index = 0;
    if (index > this.grid.cols) index = this.grid.cols;
    for (const cell of this.cells) {
      const cs = cell.colSpan || 1;
      const right = cell.c + cs - 1;
      if (cell.c >= index) {
        cell.c += count;
      } else if (index <= right) {
        cell.colSpan = cs + count;
      }
    }
    if (this.grid.columnSizes) {
      const insert = Array.from({ length: count }, () => ({ v: 1, u: 'ratio' }));
      this.grid.columnSizes.splice(index, 0, ...insert);
    }
    this.grid.cols += count;
    this._rebuildIndex();
    this.bus?.emit('structure:change', { type: 'insertColumns', index, count, cols: this.grid.cols });
    return true;
  }

  /**
   * Удалить строки начиная с start (включительно).
   * Политика:
   *  - Нельзя удалить так, чтобы осталось 0 строк.
   *  - Ведущие ячейки ниже диапазона сдвигаются вверх.
   *  - Полностью попавшие внутрь удаляемого диапазона ячейки удаляются.
   *  - Пересечение верхней части блока -> shrink снизу (rowSpan = rFrom - top).
   *  - Пересечение нижней части блока -> shrink сверху (новый top = rFrom, rowSpan = bottom - rTo).
   *  - Interior split (удаляем середину блока) запрещён (возврат {ok:false}).
   * @param {number} start Индекс первой удаляемой строки
   * @param {number} [count=1] Количество строк
   * @returns {{ok:boolean, reason?:string}}
   */
  deleteRows(start, count = 1) {
    count = Number(count) || 1;
    if (count <= 0) return { ok: false, reason: 'count<=0' };
    if (this.grid.rows - count < 1) return { ok: false, reason: 'min-rows-violation' };
    if (start < 0) start = 0;
    if (start >= this.grid.rows) return { ok: false, reason: 'start-out-of-range' };
    if (start + count > this.grid.rows) count = this.grid.rows - start;
    const rFrom = start;
    const rTo = start + count - 1;
    const newCells = [];
    for (const cell of this.cells) {
      const rs = cell.rowSpan || 1;
      const top = cell.r;
      const bottom = cell.r + rs - 1;
      if (bottom < rFrom) {
        // выше удаляемой зоны
        newCells.push(cell);
        continue;
      }
      if (top > rTo) {
        // ниже удаляемой зоны -> сдвиг вверх
        cell.r -= count;
        newCells.push(cell);
        continue;
      }
      // теперь top <= rTo && bottom >= rFrom => пересечение
      if (top >= rFrom && bottom <= rTo) {
        // целиком удаляем
        continue;
      }
      const intersectsTop = top < rFrom && bottom >= rFrom && bottom <= rTo; // отрезается нижняя часть
      const intersectsBottom = top >= rFrom && top <= rTo && bottom > rTo; // отрезается верхняя часть
      const interiorSplit = top < rFrom && bottom > rTo; // середина блока удаляется -> запрещено
      if (interiorSplit) {
        return { ok: false, reason: 'interior-merge-cut' };
      }
      if (intersectsTop) {
        // shrink снизу: оставляем верхнюю часть до rFrom-1
        const keepRows = rFrom - top;
        if (keepRows <= 0) continue; // на всякий случай
        cell.rowSpan = keepRows;
        newCells.push(cell);
        continue;
      }
      if (intersectsBottom) {
        // shrink сверху: переносим верх к rFrom, оставляем нижнюю часть после rTo
        const keepRows = bottom - rTo;
        cell.r = rFrom; // после удаления нижняя часть сдвигается к новой позиции rFrom
        cell.rowSpan = keepRows;
        newCells.push(cell);
        continue;
      }
      // иных вариантов нет
    }
    // Применяем изменения
    this.cells = newCells;
    this.grid.rows -= count;
    if (this.grid.headerRows > this.grid.rows) this.grid.headerRows = this.grid.rows;
    this._rebuildIndex();
    this.bus?.emit('structure:change', { type: 'deleteRows', start, count, rows: this.grid.rows });
    return { ok: true };
  }

  /**
   * Удалить столбцы начиная с start.
   * Симметрично deleteRows.
   * Политика interior split colSpan также запрещена.
   * Корректируем columnSizes если присутствует.
   * @param {number} start
   * @param {number} [count=1]
   * @returns {{ok:boolean, reason?:string}}
   */
  deleteColumns(start, count = 1) {
    count = Number(count) || 1;
    if (count <= 0) return { ok: false, reason: 'count<=0' };
    if (this.grid.cols - count < 1) return { ok: false, reason: 'min-cols-violation' };
    if (start < 0) start = 0;
    if (start >= this.grid.cols) return { ok: false, reason: 'start-out-of-range' };
    if (start + count > this.grid.cols) count = this.grid.cols - start;
    const cFrom = start;
    const cTo = start + count - 1;
    const newCells = [];
    for (const cell of this.cells) {
      const cs = cell.colSpan || 1;
      const left = cell.c;
      const right = cell.c + cs - 1;
      if (right < cFrom) { newCells.push(cell); continue; }
      if (left > cTo) { cell.c -= count; newCells.push(cell); continue; }
      if (left >= cFrom && right <= cTo) { continue; } // целиком удалён
      const intersectsLeft = left < cFrom && right >= cFrom && right <= cTo; // отрезается правая часть
      const intersectsRight = left >= cFrom && left <= cTo && right > cTo; // отрезается левая часть
      const interiorSplit = left < cFrom && right > cTo; // середина блока
      if (interiorSplit) { return { ok: false, reason: 'interior-merge-cut' }; }
      if (intersectsLeft) {
        const keepCols = cFrom - left;
        if (keepCols <= 0) continue;
        cell.colSpan = keepCols;
        newCells.push(cell);
        continue;
      }
      if (intersectsRight) {
        const keepCols = right - cTo;
        cell.c = cFrom; // сдвиг к новой позиции после удаления
        cell.colSpan = keepCols;
        newCells.push(cell);
        continue;
      }
    }
    this.cells = newCells;
    this.grid.cols -= count;
    if (this.grid.columnSizes) {
      this.grid.columnSizes.splice(start, count);
      if (!this.grid.columnSizes.length) this.grid.columnSizes = null;
    }
    this._rebuildIndex();
    this.bus?.emit('structure:change', { type: 'deleteColumns', start, count, cols: this.grid.cols });
    return { ok: true };
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
    // Нормализация columnSizes только по новой схеме массива объектов {v,u}.
    let normalizedColumnSizes = null;
    if (Array.isArray(doc.grid.columnSizes)) {
      normalizedColumnSizes = doc.grid.columnSizes
        .filter(x => x && typeof x.v === 'number' && (x.u === 'px' || x.u === 'ratio'))
        .map(x => ({ v: x.v, u: x.u }));
      if (!normalizedColumnSizes.length) normalizedColumnSizes = null;
    }
    this.grid = {
      rows: doc.grid.rows,
      cols: doc.grid.cols,
      headerRows: doc.grid.headerRows ? doc.grid.headerRows : 0,
      columnSizes: normalizedColumnSizes
    };
    this.cells = Array.isArray(doc.cells) ? doc.cells.map(c => ({ ...c })) : [];
    this._rebuildIndex();
    if (emitEvent) {
      this.bus?.emit('structure:change', { type: 'applyDocument' });
    }
    return true;
  }

  /**
   * Установить размеры всех столбцов (пока только сохранение в модель / JSON, без визуального применения).
   * Формат columnSizes: массив длиной = числу столбцов, элементы { v:number, u:'px'|'ratio' }.
   * Если передано null/undefined — удаляем настройку (будут использоваться значения по умолчанию: ratio=1).
   * Никакой поддержки старого формата {mode, values} больше нет.
   * @param {Array<{v:number,u:'px'|'ratio'}>|null} columnSizes
   */
  setColumnSizes(columnSizes) {
    if (columnSizes == null) {
      if (!this.grid.columnSizes) return;
      this.grid.columnSizes = null;
      this.bus?.emit('structure:change', { type: 'columnSizes', columnSizes: null });
      return;
    }
    if (!Array.isArray(columnSizes)) {
      console.warn('[TableModel.setColumnSizes] Ожидался массив объектов {v,u}');
      return;
    }
    if (columnSizes.length !== this.grid.cols) {
      console.warn('[TableModel.setColumnSizes] Количество элементов не совпадает с числом столбцов');
      return;
    }
    const norm = columnSizes.map(cs => {
      if (!cs || typeof cs.v !== 'number' || (cs.u !== 'px' && cs.u !== 'ratio')) {
        return { v: 1, u: 'ratio' };
      }
      return { v: cs.v, u: cs.u };
    });
    const prevJson = JSON.stringify(this.grid.columnSizes || null);
    const nextJson = JSON.stringify(norm);
    if (prevJson === nextJson) return;
    this.grid.columnSizes = norm;
    this.bus?.emit('structure:change', { type: 'columnSizes', columnSizes: this.grid.columnSizes });
  }

  /**
   * Установить размер одного столбца.
   * raw может быть:
   *  - '120px' -> {v:120,u:'px'}
   *  - '3'     -> {v:3,u:'ratio'}
   *  - пусто / некорректно -> {v:1,u:'ratio'} (сброс к дефолту)
   * @param {number} index
   * @param {string} raw
   */
  setColumnSize(index, raw) {
    if (index < 0 || index >= this.grid.cols) return;
    if (!this.grid.columnSizes) {
      // Инициализируем массив значениями по умолчанию
      this.grid.columnSizes = Array.from({ length: this.grid.cols }, () => ({ v: 1, u: 'ratio' }));
    }
    let parsed = { v: 1, u: 'ratio' };
    if (typeof raw === 'string' && raw.trim()) {
      const t = raw.trim();
      if (/^\d+px$/.test(t)) {
        parsed = { v: parseInt(t, 10), u: 'px' };
      } else if (/^\d+$/.test(t)) {
        parsed = { v: parseInt(t, 10), u: 'ratio' };
      }
    }
    const prev = this.grid.columnSizes[index];
    if (prev && prev.v === parsed.v && prev.u === parsed.u) return;
    this.grid.columnSizes[index] = parsed;
    this.bus?.emit('structure:change', { type: 'columnSizes', columnSizes: this.grid.columnSizes, changedIndex: index });
  }
}
