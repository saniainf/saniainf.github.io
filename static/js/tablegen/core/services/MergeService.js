// MergeService.js
// Сервис для объединения (merge) и разделения (split) ячеек.
// Для джуниора: merge объединяет прямоугольный диапазон ячеек в одну "ведущую" (top-left) ячейку.
// Остальные ячейки диапазона удаляются из массива cells (их покрывает rowSpan/colSpan ведущей).

// ВНИМАНИЕ: РАНЬШЕ здесь была локальная функция validateRange с частично дублирующей логикой
// проверки пересечения merge-областей. Теперь — единая точка проверки в ValidationService
// (метод validateMergeOperation). Этот модуль предполагает, что вызов mergeRange() происходит
// ТОЛЬКО после успешной внешней валидации. Мы всё же оставляем минимальные защитные проверки
// (нормализация диапазона и базовые границы), чтобы не записать заведомо битое состояние
// при ошибочном использовании API.

/**
 * Объединить диапазон (r1,c1) - (r2,c2)
 * @param {import('../model/TableModel.js').TableModel} model
 * @param {number} r1
 * @param {number} c1
 * @param {number} r2
 * @param {number} c2
 * @returns {{ok:boolean,error?:string}}
 */
export function mergeRange(model, r1, c1, r2, c2) {
  // 1. Нормализуем порядок координат (на случай если пришли в обратном порядке)
  if (r2 < r1) [r1, r2] = [r2, r1];
  if (c2 < c1) [c1, c2] = [c2, c1];
  // 2. Минимальная защита: диапазон не выходит за границы и корректный
  if (r1 < 0 || c1 < 0 || r2 >= model.grid.rows || c2 >= model.grid.cols) {
    return { ok: false, error: 'Диапазон выходит за пределы таблицы (ожидалась предварительная валидация)' };
  }
  if (r1 > r2 || c1 > c2) {
    return { ok: false, error: 'Неверный диапазон (ожидалась предварительная валидация)' };
  }
  // 3. Размер области
  const rowSpan = r2 - r1 + 1;
  const colSpan = c2 - c1 + 1;
  if (rowSpan === 1 && colSpan === 1) return { ok: true }; // нет смысла объединять 1x1 (не ошибка)
  // 4. Дополнительная (дешёвая) страховка от частичного пересечения. Полная логика уже должна
  // быть выполнена извне (ValidationService.validateMergeOperation). Здесь мы разрешаем ровно два
  // сценария при overlap (как и в валидаторе):
  //   a) Новый диапазон полностью содержит существующий merge (поглощение)
  //   b) Новый диапазон полностью содержится внутри существующего merge (вложенный no-op)
  // Любое другое пересечение => ошибка.
  for (const cell of model.cells) {
    const rs = cell.rowSpan || 1;
    const cs = cell.colSpan || 1;
    if (rs === 1 && cs === 1) continue;
    const cellR2 = cell.r + rs - 1;
    const cellC2 = cell.c + cs - 1;
    const overlaps = !(r2 < cell.r || r1 > cellR2 || c2 < cell.c || c1 > cellC2);
    if (overlaps) {
      const newContainsExisting = r1 <= cell.r && r2 >= cellR2 && c1 <= cell.c && c2 >= cellC2;
      const existingContainsNew = cell.r <= r1 && cellR2 >= r2 && cell.c <= c1 && cellC2 >= c2;
      if (!(newContainsExisting || existingContainsNew)) {
        return { ok: false, error: 'Конфликт merge (частичное пересечение)' };
      }
    }
  }

  // Сбор содержимого всех ячеек внутри диапазона ДО модификации массива.
  // Для джуниора: мы хотим после объединения сохранить текст, объединив значения «ведущая + все поглощённые»
  // через пробел. Порядок: сверху вниз, слева направо, что логично визуально.
  const collected = [];
  for (let rr = r1; rr <= r2; rr++) {
    for (let cc = c1; cc <= c2; cc++) {
      const cell = model.getCell(rr, cc);
      if (cell && typeof cell.value === 'string') {
        const trimmed = cell.value.trim();
        if (trimmed) collected.push(trimmed);
      }
    }
  }

  // Находим/создаём ведущую ячейку
  let lead = model.getCell(r1, c1);
  if (!lead) {
    model.setCellValue(r1, c1, '');
    lead = model.getCell(r1, c1);
  }

  // Применяем размеры объединения
  lead.rowSpan = rowSpan;
  lead.colSpan = colSpan;

  // Объединяем текстовые значения в одно. Если все были пустые — оставляем текущий (или пустую строку)
  if (collected.length) {
    const oldValue = lead.value;
    const newValue = collected.join(' ');
    // Напрямую присваиваем, чтобы не эмитить десяток событий по каждой поглощённой ячейке.
    lead.value = newValue;
    // Эмитим одно событие cell:change для ведущей, чтобы слушатели могли обновиться.
    model.bus?.emit('cell:change', { r: lead.r, c: lead.c, field: 'value', oldValue, newValue });
  }

  // Фильтруем массив ячеек, убирая поглощённые (кроме ведущей)
  const keep = [];
  for (const cell of model.cells) {
    if (cell === lead) { keep.push(cell); continue; }
    if (cell.r >= r1 && cell.r <= r2 && cell.c >= c1 && cell.c <= c2) {
      continue; // поглощённая ячейка
    }
    keep.push(cell);
  }
  model.cells = keep;
  model._rebuildIndex();

  model.bus?.emit('merge', { r1, c1, r2, c2, rowSpan, colSpan });
  return { ok: true };
}

