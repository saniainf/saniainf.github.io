// TableRenderer.js
// Отвечает за создание и перерисовку HTML <table> на основе модели.
// Для упрощения поддержки логика рендера изолирована от остального кода.

/**
 * Класс отвечает только за отображение таблицы.
 * При изменении модели вызывайте renderer.render().
 */
export class TableRenderer {
  /**
   * @param {TableModel} model Модель таблицы
   * @param {EventBus} bus Шина событий (пока не используется внутри, но оставлена для будущих расширений)
   */
  constructor(model, bus) {
    this.model = model;
    this.bus = bus;
    this.tableEl = document.createElement('table');
    this.tableEl.className = 'tablegen-basic-table';
  }

  /**
   * Проверяем покрыта ли координата объединением (если да и не ведущая — её не нужно рисовать)
   * @param {number} r Строка
   * @param {number} c Колонка
   * @returns {boolean}
   */
  isCoveredByMerge(r, c) {
    for (const cell of this.model.cells) {
      const rs = cell.rowSpan || 1;
      const cs = cell.colSpan || 1;
      if (rs > 1 || cs > 1) {
        const rMax = cell.r + rs - 1;
        const cMax = cell.c + cs - 1;
        if (r >= cell.r && r <= rMax && c >= cell.c && c <= cMax) {
          if (!(r === cell.r && c === cell.c)) return true;
        }
      }
    }
    return false;
  }

  /**
   * Полная перерисовка таблицы на основании текущего состояния модели.
   */
  render() {
    const model = this.model;
    const tableEl = this.tableEl;
    tableEl.innerHTML = '';
    for (let r = 0; r < model.grid.rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < model.grid.cols; c++) {
        const cell = model.getCell(r, c);
        if (cell) {
          const td = document.createElement('td');
          const rowSpan = cell.rowSpan || 1;
          const colSpan = cell.colSpan || 1;
          td.textContent = cell.value;
          td.dataset.r = String(r);
          td.dataset.c = String(c);
          if (rowSpan > 1) td.rowSpan = rowSpan;
          if (colSpan > 1) td.colSpan = colSpan;
          if (cell.classes && cell.classes.length) td.className = cell.classes.join(' ');
          if (cell.data) {
            for (const k of Object.keys(cell.data)) {
              td.setAttribute('data-' + k, cell.data[k]);
            }
          }
          tr.appendChild(td);
        } else {
          if (!this.isCoveredByMerge(r, c)) {
            const td = document.createElement('td');
            td.textContent = '';
            td.dataset.r = String(r);
            td.dataset.c = String(c);
            tr.appendChild(td);
          }
        }
      }
      tableEl.appendChild(tr);
    }
  }
}
