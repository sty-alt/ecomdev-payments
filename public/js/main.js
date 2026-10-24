import { ApiError, api } from './api.js';
import {
  $,
  armButton,
  clearErrors,
  focusFirstInvalid,
  h,
  prefersReducedMotion,
  showApiError,
  showFieldError,
  toast,
} from './dom.js';
import {
  amountForInput,
  formatDate,
  formatPhone,
  formatRub,
  inMonth,
  lastDayOf,
  localToday,
  monthShort,
  monthTitle,
  parseAmount,
  plural,
  setCenterTimeZone,
  shiftMonth,
  sumRub,
} from './format.js';

// ---------- Состояние и адрес страницы ----------

const currentMonth = () => localToday().slice(0, 7);

const state = {
  month: currentMonth(),
  tab: 'debtors',
  students: [],
  report: null,
  group: '',
  search: '',
  /** id ученика в открытой карточке; 'new' — создание. */
  dialog: null,
};

function readUrl() {
  const params = new URLSearchParams(location.search);
  const month = params.get('month');
  if (month && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= currentMonth()) state.month = month;
  if (location.hash === '#students') state.tab = 'students';
}

function writeUrl() {
  const query = state.month === currentMonth() ? '' : `?month=${state.month}`;
  const hash = state.tab === 'students' ? '#students' : '';
  history.replaceState(null, '', `${location.pathname}${query}${hash}`);
}

const studentById = (id) => state.students.find((s) => s.id === id);
const debtorById = (id) => state.report?.debtors.find((d) => d.studentId === id);
const startedBy = (student, month) => student.startDate <= lastDayOf(month);

async function loadAll() {
  const month = state.month;
  const [students, report] = await Promise.all([api.students(), api.debtors(month)]);
  if (month !== state.month) return; // пока грузили, пользователь переключил месяц
  state.students = students;
  state.report = report;
  if (state.group && !report.debtors.some((d) => d.group === state.group)) state.group = '';
  render();
}

async function refresh() {
  try {
    await loadAll();
  } catch (err) {
    if (!state.report) {
      $('#debtor-list').setAttribute('aria-busy', 'false');
      $('#debtor-list').replaceChildren(
        h(
          'li',
          { class: 'empty' },
          'Не удалось загрузить месяц. ',
          h('button', { type: 'button', class: 'pill-button', onclick: refresh }, 'Повторить'),
        ),
      );
    }
    toast(err.message, { tone: 'error' });
  }
}

function render() {
  renderMonth();
  renderDebtors();
  renderStudents();
  renderStudentOptions();
  renderPayHint();
  if (state.dialog !== null && $('#student-dialog').open) renderDialog();
}

// ---------- Месяц ----------

function renderMonth() {
  $('#month-prev').disabled = state.month === '0001-01';
  const isCurrent = state.month === currentMonth();
  $('#month-label').replaceChildren(monthTitle(state.month), ...(isCurrent ? [h('small', {}, 'текущий')] : []));
  // Будущие месяцы не показываем: оплату будущим числом внести нельзя, все были бы «должниками».
  $('#month-next').disabled = isCurrent;
  $('#month-next').setAttribute('aria-disabled', String(isCurrent));
}

function goToMonth(month) {
  state.month = month;
  state.report = null;
  $('#summary').hidden = true;
  $('#group-filters').hidden = true;
  $('#debtor-list').replaceChildren(h('li', { class: 'loading' }, 'Загружаем должников…'));
  $('#student-list').replaceChildren(h('p', { class: 'loading' }, 'Загружаем данные месяца…'));
  writeUrl();
  renderMonth();
  $('#debtor-list').setAttribute('aria-busy', 'true');
  refresh();
}

$('#month-prev').addEventListener('click', () => goToMonth(shiftMonth(state.month, -1)));
$('#month-next').addEventListener('click', () => {
  if (state.month < currentMonth()) goToMonth(shiftMonth(state.month, 1));
});

