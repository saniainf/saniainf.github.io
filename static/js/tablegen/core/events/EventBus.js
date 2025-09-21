// EventBus.js
// Простой шина событий для обмена сообщениями между модулями.
// Сделано максимально минималистично, чтобы легко заменить позже на более продвинутый EventEmitter.
// Для джуниора: Map хранит соответствие имени события и множества (Set) обработчиков.

export class EventBus {
  constructor() {
    // Map<string, Set<Function>>
    this._handlers = new Map();
  }

  /**
   * Подписка на событие
   * @param {string} eventName - имя события
   * @param {Function} handler - функция обработчик
   */
  on(eventName, handler) {
    if (!this._handlers.has(eventName)) {
      this._handlers.set(eventName, new Set());
    }
    this._handlers.get(eventName).add(handler);
  }

  /**
   * Отписка от события
   * @param {string} eventName - имя события
   * @param {Function} handler - ранее добавленный обработчик
   */
  off(eventName, handler) {
    const set = this._handlers.get(eventName);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this._handlers.delete(eventName);
      }
    }
  }

  /**
   * Генерация (emit) события
   * @param {string} eventName - имя события
   * @param {any} payload - данные события
   */
  emit(eventName, payload) {
    const set = this._handlers.get(eventName);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        // Логируем, но не падаем, чтобы один плохой обработчик не ломал остальные
        console.error('[EventBus] Ошибка обработчика', eventName, err);
      }
    }
  }
}
