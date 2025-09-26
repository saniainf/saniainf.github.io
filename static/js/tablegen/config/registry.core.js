// Предопределённый (core) набор допустимых классов и data-* атрибутов.
// Формат подобран минималистичным: только enum, number, boolean. Без string и deprecated.
// exclusiveGroup позволяет указывать, что внутри группы может быть только один класс одновременно.

export const CORE_REGISTRY = {
  version: 1,
  classes: [
    { name: 'highlight', group: 'visual' },
    { name: 'numeric', group: 'datatype', exclusiveGroup: 'datatype' },
    { name: 'text', group: 'datatype', exclusiveGroup: 'datatype' }
  ],
  dataAttributes: [
    { name: 'data-role', type: 'enum', values: ['header', 'total', 'subtotal'], default: 'header' },
    { name: 'data-format', type: 'enum', values: ['number', 'percent', 'date'], default: 'number' }
  ],
  rules: {
    importPolicy: 'strict', // при импорте неизвестные классы/атрибуты приводят к ошибке
    classExclusivity: true  // применять exclusiveGroup логику
  }
};