/**
 * Разделить (split) ведущую ячейку, убрав её rowSpan/colSpan и создавая пустые ячейки
 * @param {import('../model/TableModel.js').TableModel} model
 * @param {number} r
 * @param {number} c
 * @returns {{ok:boolean,error?:string}}
 */
export function splitCell(model, r, c) {
  const cell = model.getCell(r, c);
  if (!cell) return { ok: false, error: 'Нет ведущей ячейки по координатам' };
  const rs = cell.rowSpan || 1;
  const cs = cell.colSpan || 1;
  if (rs === 1 && cs === 1) return { ok: true }; // нечего делить

  // Сбрасываем размеры у ведущей
  cell.rowSpan = 1;
  cell.colSpan = 1;

  // Добавляем недостающие ячейки
  for (let rr = r; rr < r + rs; rr++) {
    for (let cc = c; cc < c + cs; cc++) {
      if (rr === r && cc === c) continue; // ведущая
      if (!model.getCell(rr, cc)) {
        model.setCellValue(rr, cc, '');
      }
    }
  }
  model.bus?.emit('split', { r, c, rowSpan: rs, colSpan: cs });
  return { ok: true };
}

/**
 * Разъединить (split) все объединённые ячейки, которые полностью или частично попадают в диапазон.
 * Для джуниора: мы должны найти ВСЕ ведущие ячейки (те, у кого rowSpan>1 или colSpan>1), у которых
 * их прямоугольник пересекается с прямоугольником диапазона (r1,c1)-(r2,c2). Для каждой вызываем splitCell.
 * Порядок: сначала фиксируем список координат ведущих ячеек (чтобы изменения массива model.cells при split
 * не ломали итерацию), затем последовательно split.
 *
 * ВАЖНО: Если одна большая объединённая ячейка накрывает весь диапазон и внутри есть другие (вообще в нашей
 * структуре внутри не будет других ведущих — мы храним только top-level), достаточно одного split.
 *
 * @param {import('../model/TableModel.js').TableModel} model
 * @param {number} r1
 * @param {number} c1
 * @param {number} r2
 * @param {number} c2
 * @returns {{ok:boolean, processed:number}} processed — сколько merge областей разъединено
 */
/**
 * Разъединить объединённые области внутри диапазона с выбранной стратегией включения.
 * @param {TableModel} model
 * @param {number} r1
 * @param {number} c1
 * @param {number} r2
 * @param {number} c2
 * @param {('overlap'|'fully')} [mode='overlap'] Режим выбора областей:
 *   - 'overlap' (по умолчанию): разбивать все merge, которые ХОТЬ КАК-ТО пересекаются с диапазоном
 *     (включая соприкосновение по границе в одной ячейке). Это повторяет привычное поведение
 *     электронных таблиц: если выделение задевает объединённую область, она будет разъединена.
 *   - 'fully': разбивать только те merge, которые полностью лежат внутри диапазона.
 * Для джуниора: в UI пользователю обычно ожидаемо поведение overlap — выделил прямоугольник, попавшие
 * области распались. Режим fully полезен для более точных операций или будущего batch API.
 */
export function splitAllInRange(model, r1, c1, r2, c2, mode = 'overlap') {
  // Нормализуем (на случай если передали в обратном порядке)
  const R1 = Math.min(r1, r2);
  const R2 = Math.max(r1, r2);
  const C1 = Math.min(c1, c2);
  const C2 = Math.max(c1, c2);

  const targets = [];
  for (const cell of model.cells) {
    const rs = cell.rowSpan || 1;
    const cs = cell.colSpan || 1;
    if (rs === 1 && cs === 1) continue;
    const cellR2 = cell.r + rs - 1;
    const cellC2 = cell.c + cs - 1;
    const overlaps = !(cellR2 < R1 || cell.r > R2 || cellC2 < C1 || cell.c > C2);
    if (!overlaps) continue;
    if (mode === 'fully') {
      const fullyInside = cell.r >= R1 && cellR2 <= R2 && cell.c >= C1 && cellC2 <= C2;
      if (!fullyInside) continue;
      targets.push({ r: cell.r, c: cell.c });
    } else { // overlap
      targets.push({ r: cell.r, c: cell.c });
    }
  }

  if (!targets.length) {
    return { ok: true, processed: 0 };
  }

  let processed = 0;
  for (const t of targets) {
    const res = splitCell(model, t.r, t.c);
    if (res.ok) processed++;
  }

  return { ok: true, processed };
}
