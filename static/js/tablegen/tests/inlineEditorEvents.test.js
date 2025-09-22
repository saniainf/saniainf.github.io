// inlineEditorEvents.test.js
// Тесты событий InlineEditor (edit:start, edit:commit, edit:cancel)
// Для джуниора: мы эмулируем работу редактора без полноценного DOM-фреймворка.
// Проверяем, что при запуске, подтверждении и отмене редактирования генерируются корректные события.

import { EventBus } from '../core/events/EventBus.js';
import { TableModel } from '../core/model/TableModel.js';
import { TableRenderer } from '../app/TableRenderer.js';
import { InlineEditor } from '../app/InlineEditor.js';
import { SelectionService } from '../app/SelectionService.js';
import { RenderScheduler } from '../app/RenderScheduler.js';

function assert(cond, message) {
  if (!cond) {
    console.error('TEST FAIL:', message);
    throw new Error(message);
  }
}

function createEnv() {
  // Создаём bus + модель 3x3 для простоты
  const bus = new EventBus();
  const doc = { version:1, meta:{name:'InlineTest'}, grid:{rows:3, cols:3}, cells:[] };
  const model = new TableModel(doc, bus);
  // Заполним одну ячейку значением для проверки oldValue/newValue
  model.setCellValue(0,0,'A');
  const renderer = new TableRenderer(model, bus);
  // В реальном приложении renderer.tableEl добавляется в DOM; здесь достаточно иметь элемент в памяти
  const selection = new SelectionService(model, renderer, bus);
  const scheduler = new RenderScheduler(renderer, selection);
  const inlineEditor = new InlineEditor(model, renderer, null, selection, scheduler, bus);
  return { bus, model, renderer, selection, inlineEditor };
}

export function testInlineEditCommit() {
  const { bus, selection, inlineEditor, renderer } = createEnv();
  const events = [];
  bus.on('edit:start', e => events.push({ type:'start', e }));
  bus.on('edit:commit', e => events.push({ type:'commit', e }));
  bus.on('edit:cancel', e => events.push({ type:'cancel', e }));

  // Выбираем ячейку 0,0, имитируя пользовательский клик
  renderer.tableEl.innerHTML = ''; // гарантируем пустое состояние
  renderer.render();
  selection.select(0,0);
  // Начинаем редактирование
  inlineEditor.beginEditFromSelection();
  assert(events.length === 1 && events[0].type==='start','Должен быть один edit:start');
  // Меняем значение через input
  const input = inlineEditor.activeEditor.input;
  input.value = 'ABC';
  // Подтверждаем (симулируем Enter через прямой вызов commit())
  inlineEditor.activeEditor.commit();
  assert(events.length === 2 && events[1].type==='commit','Должен быть commit после start');
  assert(events[1].e.oldValue === 'A','oldValue должен быть A');
  assert(events[1].e.newValue === 'ABC','newValue должен быть ABC');
  console.log('testInlineEditCommit OK');
}

export function testInlineEditCancelEsc() {
  const { bus, selection, inlineEditor, renderer } = createEnv();
  const events = [];
  bus.on('edit:start', e => events.push({ type:'start', e }));
  bus.on('edit:commit', e => events.push({ type:'commit', e }));
  bus.on('edit:cancel', e => events.push({ type:'cancel', e }));

  renderer.render();
  selection.select(0,0);
  inlineEditor.beginEditFromSelection();
  assert(events.length===1 && events[0].type==='start','edit:start должен быть эмитирован');
  // Отмена редактирования через cancel()
  inlineEditor.activeEditor.cancel();
  assert(events.length===2 && events[1].type==='cancel','После отмены должен быть edit:cancel');
  assert(!inlineEditor.activeEditor,'Редактор должен быть сброшен');
  console.log('testInlineEditCancelEsc OK');
}

export function testInlineEditCancelExternal() {
  const { bus, selection, inlineEditor, renderer } = createEnv();
  const events = [];
  bus.on('edit:start', e => events.push({ type:'start', e }));
  bus.on('edit:commit', e => events.push({ type:'commit', e }));
  bus.on('edit:cancel', e => events.push({ type:'cancel', e }));

  renderer.render();
  selection.select(1,1);
  // Создадим ячейку 1,1
  inlineEditor.model.setCellValue(1,1,'X');
  // Нужно перерендерить чтобы td появился
  renderer.render();
  selection.select(1,1);
  inlineEditor.beginEditFromSelection();
  assert(events.length===1 && events[0].type==='start','Ожидали событие start');
  // Внешняя отмена (например undo) — используем cancelIfAny
  inlineEditor.cancelIfAny();
  assert(events.length===2 && events[1].type==='cancel','Ожидали событие cancel при внешней отмене');
  console.log('testInlineEditCancelExternal OK');
}

export function runInlineEditorEventsTests() {
  testInlineEditCommit();
  testInlineEditCancelEsc();
  testInlineEditCancelExternal();
  console.log('All inline editor events tests passed');
}
