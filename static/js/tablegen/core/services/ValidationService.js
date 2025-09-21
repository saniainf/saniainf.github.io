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
        // Частичное пересечение недопустимо, полное поглощение - ок
        const fullyContained = 
          minR <= cell.r && maxR >= cellMaxR && 
          minC <= cell.c && maxC >= cellMaxC;
        
        if (!fullyContained) {
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