import { formatMonth, isCalendarDate, monthSchema } from '../lib/dates.js';
import { AppError } from '../lib/errors.js';
import { formatRubles, MAX_AMOUNT_RUB, parseHumanAmount } from '../lib/money.js';
import type { Services } from '../services.js';

/**
 * Логика команд бота без привязки к Telegram: на входе текст аргументов, на выходе HTML-ответ.
 * Так команды легко тестировать, а grammY отвечает только за доставку сообщений.
 */

const MAX_LINES = 50;

// Telegram допускает до 4096 символов: длинные имена и HTML-экранирование тоже занимают место.
function fitLines(lines: string[], total: number): string[] {
  const result: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 > 3500) break;
    result.push(line);
    length += line.length + 1;
  }
  if (total > result.length) result.push(`…и ещё ${total - result.length}. Полный список доступен на веб-странице.`);
  return result;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

export const HELP_TEXT = [
  '<b>Учёт оплат учебного центра</b>',
  '',
  '/debt — должники текущего месяца',
  '/debt 2026-09 — должники за другой месяц',
  '/pay &lt;id ученика&gt; &lt;сумма&gt; — внести оплату сегодняшним числом',
  '/pay 12 4500 2026-10-01 — оплата с датой',
  '/students — ученики и их id',
].join('\n');

export function debtCommand(services: Services, args: string): string {
  const arg = args.trim();
  if (arg && !monthSchema.safeParse(arg).success) {
    return 'Месяц указывается в формате YYYY-MM, например: /debt 2026-09';
  }
  const month = arg || services.clock.currentMonth();
  const report = services.debtors.forMonth(month);
  const title = formatMonth(month);

  if (report.count === 0) return `За ${title} должников нет — все оплатили.`;

  const lines = report.debtors
    .slice(0, MAX_LINES)
    .map(
      (d) =>
        `<code>${d.studentId}</code> ${escapeHtml(d.name)} (${escapeHtml(d.group)}) — ` +
        `должен <b>${formatRubles(d.debt)}</b>, оплачено ${formatRubles(d.paid)} из ${formatRubles(d.monthlyFee)}`,
    );

  return [
    `<b>Должники за ${title}</b>: ${report.count}, всего ${formatRubles(report.totalDebt)}`,
    '',
    ...fitLines(lines, report.count),
    '',
    'Внести оплату: /pay &lt;id&gt; &lt;сумма&gt;',
  ].join('\n');
}

const PAY_USAGE = 'Формат: /pay &lt;id ученика&gt; &lt;сумма&gt; [дата YYYY-MM-DD]\nНапример: /pay 12 4500';

export function payCommand(services: Services, args: string): string {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return PAY_USAGE;

  const [idArg, amountArg, dateArg] = parts as [string, string, string | undefined];
  const studentId = Number(idArg);
  if (!/^\d+$/.test(idArg) || !Number.isSafeInteger(studentId) || studentId <= 0) {
    return `Id ученика должен быть положительным числом.\n${PAY_USAGE}`;
  }
  const amount = parseHumanAmount(amountArg);
  if (amount === undefined || amount <= 0 || amount > MAX_AMOUNT_RUB) {
    return `Сумма должна быть числом больше нуля, например 4500 или 4500,50.\n${PAY_USAGE}`;
  }
  if (dateArg !== undefined && !isCalendarDate(dateArg)) {
    return `Дата должна быть в формате YYYY-MM-DD.\n${PAY_USAGE}`;
  }

  const student = services.students.findById(studentId);
  if (!student) return `Ученик с id ${studentId} не найден. Список: /students`;

  try {
    const payment = services.payments.add({ studentId, amount, date: dateArg });
    const month = payment.date.slice(0, 7);
    const balance = services.debtors.balance(studentId, month)!;
    const status =
      balance.debt > 0
        ? `Осталось доплатить за ${formatMonth(month)}: <b>${formatRubles(balance.debt)}</b>`
        : `За ${formatMonth(month)} оплачено полностью.`;
    return [
      `Оплата принята: ${escapeHtml(student.name)} — ${formatRubles(payment.amount)} от ${payment.date}.`,
      `Оплачено ${formatRubles(balance.paid)} из ${formatRubles(balance.monthlyFee)}.`,
      status,
    ].join('\n');
  } catch (err) {
    if (err instanceof AppError) return escapeHtml(err.message);
    throw err;
  }
}

export function studentsCommand(services: Services): string {
  const students = services.students.list();
  if (students.length === 0) return 'Учеников пока нет. Добавьте их через веб-страницу или API.';
  const lines = students
    .slice(0, MAX_LINES)
    .map(
      (s) => `<code>${s.id}</code> ${escapeHtml(s.name)} (${escapeHtml(s.group)}) — ${formatRubles(s.monthlyFee)}/мес`,
    );
  return ['<b>Ученики</b>', '', ...fitLines(lines, students.length)].join('\n');
}