// ---------- Вкладки ----------

const tabs = [
  { id: 'debtors', tab: $('#tab-debtors'), panel: $('#panel-debtors') },
  { id: 'students', tab: $('#tab-students'), panel: $('#panel-students') },
];

function selectTab(id, { focus = false } = {}) {
  state.tab = id;
  for (const t of tabs) {
    const selected = t.id === id;
    t.tab.setAttribute('aria-selected', String(selected));
    t.tab.tabIndex = selected ? 0 : -1;
    t.panel.hidden = !selected;
    if (selected && focus) t.tab.focus();
  }
  writeUrl();
}

for (const [index, t] of tabs.entries()) {
  t.tab.addEventListener('click', () => selectTab(t.id));
  t.tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    selectTab(next.id, { focus: true });
  });
}

// ---------- Должники ----------

function reminderText(debtor) {
  return (
    `Здравствуйте! Напоминаем об оплате занятий в группе «${debtor.group}» ` +
    `за ${monthTitle(state.month)}: осталось ${formatRub(debtor.debt)}. Спасибо!`
  );
}

function renderSummary(report) {
  const box = $('#summary');
  const { summary } = report;
  box.hidden = summary.studentsCount === 0;
  if (box.hidden) return;

  // «Собрано» — сколько плана закрыто: переплата одного не покрывает долг другого.
  const collected = Math.max(0, sumRub([summary.expectedTotal, -report.totalDebt]));
  const share = summary.expectedTotal > 0 ? Math.round((collected / summary.expectedTotal) * 100) : 100;
  const overpaid = sumRub([summary.paidTotal, -collected]);

  $('#summary-collected').replaceChildren(
    `${inMonth(state.month)} собрано `,
    h('strong', {}, formatRub(collected)),
    ` из ${formatRub(summary.expectedTotal)}`,
  );
  const bar = $('#summary-bar');
  bar.value = share;
  bar.setAttribute('aria-valuetext', `${share}% плана`);

  const details = [
    h('span', {}, 'Оплатили полностью: ', h('b', {}, `${summary.paidInFullCount} из ${summary.studentsCount}`)),
    report.count > 0 && h('span', { class: 'debt' }, 'Долг: ', h('b', {}, formatRub(report.totalDebt))),
    overpaid > 0 && h('span', {}, 'Переплаты: ', h('b', {}, formatRub(overpaid))),
  ];
  $('#summary-details').replaceChildren(...details.filter(Boolean));
}

function renderGroupFilters(report) {
  const box = $('#group-filters');
  const counts = new Map();
  for (const d of report.debtors) counts.set(d.group, (counts.get(d.group) ?? 0) + 1);
  box.hidden = counts.size < 2;
  if (box.hidden) return;

  const chip = (group, label, count) =>
    h(
      'button',
      {
        type: 'button',
        class: 'filter',
        'aria-pressed': String(state.group === group),
        onclick: () => {
          state.group = group;
          renderDebtors();
        },
      },
      label,
      h('span', {}, String(count)),
    );
  const groups = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'ru'));
  $('#group-filter-list').replaceChildren(
    chip('', 'Все', report.count),
    ...groups.map((g) => chip(g, g, counts.get(g))),
  );
}

