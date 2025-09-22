// setupTestButtons.js
// Отвечает за создание и добавление в DOM кнопок запуска тестов.
// Для джуниора: вынос тестовых кнопок уменьшает init.js и делает возможным
// отключение тестового UI в продакшене одной строкой.

import { runPasteTests } from '../../tests/pasteService.test.js';
import { runMergeTests } from '../../tests/mergeService.test.js';
import { runInlineEditorEventsTests } from '../../tests/inlineEditorEvents.test.js';
import { runApplyDocumentTests } from '../../tests/applyDocument.test.js';
import { runHistoryTests } from '../../tests/historyService.test.js';

/**
 * Создаёт и монтирует набор кнопок тестов.
 * @param {HTMLElement} targetEl Элемент, в который добавляем кнопки (например document.body)
 * @returns {{buttons: HTMLButtonElement[]}} Для потенциального дальнейшего управления
 */
export function setupTestButtons(targetEl) {
  const created = [];

  function makeButton(label, onClick) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.marginRight = '8px';
    btn.addEventListener('click', () => {
      try {
        onClick();
      } catch (e) {
        console.error(`Ошибки в тестах: ${label}`, e);
        alert(`${label}: ошибки, см. консоль`);
        return;
      }
      alert(`${label} прошли успешно (см. консоль)`);
    });
    targetEl.appendChild(btn);
    created.push(btn);
    return btn;
  }

  // Создаём набор кнопок
  makeButton('Run Paste Tests', runPasteTests);
  makeButton('Run Merge Tests', runMergeTests);
  makeButton('Run Inline Editor Event Tests', runInlineEditorEventsTests);
  makeButton('Run applyDocument Tests', runApplyDocumentTests);
  makeButton('Run History Tests', runHistoryTests);

  return { buttons: created };
}
