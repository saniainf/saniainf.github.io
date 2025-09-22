// RenderScheduler.js
// Для джуниора: этот класс нужен, чтобы не вызывать перерисовку таблицы (render)
// слишком часто при серии быстрых изменений. Вместо множественных подряд вызовов
// мы ставим один запрос на ближайший animation frame (requestAnimationFrame) и
// выполняем ровно один render + восстановление выделения.
// Это снижает количество операций с DOM и ускоряет интерфейс.

export class RenderScheduler {
  /**
   * @param {import('./TableRenderer.js').TableRenderer} renderer - экземпляр рендерера таблицы
   * @param {import('./SelectionService.js').SelectionService} selectionService - сервис выделения
   */
  constructor(renderer, selectionService) {
    this.renderer = renderer;
    this.selectionService = selectionService;
    this._pending = false; // флаг, что кадр уже запрошен
    this._rafId = null;    // id requestAnimationFrame (для отмены при необходимости)
  }

  /**
   * Запросить отложенный render. Если уже запрошен — повторно не ставим.
   * Для джуниора: это защищает от десятков подряд render() при быстрой серии
   * событий (например, массовое изменение ячеек или быстрые клики).
   */
  request() {
    if (this._pending) return;
    this._pending = true;
    this._rafId = requestAnimationFrame(() => {
      this._pending = false;
      this._rafId = null;
      this._doRender();
    });
  }

  /**
   * Немедленно выполнить отрисовку, если нужно обойти ожидание кадра.
   * Обычно не требуется, но может быть полезно в тестах или force-refresh сценариях.
   */
  flush() {
    if (this._pending) {
      // Отменяем план и сразу рендерим
      cancelAnimationFrame(this._rafId);
      this._pending = false;
      this._rafId = null;
    }
    this._doRender();
  }

  /**
   * Отменить ожидающийся кадр без выполнения render.
   * Используется редко — например, если состояние уничтожается.
   */
  cancel() {
    if (!this._pending) return;
    cancelAnimationFrame(this._rafId);
    this._pending = false;
    this._rafId = null;
  }

  // Внутренний метод: один реальный цикл перерисовки + восстановление выделения/диапазона
  _doRender() {
    this.renderer.render();
    // После перерисовки DOM нам нужно вернуть визуальное выделение (CSS классы) —
    // сервис выделения умеет это делать с помощью специальных методов.
    this.selectionService.reapplySelection();
    this.selectionService.reapplyRange();
  }
}