function debtorRow(d) {
  const share = d.monthlyFee > 0 ? Math.min(100, (d.paid / d.monthlyFee) * 100) : 0;
  const bar = h('div', { class: 'debtor__bar', 'aria-hidden': 'true' }, h('span'));
  bar.firstElementChild.style.width = `${share}%`;

  return h(
    'li',
    { class: 'row', dataset: { studentId: d.studentId } },
    h(
      'div',
      { class: 'row__main' },
      h('button', { type: 'button', class: 'row__name', onclick: () => openStudent(d.studentId) }, d.name),
      h(
        'p',
        { class: 'row__meta' },
        h('span', {}, d.group),
        h('a', { href: `tel:${d.phone}` }, formatPhone(d.phone)),
        h(
          'a',
          {
            href: `sms:${d.phone}?body=${encodeURIComponent(reminderText(d))}`,
            'aria-label': `Напомнить по SMS: ${d.name}`,
          },
          'Напомнить',
        ),
      ),
      bar,
      h('p', { class: 'debtor__paid' }, `Оплачено ${formatRub(d.paid)} из ${formatRub(d.monthlyFee)}`),
    ),
    h(
      'div',
      { class: 'row__side' },
      h('p', { class: 'debtor__debt' }, h('span', { class: 'visually-hidden' }, 'Долг '), formatRub(d.debt)),
      h(
        'button',
        {
          type: 'button',
          class: 'pill-button',
          'aria-label': `Внести оплату: ${d.name}`,
          onclick: () => startPayment(d.studentId),
        },
        'Внести',
      ),
    ),
  );
}

function renderDebtors() {
  const report = state.report;
  const list = $('#debtor-list');
  if (!report) return;
  list.setAttribute('aria-busy', 'false');
  $('#tab-debtors-count').textContent = report.count > 0 ? String(report.count) : '';
  renderSummary(report);
  renderGroupFilters(report);

  if (state.students.length === 0) {
    list.replaceChildren(
      h(
        'li',
        { class: 'empty' },
        h('strong', {}, 'Учеников пока нет'),
        'Добавьте первого ученика, и здесь появятся те, кто не оплатил месяц. ',
        h('button', { type: 'button', class: 'pill-button', onclick: openCreate }, 'Добавить ученика'),
      ),
    );
    return;
  }
  if (report.count === 0) {
    const text =
      report.summary.studentsCount === 0
        ? `В ${monthTitle(state.month)} ещё никто не занимался.`
        : `Все ученики оплатили ${monthTitle(state.month)}.`;
    list.replaceChildren(h('li', { class: 'empty empty--good' }, h('strong', {}, 'Должников нет'), text));
    return;
  }

  const visible = state.group ? report.debtors.filter((d) => d.group === state.group) : report.debtors;
  list.replaceChildren(...visible.map(debtorRow));
}

// ---------- Ученики ----------

function studentStatus(student) {
  if (!startedBy(student, state.month)) {
    return h('span', { class: 'status status--future' }, `с ${formatDate(student.startDate)}`);
  }
  const debtor = debtorById(student.id);
  if (debtor) return h('span', { class: 'status status--debt' }, `долг ${formatRub(debtor.debt)}`);
  if (student.monthlyFee === 0) return h('span', { class: 'status status--paid' }, 'бесплатно');
  return h('span', { class: 'status status--paid' }, 'оплачено');
}

function matchesSearch(student, query) {
  if (!query) return true;
  const q = query.toLocaleLowerCase('ru-RU');
  const digits = query.replace(/\D/g, '');
  return (
    student.name.toLocaleLowerCase('ru-RU').includes(q) ||
    student.group.toLocaleLowerCase('ru-RU').includes(q) ||
    (digits.length >= 3 && student.phone.includes(digits))
  );
}

