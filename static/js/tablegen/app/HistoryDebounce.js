// HistoryDebounce.js
// Класс-обёртка для отложенной (debounce) записи состояния модели в HistoryService.
// Снижает количество snapshot'ов при массовых операциях (вставка, импорт, merge большого блока).

/**
 * Использование:
 *  const debounced = new HistoryDebounceRecorder(history, model);
 *  // при событии:
 *  debounced.schedule();
 */
export class HistoryDebounceRecorder {
  /**
   * @param {HistoryService} history История undo/redo
   * @param {TableModel} model Текущая модель
   */
  constructor(history, model) {
    this.history = history;
    this.model = model;
    this._scheduled = false;
  }

  /**
   * Планирует запись снапшота в историю в конце текущего тика event loop.
   */
  schedule() {
    if (this.history._suspend) return; // Не пишем во время restore
    if (this._scheduled) return;
    this._scheduled = true;
    setTimeout(() => {
      this._scheduled = false;
      this.history.record(this.model);
    }, 0);
  }
}
