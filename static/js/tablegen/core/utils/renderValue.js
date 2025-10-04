// renderValue.js
// Утилиты для безопасного отображения значения ячейки с ограниченным набором разрешённых HTML-тегов.
// Разрешённые теги: <br>, <i>, <u>, <sup>, <sub>
// Подход: полностью экранируем строку, затем выборочно «распаковываем» разрешённые теги.
// Это исключает исполнение скриптов и вставку нежелательных атрибутов.

/**
 * Экранирует все HTML-символы.
 * @param {string} s исходная строка
 * @returns {string}
 */
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Регулярные выражения для разрешённых тегов в экранированном виде
// Примечание: работаем с экранированным текстом (&lt;tag&gt;), поэтому ищем именно такие шаблоны.
const ALLOWED_PATTERNS = [
  { re: /&lt;br\s*\/?&gt;/gi, replacement: '<br>' },
  { re: /&lt;i&gt;([^]*?)&lt;\/i&gt;/gi, replacement: (_m, inner) => '<i>' + inner + '</i>' },
  { re: /&lt;u&gt;([^]*?)&lt;\/u&gt;/gi, replacement: (_m, inner) => '<u>' + inner + '</u>' },
  { re: /&lt;sup&gt;([^]*?)&lt;\/sup&gt;/gi, replacement: (_m, inner) => '<sup>' + inner + '</sup>' },
  { re: /&lt;sub&gt;([^]*?)&lt;\/sub&gt;/gi, replacement: (_m, inner) => '<sub>' + inner + '</sub>' }
];

/**
 * Преобразует значение ячейки в безопасный HTML с разрешёнными тегами.
 * @param {string} value исходное значение из модели
 * @returns {string} HTML строка (уже безопасная для вставки через innerHTML)
 */
export function renderCellHtml(value) {
  if (!value) return '';
  // Экранируем всё
  let escaped = escapeHtml(String(value));
  // Восстанавливаем допустимые теги
  for (const { re, replacement } of ALLOWED_PATTERNS) {
    escaped = escaped.replace(re, replacement);
  }
  return escaped;
}

/**
 * Быстрая проверка — содержит ли значение потенциально разрешённые теги.
 * Можно использовать в будущем для оптимизации (skip replace если нет ни '<').
 * @param {string} value 
 * @returns {boolean}
 */
export function mayContainAllowedTags(value) {
  return typeof value === 'string' && value.includes('<');
}
