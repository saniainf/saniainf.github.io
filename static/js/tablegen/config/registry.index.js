// Объединение CORE_REGISTRY и PROJECT_REGISTRY в единый TABLEGEN_REGISTRY.
// Правило: project override заменяет core по имени (классы и атрибуты). Правила (rules) мержим поверх.

import { CORE_REGISTRY } from './registry.core.js';
import { PROJECT_REGISTRY } from './registry.project.js';

export function mergeArraysByName(coreArr = [], projArr = []) {
  const map = new Map();
  for (const item of coreArr) map.set(item.name, { ...item, source: 'core' });
  for (const item of projArr) map.set(item.name, { ...item, source: 'project' });
  return Array.from(map.values());
}

export function mergeRules(coreRules = {}, projectRules = {}) {
  return { ...coreRules, ...projectRules };
}

/**
 * Универсальная функция сборки финального реестра из core + project.
 * Если project не передан (null/undefined) — возвращается clone core.
 * @param {Object} core
 * @param {Object|null} project
 * @returns {Object}
 */
export function mergeCoreAndProject(core, project) {
  if (!project) {
    return {
      version: core.version || 1,
      classes: [...(core.classes||[])],
      dataAttributes: [...(core.dataAttributes||[])],
      rules: { ...(core.rules||{}) }
    };
  }
  const classes = mergeArraysByName(core.classes, project.classes);
  const dataAttributes = mergeArraysByName(core.dataAttributes, project.dataAttributes);
  const rules = mergeRules(core.rules, project.rules);
  return {
    version: Math.max(core.version || 1, project.version || 1),
    classes,
    dataAttributes,
    rules
  };
}

// Сохраняем старый экспорт для тестов / обратной совместимости: core + встроенный project.
export const TABLEGEN_REGISTRY = mergeCoreAndProject(CORE_REGISTRY, PROJECT_REGISTRY);
