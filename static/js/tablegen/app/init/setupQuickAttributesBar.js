// setupQuickAttributesBar.js
// Панель быстрого переключения избранных data-* атрибутов под Action Bar.
// Отображает только атрибуты с флагом quickToggle (enum / boolean) и позволяет
// назначать значения по клику, а также сбрасывать их через крестик.

import { getAttrLabel, getEnumValueLabel } from '../../config/registry.display.js';

/**
 * Создаёт панель быстрого управления data-* атрибутами.
 * @param {Object} ctx Контекст инициализации TableGen
 * @param {import('../../core/services/ValidationService.js').ValidationService} ctx.validator
 * @param {import('../SelectionService.js').SelectionService} ctx.selectionService
 * @param {import('../../core/model/TableModel.js').TableModel} ctx.model
 * @param {import('../TableRenderer.js').TableRenderer} ctx.renderer
 * @param {import('../../core/events/EventBus.js').EventBus} ctx.bus
 * @returns {{ element: HTMLDivElement, refresh: () => void, destroy: () => void }}
 */
export function setupQuickAttributesBar(ctx) {
  const { validator, selectionService, model, renderer, bus } = ctx;
  const quickAttrs = validator.listQuickToggleAttributes();
  const root = document.createElement('div');
  root.className = 'tablegen-quick-attrs';
  root.classList.add('inline-flex', 'flex-wrap', 'items-start', 'gap-3', 'p-2', 'bg-white', 'border', 'border-gray-200', 'rounded', 'mb-2');

  if (!quickAttrs.length) {
    root.classList.add('hidden');
    return {
      element: root,
      refresh: () => {},
      destroy: () => {}
    };
  }

  /**
   * Возвращает массив целевых координат (только ведущие ячейки, без накрытых merge-областей).
   * @returns {Array<{r:number,c:number,cell?:object}>}
   */
  function collectTargetCells() {
    const targets = [];
    const range = selectionService.getRange?.();
    if (range) {
      const { r1, c1, r2, c2 } = range;
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const cell = model.getCell(r, c);
          if (!cell && renderer && renderer.isCoveredByMerge(r, c)) continue;
          targets.push({ r, c, cell });
        }
      }
      return targets;
    }
    const sel = selectionService.getSelected?.();
    if (sel) {
      const cell = model.getCell(sel.r, sel.c);
      if (!cell && renderer && renderer.isCoveredByMerge(sel.r, sel.c)) {
        return [];
      }
      targets.push({ r: sel.r, c: sel.c, cell });
    }
    return targets;
  }

  /**
   * Рассчитывает состояние атрибута для текущего выбора.
   * @param {string} name
   */
  function getAttributeState(name, targets) {
    if (!targets) targets = collectTargetCells();
    if (!targets.length) {
      return { kind: 'empty' };
    }
    let hasValue = false;
    let value;
    let mixed = false;
    for (const { cell } of targets) {
      const data = cell && cell.data ? cell.data : undefined;
      if (data && Object.prototype.hasOwnProperty.call(data, name)) {
        const current = data[name];
        if (!hasValue) {
          hasValue = true;
          value = current;
        } else if (value !== current) {
          mixed = true;
          break;
        }
      } else {
        if (hasValue) {
          mixed = true;
          break;
        }
      }
    }
    if (!hasValue) return { kind: 'absent' };
    if (mixed) return { kind: 'mixed' };
    return { kind: 'value', value };
  }

  /**
   * Применяет новое значение или удаляет атрибут для всех целевых ячеек.
   * @param {object} attr
   * @param {any} newValue undefined означает удаление
   */
  function applyAttribute(attr, newValue) {
    const name = attr.name;
    const targets = collectTargetCells();
    if (!targets.length) return;
    if (newValue !== undefined) {
      const validation = validator.validateAttribute(name, newValue);
      if (!validation.ok) {
        console.warn('[quick-attrs] Значение не прошло валидацию', name, newValue);
        return;
      }
    }
    bus.batch(() => {
      for (const { r, c, cell } of targets) {
        const current = cell && cell.data ? { ...cell.data } : {};
        if (newValue === undefined) {
          if (!Object.prototype.hasOwnProperty.call(current, name)) continue;
          delete current[name];
          model.setCellData(r, c, current);
        } else {
          if (current[name] === newValue) continue;
          current[name] = newValue;
          model.setCellData(r, c, current);
        }
      }
    });
  }

  function createResetButton(attr) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tablegen-quick-attr-reset';
    btn.title = 'Сбросить атрибут';
    btn.textContent = '×';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyAttribute(attr, undefined);
    });
    return btn;
  }

  function createToggleButton(label, active, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.classList.add('tg-btn', 'tg-quick-btn');
    if (active) btn.classList.add('tg-quick-btn-active');
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      onClick();
    });
    return btn;
  }

  function renderBoolean(attr, state) {
    const group = document.createElement('div');
    group.className = 'tablegen-quick-attr';

    const header = document.createElement('div');
    header.className = 'tablegen-quick-attr-header';
    const title = document.createElement('span');
    title.className = 'tablegen-quick-attr-title';
    title.textContent = getAttrLabel(attr);
    header.appendChild(title);

    if (state.kind === 'value') {
      const resetBtn = createResetButton(attr);
      header.appendChild(resetBtn);
    } else {
      const off = document.createElement('span');
      off.className = 'tablegen-quick-attr-off';
      off.textContent = 'Выкл';
      header.appendChild(off);
    }

    const buttons = document.createElement('div');
    buttons.className = 'tablegen-quick-attr-buttons';
    const isTrue = state.kind === 'value' && state.value === true;
    const isFalse = state.kind === 'value' && state.value === false;
    buttons.appendChild(createToggleButton('Да', isTrue, () => applyAttribute(attr, true)));
    buttons.appendChild(createToggleButton('Нет', isFalse, () => applyAttribute(attr, false)));

    group.appendChild(header);
    group.appendChild(buttons);
    return group;
  }

  function renderEnum(attr, state) {
    const group = document.createElement('div');
    group.className = 'tablegen-quick-attr';

    const header = document.createElement('div');
    header.className = 'tablegen-quick-attr-header';
    const title = document.createElement('span');
    title.className = 'tablegen-quick-attr-title';
    title.textContent = getAttrLabel(attr);
    header.appendChild(title);
    if (state.kind === 'value') {
      const resetBtn = createResetButton(attr);
      header.appendChild(resetBtn);
    }

    const buttons = document.createElement('div');
    buttons.className = 'tablegen-quick-attr-buttons';
    const activeValue = state.kind === 'value' ? state.value : null;
    attr.values.forEach((value) => {
      const label = getEnumValueLabel(attr, value);
      const isActive = activeValue === value;
      buttons.appendChild(createToggleButton(label, isActive, () => applyAttribute(attr, value)));
    });

    group.appendChild(header);
    group.appendChild(buttons);
    return group;
  }

  function renderContent() {
    root.innerHTML = '';
    if (!quickAttrs.length) return;
    const targets = collectTargetCells();
    if (!targets.length) {
      const empty = document.createElement('div');
      empty.className = 'tablegen-quick-attr-empty';
      empty.textContent = 'Нет выбранных ведущих ячеек';
      root.appendChild(empty);
      return;
    }
    quickAttrs.forEach((attr) => {
      const state = getAttributeState(attr.name, targets);
      if (attr.type === 'boolean') {
        root.appendChild(renderBoolean(attr, state));
      } else {
        root.appendChild(renderEnum(attr, state));
      }
    });
  }

  const handleSelectionChange = () => renderContent();
  const handleDataChange = (payload) => {
    if (!payload || payload.field === 'data') renderContent();
  };

  bus.on('selection:change', handleSelectionChange);
  bus.on('selection:range', handleSelectionChange);
  bus.on('cell:change', handleDataChange);
  bus.on('batch:flush', handleSelectionChange);

  renderContent();

  return {
    element: root,
    refresh: renderContent,
    destroy() {
      bus.off('selection:change', handleSelectionChange);
      bus.off('selection:range', handleSelectionChange);
      bus.off('cell:change', handleDataChange);
      bus.off('batch:flush', handleSelectionChange);
    }
  };
}
