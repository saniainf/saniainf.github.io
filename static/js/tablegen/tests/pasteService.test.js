// pasteService.test.js
// Простейшие ручные тесты логики вставки.
// Для джуниора: так как у нас нет сейчас полноценного test runner,
// делаем минимальный скрипт, который можно подключить отдельно или вызвать из консоли.
// Он создаёт модель, имитирует вставку и проверяет ожидаемые свойства.

import { EventBus } from '../core/events/EventBus.js';
import { TableModel } from '../core/model/TableModel.js';
import { applyPaste, applyHtmlTablePaste } from '../core/services/PasteService.js';

// Утилита для assert
function assert(cond, message) {
  if (!cond) {
    console.error('TEST FAIL:', message);
    throw new Error(message);
  }
}

function createEmptyModel(rows=5, cols=5) {
  const bus = new EventBus();
  const doc = { version:1, meta:{name:'Test'}, grid:{rows, cols}, cells:[] };
  const model = new TableModel(doc, bus);
  return { model, bus };
}

export function testPlainTextPaste() {
  const { model } = createEmptyModel(3,3);
  const matrix = [ ['A','B'], ['C','D'] ];
  applyPaste(model, 0, 0, matrix);
  assert(model.getCell(0,0).value === 'A', 'Cell (0,0) should be A');
  assert(model.getCell(1,1).value === 'D', 'Cell (1,1) should be D');
  console.log('testPlainTextPaste OK');
}

export function testHtmlPasteWithMerge() {
  const { model } = createEmptyModel(4,4);
  // Имитация результата parseClipboardHtmlTable (упрощённо)
  const parsed = {
    success: true,
    rows: 3,
    cols: 3,
    cells: [
      { r:0, c:0, value:'X', rowSpan:2, colSpan:2 },
      { r:0, c:2, value:'R', rowSpan:1, colSpan:1 },
      { r:2, c:0, value:'Z', rowSpan:1, colSpan:1 },
      { r:2, c:1, value:'Q', rowSpan:1, colSpan:1 },
      { r:2, c:2, value:'W', rowSpan:1, colSpan:1 }
    ]
  };
  applyHtmlTablePaste(model, 0, 0, parsed);
  const lead = model.getCell(0,0);
  assert(lead.value === 'X', 'Merged lead value X');
  assert(lead.rowSpan === 2 && lead.colSpan === 2, 'Lead spans 2x2');
  assert(!model.getCell(1,1), 'Inner merged cell (1,1) must be absent');
  assert(model.getCell(0,2).value === 'R', 'Cell (0,2) R');
  assert(model.getCell(2,2).value === 'W', 'Cell (2,2) W');
  console.log('testHtmlPasteWithMerge OK');
}

// Запуск всех тестов (можно вызвать из консоли импортировав модуль)
export function runPasteTests() {
  testPlainTextPaste();
  testHtmlPasteWithMerge();
  console.log('All paste tests passed');
}
