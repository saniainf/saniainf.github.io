// ValidationService.js
// Сервис валидации документа таблицы и проверки корректности данных.
// Для джуниора: централизованная валидация предотвращает появление некорректных состояний.

/**
 * ValidationService отвечает за:
 *  - проверку целостности документа (координаты, границы grid)
 *  - валидацию merge-операций на пересечения и конфликты
 *  - проверку формата data-* ключей и классов CSS
 *  - предварительную валидацию перед применением изменений
 */
export class ValidationService {
  /**
   * @param {TableModel} model Ссылка на модель для проверки текущего состояния
   */
  constructor(model) {
    this.model = model;
    // Реестр будет установлен через initRegistry
    this._registry = null;          // исходный объект реестра
    this._classSet = new Set();      // множество допустимых классов
    this._exclusiveGroups = new Map(); // карта: className -> exclusiveGroup
    this._attrMap = new Map();       // карта: attrName -> метаданные
    this._strict = true;             // STRICT политика импорта/валидации
  }

  /**
   * Полная проверка документа таблицы на корректность
   * @param {Object} doc Документ таблицы в формате JSON schema v1
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateDocument(doc) {
    const errors = [];

    // Проверка базовой структуры
    if (!doc.version || !doc.grid || !Array.isArray(doc.cells)) {
      errors.push('Некорректная структура документа');
      return { valid: false, errors };
    }

    if (doc.grid.rows <= 0 || doc.grid.cols <= 0) {
      errors.push('Размеры таблицы должны быть положительными');
    }

    // Проверка каждой ячейки
    for (let i = 0; i < doc.cells.length; i++) {
      const cell = doc.cells[i];
      const cellErrors = this.validateCell(cell, doc.grid);
      if (cellErrors.length > 0) {
        errors.push(`Ячейка ${i}: ${cellErrors.join(', ')}`);
      }
      // Дополнительная STRICT проверка по реестру (если он инициализирован)
      if (this._registry) {
        const regErrors = this._validateCellRegistry(cell);
        if (regErrors.length) errors.push(`Ячейка ${i} (registry): ${regErrors.join(', ')}`);
      }
    }

    // Проверка merge-пересечений
    const mergeErrors = this.validateMergeConflicts(doc.cells, doc.grid);
    errors.push(...mergeErrors);

    return { valid: errors.length === 0, errors };
  }

  /**
   * Проверка корректности данных одной ячейки
   * @param {Object} cell Объект ячейки
   * @param {Object} grid Размеры таблицы {rows, cols}
   * @returns {string[]} Массив ошибок
   */
  validateCell(cell, grid) {
    const errors = [];

    // Проверка координат
    if (cell.r < 0 || cell.c < 0) {
      errors.push('координаты не могут быть отрицательными');
    }
    if (cell.r >= grid.rows || cell.c >= grid.cols) {
      errors.push('координаты выходят за границы таблицы');
    }

    // Проверка размеров merge
    const rowSpan = cell.rowSpan || 1;
    const colSpan = cell.colSpan || 1;
    if (rowSpan < 1 || colSpan < 1) {
      errors.push('rowSpan и colSpan должны быть >= 1');
    }
    if (cell.r + rowSpan > grid.rows) {
      errors.push('rowSpan выходит за границы таблицы');
    }
    if (cell.c + colSpan > grid.cols) {
      errors.push('colSpan выходит за границы таблицы');
    }

    // Проверка классов CSS
    if (cell.classes) {
      if (!Array.isArray(cell.classes)) {
        errors.push('classes должно быть массивом');
      } else {
        for (const cls of cell.classes) {
          if (!this.validateCssClass(cls)) {
            errors.push(`недопустимое имя класса: ${cls}`);
          }
        }
      }
    }

    // Проверка data-атрибутов
    if (cell.data) {
      if (typeof cell.data !== 'object') {
        errors.push('data должно быть объектом');
      } else {
        for (const key of Object.keys(cell.data)) {
          if (!this.validateDataKey(key)) {
            errors.push(`недопустимый ключ data-атрибута: ${key}`);
          }
        }
      }
    }

    return errors;
  }

  /**
   * Инициализация реестра допустимых классов и атрибутов.
   * STRICT политика: любое неизвестное значение считается ошибкой при валидации документов/импорта.
   * @param {Object} registry Объект TABLEGEN_REGISTRY
   */
  initRegistry(registry) {
    this._registry = registry;
    this._classSet.clear();
    this._exclusiveGroups.clear();
    this._attrMap.clear();
    if (!registry) return;
    if (registry.classes) {
      for (const cls of registry.classes) {
        this._classSet.add(cls.name);
        if (cls.exclusiveGroup) this._exclusiveGroups.set(cls.name, cls.exclusiveGroup);
      }
    }
    if (registry.dataAttributes) {
      for (const a of registry.dataAttributes) {
        this._attrMap.set(a.name, a);
      }
    }
    if (registry.rules && registry.rules.importPolicy === 'strict') {
      this._strict = true; // сейчас только strict
    }
  }

