// MergeService.js
// Сервис для объединения (merge) и разделения (split) ячеек.
// Для джуниора: merge объединяет прямоугольный диапазон ячеек в одну "ведущую" (top-left) ячейку.
// Остальные ячейки диапазона удаляются из массива cells (их покрывает rowSpan/colSpan ведущей).

/**
 * Проверяем пересекается ли диапазон с уже объединёнными ведущими ячейками
 * @param {import('../model/TableModel.js').TableModel} model
 * @param {number} r1
 * @param {number} c1
 * @param {number} r2
 * @param {number} c2
 * @returns {string|null} сообщение об ошибке или null если всё ок
 */
function validateRange(model, r1, c1, r2, c2) {
  if (r1 > r2 || c1 > c2) return 'Неверный диапазон (r1>r2 или c1>c2)';
  if (r2 >= model.grid.rows || c2 >= model.grid.cols) return 'Диапазон выходит за пределы таблицы';
  // Проверяем что диапазон не пересекает существующий merge частично
  for (const cell of model.cells) {
    const rs = cell.rowSpan || 1;
    const cs = cell.colSpan || 1;
    if (rs > 1 || cs > 1) {
      const R2 = cell.r + rs - 1;
      const C2 = cell.c + cs - 1;
  // Ранее здесь вычислялись overlapR/overlapC (кол-во пересекающихся строк/столбцов),
  // но фактически они не использовались для принятия решения. Оставлять «мертвый код» не стоит,
  // чтобы не вводить в заблуждение — удалили эти переменные.
      const intersects = !(r2 < cell.r || r1 > R2 || c2 < cell.c || c1 > C2);
      if (intersects) {
        // Разрешаем только случай когда весь диапазон целиком внутри уже объединённой ячейки (тогда смысла merge нет)
        const fullyInside = r1 >= cell.r && r2 <= R2 && c1 >= cell.c && c2 <= C2;
        if (!fullyInside) {
          return 'Диапазон пересекает уже объединённую область';
        }
      }
    }
  }
  return null;
}

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
  const err = validateRange(model, r1, c1, r2, c2);
  if (err) return { ok: false, error: err };
  // Нормализуем порядок
  if (r2 < r1) [r1, r2] = [r2, r1];
  if (c2 < c1) [c1, c2] = [c2, c1];
  const rowSpan = r2 - r1 + 1;
  const colSpan = c2 - c1 + 1;
  if (rowSpan === 1 && colSpan === 1) return { ok: true }; // нет смысла объединять 1x1

  // Находим/создаём ведущую ячейку
  let lead = model.getCell(r1, c1);
  if (!lead) {
    model.setCellValue(r1, c1, '');
    lead = model.getCell(r1, c1);
  }
  lead.rowSpan = rowSpan;
  lead.colSpan = colSpan;

  // Удаляем остальные ячейки внутри диапазона (кроме ведущей)
  const keep = [];
  for (const cell of model.cells) {
    if (cell === lead) { keep.push(cell); continue; }
    if (cell.r >= r1 && cell.r <= r2 && cell.c >= c1 && cell.c <= c2) {
      // пропускаем — ячейка поглощена merge
      continue;
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
export function splitAllInRange(model, r1, c1, r2, c2) {
  // Нормализуем (на случай если передали в обратном порядке)
  const R1 = Math.min(r1, r2);
  const R2 = Math.max(r1, r2);
  const C1 = Math.min(c1, c2);
  const C2 = Math.max(c1, c2);

  // Собираем список ведущих ячеек, которые пересекают диапазон
  const targets = [];
  for (const cell of model.cells) {
    const rs = cell.rowSpan || 1;
    const cs = cell.colSpan || 1;
    if (rs === 1 && cs === 1) continue; // не объединённая
    const cellR2 = cell.r + rs - 1;
    const cellC2 = cell.c + cs - 1;
    // Проверка пересечения прямоугольников (A и B)
    const overlaps = !(cellR2 < R1 || cell.r > R2 || cellC2 < C1 || cell.c > C2);
    if (overlaps) {
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
