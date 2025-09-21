// PasteService.js
// Сервис для вставки диапазона (например из Excel через буфер обмена)
// На вход получает TableModel и двумерный массив значений (matrix)

/**
 * @param {import('../model/TableModel.js').TableModel} model
 * @param {number} startR - начальная строка вставки
 * @param {number} startC - начальный столбец вставки
 * @param {string[][]} matrix - матрица значений (результат parseClipboardMatrix)
 */
export function applyPaste(model, startR, startC, matrix) {
  const rows = matrix.length;
  const cols = rows ? matrix[0].length : 0;
  // Расширяем таблицу при необходимости
  model.ensureSize(startR + rows, startC + cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const raw = matrix[i][j];
      // Тримим пробелы по краям
      const val = raw.trim();
      model.setCellValue(startR + i, startC + j, val);
    }
  }
  model.bus?.emit('paste', { startR, startC, rows, cols });
}

/**
 * Вставка HTML таблицы (с already parsed structure), учитывая rowspan/colspan
 * @param {import('../model/TableModel.js').TableModel} model
 * @param {number} startR
 * @param {number} startC
 * @param {{rows:number, cols:number, cells:Array<{r:number,c:number,value:string,rowSpan:number,colSpan:number}>}} parsed
 */
export function applyHtmlTablePaste(model, startR, startC, parsed) {
  // Расширяем размеры
  model.ensureSize(startR + parsed.rows, startC + parsed.cols);
  // Сначала вставляем все значения как будто без merge
  // Заполняем пустыми строками базовую сетку, чтобы split потом не требовался
  for (let r = 0; r < parsed.rows; r++) {
    for (let c = 0; c < parsed.cols; c++) {
      model.setCellValue(startR + r, startC + c, '');
    }
  }
  // Теперь применяем ведущие ячейки
  for (const cell of parsed.cells) {
    const R = startR + cell.r;
    const C = startC + cell.c;
    model.setCellValue(R, C, cell.value.trim());
    if (cell.rowSpan > 1 || cell.colSpan > 1) {
      // Объединяем вручную: присваиваем размеры и удаляем поглощённые
      let lead = model.getCell(R, C);
      lead.rowSpan = cell.rowSpan;
      lead.colSpan = cell.colSpan;
      // Удаляем внутренние ведущие ячейки
      const keep = [];
      for (const existing of model.cells) {
        if (existing === lead) { keep.push(existing); continue; }
        if (existing.r >= R && existing.r < R + cell.rowSpan && existing.c >= C && existing.c < C + cell.colSpan) {
          continue;
        }
        keep.push(existing);
      }
      model.cells = keep;
      model._rebuildIndex();
    }
  }
  model.bus?.emit('paste', { startR, startC, rows: parsed.rows, cols: parsed.cols, html: true });
}
