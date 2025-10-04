// Предопределённый (core) набор допустимых классов и data-* атрибутов.
// Формат подобран минималистичным: только enum, number, boolean. Без string и deprecated.
// exclusiveGroup позволяет указывать, что внутри группы может быть только один класс одновременно.

export const CORE_REGISTRY = {
  version: 1,
  classes: [
    // highlight — визуальное подчёркивание важности
    { name: 'color-highlight', group: 'visual', label: 'Выделение', description: 'Подсветить ячейку для акцента (например важное значение)' },
    // numeric / text — взаимоисключающие типы данных (exclusiveGroup)
    { name: 'numeric', group: 'datatype', exclusiveGroup: 'datatype', label: 'Числовое', description: 'Ячейка содержит число, может применяться спец. форматирование' },
    { name: 'text', group: 'datatype', exclusiveGroup: 'datatype', label: 'Текст', description: 'Обычный текстовый контент без числовой семантики' }
  ],
  dataAttributes: [
    { 
      name: 'data-role', 
      type: 'enum', 
      values: ['header', 'total', 'subtotal'], 
      default: 'header', 
      label: 'Роль', 
      description: 'Семантическая роль значения ячейки (заголовок, итого, подытог)',
      valueLabels: { header: 'Заголовок', total: 'Итого', subtotal: 'Промежуточно' },
      quickToggle: true
    },
    { 
      name: 'data-format', 
      type: 'enum', 
      values: ['number', 'percent', 'date'], 
      default: 'number', 
      label: 'Формат', 
      description: 'Формат отображения значения (число, процент или дата)',
      valueLabels: { number: 'Число', percent: 'Процент', date: 'Дата' },
      quickToggle: true
    }
  ],
  rules: {
    importPolicy: 'strict', // при импорте неизвестные классы/атрибуты приводят к ошибке
    classExclusivity: true  // применять exclusiveGroup логику
  }
};
