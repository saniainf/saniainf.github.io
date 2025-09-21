// ClipboardPasteService.js
// Сервис-обёртка над логикой вставки из буфера обмена.
// Для джуниора: выносим код из init.js чтобы изолировать ответственность
// и упростить тестирование.

import { parseClipboardMatrix } from '../../integration/import/parseClipboardMatrix.js';
import { parseClipboardHtmlTable } from '../../integration/import/parseClipboardHtmlTable.js';
import { applyPaste, applyHtmlTablePaste } from './PasteService.js';

/**
 * Результат обработки вставки
 * @typedef {{ type:'html'|'text', rows:number, cols:number }} PasteResultMeta
 */

/**
 * Попытаться обработать событие paste: определить HTML ли это таблица или текст, применить к модели.
 * Возвращает метаданные о вставке или null если ничего не вставлено.
 * @param {ClipboardEvent} e
 * @param {import('../model/TableModel.js').TableModel} model
 * @returns {PasteResultMeta|null}
 */
export function handleClipboardPaste(e, model) {
  // 1. Пробуем html
  const html = e.clipboardData?.getData('text/html');
  if (html && html.includes('<table')) {
    const parsed = parseClipboardHtmlTable(html);
    if (parsed.success) {
      applyHtmlTablePaste(model, 0, 0, parsed);
      return { type: 'html', rows: parsed.rows, cols: parsed.cols };
    }
  }
  // 2. Падение назад в plain text
  const text = e.clipboardData?.getData('text/plain');
  if (text) {
    const matrix = parseClipboardMatrix(text);
    const rows = matrix.length;
    const cols = rows ? matrix[0].length : 0;
    applyPaste(model, 0, 0, matrix);
    return { type: 'text', rows, cols };
  }
  return null;
}
