// runAllTests.js
// Универсальный запуск всех ручных тестов. Можно импортировать в консоли браузера:
// import('./static/js/tablegen/tests/runAllTests.js').then(m => m.runAllTests());
// Для джуниора: мы просто вызываем функции из отдельных файлов тестов.

import { runPasteTests } from './pasteService.test.js';
import { runRegistryTests } from './registryValidation.test.js';

export function runAllTests() {
  console.log('--- START TEST SUITE ---');
  runPasteTests();
  runRegistryTests();
  console.log('--- ALL TESTS PASSED ---');
}

// Авто-запуск по желанию можно раскомментировать, но сейчас оставим только явный вызов.
// runAllTests();