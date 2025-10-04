// setupImportExportUI.js
// UI импорта / экспорта JSON и полной замены таблицы содержимым буфера.

import { toJson } from '../../integration/export/toJson.js';
import { parseTableJson, applyImportedDocument } from '../../integration/import/fromJson.js';
// Импортируем парсеры и функции применения вставки, чтобы реализовать кнопку ручной вставки из буфера
import { parseClipboardHtmlTable } from '../../integration/import/parseClipboardHtmlTable.js';
import { parseClipboardMatrix } from '../../integration/import/parseClipboardMatrix.js';
import { applyHtmlTablePaste, applyPaste } from '../../core/services/PasteService.js';

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
  container.classList.add('mt-4','p-3','bg-white','border','border-gray-200','rounded','flex','flex-wrap','items-start','gap-2');

  // Кнопка ручной вставки из буфера (замена глобальному Ctrl+V)
  const pasteBtn = document.createElement('button');
  pasteBtn.textContent = 'Вставить из буфера';
  pasteBtn.classList.add('tg-btn','tg-btn-primary');
  pasteBtn.addEventListener('click', async () => {
  // Полная замена текущей таблицы содержимым буфера через новый документ (reset структуры + корректный undo).
    if (!navigator.clipboard) {
      alert('Clipboard API недоступно в этом браузере');
      return;
    }
    try {
      let html = '';
      let text = '';
      if (navigator.clipboard.read) {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            if (item.types.includes('text/html')) {
              const blob = await item.getType('text/html');
              html = await blob.text();
            }
            if (item.types.includes('text/plain')) {
              const blob = await item.getType('text/plain');
              text = await blob.text();
            }
          }
        } catch (_e) {
          text = await navigator.clipboard.readText();
        }
      } else if (navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }

      // Helper: применить новый документ к модели с записью в историю
      const replaceWithDoc = (doc) => {
        // Применяем новый документ. Событие structure:change сгенерируется внутри applyDocument.
        // HistoryDebounceRecorder сам запишет один снимок (и HistoryService отфильтрует дубликат при необходимости).
        // Ранее здесь был ручной вызов history.record(model) — удалён, чтобы не создавать двойной шаг Undo.
        model.applyDocument(doc, { emitEvent: true });
        console.log('[PasteButton] Таблица заменена. Размер:', doc.grid.rows, 'x', doc.grid.cols);
      };

      // 1) HTML таблица с merge
      if (html && html.includes('<table')) {
        const parsed = parseClipboardHtmlTable(html);
        if (parsed.success) {
          // Строим новый документ. Переносим meta.name чтобы не терять имя таблицы.
          const newDoc = {
            version: model.version || 1,
            meta: { ...model.meta },
            grid: {
              rows: parsed.rows,
              cols: parsed.cols,
              headerRows: 0 // при полной замене сбрасываем пользовательскую шапку
            },
            cells: parsed.cells.map(c => ({
              r: c.r,
              c: c.c,
              value: (c.value || '').trim(),
              rowSpan: c.rowSpan > 1 ? c.rowSpan : 1,
              colSpan: c.colSpan > 1 ? c.colSpan : 1
            }))
          };
            // Оптимизация: можно было бы фильтровать пустые, но оставим все ведущие ради точного соответствия исходной структуры.
          replaceWithDoc(newDoc);
          return;
        }
      }

      // 2) Plain text матрица
      if (text) {
        const matrix = parseClipboardMatrix(text);
        const rows = matrix.length;
        const cols = rows ? matrix[0].length : 0;
        const cells = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const val = (matrix[r][c] || '').trim();
            if (val !== '') {
              cells.push({ r, c, value: val, rowSpan: 1, colSpan: 1 });
            }
          }
        }
        const newDoc = {
          version: model.version || 1,
          meta: { ...model.meta },
          grid: { rows, cols, headerRows: 0 },
          cells
        };
        replaceWithDoc(newDoc);
        return;
      }

      alert('Буфер не содержит поддерживаемых данных для замены таблицы');
    } catch (err) {
      console.error('Ошибка чтения буфера:', err);
      alert('Не удалось прочитать буфер обмена: ' + err);
    }
  });
  container.appendChild(pasteBtn);

  // Кнопка экспорта
  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Экспорт JSON (console)';
  exportBtn.classList.add('tg-btn');
  exportBtn.addEventListener('click', () => {
    const json = toJson(model);
    console.log('EXPORT JSON:\n', json);
  });
  container.appendChild(exportBtn);

  // Блок импорта
  const importArea = document.createElement('textarea');
  importArea.placeholder = 'Вставьте сюда JSON таблицы и нажмите "Импорт JSON"';
  importArea.rows = 4;
  // Tailwind оформление для textarea вместо inline стилей
  importArea.classList.add('w-96','block','mt-2','p-2','border','border-gray-300','rounded','font-mono','text-sm','resize-y');
  const importBtn = document.createElement('button');
  importBtn.textContent = 'Импорт JSON';
  importBtn.classList.add('tg-btn');
  importBtn.addEventListener('click', () => {
    const raw = importArea.value.trim();
    if (!raw) {
      console.warn('Пустая строка JSON для импорта');
      return;
    }
  // Передаём validator для STRICT проверки реестра (классы / data-*). Если есть неизвестные значения — импорт будет отклонён сразу.
  const res = parseTableJson(raw, validator);
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
