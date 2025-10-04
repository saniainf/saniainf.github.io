// mergeService.test.js
// Ручные тесты логики merge / split (без тестового фреймворка — ошибки через assert).

import { EventBus } from '../core/events/EventBus.js';
import { TableModel } from '../core/model/TableModel.js';
import { mergeRange, splitCell, splitAllInRange } from '../core/services/MergeService.js';
import { ValidationService } from '../core/services/ValidationService.js';

// Простая утилита assert
function assert(cond, message) {
  if (!cond) {
    console.error('TEST FAIL:', message);
    throw new Error(message);
  }
}

function createModel(rows=6, cols=6) {
  const bus = new EventBus();
  const doc = { version:1, meta:{name:'MergeTest'}, grid:{rows, cols}, cells:[] };
  const model = new TableModel(doc, bus);
  const validator = new ValidationService(model);
  return { model, bus, validator };
}

export function testSimpleMerge() {
  const { model, validator } = createModel(5,5);
  const v = validator.validateMergeOperation(1,1,2,3);
  assert(v.ok, 'Ожидали что merge диапазона (1,1)-(2,3) валиден');
  const res = mergeRange(model,1,1,2,3);
  assert(res.ok, 'mergeRange должен выполниться');
  const lead = model.getCell(1,1);
  assert(lead && lead.rowSpan===2 && lead.colSpan===3, 'Ведущая ячейка должна иметь rowSpan=2 colSpan=3');
  // Проверяем что внутренняя ячейка удалена
  assert(!model.getCell(2,3), 'Внутренняя ячейка (2,3) должна быть поглощена (как объект отсутствует)');
  console.log('testSimpleMerge OK');
}

export function testNestedMergeNoOp() {
  const { model, validator } = createModel(5,5);
  // Создаём большую область 0,0 - 3,3
  let v = validator.validateMergeOperation(0,0,3,3);
  assert(v.ok, 'Большой merge валиден');
  let r = mergeRange(model,0,0,3,3);
  assert(r.ok,'Большой merge должен выполниться');
  // Пытаемся объединить вложенный диапазон 1,1 - 2,2 (полностью внутри)
  v = validator.validateMergeOperation(1,1,2,2);
  assert(v.ok,'Validator разрешает вложенный merge (он будет фактически no-op)');
  r = mergeRange(model,1,1,2,2);
  assert(r.ok,'mergeRange во вложенном диапазоне должен вернуть ok');
  // Убеждаемся что структура не изменилась: ведущая всё ещё (0,0)
  const lead = model.getCell(0,0);
  assert(lead && lead.rowSpan===4 && lead.colSpan===4, 'Главная объединённая ячейка осталась 4x4');
  console.log('testNestedMergeNoOp OK');
}

export function testPartialOverlapRejected() {
  const { model, validator } = createModel(5,5);
  // Объединим диапазон (0,0)-(2,2)
  let v = validator.validateMergeOperation(0,0,2,2);
  assert(v.ok,'Первый merge валиден');
  let r = mergeRange(model,0,0,2,2);
  assert(r.ok,'Первый merge выполнен');
  // Попытка объединить частично пересекающийся диапазон (1,1)-(3,3) — должна быть отвергнута валидатором
  v = validator.validateMergeOperation(1,1,3,3);
  assert(!v.ok,'Ожидаем отказ валидатора на частичное пересечение');
  // Даже если ошибочно вызвать mergeRange напрямую — он должен вернуть ошибку защитной проверкой
  r = mergeRange(model,1,1,3,3);
  assert(!r.ok,'mergeRange должен вернуть ошибку при частичном пересечении (fallback защита)');
  console.log('testPartialOverlapRejected OK');
}

export function testSplitCell() {
  const { model, validator } = createModel(6,6);
  // Merge 2x2
  let v = validator.validateMergeOperation(2,2,3,3);
  assert(v.ok,'Merge 2x2 валиден');
  let r = mergeRange(model,2,2,3,3);
  assert(r.ok,'Merge 2x2 прошёл');
  const lead = model.getCell(2,2);
  assert(lead && lead.rowSpan===2 && lead.colSpan===2,'Проверяем параметры merge');
  // Split
  const split = splitCell(model,2,2);
  assert(split.ok,'splitCell должен выполниться');
  assert(model.getCell(3,3),'После splitCell ячейка (3,3) должна появиться как отдельный объект');
  console.log('testSplitCell OK');
}

