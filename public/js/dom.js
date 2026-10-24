// Небольшие помощники для DOM: создание элементов без innerHTML, ошибки форм, уведомления.

/**
 * h('button', { class: 'x', onclick: fn, dataset: { id: 1 }, 'aria-label': '…' }, 'текст', child)
 * Текст всегда вставляется как textNode — пользовательские данные не превращаются в HTML.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el && !key.includes('-')) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

export const $ = (selector, root = document) => root.querySelector(selector);

export function clearErrors(form) {
  for (const el of form.querySelectorAll('.field__error')) el.textContent = '';
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
}

/** Показывает ошибку под полем; возвращает true, если поле нашлось. */
export function showFieldError(form, field, message) {
  const slot = form.querySelector(`[data-error-for="${field}"]`);
  const input = form.querySelector(`[name="${field}"]`);
  if (!slot || !input) return false;
  slot.textContent = message;
  slot.id ||= `${input.id}-error`;
  input.setAttribute('aria-invalid', 'true');
  const described = new Set((input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean));
  described.add(slot.id);
  input.setAttribute('aria-describedby', [...described].join(' '));
  return true;
}

export function focusFirstInvalid(form) {
  form.querySelector('[aria-invalid="true"]')?.focus();
}

/** Раскладывает ошибку API по полям формы; что не легло на поле — в общий блок ошибки. */
export function showApiError(form, errorEl, err, codeToField = {}) {
  let placed = false;
  for (const d of err.details) placed = showFieldError(form, d.field.replace(/^body\./, ''), d.message) || placed;
  const field = codeToField[err.code];
  if (field) placed = showFieldError(form, field, err.message) || placed;
  errorEl.textContent = placed ? '' : err.message;
  focusFirstInvalid(form);
}

let toastTimer;
/** Одно уведомление внизу экрана; action — кнопка вроде «Отменить». */
export function toast(message, { action, tone = 'ok', timeout = 6000 } = {}) {
  const region = $('#toast-region');
  clearTimeout(toastTimer);
  const close = () => region.replaceChildren();
  const button =
    action &&
    h(
      'button',
      {
        type: 'button',
        onclick: async () => {
          close();
          await action.onClick();
        },
      },
      action.label,
    );
  region.replaceChildren(
    h('div', { class: `toast${tone === 'error' ? ' toast--error' : ''}`, role: 'status' }, h('p', {}, message), button),
  );
  toastTimer = setTimeout(close, timeout);
}

/**
 * Двухшаговое подтверждение опасного действия без window.confirm:
 * первое нажатие меняет текст кнопки, второе в течение 4 секунд — выполняет.
 */
export function armButton(button, confirmText, onConfirm) {
  if (button.dataset.armed !== undefined) {
    delete button.dataset.armed;
    button.textContent = button.dataset.label;
    return onConfirm();
  }
  button.dataset.label = button.textContent;
  button.dataset.armed = '';
  button.textContent = confirmText;
  setTimeout(() => {
    if (button.dataset.armed === undefined) return;
    delete button.dataset.armed;
    button.textContent = button.dataset.label;
  }, 4000);
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
