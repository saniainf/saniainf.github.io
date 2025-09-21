// toJson.js
// Утилита для получения JSON из TableModel

/**
 * @param {import('../../core/model/TableModel.js').TableModel} model
 * @returns {string} JSON строка (красиво отформатированная)
 */
export function toJson(model) {
  const doc = model.toJSON();
  return JSON.stringify(doc, null, 2);
}