function renderStudents() {
  if (!state.report) return;
  const box = $('#student-list');
  const note = $('#students-note');
  const all = state.students;

  if (all.length === 0) {
    note.textContent = '';
    box.replaceChildren(
      h(
        'p',
        { class: 'empty' },
        h('strong', {}, 'Учеников пока нет'),
        'Нажмите «Добавить», чтобы завести первого ученика.',
      ),
    );
    return;
  }

  const found = all.filter((s) => matchesSearch(s, state.search.trim()));
  const groups = new Map();
  for (const s of found) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }

  if (state.search.trim()) {
    note.textContent = `Найдено: ${found.length} из ${all.length}`;
  } else {
    const groupCount = new Set(all.map((s) => s.group)).size;
    note.textContent =
      `${all.length} ${plural(all.length, 'ученик', 'ученика', 'учеников')} ` +
      `в ${groupCount} ${plural(groupCount, 'группе', 'группах', 'группах')}. Статус оплаты — за ${monthTitle(state.month)}.`;
  }

  if (found.length === 0) {
    box.replaceChildren(
      h(
        'p',
        { class: 'empty' },
        h('strong', {}, 'Никого не нашли'),
        'Проверьте написание или ищите по номеру телефона.',
      ),
    );
    return;
  }

  const sections = [...groups.keys()]
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .map((group) =>
      h(
        'section',
        {},
        h('h3', { class: 'group-title' }, `${group} (${groups.get(group).length})`),
        h(
          'ul',
          {},
          groups
            .get(group)
            .map((s) =>
              h(
                'li',
                { class: 'row', dataset: { studentId: s.id } },
                h(
                  'div',
                  { class: 'row__main' },
                  h('button', { type: 'button', class: 'row__name', onclick: () => openStudent(s.id) }, s.name),
                  h(
                    'p',
                    { class: 'row__meta' },
                    h('a', { href: `tel:${s.phone}` }, formatPhone(s.phone)),
                    h('span', {}, `${formatRub(s.monthlyFee)} в месяц`),
                  ),
                ),
                h('div', { class: 'row__side' }, studentStatus(s)),
              ),
            ),
        ),
      ),
    );
  box.replaceChildren(...sections);
}

$('#student-search').addEventListener('input', (event) => {
  state.search = event.target.value;
  renderStudents();
});
$('#student-add').addEventListener('click', () => openCreate());

// ---------- Форма оплаты ----------

const payForm = $('#pay-form');
const studentSelect = $('#pay-student');
const amountInput = $('#pay-amount');
const dateInput = $('#pay-date');
const fillDebt = $('#pay-fill-debt');
const payHint = $('#pay-student-hint');

function renderStudentOptions() {
  const selected = studentSelect.value;
  const groups = new Map();
  for (const s of state.students) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }
  const placeholder = new Option(state.students.length ? 'Выберите ученика' : 'Сначала добавьте ученика', '');
  const optgroups = [...groups.keys()]
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .map((group) =>
      h(
        'optgroup',
        { label: group },
        groups.get(group).map((s) => new Option(s.name, String(s.id))),
      ),
    );
  studentSelect.replaceChildren(placeholder, ...optgroups);
  studentSelect.value = state.students.some((s) => String(s.id) === selected) ? selected : '';
  $('#group-options').replaceChildren(...[...groups.keys()].map((g) => new Option(g)));
}

let hintRequest = 0;
/** Под выбором ученика: сколько он уже оплатил за месяц выбранной даты и кнопка «Весь долг». */
async function renderPayHint() {
  const student = studentById(Number(studentSelect.value));
  const date = dateInput.value;
  const request = ++hintRequest;
  fillDebt.hidden = true;
  payHint.textContent = '';
  if (!student || !date) return;

  const month = date.slice(0, 7);
  if (!startedBy(student, month)) {
    payHint.textContent = `Занимается с ${formatDate(student.startDate)}.`;
    return;
  }
  try {
    const payments = await api.payments(student.id, month);
    if (request !== hintRequest) return;
    const paid = sumRub(payments.map((p) => p.amount));
    const debt = Math.max(0, sumRub([student.monthlyFee, -paid]));
    payHint.textContent =
      `${inMonth(month)} оплачено ${formatRub(paid)} из ${formatRub(student.monthlyFee)}` +
      (debt === 0 ? ', долга нет.' : '.');
    if (debt > 0) {
      fillDebt.hidden = false;
      fillDebt.textContent = `Весь долг ${formatRub(debt)}`;
      fillDebt.dataset.amount = String(debt);
    }
  } catch {
    // Подсказка необязательна: форма работает и без неё.
  }
}

