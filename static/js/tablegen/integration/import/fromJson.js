// fromJson.js
// Импорт JSON документа в TableDocument (валидирует и возвращает объект для конструктора TableModel; без DOM операций).

/**
 * Попытаться разобрать JSON строку в TableDocument.
 * Дополнено STRICT проверкой против реестра (если validator передан) — базовый парсинг + поверхностные проверки структуры
 * и углублённая проверка классов и data-* значений. Сервис передаётся опционально для избежания циклических зависимостей.
 * @param {string} jsonString входная JSON строка
 * @param {import('../../core/services/ValidationService.js').ValidationService} [validator] опциональный валидатор для STRICT проверки
 * @returns {{ok:true, doc:object}|{ok:false, error:string}}
 */
export function parseTableJson(jsonString, validator) {
  if (typeof jsonString !== 'string') {
    return { ok: false, error: 'Ожидалась строка JSON' };
  }
  let raw;
  try {
    raw = JSON.parse(jsonString);
  } catch (e) {
    return { ok: false, error: 'Ошибка парсинга JSON: ' + e.message };
  }
  // Базовые проверки структуры
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'JSON не является объектом' };
  if (raw.version !== 1) return { ok: false, error: 'Поддерживается только version=1' };
  if (!raw.grid || typeof raw.grid.rows !== 'number' || typeof raw.grid.cols !== 'number') {
    return { ok: false, error: 'Отсутствует корректный grid' };
  }
  if (!Array.isArray(raw.cells)) raw.cells = [];
  // Ленивая нормализация полей ячеек + локальное накопление ошибок STRICT (если есть validator)
  const strictErrors = [];
  for (const cell of raw.cells) {
    if (typeof cell.r !== 'number' || typeof cell.c !== 'number') {
      return { ok: false, error: 'Ячейка без координат (r,c)' };
    }
    if (typeof cell.value !== 'string') cell.value = '';
    if (cell.rowSpan && cell.rowSpan < 1) cell.rowSpan = 1;
    if (cell.colSpan && cell.colSpan < 1) cell.colSpan = 1;
    if (cell.classes && !Array.isArray(cell.classes)) {
      return { ok: false, error: 'Поле classes должно быть массивом строк' };
    }
    if (cell.data && typeof cell.data !== 'object') {
      return { ok: false, error: 'Поле data должно быть объектом' };
    }
    // STRICT: проверяем каждый класс и data-* сразу, чтобы раннее выявить ошибку импорта
    if (validator && validator._registry) {
      // Классы
      if (Array.isArray(cell.classes)) {
        for (const cls of cell.classes) {
          if (!validator._classSet.has(cls)) {
            strictErrors.push(`неизвестный класс: ${cls} (r=${cell.r},c=${cell.c})`);
          }
        }
        // Проверка конфликтов exclusiveGroup (вариант B: в рантайме нормализуем, но при импорте — сообщаем)
        const seenGroups = new Map();
        for (const cls of cell.classes) {
          const grp = validator._exclusiveGroups.get(cls);
            if (!grp) continue;
            if (seenGroups.has(grp)) {
              strictErrors.push(`конфликт exclusiveGroup '${grp}' классы '${seenGroups.get(grp)}' и '${cls}' (r=${cell.r},c=${cell.c})`);
            } else {
              seenGroups.set(grp, cls);
            }
        }
      }
      // data-*
      if (cell.data) {
        for (const key of Object.keys(cell.data)) {
          const meta = validator._attrMap.get(key);
          if (!meta) {
            strictErrors.push(`неизвестный data-атрибут: ${key} (r=${cell.r},c=${cell.c})`);
            continue;
          }
          const val = cell.data[key];
          if (!validator._validateAttributeValue(meta, val)) {
            strictErrors.push(`недопустимое значение '${val}' для ${key} (r=${cell.r},c=${cell.c})`);
          }
        }
      }
    }
  }
  if (strictErrors.length) {
    return { ok: false, error: 'STRICT ошибки импорта:\n' + strictErrors.join('\n') };
  }
  return { ok: true, doc: raw };
}

/**
 * Применить документ к существующей модели (перезапись содержимого)
 * @param {import('../../core/model/TableModel.js').TableModel} model
 * @param {object} doc - TableDocument
 * @param {import('../../core/events/EventBus.js').EventBus} bus
 */
export function applyImportedDocument(model, doc, bus) {
  // Теперь используем публичный метод модели, чтобы не дублировать логику переноса полей.
  // emitEvent:false — чтобы не создавать событие applyDocument (мы хотим пометить именно import).
  model.applyDocument(doc, { emitEvent: false });
  // Эмитим одно событие структуры с конкретной причиной 'import'.
  bus.emit('structure:change', { type: 'import' });
}
