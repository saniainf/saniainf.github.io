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
   * @param {number} [delay=75] Задержка (мс) перед фиксацией snapshot после последнего события.
   * Для джуниора: меньше задержка => быстрее пишем в историю, больше => лучше группируем серию изменений.
   */
  constructor(history, model, delay = 75, bus = null) {
    this.history = history;
    this.model = model;
    this.delay = delay; // текущий интервал debounce
    this._timer = null; // id таймера (возвращаемый setTimeout)
    this._pending = false; // есть ли в принципе отложенная запись
    this._bus = bus;      // Ссылка на EventBus (если передана) для синхронизации с batch

    // Если есть bus — подписываемся на окончание batch, чтобы зафиксировать состояние немедленно.
    // Для джуниора: это значит, что серия массовых операций (например добавление класса в
    // десятки ячеек) сохранится одним снимком истории сразу по завершении batch,
    // а не по таймеру.
    if (this._bus && typeof this._bus.on === 'function') {
      this._bus.on('batch:flush', () => {
        // Если во время batch были события — flush их.
        this.flush();
      });
    }
  }

  /**
   * Запланировать запись в историю через delay мс.
   * Если за время ожидания приходят новые события (повторный schedule) — таймер перезапускается.
   * Это и есть классическое debounce: серия быстрых изменений группируется в один snapshot.
   */
  schedule() {
    if (this.history._suspend) return; // Не пишем во время restore (undo/redo)
    // Перезапускаем таймер если уже ждём
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._pending = true;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (!this._pending) return; // на случай cancel()
      this._pending = false;
      // Фиксируем состояние модели как снимок истории
      this.history.record(this.model);
    }, this.delay);
  }

  /**
   * Принудительно выполнить запись немедленно (если была запланирована) и очистить таймер.
   * Полезно перед крупной операцией, которая требует точной точки отката.
   */
  flush() {
    if (this.history._suspend) return; // во время restore не пишем
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._pending) {
      this._pending = false;
      this.history.record(this.model);
    }
  }

  /**
   * Отменить запланированную запись (если она была). Ничего не пишем в историю.
   */
  cancel() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._pending = false;
  }

  /**
   * Изменить задержку на лету. Следующий schedule будет использовать новое значение.
   * @param {number} newDelay Новое значение задержки в мс.
   */
  setDelay(newDelay) {
    if (typeof newDelay === 'number' && newDelay >= 0) {
      this.delay = newDelay;
    }
  }
}