  /**
   * Валидация ячейки относительно реестра (классы + data-* значения).
   * @param {Object} cell
   * @returns {string[]} ошибки
   */
  _validateCellRegistry(cell) {
    const errors = [];
    // Проверка классов
    if (cell.classes) {
      for (const cls of cell.classes) {
        if (!this._classSet.has(cls)) errors.push(`неизвестный класс: ${cls}`);
      }
      // Проверка exclusiveGroup конфликтов (оставляем последний при нормализации — здесь только репорт)
      const groupChosen = new Map(); // group -> className
      for (const cls of cell.classes) {
        const grp = this._exclusiveGroups.get(cls);
        if (!grp) continue;
        if (groupChosen.has(grp)) {
          errors.push(`конфликт exclusiveGroup '${grp}' между '${groupChosen.get(grp)}' и '${cls}'`);
        } else {
          groupChosen.set(grp, cls);
        }
      }
    }
    // Проверка data-атрибутов
    if (cell.data) {
      for (const key of Object.keys(cell.data)) {
        const meta = this._attrMap.get(key);
        if (!meta) {
          errors.push(`неизвестный data-атрибут: ${key}`);
          continue;
        }
        const val = cell.data[key];
        if (!this._validateAttributeValue(meta, val)) {
          errors.push(`недопустимое значение '${val}' для ${key}`);
        }
      }
    }
    return errors;
  }

  /**
   * Проверка значения атрибута согласно его метаданным.
   * @param {Object} meta метаданные (type, values, min, max, default)
   * @param {any} raw значение из документа (строка или число)
   * @returns {boolean}
   */
  _validateAttributeValue(meta, raw) {
    if (meta.type === 'enum') {
      return meta.values.includes(raw);
    }
    if (meta.type === 'number') {
      if (typeof raw !== 'number') return false;
      if (meta.min != null && raw < meta.min) return false;
      if (meta.max != null && raw > meta.max) return false;
      return true;
    }
    if (meta.type === 'boolean') {
      return typeof raw === 'boolean';
    }
    return false; // других типов нет (string исключён по требованиям)
  }

  /**
   * Нормализация списка классов с учётом exclusiveGroup: сохраняем последний встретившийся в группе.
   * @param {string[]} classes входной список
   * @returns {string[]} нормализованный список
   */
  normalizeClassList(classes) {
    if (!Array.isArray(classes)) return [];
    const byGroup = new Map(); // group -> className
    const result = [];
    for (const cls of classes) {
      if (!this._classSet.has(cls)) continue; // пропускаем неизвестные
      const grp = this._exclusiveGroups.get(cls);
      if (!grp) {
        result.push(cls);
      } else {
        byGroup.set(grp, cls); // последний перезапишет предыдущий
      }
    }
    // Добавляем эксклюзивные группы в конец (порядок не критичен)
    for (const cls of byGroup.values()) result.push(cls);
    return result;
  }

  /**
   * Проверка + приведение значения атрибута (используется при UI применении).
   * @param {string} name имя атрибута
   * @param {any} value значение
   * @returns {{ok:boolean, value?:any, error?:string}}
   */
  validateAttribute(name, value) {
    const meta = this._attrMap.get(name);
    if (!meta) return { ok: false, error: 'Неизвестный атрибут' };
    if (!this._validateAttributeValue(meta, value)) return { ok: false, error: 'Недопустимое значение' };
    return { ok: true, value };
  }

  /**
   * Доступные классы (для UI)
   */
  listAllowedClasses() {
    return this._registry ? this._registry.classes.slice() : [];
  }

  /**
   * Доступные атрибуты (для UI)
   */
  listAllowedAttributes() {
    return this._registry ? this._registry.dataAttributes.slice() : [];
  }

  /**
   * Проверка пересечений merge-областей в документе
   * @param {Array} cells Массив ячеек
   * @param {Object} grid Размеры таблицы
   * @returns {string[]} Ошибки пересечений
   */
  validateMergeConflicts(cells, grid) {
    const errors = [];
    const occupied = new Set(); // Множество занятых координат "r,c"

    for (const cell of cells) {
      const rowSpan = cell.rowSpan || 1;
      const colSpan = cell.colSpan || 1;
      
      // Проверяем каждую координату в области merge
      for (let r = cell.r; r < cell.r + rowSpan; r++) {
        for (let c = cell.c; c < cell.c + colSpan; c++) {
          const coord = `${r},${c}`;
          if (occupied.has(coord)) {
            errors.push(`Пересечение merge-областей в позиции (${r},${c})`);
          }
          occupied.add(coord);
        }
      }
    }

    return errors;
  }

