// SidePanel.js
// Панель редактирования classes и data-* атрибутов выбранной ячейки.
// Выделена из init.js для снижения сложности основной функции запуска.
import { getClassLabel, getAttrLabel, getEnumValueLabel } from '../config/registry.display.js';

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
  constructor(model, tableRenderer, selectionService, bus, validator, options = {}) {
    this.model = model;
    this.tableRenderer = tableRenderer;
    this.selectionService = selectionService;
    this.bus = bus;
    this.validator = validator;
    this.selectedCellRef = null; // {r,c}
    // Кэш последних введённых значений отключённых атрибутов.
    // Ключ: имя атрибута, значение: последнее пользовательское значение (типизированное).
    this.attrValueCache = {};
    this.rootEl = document.createElement('div');
    // Базовый класс панели + модификатор горизонтального режима если включён
    const horizontal = !!options.horizontal;
    this.rootEl.className = 'tablegen-side-panel' + (horizontal ? ' tablegen-sidepanel-horizontal' : '');
    // Tailwind оформление контейнера панели (фикс ширины, скролл, фон)
    this.rootEl.classList.add('bg-white', 'border', 'border-gray-200', 'rounded', 'p-2', 'mb-2', 'flex', 'gap-2', 'overflow-y-auto');
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
   * Унифицированный обход ячеек для массовых операций (классы, data-*). Если диапазона нет — действует на текущую ячейку.
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
    const panel = this.rootEl; // Основной контейнер теперь стилизуется через CSS классы

    // Убрали общий заголовок панели по требованию — панель начинается сразу с мета-блока

    // --- Общие параметры таблицы: имя и количество строк шапки ---
    const metaWrap = document.createElement('div');
    metaWrap.className = 'tg-sp-meta'; // Теперь вертикальная колонка: Имя / Строк шапки / Выбрана ячейка

    // Поле для имени таблицы
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Имя:';
    nameLabel.className = 'tg-sp-field';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Название таблицы';
    nameInput.value = this.model.meta?.name || '';
    nameInput.className = 'tg-sp-input tg-sp-input-text tg-input';
    nameInput.addEventListener('change', () => {
      this.model.setTableName(nameInput.value);
    });
    nameLabel.appendChild(nameInput);

    // Поле для количества строк шапки
    const headerLabel = document.createElement('label');
    headerLabel.textContent = 'Строк шапки:';
    headerLabel.className = 'tg-sp-field';
    const headerInput = document.createElement('input');
    headerInput.type = 'number';
    headerInput.min = '0';
    headerInput.step = '1';
    headerInput.className = 'tg-sp-input tg-sp-input-number tg-input tg-input-number';
    headerInput.value = String(this.model.grid.headerRows || 0);
    headerInput.addEventListener('change', () => {
      this.model.setHeaderRows(parseInt(headerInput.value, 10) || 0);
    });
    headerLabel.appendChild(headerInput);

    metaWrap.appendChild(nameLabel);
    metaWrap.appendChild(headerLabel);
    // Блок информации о выбранной ячейке
    const selWrap = document.createElement('div');
    selWrap.className = 'tg-sp-field tg-sp-field-inline'; // одна линия: метка + значение
    const selLabel = document.createElement('span'); selLabel.textContent = 'Выбрана:'; selLabel.className = 'tg-sp-selected-label';
    const selValue = document.createElement('span'); selValue.textContent = 'нет'; selValue.className = 'tg-sp-selected-info';
    selWrap.appendChild(selLabel); selWrap.appendChild(selValue);
    metaWrap.appendChild(selWrap);
    this.selectedInfoEl = selValue; // Сохраняем ссылку только на значение
    panel.appendChild(metaWrap);

    // Секция классов: обёртка + заголовок + контейнер
    const classesSection = document.createElement('div');
    classesSection.className = 'tg-sp-section';
    const classesTitle = document.createElement('div');
    classesTitle.textContent = 'CSS классы (выбор):';
    classesTitle.className = 'tg-sp-section-title';
    this.classControlsEl = document.createElement('div');
    this.classControlsEl.className = 'tg-sp-classes-box';
    classesSection.appendChild(classesTitle);
    classesSection.appendChild(this.classControlsEl);
    panel.appendChild(classesSection);

    // Секция атрибутов: обёртка + заголовок + контейнер
    const attrsSection = document.createElement('div');
    attrsSection.className = 'tg-sp-section';
    const attrsTitle = document.createElement('div');
    attrsTitle.textContent = 'data-* атрибуты (вкл/выкл):';
    attrsTitle.className = 'tg-sp-section-title';
    this.attrControlsEl = document.createElement('div');
    this.attrControlsEl.className = 'tg-sp-attrs-box';
    attrsSection.appendChild(attrsTitle);
    attrsSection.appendChild(this.attrControlsEl);
    panel.appendChild(attrsSection);

    // Функция применения нового списка классов (нормализация + batch)
    this._applyClasses = (newList) => {
      this.bus.batch(() => {
        this._forEachLeadCellInRange((cell, r, c) => {
          const normalized = this.validator.normalizeClassList(newList);
          const oldNorm = this.validator.normalizeClassList(cell.classes || []);
          if (JSON.stringify(normalized) !== JSON.stringify(oldNorm)) {
            this.model.setCellClasses(r, c, normalized);
          }
        });
      });
      this.refresh();
    };

    // Применение значения атрибута (либо его удаления)
    this._applyAttribute = (attrName, enabled, valueMeta) => {
      this.bus.batch(() => {
        this._forEachLeadCellInRange((cell, r, c) => {
          const current = cell.data ? { ...cell.data } : {};
          if (!enabled) {
            if (attrName in current) {
              delete current[attrName];
              this.model.setCellData(r, c, current);
            }
            return;
          }
          // enabled = true
          let valToStore = current[attrName];
          if (valToStore === undefined) {
            // Заполняем дефолтом или авто-значением
            if (valueMeta.type === 'enum') valToStore = valueMeta.default ?? valueMeta.values[0];
            else if (valueMeta.type === 'number') valToStore = valueMeta.default ?? (valueMeta.min != null ? valueMeta.min : 0);
            else if (valueMeta.type === 'boolean') valToStore = valueMeta.default ?? false;
          }
          // Если нам передали конкретное новое значение (valueMeta._newValue) используем его
          if (valueMeta && Object.prototype.hasOwnProperty.call(valueMeta, '_newValue')) {
            valToStore = valueMeta._newValue;
          }
          // Валидация перед записью
          const valid = this.validator.validateAttribute(attrName, valToStore);
          if (!valid.ok) return; // не записываем невалидное
          if (current[attrName] !== valToStore) {
            current[attrName] = valToStore;
            this.model.setCellData(r, c, current);
          }
        });
      });
      this.refresh();
    };

    // Построение UI контролов классов
    this._buildClassControls = (cell) => {
      this.classControlsEl.innerHTML = '';
      const allowed = this.validator.listAllowedClasses();
      if (!allowed.length) {
        const empty = document.createElement('div'); empty.textContent = '(нет определённых классов)'; empty.className = 'tg-sp-empty';
        this.classControlsEl.appendChild(empty); return;
      }
      // Группируем по group
      const byGroup = new Map();
      for (const cls of allowed) {
        const grp = cls.group || '(misc)';
        if (!byGroup.has(grp)) byGroup.set(grp, []);
        byGroup.get(grp).push(cls);
      }
      const current = cell && Array.isArray(cell.classes) ? cell.classes : [];
      const normalizedCurrent = this.validator.normalizeClassList(current);
      for (const [grp, list] of byGroup.entries()) {
        // Создаём контейнер группы
        const grpBox = document.createElement('div');
        grpBox.className = 'tg-sp-class-group';
        const grpTitle = document.createElement('div'); grpTitle.textContent = 'Группа: ' + grp; grpTitle.className = 'tg-sp-class-group-title';
        grpBox.appendChild(grpTitle);

        // Внутренний wrapper для элементов (сеткой по 3 строки в столбце)
        const itemsWrap = document.createElement('div');
        itemsWrap.className = 'tg-sp-class-items';

        list.forEach(clsMeta => {
          const label = document.createElement('label'); label.className = 'tg-sp-class-item tg-checkbox-inline';
          const cb = document.createElement('input'); cb.type = 'checkbox';
          cb.checked = normalizedCurrent.includes(clsMeta.name);
          cb.addEventListener('change', () => {
            // Формируем новый список: если включили — добавим; если выключили — удалим.
            let newList = [...normalizedCurrent];
            const idx = newList.indexOf(clsMeta.name);
            if (cb.checked) {
              if (idx === -1) newList.push(clsMeta.name);
            } else {
              if (idx !== -1) newList.splice(idx, 1);
            }
            // Нормализация эксклюзивных групп произойдёт в _applyClasses
            this._applyClasses(newList);
          });
          const span = document.createElement('span');
          span.textContent = getClassLabel(clsMeta);
          if (clsMeta.description) span.title = clsMeta.description;
          label.appendChild(cb); label.appendChild(span); itemsWrap.appendChild(label);
        });
        grpBox.appendChild(itemsWrap);
        this.classControlsEl.appendChild(grpBox);
      }
    };

    // Построение UI контролов атрибутов (всегда рендерим редакторы и просто отключаем их)
    this._buildAttrControls = (cell) => {
      this.attrControlsEl.innerHTML = '';
      const allowed = this.validator.listAllowedAttributes();
      if (!allowed.length) {
        const empty = document.createElement('div'); empty.textContent = '(нет определённых data-* атрибутов)'; empty.className = 'tg-sp-empty';
        this.attrControlsEl.appendChild(empty); return;
      }
      const cellData = (cell && cell.data) ? cell.data : {};
      allowed.forEach(meta => {
        const row = document.createElement('div'); row.className = 'tg-sp-attr-row';
        const enable = document.createElement('input'); enable.type = 'checkbox'; enable.title = 'Включить/отключить атрибут'; enable.classList.add('align-middle');
        const isEnabled = meta.name in cellData;
        enable.checked = isEnabled;
        const label = document.createElement('span');
        label.textContent = getAttrLabel(meta);
        label.className = 'tg-sp-attr-label';
        if (meta.description) label.title = meta.description;
        // Клик по названию атрибута теперь переключает чекбокс (аналог <label for>)
        label.addEventListener('click', (e) => {
          e.preventDefault();
          enable.checked = !enable.checked;
          enable.dispatchEvent(new Event('change', { bubbles: false }));
        });
        const editorWrap = document.createElement('div'); editorWrap.className = 'tg-sp-attr-editor';

        // Определяем исходное значение: приоритет — данные ячейки, затем кэш, затем дефолт
        let value;
        if (meta.name in cellData) value = cellData[meta.name];
        else if (meta.name in this.attrValueCache) value = this.attrValueCache[meta.name];
        else {
          if (meta.type === 'enum') value = meta.default ?? meta.values[0];
          else if (meta.type === 'number') value = meta.default ?? (meta.min != null ? meta.min : 0);
          else if (meta.type === 'boolean') value = meta.default ?? false;
        }

        // Создаём постоянный editor согласно типу
        let editorEl;
        if (meta.type === 'enum') {
          const sel = document.createElement('select'); sel.classList.add('tg-select', 'tg-input-sm');
          meta.values.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = getEnumValueLabel(meta, v); sel.appendChild(o); });
          sel.value = value;
          sel.addEventListener('change', () => {
            this.attrValueCache[meta.name] = sel.value; // сохраняем в кэш
            if (enable.checked) {
              this._applyAttribute(meta.name, true, { ...meta, _newValue: sel.value });
            }
          });
          editorEl = sel;
        } else if (meta.type === 'number') {
          const inp = document.createElement('input'); inp.type = 'number'; inp.classList.add('tg-input', 'tg-input-sm', 'tg-input-number');
          if (meta.min != null) inp.min = String(meta.min);
          if (meta.max != null) inp.max = String(meta.max);
          inp.value = String(value);
          inp.style.width = '80px';
          inp.addEventListener('change', () => {
            let num = Number(inp.value);
            if (Number.isNaN(num)) num = meta.min != null ? meta.min : 0;
            if (meta.min != null && num < meta.min) num = meta.min;
            if (meta.max != null && num > meta.max) num = meta.max;
            this.attrValueCache[meta.name] = num;
            if (enable.checked) this._applyAttribute(meta.name, true, { ...meta, _newValue: num });
          });
          editorEl = inp;
        } else if (meta.type === 'boolean') {
          const sel = document.createElement('select'); sel.classList.add('tg-select', 'tg-input-sm');
          ['false', 'true'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
          sel.value = value ? 'true' : 'false';
          sel.addEventListener('change', () => {
            const boolVal = sel.value === 'true';
            this.attrValueCache[meta.name] = boolVal;
            if (enable.checked) this._applyAttribute(meta.name, true, { ...meta, _newValue: boolVal });
          });
          editorEl = sel;
        }
        if (editorEl) editorWrap.appendChild(editorEl);

        // Первичное применение если атрибут включён и значения ещё нет в cellData (например из кэша)
        if (enable.checked && !(meta.name in cellData)) {
          this.attrValueCache[meta.name] = value;
          this._applyAttribute(meta.name, true, { ...meta, _newValue: value });
        }

        // Обработчик включения/выключения
        enable.addEventListener('change', () => {
          if (!enable.checked) {
            // Сохраняем текущее значение в кэш и удаляем из модели
            if (editorEl) {
              let stored;
              if (meta.type === 'enum') stored = editorEl.value;
              else if (meta.type === 'number') stored = Number(editorEl.value);
              else if (meta.type === 'boolean') stored = editorEl.value === 'true';
              this.attrValueCache[meta.name] = stored;
            }
            this._applyAttribute(meta.name, false, meta);
            if (editorEl) editorEl.disabled = true;
          } else {
            // Восстанавливаем из кэша или дефолта и применяем
            let restore = this.attrValueCache.hasOwnProperty(meta.name) ? this.attrValueCache[meta.name] : value;
            if (editorEl) {
              if (meta.type === 'boolean') editorEl.value = restore ? 'true' : 'false';
              else editorEl.value = String(restore);
              editorEl.disabled = false;
            }
            this._applyAttribute(meta.name, true, { ...meta, _newValue: restore });
          }
        });

        // Отключаем editor если атрибут выключен
        if (!enable.checked && editorEl) editorEl.disabled = true;

        row.appendChild(enable); row.appendChild(label); row.appendChild(editorWrap);
        this.attrControlsEl.appendChild(row);
      });
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
      // Если это накрытая merge часть (нет cell И координата покрыта merge) — игнорируем выбор
      const covered = !cell && this.tableRenderer.isCoveredByMerge(r, c);
      if (covered) {
        this.selectedCellRef = null;
        this.refresh();
        return;
      }
      // Пустая (ещё не созданная) ячейка допустима: показываем её как выбранную
      this.selectedCellRef = { r, c };
      this.refresh();
    });
    // Подписка на изменение диапазона (фиксация range) — для обновления отображения координат
    this.bus.on('selection:range', () => {
      // Диапазон зафиксирован (commitRange). Просто обновляем панель.
      this.refresh();
    });
  }

  /**
   * Обновляет панель в соответствии с текущей выбранной ячейкой.
   */
  refresh() {
    if (!this.selectedCellRef) {
      this.selectedInfoEl.textContent = 'нет';
      this.classControlsEl.innerHTML = '<div class="tg-sp-empty">(нет выбора)</div>';
      this.attrControlsEl.innerHTML = '<div class="tg-sp-empty">(нет выбора)</div>';
      return;
    }
    // Проверяем диапазон: если есть и больше одной ячейки — показываем границы
    const range = this.selectionService.getRange && this.selectionService.getRange();
    if (range) {
      const { r1, c1, r2, c2 } = range;
      const multi = (r1 !== r2) || (c1 !== c2);
      if (multi) {
        // Переключаем в пользовательский (1-based) формат
        this.selectedInfoEl.textContent = '(' + (r1 + 1) + ',' + (c1 + 1) + ') - (' + (r2 + 1) + ',' + (c2 + 1) + ')';
      } else {
        this.selectedInfoEl.textContent = '(' + (r1 + 1) + ',' + (c1 + 1) + ')';
      }
    } else {
      this.selectedInfoEl.textContent = '(' + (this.selectedCellRef.r + 1) + ',' + (this.selectedCellRef.c + 1) + ')';
    }
    const cell = this.model.getCell(this.selectedCellRef.r, this.selectedCellRef.c);
    this._buildClassControls(cell);
    this._buildAttrControls(cell);
  }
}
