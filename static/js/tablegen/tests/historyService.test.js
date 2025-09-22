// historyService.test.js
// Тесты истории: базовый undo/redo, redo сбрасывается после новой правки, debounce группировка.
// Для джуниора: мы максимально изолируем тест от UI — работаем только с моделью и сервисами.

import { EventBus } from '../core/events/EventBus.js';
import { TableModel } from '../core/model/TableModel.js';
import { HistoryService } from '../core/services/HistoryService.js';
import { HistoryDebounceRecorder } from '../app/HistoryDebounce.js';

function assert(cond, message) {
  if (!cond) {
    console.error('TEST FAIL:', message);
    throw new Error(message);
  }
}

function createEnv() {
  const bus = new EventBus();
  const doc = { version:1, meta:{ name:'Hist' }, grid:{ rows:2, cols:2 }, cells:[] };
  const model = new TableModel(doc, bus);
  const history = new HistoryService(20);
  history.record(model); // snapshot #0
  const debounced = new HistoryDebounceRecorder(history, model, 50, bus);
  return { bus, model, history, debounced };
}

export function testBasicUndoRedo() {
  const { model, history } = createEnv();
  // Изменяем 2 ячейки и фиксируем сразу вручную (имитируем события через прямую запись)
  model.setCellValue(0,0,'A');
  history.record(model); // snapshot #1
  model.setCellValue(0,1,'B');
  history.record(model); // snapshot #2
  assert(history.index === 2, 'Ожидаем индекс 2');
  // Undo -> snapshot #1
  let doc = history.undo();
  assert(doc.grid.cols === 2, 'grid должен сохраниться');
  assert(history.index === 1, 'После undo индекс 1');
  // Undo -> snapshot #0
  doc = history.undo();
  assert(history.index === 0, 'После второго undo индекс 0');
  // Redo -> назад к #1
  doc = history.redo();
  assert(history.index === 1, 'После redo индекс 1');
  console.log('testBasicUndoRedo OK');
}

export function testRedoInvalidatedAfterNewEdit() {
  const { model, history } = createEnv();
  model.setCellValue(0,0,'A');
  history.record(model); // #1
  model.setCellValue(0,0,'B');
  history.record(model); // #2
  assert(history.index === 2, 'index==2 после двух изменений');
  // undo -> #1
  history.undo();
  assert(history.index === 1, 'undo -> index==1');
  // Новое изменение после undo (должно усечь будущее (#2))
  model.setCellValue(1,1,'X');
  history.record(model); // теперь это новый #2, старый #2 потерян
  assert(!history.canRedo(), 'redo должен быть недоступен после новой правки');
  console.log('testRedoInvalidatedAfterNewEdit OK');
}

export function testDebounceGrouping(doneCallback) {
  const { model, history, debounced } = createEnv();
  // Сделаем несколько быстрых изменений через debounced.schedule()
  model.setCellValue(0,0,'1'); debounced.schedule();
  model.setCellValue(0,0,'12'); debounced.schedule();
  model.setCellValue(0,0,'123'); debounced.schedule();
  // Пока таймер не сработал — история не должна увеличиться (index всё ещё 0)
  assert(history.index === 0, 'Пока debounce не завершён, индекс должен быть 0');
  // Ждём 120 мс (больше 50) чтобы debounce отработал
  setTimeout(() => {
    assert(history.index === 1, 'После debounce должен быть один новый snapshot (index 1)');
    console.log('testDebounceGrouping OK');
    if (doneCallback) doneCallback();
  }, 120);
}

export function runHistoryTests() {
  testBasicUndoRedo();
  testRedoInvalidatedAfterNewEdit();
  // Для debounce используем асинхронный паттерн — завершим цепочку в конце timeout
  testDebounceGrouping(() => {
    console.log('All history tests passed');
  });
}
