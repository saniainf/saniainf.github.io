// setupTestButtons.js
// Отвечает за создание и добавление в DOM кнопок запуска тестов.
// Для джуниора: вынос тестовых кнопок уменьшает init.js и делает возможным
// отключение тестового UI в продакшене одной строкой.

// Импорты удалены: теперь используем динамический импорт для ленивой загрузки тестовых модулей.

/**
 * Создаёт и монтирует набор кнопок тестов.
 * @param {HTMLElement} targetEl Элемент, в который добавляем кнопки (например document.body)
 * @returns {{buttons: HTMLButtonElement[]}} Для потенциального дальнейшего управления
 */
export function setupTestButtons(targetEl) {
  // Одна универсальная кнопка запуска ВСЕХ тестов.
  const btn = document.createElement('button');
  btn.textContent = 'Run All Tests';
  btn.style.marginRight = '8px';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Running tests...';
    try {
      console.log('--- START TEST SUITE (ALL) ---');
      // Динамические импорты: подгружаем только при нажатии, чтобы не грузить тестовый код в рабочем режиме.
      const paste = await import('../../tests/pasteService.test.js');
      const merge = await import('../../tests/mergeService.test.js');
      const inlineEd = await import('../../tests/inlineEditorEvents.test.js');
      const applyDoc = await import('../../tests/applyDocument.test.js');
      const history = await import('../../tests/historyService.test.js');
      const registry = await import('../../tests/registryValidation.test.js');

      // Запускаем по порядку. History содержит асинхронный debounce тест — оборачиваем в Promise.
      paste.runPasteTests();
      merge.runMergeTests();
      inlineEd.runInlineEditorEventsTests();
      applyDoc.runApplyDocumentTests();
      // Оборачиваем runHistoryTests с ожиданием финального сообщения через Promise, если надо дождаться.
      await new Promise(resolve => {
        const originalLog = console.log;
        const marker = 'All history tests passed';
        console.log = function(...args) {
            originalLog.apply(console, args);
            if (args.join(' ').includes(marker)) {
              console.log = originalLog; // восстанавливаем
              resolve();
            }
        };
        history.runHistoryTests();
      });
      registry.runRegistryTests();
      console.log('--- ALL TESTS PASSED ---');
      alert('Все тесты прошли успешно (см. консоль)');
    } catch (e) {
      console.error('Ошибки во время запуска тестов', e);
      alert('Ошибки в тестах — см. консоль');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Run All Tests';
    }
  });
  // Дополнительная кнопка для изолированного запуска только inline editor tests (быстрая отладка)
  const btnInline = document.createElement('button');
  btnInline.textContent = 'Inline Tests';
  btnInline.style.marginRight = '8px';
  btnInline.addEventListener('click', async () => {
    btnInline.disabled = true;
    const original = btnInline.textContent;
    btnInline.textContent = 'Running inline...';
    try {
      const inlineEd = await import('../../tests/inlineEditorEvents.test.js');
      inlineEd.runInlineEditorEventsTests();
      alert('Inline editor tests OK');
    } catch (e) {
      console.error('Ошибка inline editor tests', e);
      alert('Ошибка inline editor tests (см. консоль)');
    } finally {
      btnInline.disabled = false;
      btnInline.textContent = original;
    }
  });

  targetEl.appendChild(btn);
  targetEl.appendChild(btnInline);
  // Кнопка для запуска только structure (insert/delete) тестов
  const btnStructure = document.createElement('button');
  btnStructure.textContent = 'Structure Tests';
  btnStructure.style.marginRight = '8px';
  btnStructure.addEventListener('click', async () => {
    // Блокируем кнопку на время выполнения, чтобы избежать повторных запусков
    btnStructure.disabled = true;
    const orig = btnStructure.textContent;
    btnStructure.textContent = 'Running structure...';
    try {
      // Динамически импортируем модуль structureOps.test.js только по запросу
      const mod = await import('../../tests/structureOps.test.js');
      // Запускаем набор тестов структуры
      mod.runStructureOpsTests();
      alert('Structure tests OK');
    } catch (e) {
      console.error('Ошибка structure tests', e);
      alert('Ошибка structure tests (см. консоль)');
    } finally {
      btnStructure.disabled = false;
      btnStructure.textContent = orig;
    }
  });

  targetEl.appendChild(btnStructure);
  // Кнопка для history тестов структурных операций (insert/delete undo)
  const btnStructHist = document.createElement('button');
  btnStructHist.textContent = 'Struct History Tests';
  btnStructHist.style.marginRight = '8px';
  btnStructHist.addEventListener('click', async () => {
    btnStructHist.disabled = true;
    const orig = btnStructHist.textContent;
    btnStructHist.textContent = 'Running struct hist...';
    try {
      const mod = await import('../../tests/structureHistory.test.js');
      // Запускаем оба набора (insert + delete)
      mod.runAllStructureHistoryTests();
      alert('Structure history tests OK');
    } catch (e) {
      console.error('Ошибка structure history tests', e);
      alert('Ошибка structure history tests (см. консоль)');
    } finally {
      btnStructHist.disabled = false;
      btnStructHist.textContent = orig;
    }
  });
  targetEl.appendChild(btnStructHist);
  return { buttons: [btn, btnInline, btnStructure, btnStructHist] };
}
