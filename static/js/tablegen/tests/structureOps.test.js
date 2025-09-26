// structureOps.test.js
// Тесты операций вставки и удаления строк/столбцов.
// Стиль аналогичен pasteService.test.js: ручные проверки через assert.
// Цель: убедиться в корректной работе insertRows/insertColumns и deleteRows/deleteColumns,
// включая обработку merge-блоков и защиту от interior split.

import { EventBus } from '../core/events/EventBus.js';
import { TableModel } from '../core/model/TableModel.js';

function assert(cond, msg) {
  if (!cond) { console.error('TEST FAIL:', msg); throw new Error(msg); }
}

function createModel(rows=6, cols=6) {
  const bus = new EventBus();
  const doc = { version:1, meta:{name:'StructTest'}, grid:{rows, cols}, cells:[] };
  const model = new TableModel(doc, bus);
  return { model, bus };
}

// --- INSERT TESTS ---
export function testInsertRowMiddle() {
  const { model } = createModel(5,5);
  // Создадим merge-блок 2x1 начиная с r=1
  model.cells.push({ r:1, c:2, value:'', rowSpan:2, colSpan:1 });
  model._rebuildIndex();
  model.insertRows(2,1); // вставляем строку внутрь блока (index=2) -> rowSpan должен увеличиться
  const cell = model.getCell(1,2);
  assert(cell && cell.rowSpan === 3, 'rowSpan должен расшириться до 3');
  assert(model.grid.rows === 6, 'rows должно стать 6');
  console.log('testInsertRowMiddle OK');
}

export function testInsertColumnEdgeOfMerge() {
  const { model } = createModel(4,4);
  model.cells.push({ r:0, c:1, value:'', rowSpan:1, colSpan:2 }); // merge по колонкам (1,2)
  model._rebuildIndex();
  model.insertColumns(3,1); // вставка после правого края (index=3)
  const cell = model.getCell(0,1);
  assert(cell.colSpan === 2, 'colSpan не должен измениться при вставке справа');
  assert(model.grid.cols === 5, 'cols должно стать 5');
  console.log('testInsertColumnEdgeOfMerge OK');
}

export function testInsertColumnInsideMerge() {
  const { model } = createModel(3,5);
  model.cells.push({ r:1, c:1, value:'M', rowSpan:1, colSpan:3 }); // покрывает c=1..3
  model._rebuildIndex();
  model.insertColumns(2,1); // вставка внутрь span (между c=1 и c=3) -> расширение
  const cell = model.getCell(1,1);
  assert(cell.colSpan === 4, 'colSpan должен увеличиться до 4');
  console.log('testInsertColumnInsideMerge OK');
}

// --- DELETE TESTS ---
export function testDeleteRowShrinkBottom() {
  const { model } = createModel(6,4);
  model.cells.push({ r:1, c:1, value:'', rowSpan:4, colSpan:1 }); // блок 1..4
  model._rebuildIndex();
  // Удаляем нижнюю строку блока (r=4)
  const res = model.deleteRows(4,1);
  assert(res.ok, 'Удаление должно быть ok');
  const cell = model.getCell(1,1);
  assert(cell.rowSpan === 3, 'rowSpan должен сократиться до 3');
  assert(model.grid.rows === 5, 'rows=5 после удаления');
  console.log('testDeleteRowShrinkBottom OK');
}

export function testDeleteRowShrinkTop() {
  const { model } = createModel(6,4);
  model.cells.push({ r:1, c:1, value:'', rowSpan:4, colSpan:1 }); // блок 1..4
  model._rebuildIndex();
  // Удаляем верхнюю строку блока (r=1)
  const res = model.deleteRows(1,1);
  assert(res.ok, 'Удаление должно быть ok');
  const cell = model.getCell(1,1); // смещённый вверх? политика: удалён top -> shrink сверху => cell.r = rFrom
  assert(cell.r === 1, 'Новый top блока = rFrom (1)');
  assert(cell.rowSpan === 3, 'rowSpan сокращён до 3');
  console.log('testDeleteRowShrinkTop OK');
}

export function testDeleteRowInteriorSplitForbidden() {
  const { model } = createModel(8,4);
  model.cells.push({ r:2, c:0, value:'', rowSpan:5, colSpan:1 }); // блок 2..6
  model._rebuildIndex();
  const res = model.deleteRows(4,1); // вырезаем середину (строка 4 внутри блока)
  assert(!res.ok && res.reason === 'interior-merge-cut', 'Должен быть interior-merge-cut отказ');
  console.log('testDeleteRowInteriorSplitForbidden OK');
}

export function testDeleteColumnShrinkRight() {
  const { model } = createModel(4,6);
  model.cells.push({ r:0, c:1, value:'', rowSpan:1, colSpan:4 }); // блок по колонкам 1..4
  model._rebuildIndex();
  const res = model.deleteColumns(4,1); // удаляем правый край (col=4)
  assert(res.ok, 'Удаление должно быть ok');
  const cell = model.getCell(0,1);
  assert(cell.colSpan === 3, 'colSpan сократился до 3');
  assert(model.grid.cols === 5, 'cols=5');
  console.log('testDeleteColumnShrinkRight OK');
}

export function testDeleteColumnInteriorSplitForbidden() {
  const { model } = createModel(5,7);
  model.cells.push({ r:2, c:2, value:'', rowSpan:1, colSpan:5 }); // покрывает 2..6
  model._rebuildIndex();
  const res = model.deleteColumns(4,1); // середина (col=4)
  assert(!res.ok && res.reason === 'interior-merge-cut', 'Ожидаем interior-merge-cut при удалении середины colSpan');
  console.log('testDeleteColumnInteriorSplitForbidden OK');
}

export function testDeleteColumnFullRemoval() {
  const { model } = createModel(4,5);
  model.cells.push({ r:0, c:1, value:'', rowSpan:2, colSpan:2 }); // покрывает c=1..2
  model._rebuildIndex();
  const res = model.deleteColumns(1,2); // полностью удаляем блок
  assert(res.ok, 'Удаление должно быть ok');
  const cell = model.getCell(0,1);
  assert(!cell, 'Блок должен исчезнуть');
  console.log('testDeleteColumnFullRemoval OK');
}

// Итоговый раннер
export function runStructureOpsTests() {
  // Insert
  testInsertRowMiddle();
  testInsertColumnEdgeOfMerge();
  testInsertColumnInsideMerge();
  // Delete
  testDeleteRowShrinkBottom();
  testDeleteRowShrinkTop();
  testDeleteRowInteriorSplitForbidden();
  testDeleteColumnShrinkRight();
  testDeleteColumnInteriorSplitForbidden();
  testDeleteColumnFullRemoval();
  console.log('All structureOps tests passed');
}
