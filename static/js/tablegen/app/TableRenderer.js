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
    // Создаём отдельные секции thead / tbody, чтобы упростить добавление
    // заголовков столбцов и потенциально в будущем зафиксировать их стилями.
    this.thead = document.createElement('thead');
    this.tbody = document.createElement('tbody');
    this.tableEl.appendChild(this.thead);
    this.tableEl.appendChild(this.tbody);
    // Кэш покрытых координат (строка+запятая+колонка). Заполняется при каждом render().
    // Для джуниора: цель — ускорить проверку скрытых merge ячеек с O(N * merges) до O(1) по времени запроса.
    this._covered = new Set();
  }

  /**
   * Проверяем покрыта ли координата объединением (если да и не ведущая — её не нужно рисовать)
   * @param {number} r Строка
   * @param {number} c Колонка
   * @returns {boolean}
   */
  isCoveredByMerge(r, c) {
    // Теперь достаточно одной hash-проверки в Set.
    return this._covered.has(r + ',' + c);
  }

  /**
   * Полная перерисовка таблицы на основании текущего состояния модели.
   */
  render() {
    const model = this.model;
    const tableEl = this.tableEl;
    // Полностью пересоздаём содержимое head и body (упрощает логику, таблицы пока небольшие).
    this.thead.innerHTML = '';
    this.tbody.innerHTML = '';
    // Перед построением DOM пересобираем кэш покрытия merge.
    // Алгоритм: проходим по всем ведущим ячейкам; для каждой с rowspan/colspan >1
    // добавляем в Set все координаты, которые она покрывает, кроме самой ведущей.
    this._covered.clear();
    for (const cell of model.cells) {
      const rs = cell.rowSpan || 1;
      const cs = cell.colSpan || 1;
      if (rs === 1 && cs === 1) continue; // Нет расширения — нечего добавлять
      for (let rr = cell.r; rr < cell.r + rs; rr++) {
        for (let cc = cell.c; cc < cell.c + cs; cc++) {
          if (rr === cell.r && cc === cell.c) continue; // ведущая ячейка
          this._covered.add(rr + ',' + cc);
        }
      }
    }
    // --- Рендер строки нумерации столбцов (первая строка thead) ---
    const numberingRow = document.createElement('tr');
    const cornerTh = document.createElement('th');
    cornerTh.className = 'tablegen-header-corner';
    numberingRow.appendChild(cornerTh);
    for (let c = 0; c < model.grid.cols; c++) {
      const th = document.createElement('th');
      th.textContent = String(c + 1);
      th.className = 'tablegen-col-header';
      th.dataset.col = String(c);
      numberingRow.appendChild(th);
    }
    this.thead.appendChild(numberingRow);

    // --- Строка инпутов размеров столбцов ---
    const sizesRow = document.createElement('tr');
    const sizesCorner = document.createElement('th');
    sizesCorner.className = 'tablegen-header-corner';
    sizesCorner.textContent = 'W';
    sizesRow.appendChild(sizesCorner);
    for (let c = 0; c < model.grid.cols; c++) {
      const th = document.createElement('th');
      th.className = 'tablegen-col-header';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'tablegen-colsize-input';
      input.dataset.colSizeInput = String(c);
      input.style.width = '60px';
      input.style.boxSizing = 'border-box';
      input.style.fontSize = '11px';
      input.style.padding = '2px 3px';
      // Предзаполнение: если model.grid.columnSizes есть — выводим соответствующее значение
      if (model.grid.columnSizes && model.grid.columnSizes[c]) {
        const cs = model.grid.columnSizes[c];
        input.value = cs.u === 'px' ? (cs.v + 'px') : String(cs.v);
      } else {
        input.value = '1'; // дефолт
      }
      input.addEventListener('change', () => {
        // Передаём «сырой» ввод в модель
        this.model.setColumnSize(c, input.value);
      });
      th.appendChild(input);
      sizesRow.appendChild(th);
    }
    this.thead.appendChild(sizesRow);

  // --- Пользовательские строки шапки (headerRows) ---
  // Эти строки берутся из первых N строк данных модели и выводятся ТОЛЬКО в thead (не дублируются в tbody).
  // Таким образом тело содержит только «данные» после шапки.
    const headerRows = model.grid.headerRows || 0;
    if (headerRows > 0) {
      for (let r = 0; r < Math.min(headerRows, model.grid.rows); r++) {
        const hrTr = document.createElement('tr');
        // Левая нумерация строки шапки (как в body) — не редактируется
        const hrTh = document.createElement('th');
        hrTh.className = 'tablegen-row-header tablegen-user-header-corner';
        hrTh.textContent = String(r + 1);
        hrTr.appendChild(hrTh);
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
            hrTr.appendChild(td);
          } else {
            if (!this.isCoveredByMerge(r, c)) {
              const td = document.createElement('td');
              td.textContent = '';
              td.dataset.r = String(r);
              td.dataset.c = String(c);
              hrTr.appendChild(td);
            }
          }
        }
        this.thead.appendChild(hrTr);
      }
    }

    // --- Рендер тела с нумерацией строк ---
    for (let r = 0; r < model.grid.rows; r++) {
      // Пропускаем строки, которые отрисованы как шапка
      if (headerRows > 0 && r < headerRows) continue;
      const tr = document.createElement('tr');
      // Добавляем левый заголовок строки
      const rowTh = document.createElement('th');
      rowTh.textContent = String(r + 1);
      rowTh.className = 'tablegen-row-header';
      rowTh.dataset.row = String(r);
      tr.appendChild(rowTh);
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
      this.tbody.appendChild(tr);
    }
  }
}
