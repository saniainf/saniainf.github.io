// SidePanel.js
// Панель редактирования classes и data-* атрибутов выбранной ячейки.
// Выделена из init.js для снижения сложности основной функции запуска.

/**
 * Класс панели справа: позволяет просматривать и редактировать классы и data-* атрибуты
 * выбранной ведущей ячейки (merged lead cell).
 */
export class SidePanel {
  /**
   * @param {TableModel} model Модель таблицы
   * @param {TableRenderer} tableRenderer Рендерер (для повторного рендера при надобности)
   * @param {SelectionService} selectionService Сервис выбора
   * @param {EventBus} bus Шина событий
   * @param {ValidationService} validator Сервис валидации
   */
  constructor(model, tableRenderer, selectionService, bus, validator) {
    this.model = model;
    this.tableRenderer = tableRenderer;
    this.selectionService = selectionService;
    this.bus = bus;
    this.validator = validator;
    this.selectedCellRef = null; // {r,c}
    this.rootEl = document.createElement('div');
    this.rootEl.className = 'tablegen-side-panel';
    this._build();
    this._subscribeSelection();
  }

  /**
   * Обходит все ведущие (реальные) ячейки в текущем выделенном диапазоне, если диапазон есть.
   * Если диапазона нет — обрабатывает только текущую выбранную ячейку.
   * Ведущая ячейка — та, которая реально существует в модели (model.getCell(r,c) вернул объект),
   * а не накрыта merge другой ячейкой (в этом случае getCell вернёт null/undefined).
   * Для каждого найденного элемента вызывает callback.
   * @param {(cell:object, r:number, c:number)=>void} fn Функция обработки ячейки
   */
  /**
   * Унифицированный обход ячеек для массовых операций (классы, data-*).
   * Для джуниора: мы не хотим дублировать логику определения диапазона в каждом месте,
   * поэтому выносим сюда. Если диапазона нет — действуем на одну текущую ячейку.
   * @param {(cell:object, r:number, c:number)=>void} fn Колбек обработки
   */
  _forEachLeadCellInRange(fn) {
    const range = this.selectionService.getRange && this.selectionService.getRange();
    if (!range) {
      // Нет диапазона — работаем только с одиночной ячейкой
      if (!this.selectedCellRef) return;
      const { r, c } = this.selectedCellRef;
      const cell = this.model.getCell(r, c);
      if (cell) fn(cell, r, c);
      return;
    }
    const { r1, c1, r2, c2 } = range;
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = this.model.getCell(r, c);
        if (!cell) continue; // пропускаем накрытые merge участки
        fn(cell, r, c);
      }
    }
  }

  _build() {
    const panel = this.rootEl;
    panel.style.border = '1px solid #ccc';
    panel.style.padding = '8px';
    panel.style.marginTop = '12px';
    panel.style.maxWidth = '420px';

    const title = document.createElement('div');
    title.textContent = 'Редактор classes / data-*';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '6px';
    panel.appendChild(title);

    this.selectedInfoEl = document.createElement('div');
    this.selectedInfoEl.textContent = 'Ячейка не выбрана';
    this.selectedInfoEl.style.marginBottom = '6px';
    panel.appendChild(this.selectedInfoEl);

    // ----- БЛОК КЛАССОВ -----
    const classSectionTitle = document.createElement('div');
    classSectionTitle.textContent = 'CSS классы:';
    classSectionTitle.style.marginTop = '4px';
    panel.appendChild(classSectionTitle);

    this.classListEl = document.createElement('div');
    this.classListEl.style.display = 'flex';
    this.classListEl.style.flexWrap = 'wrap';
    this.classListEl.style.gap = '4px';
    this.classListEl.style.minHeight = '24px';
    this.classListEl.style.border = '1px dashed #aaa';
    this.classListEl.style.padding = '4px';
    this.classListEl.style.marginBottom = '4px';
    panel.appendChild(this.classListEl);

    const classInputWrap = document.createElement('div');
    const classInput = document.createElement('input');
    classInput.type = 'text';
    classInput.placeholder = 'Новый класс';
    classInput.style.width = '140px';
    const addClassBtn = document.createElement('button');
    addClassBtn.textContent = '+';
    addClassBtn.title = 'Добавить класс';
    addClassBtn.addEventListener('click', () => {
      // Добавляем класс ко всем ведущим ячейкам диапазона (если есть диапазон) либо к одной выбранной.
      const name = classInput.value.trim();
      if (!name) return; // пустые игнорируем
      let changed = false;
      this._forEachLeadCellInRange((cell, r, c) => {
        const current = cell.classes ? [...cell.classes] : [];
        // Валидация для каждой ячейки отдельно — может отклониться только для неё.
        const validation = this.validator.canAddClass(current, name);
        if (!validation.ok) return; // пропускаем только эту ячейку
        current.push(name);
        this.model.setCellClasses(r, c, current);
        changed = true;
      });
      if (changed) {
        this.refresh();
        classInput.value = '';
      }
    });
    classInputWrap.appendChild(classInput);
    classInputWrap.appendChild(addClassBtn);
    classInputWrap.style.display = 'flex';
    classInputWrap.style.gap = '4px';
    classInputWrap.style.marginBottom = '8px';
    panel.appendChild(classInputWrap);

    this._renderClassChips = (cell) => {
      this.classListEl.innerHTML = '';
      const list = cell && cell.classes ? cell.classes : [];
      if (!list.length) {
        const empty = document.createElement('span');
        empty.textContent = '(нет)';
        empty.style.opacity = '0.6';
        this.classListEl.appendChild(empty);
        return;
      }
      for (const cls of list) {
        const chip = document.createElement('span');
        chip.textContent = cls + ' ×';
        chip.style.background = '#eee';
        chip.style.border = '1px solid #bbb';
        chip.style.padding = '2px 6px';
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', () => {
          // Удаляем класс из всех ведущих ячеек диапазона / или одной выбранной.
            let removedAny = false;
            this._forEachLeadCellInRange((cell, r, c) => {
              const current = cell.classes ? [...cell.classes] : [];
              if (!current.includes(cls)) return; // нет класса — пропускаем
              const filtered = current.filter(x => x !== cls);
              this.model.setCellClasses(r, c, filtered);
              removedAny = true;
            });
            if (removedAny) this.refresh();
        });
        this.classListEl.appendChild(chip);
      }
    };

    // ----- БЛОК data-* -----
    const dataTitle = document.createElement('div');
    dataTitle.textContent = 'data-* атрибуты:';
    dataTitle.style.marginTop = '4px';
    panel.appendChild(dataTitle);

    this.dataTable = document.createElement('table');
    this.dataTable.style.width = '100%';
    this.dataTable.style.borderCollapse = 'collapse';
    this.dataTable.style.marginTop = '4px';
    this.dataTbody = document.createElement('tbody');
    this.dataTable.appendChild(this.dataTbody);
    panel.appendChild(this.dataTable);

    // ---- Добавление / обновление data-* пары (единый ключ без авто-генерации) ----
    // Для джуниора: теперь мы не создаём автоматически key1, key2. Вместо этого просим пользователя ввести
    // понятные key и value. Если в ячейке уже есть этот ключ — просто обновим его значение.
    const dataAddWrap = document.createElement('div');
    dataAddWrap.style.display = 'flex';
    dataAddWrap.style.gap = '4px';
    dataAddWrap.style.marginTop = '4px';
    const dataKeyInput = document.createElement('input');
    dataKeyInput.type = 'text';
    dataKeyInput.placeholder = 'key';
    dataKeyInput.style.width = '110px';
    const dataValInput = document.createElement('input');
    dataValInput.type = 'text';
    dataValInput.placeholder = 'value';
    dataValInput.style.width = '140px';
    const applyDataBtn = document.createElement('button');
    applyDataBtn.textContent = 'Применить';
    applyDataBtn.title = 'Добавить или обновить data-* во всех выбранных ячейках';
    applyDataBtn.addEventListener('click', () => {
      const key = dataKeyInput.value.trim();
      if (!key) { console.warn('Ключ не может быть пустым'); return; }
      if (!this.validator.validateDataKey(key)) { console.warn('Недопустимый формат ключа'); return; }
      const value = dataValInput.value; // пустая строка допустима
      let changed = false;
      this._forEachLeadCellInRange((cell, r, c) => {
        const current = cell.data ? { ...cell.data } : {};
        // Валидация добавления (если ключа нет) — если ключ уже есть, canAddDataAttribute можно не звать, но оставим универсально.
        if (!(key in current)) {
          const validation = this.validator.canAddDataAttribute(current, key, value);
          if (!validation.ok) return; // пропускаем только конкретную ячейку
        }
        // Присваиваем / обновляем
        if (current[key] !== value) {
          current[key] = value;
          this.model.setCellData(r, c, current);
          changed = true;
        }
      });
      if (changed) {
        // Не очищаем выделение — SidePanel.refresh() перерисует список, а диапазон восстановится через reapplyRange (будет добавлен).
        this.refresh();
      }
    });
    dataAddWrap.appendChild(dataKeyInput);
    dataAddWrap.appendChild(dataValInput);
  dataAddWrap.appendChild(applyDataBtn);
  // Для UX можно в будущем добавить Enter по полю value => клик по кнопке.
    panel.appendChild(dataAddWrap);

    this._renderDataRows = (cell) => {
      this.dataTbody.innerHTML = '';
      const obj = cell && cell.data ? cell.data : {};
      const keys = Object.keys(obj);
      if (!keys.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3; td.textContent = '(нет атрибутов)'; td.style.opacity = '0.6';
        tr.appendChild(td); this.dataTbody.appendChild(tr); return;
      }
      for (const k of keys) {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #ddd';
        const keyTd = document.createElement('td');
        const valTd = document.createElement('td');
        const delTd = document.createElement('td');
        keyTd.style.padding = valTd.style.padding = delTd.style.padding = '2px';
        const keyInput = document.createElement('input'); keyInput.type = 'text'; keyInput.value = k; keyInput.style.width = '110px';
        const valInput = document.createElement('input'); valInput.type = 'text'; valInput.value = obj[k]; valInput.style.width = '140px';
        const delBtn = document.createElement('button'); delBtn.textContent = '×'; delBtn.title = 'Удалить атрибут';
        delBtn.addEventListener('click', () => {
          // Удаляем этот data-* ключ из всех ячеек диапазона / или одной выбранной.
          let removed = false;
          this._forEachLeadCellInRange((cell, r, c) => {
            const copy = cell.data ? { ...cell.data } : {};
            if (!(k in copy)) return; // нет ключа — пропускаем
            delete copy[k];
            this.model.setCellData(r, c, copy);
            removed = true;
          });
          if (removed) this.refresh();
        });
        keyInput.addEventListener('change', () => {
          // Переименовываем ключ во всех ячейках, где он есть и где нет конфликта по новому имени.
          const newKey = keyInput.value.trim();
          if (!newKey) { console.warn('Ключ не может быть пустым'); keyInput.value = k; return; }
          if (!this.validator.validateDataKey(newKey)) {
            console.warn('Недопустимый формат ключа data-атрибута');
            keyInput.value = k; return; }
          if (newKey === k) return; // не изменили
          let renamed = false;
            this._forEachLeadCellInRange((cell, r, c) => {
              if (!cell.data) return;
              if (!(k in cell.data)) return; // в этой ячейке ключа нет
              if (newKey in cell.data) return; // конфликт — пропускаем
              const copy = { ...cell.data };
              copy[newKey] = copy[k]; delete copy[k];
              this.model.setCellData(r, c, copy);
              renamed = true;
            });
          if (!renamed) {
            // Если не смогли ни в одной ячейке — откатываем поле ввода.
            keyInput.value = k;
            return;
          }
          this.refresh();
        });
        valInput.addEventListener('change', () => {
          // Изменяем значение data-* ключа у всех ячеек диапазона, в которых этот ключ существует.
          const newVal = valInput.value;
          this._forEachLeadCellInRange((cell, r, c) => {
            if (!cell.data || !(k in cell.data)) return;
            const copy = { ...cell.data };
            copy[k] = newVal;
            this.model.setCellData(r, c, copy);
          });
        });
        keyTd.appendChild(keyInput); valTd.appendChild(valInput); delTd.appendChild(delBtn);
        tr.appendChild(keyTd); tr.appendChild(valTd); tr.appendChild(delTd); this.dataTbody.appendChild(tr);
      }
    };
  }

  _subscribeSelection() {
    // Подписываемся на события изменения выбора из SelectionService через bus
    this.bus.on('selection:change', ({ r, c, cell }) => {
      if (r == null || c == null) {
        this.selectedCellRef = null;
        this.refresh();
        return;
      }
      // Если скрытая merge часть (cell null) — игнорируем
      if (!cell) {
        this.selectedCellRef = null;
        this.refresh();
        return;
      }
      this.selectedCellRef = { r, c };
      this.refresh();
    });
  }

  /**
   * Обновляет панель в соответствии с текущей выбранной ячейкой.
   */
  refresh() {
    if (!this.selectedCellRef) {
      this.selectedInfoEl.textContent = 'Ячейка не выбрана';
      this._renderClassChips(null);
      this._renderDataRows(null);
      return;
    }
    const cell = this.model.getCell(this.selectedCellRef.r, this.selectedCellRef.c);
    this.selectedInfoEl.textContent = 'Выбрана ячейка: (' + this.selectedCellRef.r + ',' + this.selectedCellRef.c + ')';
    this._renderClassChips(cell);
    this._renderDataRows(cell);
  }
}