/** Заполняет форму для ученика: долг выбранного месяца и подходящая дата. */
function startPayment(studentId) {
  const today = localToday();
  studentSelect.value = String(studentId);
  // Оплата относится к месяцу по дате: долг прошлого месяца закрываем его последним днём.
  dateInput.value = state.month === currentMonth() ? today : lastDayOf(state.month);
  const debtor = debtorById(studentId);
  amountInput.value = debtor ? amountForInput(debtor.debt) : '';
  clearErrors(payForm);
  $('#pay-error').textContent = '';
  renderPayHint();
  $('#pay').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  amountInput.focus({ preventScroll: true });
  amountInput.select();
}

fillDebt.addEventListener('click', () => {
  amountInput.value = amountForInput(fillDebt.dataset.amount);
  amountInput.focus();
});
studentSelect.addEventListener('change', renderPayHint);
dateInput.addEventListener('change', renderPayHint);

function flashRow(studentId) {
  for (const row of document.querySelectorAll(`[data-student-id="${studentId}"]`)) {
    row.classList.remove('row--flash');
    void row.offsetWidth; // перезапуск анимации
    row.classList.add('row--flash');
  }
}

async function undoPayment(payment, studentName) {
  try {
    await api.deletePayment(payment.id);
    toast(`Оплата ${formatRub(payment.amount)} (${studentName}) отменена.`);
  } catch (err) {
    toast(err.message, { tone: 'error' });
  }
  await refresh();
}

payForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors(payForm);
  $('#pay-error').textContent = '';

  const studentId = Number(studentSelect.value);
  const amount = parseAmount(amountInput.value);
  if (!studentId) showFieldError(payForm, 'studentId', 'Выберите ученика');
  if (amount === undefined || amount <= 0) {
    showFieldError(payForm, 'amount', 'Введите сумму больше нуля, например 4500 или 4500,50');
  }
  if (!dateInput.value) showFieldError(payForm, 'date', 'Укажите дату оплаты');
  else if (dateInput.value > localToday()) showFieldError(payForm, 'date', 'Дата оплаты не может быть в будущем');
  if (payForm.querySelector('[aria-invalid="true"]')) return focusFirstInvalid(payForm);

  const submit = $('#pay-submit');
  submit.disabled = true;
  try {
    const payment = await api.addPayment({ studentId, amount, date: dateInput.value });
    const name = studentById(studentId)?.name ?? 'ученик';
    amountInput.value = '';
    toast(`Внесено ${formatRub(payment.amount)}: ${name}, ${formatDate(payment.date)}.`, {
      action: { label: 'Отменить', onClick: () => undoPayment(payment, name) },
      timeout: 10000,
    });
    await refresh();
    flashRow(studentId);
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    showApiError(payForm, $('#pay-error'), err, { PAYMENT_DATE_IN_FUTURE: 'date', STUDENT_NOT_FOUND: 'studentId' });
  } finally {
    submit.disabled = false;
  }
});

// Кнопка «Внести оплату» внизу экрана на телефоне прячется, когда форма и так видна.
const dock = $('#dock');
new IntersectionObserver(([entry]) => {
  dock.toggleAttribute('data-hidden', entry.isIntersecting);
}).observe($('#pay'));
$('#dock-pay').addEventListener('click', (event) => {
  event.preventDefault();
  $('#pay').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  studentSelect.focus({ preventScroll: true });
});

// ---------- Карточка ученика ----------

const dialog = $('#student-dialog');
const studentForm = $('#student-form');
let dialogPayments = [];

function openStudent(id) {
  state.dialog = id;
  dialogPayments = [];
  renderDialog();
  if (!dialog.open) dialog.showModal();
  loadDialogPayments(id);
}

function openCreate() {
  state.dialog = 'new';
  renderDialog();
  if (!dialog.open) dialog.showModal();
  $('#st-name').focus();
}

async function loadDialogPayments(id) {
  try {
    const payments = await api.payments(id);
    if (state.dialog !== id) return;
    dialogPayments = payments;
    renderDialog();
  } catch (err) {
    toast(err.message, { tone: 'error' });
  }
}