export function testSplitAllInRange() {
  const { model, validator } = createModel(8,8);
  // Делаем несколько merge
  let v = validator.validateMergeOperation(0,0,1,1); assert(v.ok); mergeRange(model,0,0,1,1);
  v = validator.validateMergeOperation(2,2,4,4); assert(v.ok); mergeRange(model,2,2,4,4);
  v = validator.validateMergeOperation(5,5,6,6); assert(v.ok); mergeRange(model,5,5,6,6);
  // Диапазон (1,1)-(6,6) пересекается со ВСЕМИ тремя merge областями:
  //  - (0,0)-(1,1) касается границей (делит общую ячейку (1,1)) — это тоже считается пересечением
  //  - (2,2)-(4,4) полностью внутри
  //  - (5,5)-(6,6) полностью внутри
  // В режиме overlap мы принимаем Excel‑подобную семантику: ЛЮБОЕ пересечение => split.
  const res = splitAllInRange(model,1,1,6,6);
  assert(res.ok,'splitAllInRange ok');
  assert(res.processed===3,'Должны быть разъединены 3 области (все пересекающиеся) для режима overlap');
  // Проверяем что одна из ячеек (3,3) теперь существует как обычная
  assert(model.getCell(3,3),'Ячейка (3,3) должна существовать после splitAllInRange');
  console.log('testSplitAllInRange OK');
}

/**
 * Тест режима fully: разъединяются только полностью включённые объединения, частичные остаются.
 */
export function testSplitAllInRangeFullyMode() {
  const { model, validator } = createModel(8,8);
  // Создаём три merge области
  let v = validator.validateMergeOperation(0,0,1,1); assert(v.ok); mergeRange(model,0,0,1,1); // A (частично пересечётся)
  v = validator.validateMergeOperation(2,2,4,4); assert(v.ok); mergeRange(model,2,2,4,4);     // B (полностью внутри)
  v = validator.validateMergeOperation(5,5,6,6); assert(v.ok); mergeRange(model,5,5,6,6);     // C (полностью внутри)

  // Выделяем диапазон (1,1)-(6,6): он полностью включает B и C, но только
  // частично задевает A (совпадает по углу в точке (1,1)). В режиме fully
  // мы ожидаем разъединения только B и C.
  const res = splitAllInRange(model,1,1,6,6,'fully');
  assert(res.ok,'splitAllInRange (fully) ok');
  assert(res.processed===2,'В режиме fully должны быть разъединены только 2 области (B и C)');

  // Проверяем что B действительно разъединена (ячейка изнутри теперь существует отдельно)
  assert(model.getCell(3,3),'Ячейка (3,3) должна существовать после splitAllInRange fully');
  // Проверяем что A НЕ была разъединена (остаётся объединённой 2x2)
  const aLead = model.getCell(0,0);
  assert(aLead && aLead.rowSpan===2 && aLead.colSpan===2,'Область A не должна быть разъединена в режиме fully');
  console.log('testSplitAllInRangeFullyMode OK');
}

export function testConsumeExistingMerge() {
  // Сценарий: сначала маленький merge, затем поглощающее объединение большего диапазона.
  const { model, validator } = createModel(6,6);
  let v = validator.validateMergeOperation(1,1,2,2); assert(v.ok); mergeRange(model,1,1,2,2);
  // Теперь объединяем больший диапазон, который целиком содержит предыдущий merge
  v = validator.validateMergeOperation(0,0,3,3); assert(v.ok,'Поглощающее объединение должно быть валидно');
  const r = mergeRange(model,0,0,3,3);
  assert(r.ok,'mergeRange для поглощающего диапазона должен выполниться');
  const lead = model.getCell(0,0);
  assert(lead && lead.rowSpan===4 && lead.colSpan===4,'Главная ячейка должна стать 4x4');
  console.log('testConsumeExistingMerge OK');
}

/**
 * Тест объединения текстовых значений: собираются сверху-вниз, слева-направо; пустые/пробельные пропускаются; join через пробел.
 */
export function testMergeValueConcatenation() {
  const { model } = createModel(4,4);
  // Заполним несколько ячеек значениями (включая пустые / пробельные)
  model.setCellValue(0,0,'Привет');
  model.setCellValue(0,1,' '); // будет проигнорирована
  model.setCellValue(1,0,'мир');
  model.setCellValue(1,1,'!');
  // Выполняем merge диапазона 0,0 - 1,1
  const res = mergeRange(model,0,0,1,1);
  assert(res.ok,'mergeRange для склейки значений должен выполниться');
  const lead = model.getCell(0,0);
  assert(lead.value === 'Привет мир !', 'Ожидали конкатенацию значений через пробел ("Привет мир !"), получили: '+lead.value);
  console.log('testMergeValueConcatenation OK');
}

// Запуск всех merge тестов
export function runMergeTests() {
  testSimpleMerge();
  testNestedMergeNoOp();
  testPartialOverlapRejected();
  testSplitCell();
  testSplitAllInRange();
  testSplitAllInRangeFullyMode();
  testConsumeExistingMerge();
  testMergeValueConcatenation();
  console.log('All merge tests passed');
}
