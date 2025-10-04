// parseClipboardHtmlTable.js
// Парсит HTML-фрагмент из буфера обмена (если пользователь копировал диапазон с объединёнными ячейками)
// Excel / Google Sheets при копировании передают в clipboard тип text/html с кусочком <table>.
// Задача: извлечь структуру, учесть rowspan/colspan и вернуть нормализованные ведущие ячейки с координатами и размерами.

/**
 * Попытка извлечь первую таблицу из HTML
 * @param {string} html
 * @returns {{success:boolean, rows?:number, cols?:number, cells?:Array<{r:number,c:number,value:string,rowSpan:number,colSpan:number}>}}
 */
export function parseClipboardHtmlTable(html) {
  if (!html || html.indexOf('<table') === -1) return { success: false };
  // Создаём временной контейнер
  const container = document.createElement('div');
  container.innerHTML = html;
  const table = container.querySelector('table');
  if (!table) return { success: false };

  const rowsEls = Array.from(table.querySelectorAll('tr'));
  if (!rowsEls.length) return { success: false };

  // Используем алгоритм развёртки с учётом rowspan/colspan
  const cells = [];
  let maxCols = 0;
  // occupancy[r][c] = занято (boolean)
  const occupancy = [];

  for (let r = 0; r < rowsEls.length; r++) {
    const rowEl = rowsEls[r];
    if (!occupancy[r]) occupancy[r] = [];
    let cIndex = 0;
    // Пропускаем занятые позиции (занесённые предыдущими rowspan)
    while (occupancy[r][cIndex]) cIndex++;

    const cellEls = Array.from(rowEl.querySelectorAll('th,td'));
    for (const cellEl of cellEls) {
      // Перематываем пока текущее место занято
      while (occupancy[r][cIndex]) cIndex++;
      const txt = cellEl.textContent || '';
      const rowSpan = parseInt(cellEl.getAttribute('rowspan') || '1', 10) || 1;
      const colSpan = parseInt(cellEl.getAttribute('colspan') || '1', 10) || 1;

      cells.push({ r, c: cIndex, value: txt.trim(), rowSpan, colSpan });

      // Помечаем занятость диапазона
      for (let rr = r; rr < r + rowSpan; rr++) {
        if (!occupancy[rr]) occupancy[rr] = [];
        for (let cc = cIndex; cc < cIndex + colSpan; cc++) {
          occupancy[rr][cc] = true;
        }
      }

      cIndex += colSpan; // Следующая потенциальная позиция
    }
    if (cIndex > maxCols) maxCols = cIndex;
  }

  return { success: true, rows: rowsEls.length, cols: maxCols, cells };
}