// В узкой клетке журнала — долг в целых рублях; точная сумма — в описании для скринридера и в истории.
const wholeRub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/** Последние 6 месяцев до выбранного: отметка как в журнале. */
function journalCells(student) {
  return Array.from({ length: 6 }, (_, i) => shiftMonth(state.month, i - 5)).map((month) => {
    const label = `${monthShort(month)}${month.slice(5) === '01' ? ` ${month.slice(2, 4)}` : ''}`;
    let mark;
    let kind;
    let description;
    if (!startedBy(student, month)) {
      [mark, kind, description] = ['—', 'none', 'ещё не занимался'];
    } else {
      const paid = sumRub(dialogPayments.filter((p) => p.date.startsWith(month)).map((p) => p.amount));
      const debt = Math.max(0, sumRub([student.monthlyFee, -paid]));
      if (debt === 0) [mark, kind, description] = ['✓', 'full', 'оплачено полностью'];
      else [mark, kind, description] = [`−${wholeRub.format(Math.round(debt))}`, 'debt', `долг ${formatRub(debt)}`];
    }
    const current = month === state.month ? ' journal__cell--current' : '';
    return h(
      'div',
      { class: `journal__cell journal__cell--${kind}${current}`, role: 'listitem' },
      h('span', { class: 'journal__month', 'aria-hidden': 'true' }, label),
      h('span', { class: 'journal__mark', 'aria-hidden': 'true' }, mark),
      h('span', { class: 'visually-hidden' }, `${monthTitle(month)}: ${description}`),
    );
  });
}

function renderHistory(student) {
  const list = $('#dialog-history');
  if (dialogPayments.length === 0) {
    list.replaceChildren(h('li', { class: 'empty' }, 'Оплат пока нет.'));
    return;
  }
  list.replaceChildren(
    ...dialogPayments.map((p) =>
      h(
        'li',
        {},
        h(
          'div',
          {},
          h('p', { class: 'history__amount' }, formatRub(p.amount)),
          h('p', { class: 'history__date' }, formatDate(p.date)),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'link-button',
            'aria-label': `Отменить оплату ${formatRub(p.amount)} от ${formatDate(p.date)}`,
            onclick: (event) =>
              armButton(event.currentTarget, 'Точно отменить?', async () => {
                try {
                  await api.deletePayment(p.id);
                  toast(`Оплата ${formatRub(p.amount)} от ${formatDate(p.date)} отменена.`);
                  await Promise.all([refresh(), loadDialogPayments(student.id)]);
                } catch (err) {
                  toast(err.message, { tone: 'error' });
                }
              }),
          },
          'Отменить',
        ),
      ),
    ),
  );
}

function fillStudentForm(student) {
  clearErrors(studentForm);
  $('#student-error').textContent = '';
  $('#st-name').value = student?.name ?? '';
  $('#st-phone').value = student ? formatPhone(student.phone) : '';
  $('#st-group').value = student?.group ?? '';
  $('#st-fee').value = student ? amountForInput(student.monthlyFee) : '';
  $('#st-start').value = student?.startDate ?? localToday();
}

