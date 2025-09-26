// Расширения (project) к базовому набору. Переопределяют или дополняют CORE_REGISTRY.
// Если имя совпадает с core, объект заменяет core-вариант (override).

export const PROJECT_REGISTRY = {
  version: 1,
  classes: [
    { name: 'warning', group: 'visual' },
    { name: 'accent', group: 'visual' }
  ],
  dataAttributes: [
    { name: 'data-weight', type: 'number', min: 0, max: 100, default: 0 },
    { name: 'data-flag', type: 'boolean', default: false }
  ],
  rules: {
    // Может расширять или уточнять правила, сейчас оставляем пустым — будет объединено.
  }
};
