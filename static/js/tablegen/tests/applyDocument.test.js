// applyDocument.test.js
// Тесты TableModel.applyDocument: с событием, без события (emitEvent:false), отказ на некорректном документе.

import { EventBus } from '../core/events/EventBus.js';
import { TableModel } from '../core/model/TableModel.js';

function assert(cond, message) {
  if (!cond) {
    console.error('TEST FAIL:', message);
    throw new Error(message);
  }
}

function createBaseModel() {
  const bus = new EventBus();
  const doc = { version:1, meta:{ name:'Base' }, grid:{ rows:2, cols:2 }, cells:[{ r:0, c:0, value:'A', rowSpan:1, colSpan:1 }] };
  const model = new TableModel(doc, bus);
  return { bus, model };
}

export function testApplyDocumentEmit() {
  const { bus, model } = createBaseModel();
  const events = [];
  bus.on('structure:change', e => events.push(e));

  const newDoc = { version:1, meta:{ name:'After' }, grid:{ rows:3, cols:4 }, cells:[{ r:1, c:1, value:'X', rowSpan:1, colSpan:1 }] };
  const ok = model.applyDocument(newDoc, { emitEvent:true });
  assert(ok, 'applyDocument должен вернуть true для валидного документа');
  assert(model.grid.rows === 3 && model.grid.cols === 4, 'Размеры должны обновиться');
  assert(model.getCell(1,1)?.value === 'X', 'Новая ячейка должна присутствовать');
  assert(events.length === 1, 'Должно быть одно structure:change событие');
  console.log('testApplyDocumentEmit OK');
}

export function testApplyDocumentSilent() {
  const { bus, model } = createBaseModel();
  const events = [];
  bus.on('structure:change', e => events.push(e));

  const newDoc = { version:1, meta:{ name:'Silent' }, grid:{ rows:5, cols:1 }, cells:[] };
  const ok = model.applyDocument(newDoc, { emitEvent:false });
  assert(ok, 'applyDocument silent должен вернуть true');
  assert(model.grid.rows === 5 && model.grid.cols === 1, 'Размеры должны обновиться (silent)');
  assert(events.length === 0, 'Не должно быть structure:change при emitEvent:false');
  console.log('testApplyDocumentSilent OK');
}

export function testApplyDocumentInvalid() {
  const { model } = createBaseModel();
  const badDoc = { meta:{}, grid:{ rows:'x', cols:2 }, cells:[] }; // rows не число
  const ok = model.applyDocument(badDoc, { emitEvent:true });
  assert(!ok, 'applyDocument должен вернуть false для некорректного документа');
  console.log('testApplyDocumentInvalid OK');
}

export function runApplyDocumentTests() {
  testApplyDocumentEmit();
  testApplyDocumentSilent();
  testApplyDocumentInvalid();
  console.log('All applyDocument tests passed');
}
