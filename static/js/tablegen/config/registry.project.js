// Расширения (project) к базовому набору. Переопределяют или дополняют CORE_REGISTRY.
// Если имя совпадает с core, объект заменяет core-вариант (override).

export const PROJECT_REGISTRY = {
  version: 1,
  classes: [
    { name: 'color-warning', group: 'visual' },
    { name: 'color-accent', group: 'visual' },
    { name: 'color-gray', label: 'Серый', group: 'visual' }
  ],
  dataAttributes: [
    { name: 'data-weight', type: 'number', min: 0, max: 100, default: 0 },
    { name: 'data-flag', label: 'Флаг', type: 'boolean', default: false, quickToggle: true }
  ],
  rules: {
    // Может расширять или уточнять правила, сейчас оставляем пустым — будет объединено.
  }
};
