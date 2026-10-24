// Форматирование денег, дат и русских склонений. Без зависимостей.

const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];
const MONTHS_PREPOSITIONAL = [
  'январе',
  'феврале',
  'марте',
  'апреле',
  'мае',
  'июне',
  'июле',
  'августе',
  'сентябре',
  'октябре',
  'ноябре',
  'декабре',
];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const rub = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const formatRub = (value) => rub.format(value);

const pad = (n) => String(n).padStart(2, '0');

let centerTimeZone = 'Europe/Moscow';

export function setCenterTimeZone(timeZone) {
  centerTimeZone = timeZone;
}

/** Сегодня в часовом поясе учебного центра, YYYY-MM-DD. */
export function localToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: centerTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(0);
  d.setUTCFullYear(y, m - 1 + delta, 1);
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad(d.getUTCMonth() + 1)}`;
}

const monthIndex = (month) => Number(month.slice(5, 7)) - 1;

/** «2026-10» → «октябрь 2026» */
export const monthTitle = (month) => `${MONTHS[monthIndex(month)]} ${month.slice(0, 4)}`;

/** «2026-10» → «В октябре» */
export const inMonth = (month) => `В ${MONTHS_PREPOSITIONAL[monthIndex(month)]}`;

export const monthShort = (month) => MONTHS_SHORT[monthIndex(month)];

export function lastDayOf(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(0);
  d.setUTCFullYear(y, m, 0);
  return `${month}-${pad(d.getUTCDate())}`;
}

/** «2026-10-03» → «03.10.2026» */
export const formatDate = (date) => date.split('-').reverse().join('.');

/** +79161234567 → +7 916 123-45-67; другие форматы показываем как есть. */
export function formatPhone(phone) {
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : phone;
}

/** «4500», «4 500», «4500,50» → число; иначе undefined. Те же правила, что и в боте. */
export function parseAmount(input) {
  const normalized = String(input)
    .replace(/[\s ₽]/g, '')
    .replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  return Number(normalized);
}

/** Сумма для поля ввода: 4500.5 → «4500,5». */
export const amountForInput = (value) => String(value).replace('.', ',');

export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Складывает рубли через копейки, чтобы 0,1 + 0,2 давало ровно 0,3. */
export const sumRub = (values) => values.reduce((acc, v) => acc + Math.round(v * 100), 0) / 100;
