// setupImportExportUI.js
// Отвечает за UI импорта / экспорта JSON.
// Для джуниора: вынос позволяет переиспользовать или отключать этот блок отдельно.

import { toJson } from '../../integration/export/toJson.js';
import { parseTableJson, applyImportedDocument } from '../../integration/import/fromJson.js';

/**
 * Создаёт UI блок экспорта/импорта JSON
 * @param {Object} ctx
 * @param {TableModel} ctx.model
 * @param {HistoryService} ctx.history
 * @param {ValidationService} ctx.validator
 * @param {EventBus} ctx.bus
 * @returns {{element: HTMLDivElement}}
 */
export function setupImportExportUI(ctx) {
  const { model, history, validator, bus } = ctx;
  const container = document.createElement('div');
  container.className = 'tablegen-import-export';

  // Кнопка экспорта
  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Экспорт JSON (console)';
  exportBtn.addEventListener('click', () => {
    const json = toJson(model);
    console.log('EXPORT JSON:\n', json);
  });
  container.appendChild(exportBtn);

  // Блок импорта
  const importArea = document.createElement('textarea');
  importArea.placeholder = 'Вставьте сюда JSON таблицы и нажмите "Импорт JSON"';
  importArea.rows = 4;
  importArea.style.width = '400px';
  importArea.style.display = 'block';
  importArea.style.marginTop = '8px';
  const importBtn = document.createElement('button');
  importBtn.textContent = 'Импорт JSON';
  importBtn.addEventListener('click', () => {
    const raw = importArea.value.trim();
    if (!raw) {
      console.warn('Пустая строка JSON для импорта');
      return;
    }
    const res = parseTableJson(raw);
    if (!res.ok) {
      console.error('Ошибка импорта JSON:', res.error);
      alert(`Документ содержит ошибки импорта: ${res.error}`);
      return;
    }
    const docValidation = validator.validateDocument(res.doc);
    if (!docValidation.valid) {
      console.error('Ошибки валидации документа:', docValidation.errors);
      alert(`Документ содержит ошибки:\n${docValidation.errors.join('\n')}`);
      return;
    }
    history.restore(() => {
      applyImportedDocument(model, res.doc, bus);
    }, res.doc);
    history.record(model);
    importArea.value = '';
    console.log('Импорт завершён');
  });
  container.appendChild(importArea);
  container.appendChild(importBtn);

  return { element: container };
}
