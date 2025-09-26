// structureHistory.test.js
// Undo тесты для структурных операций вставки (insertRows/insertColumns) и удаления (deleteRows/deleteColumns).
// Цель: убедиться что batch вставка/удаление даёт ровно один snapshot в истории
// и undo полностью восстанавливает исходную структуру (rows, cols, spans и позиции ведущих ячеек).

import { EventBus } from '../core/events/EventBus.js';
import { TableModel } from '../core/model/TableModel.js';
import { HistoryService } from '../core/services/HistoryService.js';
import { HistoryDebounceRecorder } from '../app/HistoryDebounce.js';

function assert(cond, msg) {
  if (!cond) { console.error('TEST FAIL:', msg); throw new Error(msg); }
}

function snapshotModelShape(model) {
  // Собираем лёгкое представление структуры: размеры + упорядоченный список ведущих ячеек (r,c,rowSpan,colSpan)
  const cells = model.cells.slice().sort((a,b)=> (a.r-b.r)|| (a.c-b.c)).map(c=>({ r:c.r, c:c.c, rs:c.rowSpan||1, cs:c.colSpan||1 }));
  return {
    rows: model.grid.rows,
    cols: model.grid.cols,
    cells
  };
}

function createEnv() {
  const bus = new EventBus();
  // Стартовая таблица 5x5 с одним merge блоком 2x3 для проверки расширения
  const doc = { version:1, meta:{ name:'StructHist' }, grid:{ rows:5, cols:5 }, cells:[
    { r:1, c:1, value:'', rowSpan:2, colSpan:3 }
  ]};
  const model = new TableModel(doc, bus);
  const history = new HistoryService(30);
  history.record(model); // snapshot #0
  const debounced = new HistoryDebounceRecorder(history, model, 30, bus); // короткий debounce
  return { bus, model, history, debounced };
}

export function testInsertRowsHistory() {
  const { bus, model, history } = createEnv();
  const before = snapshotModelShape(model);
  const prevIndex = history.index; // обычно 0
  // Делаем batch вставку 2 строк внутрь merge блока (index=2 попадает в диапазон rowSpan блока r=1 rs=2 -> расширение)
  bus.batch(()=>{
    model.insertRows(2,2);
  });
  // После batch HistoryDebounceRecorder должен сразу синхронно сделать snapshot (по событию batch:flush)
  assert(history.index === prevIndex + 1, 'Ожидаем один snapshot после batch insertRows');
  // Проверяем что модель изменилась
  assert(model.grid.rows === before.rows + 2, 'rows должны увеличиться на 2');
  const merged = model.getCell(1,1);
  assert(merged && merged.rowSpan === 4, 'rowSpan блока должен увеличиться с 2 до 4');
  // Undo
  const undoDoc = history.undo();
  model.applyDocument(undoDoc); // обычно UI слой делает applyDocument
  const afterUndo = snapshotModelShape(model);
  assert(JSON.stringify(afterUndo) === JSON.stringify(before), 'После undo структура должна полностью совпасть с исходной');
  console.log('testInsertRowsHistory OK');
}

export function testInsertColumnsHistory() {
  const { bus, model, history } = createEnv();
  const before = snapshotModelShape(model);
  const prevIndex = history.index;
  // Вставляем 1 столбец внутрь горизонтального span (merge блок c=1 colSpan=3 -> index=2 внутрь)
  bus.batch(()=>{
    model.insertColumns(2,1);
  });
  assert(history.index === prevIndex + 1, 'Ожидаем один snapshot после batch insertColumns');
  assert(model.grid.cols === before.cols + 1, 'cols должны увеличиться на 1');
  const merged = model.getCell(1,1);
  assert(merged && merged.colSpan === 4, 'colSpan блока должен увеличиться до 4');
  // Undo
  const undoDoc = history.undo();
  model.applyDocument(undoDoc);
  const afterUndo = snapshotModelShape(model);
  assert(JSON.stringify(afterUndo) === JSON.stringify(before), 'После undo структура должна совпасть с исходной (columns)');
  console.log('testInsertColumnsHistory OK');
}

export function testDeleteRowsHistory() {
  const { bus, model, history } = createEnv();
  // Добавим крупный вертикальный merge для shrink edge сценария
  model.cells.push({ r:0, c:0, value:'', rowSpan:4, colSpan:1 });
  model._rebuildIndex();
  // ВАЖНО: мы модифицировали модель после initial snapshot (#0), поэтому нужно зафиксировать новое базовое состояние.
  history.record(model); // теперь это snapshot #1
  const before = snapshotModelShape(model);
  const prevIndex = history.index; // фиксируем индекс до batch удаления
  // Удаляем нижнюю строку merge блока (start=3) -> shrink снизу
  bus.batch(()=> {
    const res = model.deleteRows(3,1);
    assert(res.ok, 'deleteRows должен вернуть ok');
  });
  assert(history.index === prevIndex + 1, 'Ожидаем один snapshot после batch deleteRows');
  const shrinkCell = model.getCell(0,0);
  assert(shrinkCell.rowSpan === 3, 'rowSpan должен уменьшиться до 3');
  // Undo
  const undoDoc = history.undo();
  model.applyDocument(undoDoc);
  const afterUndo = snapshotModelShape(model);
  assert(JSON.stringify(afterUndo) === JSON.stringify(before), 'После undo структура (deleteRows) должна восстановиться');
  console.log('testDeleteRowsHistory OK');
}

export function testDeleteColumnsHistory() {
  const { bus, model, history } = createEnv();
  // Горизонтальный merge для shrink edge
  model.cells.push({ r:0, c:0, value:'', rowSpan:1, colSpan:4 });
  model._rebuildIndex();
  // Аналогично тесту строк: фиксация нового стартового состояния после добавления merge блока.
  history.record(model); // snapshot инкремент
  const before = snapshotModelShape(model);
  const prevIndex = history.index;
  // Удаляем правый край (col=3)
  bus.batch(()=> {
    const res = model.deleteColumns(3,1);
    assert(res.ok, 'deleteColumns должен вернуть ok');
  });
  assert(history.index === prevIndex + 1, 'Ожидаем один snapshot после batch deleteColumns');
  const shrinkCell = model.getCell(0,0);
  assert(shrinkCell.colSpan === 3, 'colSpan должен уменьшиться до 3');
  // Undo
  const undoDoc = history.undo();
  model.applyDocument(undoDoc);
  const afterUndo = snapshotModelShape(model);
  assert(JSON.stringify(afterUndo) === JSON.stringify(before), 'После undo структура (deleteColumns) должна восстановиться');
  console.log('testDeleteColumnsHistory OK');
}

export function runStructureInsertHistoryTests() {
  testInsertRowsHistory();
  testInsertColumnsHistory();
  console.log('All structure insert history tests passed');
}

export function runStructureDeleteHistoryTests() {
  testDeleteRowsHistory();
  testDeleteColumnsHistory();
  console.log('All structure delete history tests passed');
}

// Объединённый раннер для всех history тестов структурных операций
export function runAllStructureHistoryTests() {
  runStructureInsertHistoryTests();
  runStructureDeleteHistoryTests();
  console.log('All structure history (insert+delete) tests passed');
}