  /**
   * Проверка возможности merge-операции без конфликтов
   * @param {number} r1 Начальная строка
   * @param {number} c1 Начальная колонка  
   * @param {number} r2 Конечная строка
   * @param {number} c2 Конечная колонка
   * @returns {{ok: boolean, error?: string}}
   */
  validateMergeOperation(r1, c1, r2, c2) {
    // Нормализуем диапазон
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);

    // Проверка границ
    if (minR < 0 || minC < 0 || maxR >= this.model.grid.rows || maxC >= this.model.grid.cols) {
      return { ok: false, error: 'Диапазон выходит за границы таблицы' };
    }

  // Проверка пересечений с существующими merge
  // Допустимы ДВА сценария пересечения:
  //  1) Наш новый диапазон ПОЛНОСТЬЮ ПОГЛОЩАЕТ существующую merge-область (поглощение) — ок (расширяем / заменяем область).
  //  2) Наш новый диапазон ПОЛНОСТЬЮ НАХОДИТСЯ ВНУТРИ существующей merge-области (вложенный) — ок (no-op с точки зрения структуры, mergeRange ничего не изменит).
  // Любое частичное перекрытие (когда прямоугольники пересекаются, но ни один не содержит другой целиком) — запрещено.
    for (const cell of this.model.cells) {
      if (!cell.rowSpan && !cell.colSpan) continue; // Не merge-ячейка
      
      const cellRowSpan = cell.rowSpan || 1;
      const cellColSpan = cell.colSpan || 1;
      const cellMaxR = cell.r + cellRowSpan - 1;
      const cellMaxC = cell.c + cellColSpan - 1;

      // Проверяем пересечение прямоугольников
      const overlapsR = !(maxR < cell.r || minR > cellMaxR);
      const overlapsC = !(maxC < cell.c || minC > cellMaxC);

      if (overlapsR && overlapsC) {
        const newContainsExisting =
          minR <= cell.r && maxR >= cellMaxR &&
          minC <= cell.c && maxC >= cellMaxC;
        const existingContainsNew =
          cell.r <= minR && cellMaxR >= maxR &&
          cell.c <= minC && cellMaxC >= maxC;

        if (!(newContainsExisting || existingContainsNew)) {
          // Частичное пересечение (ни один не содержит другой полностью) — ошибка
            return { ok: false, error: `Конфликт с существующим merge в (${cell.r},${cell.c})` };
        }
      }
    }

    return { ok: true };
  }

  /**
   * Валидация имени CSS класса
   * @param {string} className Имя класса
   * @returns {boolean} true если корректное
   */
  validateCssClass(className) {
    if (typeof className !== 'string' || className.length === 0) return false;
    // CSS класс: латинские буквы, цифры, дефис, подчёркивание, не начинается с цифры
    return /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(className);
  }

  /**
   * Валидация ключа data-атрибута  
   * @param {string} key Ключ атрибута (без префикса data-)
   * @returns {boolean} true если корректный
   */
  validateDataKey(key) {
    if (typeof key !== 'string' || key.length === 0) return false;
    // data-ключ: латинские буквы, цифры, дефис (как в HTML5 спецификации)
    return /^[a-zA-Z0-9-]+$/.test(key);
  }

  /**
   * Валидация значения data-атрибута
   * @param {any} value Значение атрибута
   * @returns {boolean} true если корректное
   */
  validateDataValue(value) {
    // data-значения должны быть строками (как в DOM)
    return typeof value === 'string';
  }

  /**
   * Быстрая проверка - можно ли добавить класс к ячейке
   * @param {Array} existingClasses Существующие классы  
   * @param {string} newClass Новый класс
   * @returns {{ok: boolean, error?: string}}
   */
  canAddClass(existingClasses, newClass) {
    if (!this.validateCssClass(newClass)) {
      return { ok: false, error: 'Недопустимое имя класса' };
    }
    if (existingClasses && existingClasses.includes(newClass)) {
      return { ok: false, error: 'Класс уже существует' };
    }
    return { ok: true };
  }

  /**
   * Быстрая проверка - можно ли добавить data-атрибут к ячейке
   * @param {Object} existingData Существующие data-атрибуты
   * @param {string} key Ключ
   * @param {any} value Значение
   * @returns {{ok: boolean, error?: string}}
   */
  canAddDataAttribute(existingData, key, value) {
    if (!this.validateDataKey(key)) {
      return { ok: false, error: 'Недопустимый ключ data-атрибута' };
    }
    if (!this.validateDataValue(value)) {
      return { ok: false, error: 'Значение data-атрибута должно быть строкой' };
    }
    if (existingData && existingData.hasOwnProperty(key)) {
      return { ok: false, error: 'Ключ уже существует' };
    }
    return { ok: true };
  }
}