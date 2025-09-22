// EventBus.js
// Простой шина событий для обмена сообщениями между модулями.
// Сделано максимально минималистично, чтобы легко заменить позже на более продвинутый EventEmitter.
// Для джуниора: Map хранит соответствие имени события и множества (Set) обработчиков.

export class EventBus {
  constructor() {
    // Map<string, Set<Function>>
    this._handlers = new Map();
    // Флаги и буферы для batch-режима
    this._paused = false;           // Признак того, что события временно не доставляются немедленно
    this._buffer = new Map();       // Map<eventName, any[]> накопленные payload'ы
    this._pauseDepth = 0;           // Позволяет делать вложенные pause()/resume()
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
    if (this._paused) {
      // В batch режиме складываем payload. Для простоты пока не объединяем, а накапливаем.
      if (!this._buffer.has(eventName)) this._buffer.set(eventName, []);
      this._buffer.get(eventName).push(payload);
      return;
    }
    this._deliver(eventName, payload);
  }

  /**
   * Внутренний метод доставки события подписчикам (без учета paused состояния)
   * @param {string} eventName
   * @param {any} payload
   */
  _deliver(eventName, payload) {
    const set = this._handlers.get(eventName);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        console.error('[EventBus] Ошибка обработчика', eventName, err);
      }
    }
  }

  /**
   * Приостановить немедленную доставку событий. Поддерживает вложенные вызовы.
   * Для джуниора: пока пауза активна, события накапливаются в буфере.
   */
  pause() {
    this._pauseDepth++;
    this._paused = this._pauseDepth > 0;
  }

  /**
   * Возобновить доставку. Когда глубина паузы достигает 0 — все накопленные события доставляются.
   */
  resume() {
    if (this._pauseDepth === 0) return;
    this._pauseDepth--;
    if (this._pauseDepth === 0) {
      this._paused = false;
      // Доставляем накопленные. Порядок: по имени события в порядке добавления ключей.
      // Для упрощения: каждое событие доставляем один раз на каждый payload.
      const buffered = this._buffer;
      this._buffer = new Map();
      for (const [eventName, payloads] of buffered.entries()) {
        for (const p of payloads) this._deliver(eventName, p);
      }
        // После проигрывания всех событий эмитим специальное событие batch:flush,
        // чтобы сервисы (например история) могли зафиксировать итоговое состояние сразу.
        this._deliver('batch:flush', { bufferedEventCount: [...buffered.values()].reduce((a, arr) => a + arr.length, 0) });
    }
  }

  /**
   * Утилита для выполнения функции fn в batch-режиме:
   * bus.batch(() => { ...несколько emit... })
   * После выхода из функции произойдет один replay накопленных событий.
   * @param {Function} fn
   */
  batch(fn) {
    this.pause();
    try {
      fn();
    } finally {
      this.resume();
    }
  }
}
