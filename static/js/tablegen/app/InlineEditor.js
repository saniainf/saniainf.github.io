// InlineEditor.js
// Теперь отвечает только за редактирование (не за выбор ячеек).
// Логика выбора вынесена в SelectionService, что снижает связность.

/**
 * Класс для inline-редактирования содержимого ячеек.
 */
export class InlineEditor {
  /**
   * @param {TableModel} model Модель таблицы
   * @param {TableRenderer} tableRenderer Рендерер таблицы
   * @param {HistoryService} history История (в будущем для snapshot перед редактированием)
   * @param {SelectionService} selectionService Сервис выбора ячеек
   */
  constructor(model, tableRenderer, history, selectionService) {
    this.model = model;
    this.tableRenderer = tableRenderer;
    this.history = history;
    this.selectionService = selectionService;
    this.activeEditor = null; // {input, td, r, c, oldValue}
    this.justFinishedEditing = false; // Флаг для предотвращения немедленного повторного редактирования
    this._bindEvents();
  }

  /**
   * Вешаем обработчик клика на таблицу (делегирование).
   */
  _bindEvents() {
    const tbl = this.tableRenderer.tableEl;
    // Двойной клик — начать редактирование (выбор уже должен быть сделан SelectionService по клику)
    tbl.addEventListener('dblclick', (e) => {
      const td = e.target.closest('td');
      if (!td || !tbl.contains(td)) return;
      // Убедимся, что сервис знает об этой ячейке (если пользователь сразу двойным кликом)
      this.selectionService.selectByTd(td);
      this.beginEditFromSelection();
    });
    // Enter — редактирование выбранной ячейки (глобально)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this.activeEditor && !this.justFinishedEditing) {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        const sel = this.selectionService.getSelected();
        if (sel) { e.preventDefault(); this.beginEditFromSelection(); }
      }
    });
  }

  /**
   * Выделяет ячейку (снимает выделение с предыдущей).
   * @param {HTMLTableCellElement} td 
   */
  // Локальный выбор удалён — используется SelectionService

  /**
   * Начинает редактирование уже выделенной ячейки (если есть) 
   */
  beginEditFromSelection() {
    const sel = this.selectionService.getSelected();
    if (!sel) return;
    const td = this.tableRenderer.tableEl.querySelector(`td[data-r="${sel.r}"][data-c="${sel.c}"]`);
    if (!td) return;
    this.beginEdit(td);
  }

  /**
   * Запускаем редактирование конкретной ячейки.
   * @param {HTMLTableCellElement} td DOM элемент ячейки
   */
  beginEdit(td) {
    if (this.activeEditor) return; // Уже редактируем другую
    const r = parseInt(td.dataset.r, 10);
    const c = parseInt(td.dataset.c, 10);
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    // Если ячейка скрыта из-за merge (не ведущая) — не редактируем
    if (!this.model.getCell(r, c) && this.tableRenderer.isCoveredByMerge(r, c)) return;
    const cell = this.model.getCell(r, c);
    const oldValue = cell ? cell.value : '';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tablegen-edit-input';
    input.value = oldValue;
    input.style.width = Math.max(40, td.clientWidth - 8) + 'px';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

  // Сохраняем состояние активного редактора.
  // Для расширения: добавим позже сюда ссылки на commit / cancel, чтобы можно было инициировать
  // завершение редактирования извне (например при клике по другой ячейке).
  this.activeEditor = { input, td, r, c, oldValue, commit: null, cancel: null };
    // ВАЖНО: объявляем cleanup ДО commit/cancel, иначе обращение к ней из commit приведёт к ReferenceError
    const cleanup = () => {
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('blur', onBlur);
      this.activeEditor = null;
    };

    const reselectAfterRender = () => {
      // Для джуниора: rAF ждёт окончания перерисовки layout, затем мы просто пере-применяем выбор.
      requestAnimationFrame(() => this.selectionService.reapplySelection());
    };
    const commit = () => {
      if (!this.activeEditor) return;
      const { r, c, oldValue, input } = this.activeEditor;
      const newValue = input.value;
      if (newValue !== oldValue) this.model.setCellValue(r, c, newValue);
      cleanup();
      this.tableRenderer.render();
      reselectAfterRender();
      
      // Устанавливаем флаг, что мы только что закончили редактирование
      // Это предотвратит немедленное повторное редактирование от глобального Enter
      this.justFinishedEditing = true;
      // Сбрасываем флаг в следующем тике событий
      setTimeout(() => { this.justFinishedEditing = false; }, 0);
    };
    const cancel = () => {
      if (!this.activeEditor) return;
      cleanup();
      this.tableRenderer.render();
      reselectAfterRender();
      
      // Устанавливаем флаг, что мы только что закончили редактирование
      // Это предотвратит немедленное повторное редактирование от глобального Enter
      this.justFinishedEditing = true;
      // Сбрасываем флаг в следующем тике событий
      setTimeout(() => { this.justFinishedEditing = false; }, 0);
    };
    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Убираем обработчик blur чтобы не словить двойной commit
        input.removeEventListener('blur', onBlur);
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.removeEventListener('blur', onBlur);
        cancel();
      }
    };
    const onBlur = () => commit();

    input.addEventListener('keydown', onKey);
    input.addEventListener('blur', onBlur);

    // Делаем функции commit / cancel доступными извне через activeEditor,
    // чтобы другие части системы (инициализация, выбор ячейки) могли корретно завершить ввод.
    this.activeEditor.commit = () => {
      // Убираем blur чтобы избежать двойного вызова
      input.removeEventListener('blur', onBlur);
      commit();
    };
    this.activeEditor.cancel = () => {
      input.removeEventListener('blur', onBlur);
      cancel();
    };
  }

  /**
   * Принудительно отменяет текущее редактирование (используем при Undo/Redo).
   */
  cancelIfAny() {
    if (this.activeEditor) {
      this.activeEditor = null;
      this.tableRenderer.render();
    }
  }

  /**
   * Принудительно коммитит текущее редактирование, если оно есть.
   * Для джуниора: вызывается, например, при клике по другой ячейке, чтобы сохранить введённый текст.
   */
  commitIfAny() {
    if (this.activeEditor && typeof this.activeEditor.commit === 'function') {
      this.activeEditor.commit();
    }
  }
}
