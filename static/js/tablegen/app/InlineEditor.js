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
  constructor(model, tableRenderer, history, selectionService, scheduler, bus) {
    this.model = model;
    this.tableRenderer = tableRenderer;
    this.history = history;
    this.selectionService = selectionService;
    // Сохраняем ссылку на RenderScheduler, чтобы вызывать отложенный рендер вместо прямого render().
    this.scheduler = scheduler;
    // Шина событий нужна для генерации событий жизненного цикла редактирования
    this.bus = bus;
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
      // Теперь шапочные ячейки тоже отмечены data-r / data-c и могут быть td
      const td = e.target.closest('[data-r][data-c]');
      if (!td || !tbl.contains(td)) return;
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
  const td = this.tableRenderer.tableEl.querySelector(`[data-r="${sel.r}"][data-c="${sel.c}"]`);
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
    // Эмитим событие начала редактирования (для аналитики / интеграций)
    if (this.bus) {
      this.bus.emit('edit:start', { r, c, oldValue });
    }
    // ВАЖНО: объявляем cleanup ДО commit/cancel, иначе обращение к ней из commit приведёт к ReferenceError
    const cleanup = () => {
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('blur', onBlur);
      this.activeEditor = null;
    };

    // После интеграции RenderScheduler восстановление выделения делается централизованно.
    // Поэтому отдельная функция reselectAfterRender больше не нужна.
    const commit = () => {
      if (!this.activeEditor) return;
      const { r, c, oldValue, input } = this.activeEditor;
      const newValue = input.value;
      if (newValue !== oldValue) this.model.setCellValue(r, c, newValue);
      cleanup();
  // Планируем один рендер на кадр через scheduler
  this.scheduler.request();
      // Эмитим событие commit
      if (this.bus) {
        this.bus.emit('edit:commit', { r, c, oldValue, newValue });
      }
      
      // Устанавливаем флаг, что мы только что закончили редактирование
      // Это предотвратит немедленное повторное редактирование от глобального Enter
      this.justFinishedEditing = true;
      // Сбрасываем флаг в следующем тике событий
      setTimeout(() => { this.justFinishedEditing = false; }, 0);
    };
    const cancel = () => {
      if (!this.activeEditor) return;
      cleanup();
  this.scheduler.request();
      // Эмитим событие cancel
      if (this.bus) {
        this.bus.emit('edit:cancel', { r, c, oldValue });
      }
      
      // Устанавливаем флаг, что мы только что закончили редактирование
      // Это предотвратит немедленное повторное редактирование от глобального Enter
      this.justFinishedEditing = true;
      // Сбрасываем флаг в следующем тике событий
      setTimeout(() => { this.justFinishedEditing = false; }, 0);
    };
    const onKey = (e) => {
      // Alt+Enter: вставка <br> (перенос строки) без завершения редактирования.
      // Реализуем раньше чем обычный Enter, чтобы не произошёл commit.
      if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        this.applyFormatting('br');
        return;
      }
      // Ctrl+Enter / Cmd+Enter: тоже вставка <br> без завершения (удобно для пользователей привыкших к этой комбинации)
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.applyFormatting('br');
        return;
      }
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
      // Если есть активный редактор — трактуем это как отмену (без commit значения)
      const { r, c, oldValue } = this.activeEditor;
      this.activeEditor = null;
      this.scheduler.request();
      if (this.bus) {
        this.bus.emit('edit:cancel', { r, c, oldValue });
      }
    }
  }

  /**
   * Принудительно коммитит текущее редактирование (например при клике по другой ячейке).
   */
  commitIfAny() {
    if (this.activeEditor && typeof this.activeEditor.commit === 'function') {
      this.activeEditor.commit();
    }
  }

  /**
   * Оборачивает текущий выделенный текст в inline input разрешённым тегом или вставляет тег.
   * Поддерживаются: i, u, sup, sub, br. Историю не трогаем до commit.
   * @param {string} tag i|u|sup|sub|br
   */
  applyFormatting(tag) {
    if (!this.activeEditor) return false;
    const { input } = this.activeEditor;
    input.focus();
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    const value = input.value;

    if (tag === 'br') {
      // Вставляем перенос. Если есть выделение — заменяем его.
      const before = value.slice(0, start);
      const after = value.slice(end);
      const insert = '<br>';
      input.value = before + insert + after;
      const pos = before.length + insert.length;
      input.setSelectionRange(pos, pos);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    const open = `<${tag}>`;
    const close = `</${tag}>`;

    if (start === end) {
      // Нет выделения: вставляем пустую пару и ставим курсор внутрь
      const before = value.slice(0, start);
      const after = value.slice(end);
      input.value = before + open + close + after;
      const cursor = before.length + open.length;
      input.setSelectionRange(cursor, cursor);
    } else {
      // Оборачиваем выделенный диапазон
      const selText = value.slice(start, end);
      const before = value.slice(0, start);
      const after = value.slice(end);
      input.value = before + open + selText + close + after;
      const newStart = before.length + open.length;
      const newEnd = newStart + selText.length;
      input.setSelectionRange(newStart, newEnd);
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
}
