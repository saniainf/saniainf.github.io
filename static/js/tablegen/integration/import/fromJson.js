// fromJson.js
// Функция импорта JSON документа в формат TableDocument -> TableModel
// Для джуниора: эта функция НЕ создает DOM, она только валидирует и возвращает объект
// который можно передать в конструктор TableModel. Здесь минимальная валидация —
// позже можно расширить (вынести в ValidationService).

/**
 * Попытаться разобрать JSON строку в TableDocument
 * @param {string} jsonString - входная JSON строка
 * @returns {{ok:true, doc:object}|{ok:false, error:string}}
 */
export function parseTableJson(jsonString) {
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
  // Ленивая нормализация полей ячеек
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
  // Для джуниора: мы не создаём новый объект модели, чтобы внешние ссылки (например из UI)
  // оставались валидными. Просто перезаписываем поля.
  model.version = doc.version || 1;
  model.meta = { ...(doc.meta || { name: 'Imported' }) };
  model.grid = { rows: doc.grid.rows, cols: doc.grid.cols };
  model.cells = (doc.cells || []).map(c => ({ ...c }));
  model._rebuildIndex();
  // Сообщаем подписчикам что структура и содержимое изменилось
  bus.emit('structure:change', { type: 'import' });
  bus.emit('paste', { import: true }); // используем существующий рендер-триггер
}
