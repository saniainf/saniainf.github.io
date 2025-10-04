// registry.display.js
// Утилиты для получения человеко-читаемых подписей из метаданных реестра.
// Эти функции НЕ участвуют в валидации и не влияют на экспорт/импорт.

/**
 * Возвращает отображаемый label для класса.
 * @param {object} cls Объект класса из реестра
 * @returns {string}
 */
export function getClassLabel(cls) {
  if (!cls) return '';
  const raw = cls.label;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length ? trimmed : cls.name;
  }
  return cls.name;
}

/**
 * Возвращает отображаемый label для data-* атрибута.
 * @param {object} attr Объект атрибута из реестра
 * @returns {string}
 */
export function getAttrLabel(attr) {
  if (!attr) return '';
  const raw = attr.label;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length ? trimmed : attr.name;
  }
  return attr.name;
}

/**
 * Возвращает отображаемый label для значения enum атрибута.
 * @param {object} attr Атрибут (type: enum)
 * @param {string} value Значение
 * @returns {string}
 */
export function getEnumValueLabel(attr, value) {
  if (!attr || !attr.valueLabels) return value;
  const lbl = attr.valueLabels[value];
  if (typeof lbl === 'string') {
    const trimmed = lbl.trim();
    return trimmed.length ? trimmed : value;
  }
  return value;
}
