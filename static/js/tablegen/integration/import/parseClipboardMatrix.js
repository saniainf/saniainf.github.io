// parseClipboardMatrix.js
// Парсит текст из буфера обмена (Excel диапазон) в двумерный массив строк.
// Для джуниора: Excel при копировании ячеек кладёт в буфер текст, где строки разделены \n (иногда \r\n),
// а ячейки внутри строки разделены табами (\t).

/**
 * Преобразовать сырой текст буфера обмена в матрицу
 * @param {string} text
 * @returns {string[][]}
 */
export function parseClipboardMatrix(text) {
  // Убираем \r чтобы не мешал split
  const cleaned = text.replace(/\r/g, '');
  const lines = cleaned.split('\n');
  // Excel часто добавляет пустую строку в конце — удаляем её
  if (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.map(line => line.split('\t'));
}
