// setupFormattingBar.js
// Панель форматирования: кнопки для вставки/оборачивания выделенного текста в разрешённые теги.
// Разрешённые: <i>, <u>, <sup>, <sub>, <br>

/**
 * Создаёт панель форматирования и привязывает кнопки к inlineEditor.
 * Размещается справа от основной action bar (флекс контейнер). Предполагается, что вызывающий код
 * поместит оба блока в общий wrapper или добавит этот блок после action bar с margin-left: auto.
 * @param {object} ctx
 * @param {InlineEditor} ctx.inlineEditor
 * @returns {{element: HTMLDivElement, updateState: Function}}
 */
export function setupFormattingBar({ inlineEditor }) {
  const bar = document.createElement('div');
  bar.className = 'tablegen-formatting-bar';
  // Tailwind классы: делаем визуально похожим на action bar (фон, рамка, отступы, скругление)
  // Дополнительно ml-auto чтобы прижать к правому краю контейнера обёртки.
  bar.classList.add(
    'flex',        // горизонтальная компоновка
    'flex-wrap',   // чтобы кнопки переносились при узкой ширине
    'items-center',
    'gap-2',       // тот же внутренний промежуток что и в action bar
    'p-2',         // одинаковый внутренний паддинг
    'bg-white',    // фон
    'border','border-gray-200', // рамка в стиле action bar
    'rounded',     // скругление
  );

  const defs = [
    { tag: 'i', label: 'I', title: 'Курсив <i>' },
    { tag: 'u', label: 'U', title: 'Подчёркнуто <u>' },
    { tag: 'sup', label: 'x⁺', title: 'Верхний индекс <sup>' },
    { tag: 'sub', label: 'x₋', title: 'Нижний индекс <sub>' },
    { tag: 'br', label: 'BR', title: 'Перенос строки <br>' }
  ];

  const buttons = [];
  for (const d of defs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = d.label;
    btn.title = d.title;
    btn.classList.add('tg-btn');
    // ВАЖНО: предотвращаем blur инпута при нажатии мышью (mousedown) прежде чем произойдёт click.
    // Иначе input теряет фокус → событие blur внутри InlineEditor приводит к commit редактирования.
    btn.addEventListener('mousedown', (e) => {
      if (inlineEditor.activeEditor) {
        e.preventDefault(); // сохраняем фокус на input
      }
    });
    btn.addEventListener('click', () => {
      if (!inlineEditor.activeEditor) return;
      inlineEditor.applyFormatting(d.tag);
    });
    bar.appendChild(btn);
    buttons.push(btn);
  }

  function updateState() {
    const enabled = !!inlineEditor.activeEditor;
    for (const b of buttons) {
      b.disabled = !enabled;
    }
  }

  // Публичное API для внешнего кода (инициализация hotkeys в будущем)
  return { element: bar, updateState };
}
