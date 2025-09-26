// HistoryService.js
// Сервис истории (Undo/Redo). Хранит последовательность снимков документа (TableDocument) в массиве.
// Для джуниора: каждый снимок — это результат model.toJSON(). Мы не сохраняем сам объект model,
// а только сериализованный документ. При undo/redo пересоздаём модель из снимка.

export class HistoryService {
  constructor(limit = 50) {
    this.limit = limit;          // Максимальное количество снимков в истории
    this.stack = [];             // Массив снимков (TableDocument)
    this.index = -1;             // Текущая позиция в стеке (-1 означает пусто)
    this._suspend = false;       // Флаг для временного отключения записи (во время undo/redo)
  }

  /**
   * Записать новый снимок состояния
   * @param {import('../model/TableModel.js').TableModel} model
   */
  record(model) {
    if (this._suspend) return; // Не записываем когда выполняем восстановление
    const doc = model.toJSON();
    // Предотвращаем запись дубликата: если последний снимок идентичен (побайтово после JSON.stringify)
    // то пропускаем. Это решает проблему двойного Undo после операций, которые сами вызывают
    // history.record и одновременно генерируют события structure:change, приводящие к отложенной
    // записи через HistoryDebounceRecorder.
    const last = this.stack[this.index];
    if (last && JSON.stringify(last) === JSON.stringify(doc)) {
      return; // дубликат — не добавляем второй раз
    }
    // Если мы откатились назад и сделали новое действие — усекаем "будущее"
    if (this.index < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.index + 1);
    }
    this.stack.push(doc);
    if (this.stack.length > this.limit) {
      this.stack.shift(); // Удаляем самый старый
    } else {
      this.index++;
    }
  }

  /**
   * Можно ли сделать undo
   */
  canUndo() {
    return this.index > 0;
  }

  /**
   * Можно ли сделать redo
   */
  canRedo() {
    return this.index >= 0 && this.index < this.stack.length - 1;
  }

  /**
   * Откат к предыдущему снимку
   * @returns {object|null} TableDocument или null если нельзя
   */
  undo() {
    if (!this.canUndo()) return null;
    this.index--;
    return this._getCurrent();
  }

  /**
   * Повтор (возврат вперёд) к следующему снимку
   * @returns {object|null} TableDocument или null если нельзя
   */
  redo() {
    if (!this.canRedo()) return null;
    this.index++;
    return this._getCurrent();
  }

  _getCurrent() {
    if (this.index < 0 || this.index >= this.stack.length) return null;
    return this.stack[this.index];
  }

  /**
   * Выполнить восстановление документа (обёртка для безопасного отключения записи)
   * @param {(doc:object)=>void} applyFn - функция которая применит документ в модель
   * @param {object} doc - TableDocument
   */
  restore(applyFn, doc) {
    this._suspend = true;
    try {
      applyFn(doc);
    } finally {
      this._suspend = false;
    }
  }
}
