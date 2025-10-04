// registryValidation.test.js
// Тесты STRICT реестра: проверяем импорт, классы, атрибуты, exclusive группы, включение/выключение.
// Лёгкие ручные тесты: запускаются через импорт и вызов runRegistryTests(); проверки через assert.

import { EventBus } from '../core/events/EventBus.js';
import { TableModel } from '../core/model/TableModel.js';
import { ValidationService } from '../core/services/ValidationService.js';
import { parseTableJson } from '../integration/import/fromJson.js';
import { TABLEGEN_REGISTRY } from '../config/registry.index.js';

function assert(cond, message) {
  if (!cond) {
    console.error('TEST FAIL:', message);
    throw new Error(message);
  }
}

function createEnv(rows=4, cols=4) {
  const bus = new EventBus();
  const baseDoc = { version:1, meta:{name:'T'}, grid:{rows, cols}, cells:[] };
  const model = new TableModel(baseDoc, bus);
  const validator = new ValidationService(model);
  validator.initRegistry(TABLEGEN_REGISTRY);
  return { bus, model, validator };
}

function testImportUnknownClass() {
  const { validator } = createEnv();
  const doc = {
    version:1,
    meta:{},
    grid:{rows:2, cols:2},
    cells:[ { r:0, c:0, value:'A', classes:['no_such_class'] } ]
  };
  const res = parseTableJson(JSON.stringify(doc), validator);
  assert(!res.ok && /неизвестный класс/i.test(res.error), 'Импорт с неизвестным классом должен упасть');
  console.log('testImportUnknownClass OK');
}

function testImportUnknownDataAttr() {
  const { validator } = createEnv();
  const doc = {
    version:1, meta:{}, grid:{rows:2, cols:2},
    cells:[ { r:0,c:0,value:'A', data:{ 'data-ghost': 'x' } } ]
  };
  const res = parseTableJson(JSON.stringify(doc), validator);
  assert(!res.ok && /неизвестный data-атрибут/i.test(res.error), 'Импорт с неизвестным data-* должен упасть');
  console.log('testImportUnknownDataAttr OK');
}

function testImportEnumInvalid() {
  const { validator } = createEnv();
  // В реестре core (см. registry.core.js) есть data-role: enum ['header','total','subtotal'].
  const doc = {
    version:1, meta:{}, grid:{rows:2, cols:2},
    cells:[ { r:0,c:0,value:'A', data:{ 'data-role': 'WRONG_ENUM' } } ]
  };
  const res = parseTableJson(JSON.stringify(doc), validator);
  assert(!res.ok && /недопустимое значение/i.test(res.error), 'Импорт с неверным enum значением должен упасть');
  console.log('testImportEnumInvalid OK');
}

function testImportEnumValid() {
  const { validator } = createEnv();
  // Берём первое допустимое enum значение из реестра
  const meta = TABLEGEN_REGISTRY.dataAttributes.find(a => a.name === 'data-role');
  const good = meta ? meta.values[0] : undefined;
  assert(good !== undefined, 'В реестре должен существовать data-role с values');
  const goodDoc = { version:1, meta:{}, grid:{rows:2, cols:2}, cells:[ { r:0,c:0,value:'A', data:{ 'data-role': good } } ] };
  const res = parseTableJson(JSON.stringify(goodDoc), validator);
  assert(res.ok, 'Импорт с валидным enum должен пройти');
  console.log('testImportEnumValid OK');
}

function testExclusiveGroupConflict() {
  const { validator } = createEnv();
  // Ищем две записи из одной exclusiveGroup
  const groups = new Map();
  for (const cls of TABLEGEN_REGISTRY.classes) {
    if (cls.exclusiveGroup) {
      if (!groups.has(cls.exclusiveGroup)) groups.set(cls.exclusiveGroup, []);
      groups.get(cls.exclusiveGroup).push(cls.name);
    }
  }
  let pair = null;
  for (const [g, arr] of groups.entries()) {
    if (arr.length >= 2) { pair = arr.slice(0,2); break; }
  }
  if (!pair) { console.warn('Нет группы с >=2 классами для теста exclusiveGroup'); return; }
  const doc = {
    version:1, meta:{}, grid:{rows:2, cols:2},
    cells:[ { r:0,c:0,value:'A', classes: pair } ]
  };
  const res = parseTableJson(JSON.stringify(doc), validator);
  assert(!res.ok && /конфликт exclusiveGroup/i.test(res.error), 'Импорт с конфликтом exclusiveGroup должен упасть');
  console.log('testExclusiveGroupConflict OK');
}

function testToggleAttributeViaValidator() {
  // Имитация включения/выключения атрибута (edge case). Берём устойчиво существующий attr data-role.
  const { model } = createEnv();
  model.setCellValue(0,0,'X');
  const attrMeta = TABLEGEN_REGISTRY.dataAttributes.find(a => a.name === 'data-role') || TABLEGEN_REGISTRY.dataAttributes[0];
  assert(attrMeta, 'В реестре должен быть хотя бы один data-* атрибут');
  const cell = model.getCell(0,0);
  let data = cell.data ? { ...cell.data } : {};
  if (attrMeta.type === 'enum') data[attrMeta.name] = attrMeta.default ?? attrMeta.values[0];
  else if (attrMeta.type === 'number') data[attrMeta.name] = attrMeta.default ?? (attrMeta.min != null ? attrMeta.min : 0);
  else if (attrMeta.type === 'boolean') data[attrMeta.name] = attrMeta.default ?? false;
  model.setCellData(0,0,data);
  const afterEnable = model.getCell(0,0).data;
  assert(afterEnable && afterEnable[attrMeta.name] !== undefined, 'Атрибут должен появиться после включения');
  // Выключение (удаляем из объекта)
  data = { ...afterEnable };
  delete data[attrMeta.name];
  model.setCellData(0,0,data);
  const afterDisable = model.getCell(0,0).data;
  assert(!afterDisable || afterDisable[attrMeta.name] === undefined, 'Атрибут должен исчезнуть после удаления');
  console.log('testToggleAttributeViaValidator OK');
}

export function runRegistryTests() {
  testImportUnknownClass();
  testImportUnknownDataAttr();
  testImportEnumInvalid();
  testImportEnumValid();
  testExclusiveGroupConflict();
  testToggleAttributeViaValidator();
  console.log('All registry tests passed');
}