function renderDialog() {
  const creating = state.dialog === 'new';
  const student = creating ? null : studentById(state.dialog);
  if (!creating && !student) {
    dialog.close();
    return;
  }

  for (const id of ['#dialog-overview', '#dialog-actions', '#dialog-history-section', '#dialog-danger']) {
    $(id).hidden = creating;
  }
  const edit = $('#dialog-edit');
  edit.querySelector('summary').hidden = creating;
  $('#student-submit').textContent = creating ? 'Добавить ученика' : 'Сохранить';

  if (creating) {
    $('#dialog-title').textContent = 'Новый ученик';
    $('#dialog-subtitle').textContent = 'Месячная сумма будет учитываться с даты начала занятий.';
    $('#dialog-phone').hidden = true;
    if (!edit.open) {
      edit.open = true;
      fillStudentForm(null);
    }
    return;
  }

  $('#dialog-title').textContent = student.name;
  $('#dialog-subtitle').textContent = `${student.group}, ${formatRub(student.monthlyFee)} в месяц`;
  $('#dialog-phone').hidden = false;
  const journal = $('#dialog-journal');
  journal.setAttribute('role', 'list');
  journal.setAttribute('aria-label', 'Оплаты за последние 6 месяцев');
  journal.replaceChildren(...journalCells(student));
  $('#dialog-phone').href = `tel:${student.phone}`;
  $('#dialog-phone').textContent = formatPhone(student.phone);
  $('#dialog-call').href = `tel:${student.phone}`;
  $('#dialog-call').setAttribute('aria-label', `Позвонить: ${formatPhone(student.phone)}`);
  renderHistory(student);
  if (!edit.open) fillStudentForm(student);

  const deleteButton = $('#dialog-delete');
  if (deleteButton.dataset.armed === undefined) deleteButton.textContent = 'Удалить ученика';
}

$('#dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close(); // клик по затемнению
});
dialog.addEventListener('close', () => {
  state.dialog = null;
  $('#dialog-edit').open = false;
});

$('#dialog-pay').addEventListener('click', () => {
  const id = state.dialog;
  dialog.close();
  startPayment(id);
});

$('#dialog-delete').addEventListener('click', (event) => {
  const student = studentById(state.dialog);
  if (!student) return;
  const count = dialogPayments.length;
  const confirmText =
    count > 0
      ? `Удалить вместе с ${count} ${plural(count, 'оплатой', 'оплатами', 'оплатами')}?`
      : 'Точно удалить ученика?';
  armButton(event.currentTarget, confirmText, async () => {
    try {
      await api.deleteStudent(student.id);
      dialog.close();
      toast(`Ученик ${student.name} удалён.`);
      await refresh();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  });
});

studentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors(studentForm);
  $('#student-error').textContent = '';

  const data = Object.fromEntries(new FormData(studentForm));
  const monthlyFee = parseAmount(data.monthlyFee);
  for (const field of ['name', 'phone', 'group']) {
    if (!String(data[field]).trim()) showFieldError(studentForm, field, 'Заполните поле');
  }
  if (monthlyFee === undefined) showFieldError(studentForm, 'monthlyFee', 'Введите сумму, например 6000');
  if (!data.startDate) showFieldError(studentForm, 'startDate', 'Укажите дату');
  if (studentForm.querySelector('[aria-invalid="true"]')) return focusFirstInvalid(studentForm);

  const input = { ...data, monthlyFee };
  const submit = $('#student-submit');
  submit.disabled = true;
  try {
    if (state.dialog === 'new') {
      const student = await api.createStudent(input);
      dialog.close();
      toast(`Ученик ${student.name} добавлен.`);
      await refresh();
      studentSelect.value = String(student.id);
      renderPayHint();
      flashRow(student.id);
    } else {
      const student = await api.updateStudent(state.dialog, input);
      $('#dialog-edit').open = false;
      toast('Изменения сохранены.');
      await refresh();
      fillStudentForm(student);
    }
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    showApiError(studentForm, $('#student-error'), err);
  } finally {
    submit.disabled = false;
  }
});

// ---------- Старт ----------

async function initialize() {
  try {
    const calendar = await api.calendar();
    setCenterTimeZone(calendar.timeZone);
    state.month = calendar.today.slice(0, 7);
    readUrl();
    selectTab(state.tab);
    dateInput.value = calendar.today;
    dateInput.max = calendar.today;
    renderMonth();
    await loadAll();
  } catch (err) {
    $('#debtor-list').setAttribute('aria-busy', 'false');
    $('#debtor-list').replaceChildren(
      h(
        'li',
        { class: 'empty' },
        'Не удалось загрузить данные. ',
        h('button', { type: 'button', class: 'pill-button', onclick: initialize }, 'Повторить'),
      ),
    );
    toast(err.message, { tone: 'error' });
  }
}

initialize();
