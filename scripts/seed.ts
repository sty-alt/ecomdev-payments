/**
 * Заполняет базу демо-данными: ученики в трёх группах и оплаты за прошлый и текущий месяц.
 * Запуск: npm run seed (добавьте -- --reset, чтобы очистить базу перед заполнением).
 */
import '../src/env.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/database.js';
import { createClock } from '../src/lib/dates.js';
import { createServices } from '../src/services.js';
import { createStudentSchema } from '../src/students/students.schemas.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const services = createServices(db, createClock(config.timeZone));
const reset = process.argv.includes('--reset');

if (reset) {
  db.exec('DELETE FROM payments; DELETE FROM students; DELETE FROM sqlite_sequence;');
} else if (services.students.list().length > 0) {
  console.log('В базе уже есть ученики — пропускаю. Для перезаписи: npm run seed -- --reset');
  process.exit(0);
}

// Проходим через ту же схему, что и API: так телефоны нормализуются одинаково.
const addStudent = (input: Record<string, unknown>) => {
  const parsed = createStudentSchema.parse(input);
  return services.students.create({ ...parsed, startDate: parsed.startDate ?? services.clock.today() });
};

const today = services.clock.today();
const thisMonth = today.slice(0, 7);
const [y, m] = thisMonth.split('-').map(Number) as [number, number];
const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
const day = (month: string, d: number) => `${month}-${String(d).padStart(2, '0')}`;
// Оплаты текущего месяца ставим не позже сегодняшнего дня.
const thisMonthDay = (d: number) => day(thisMonth, Math.min(d, Number(today.slice(8, 10))));

const students = [
  { name: 'Анна Смирнова', phone: '+7 916 123-45-67', group: 'Английский A2', monthlyFee: 6000 },
  { name: 'Иван Петров', phone: '8 (903) 555-12-34', group: 'Английский A2', monthlyFee: 6000 },
  { name: 'Мария Кузнецова', phone: '+7 925 777-00-11', group: 'Английский A2', monthlyFee: 6000 },
  { name: 'Дмитрий Соколов', phone: '+7 999 010-20-30', group: 'Робототехника', monthlyFee: 8500 },
  { name: 'Елизавета Попова', phone: '+7 977 404-50-60', group: 'Робототехника', monthlyFee: 8500 },
  { name: 'Артём Волков', phone: '+7 915 300-40-50', group: 'Подготовка к ОГЭ', monthlyFee: 7200 },
  { name: 'София Морозова', phone: '+7 926 600-70-80', group: 'Подготовка к ОГЭ', monthlyFee: 7200 },
  { name: 'Максим Лебедев', phone: '+7 905 222-33-44', group: 'Подготовка к ОГЭ', monthlyFee: 7200 },
].map((s) => addStudent({ ...s, startDate: day(prevMonth, 1) }));

// Новенький пришёл в этом месяце: за прошлый месяц он не должник.
const newcomer = addStudent({
  name: 'Ксения Новикова',
  phone: '+79161112233',
  group: 'Робототехника',
  monthlyFee: 8500,
  startDate: thisMonthDay(1),
});

const [anna, ivan, maria, dmitry, liza, artem, sofia, maxim] = students.map((s) => s.id) as number[] as [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
const pay = (studentId: number, amount: number, date: string) => services.payments.add({ studentId, amount, date });

// Прошлый месяц: почти все оплатили, Иван — частично.
pay(anna, 6000, day(prevMonth, 5));
pay(maria, 6000, day(prevMonth, 5));
pay(dmitry, 8500, day(prevMonth, 6));
pay(liza, 8500, day(prevMonth, 6));
pay(artem, 7200, day(prevMonth, 4));
pay(sofia, 7200, day(prevMonth, 4));
pay(maxim, 7200, day(prevMonth, 9));
pay(ivan, 3000, day(prevMonth, 7));

// Текущий месяц: полные, частичные (в два платежа) и отсутствующие оплаты.
pay(anna, 6000, thisMonthDay(3));
pay(dmitry, 5000, thisMonthDay(4));
pay(dmitry, 3500, thisMonthDay(10));
pay(liza, 4000, thisMonthDay(6));
pay(sofia, 7200, thisMonthDay(2));
pay(maxim, 1500.5, thisMonthDay(8));
pay(newcomer.id, 2000, thisMonthDay(1));

console.log(
  `Готово: ${students.length + 1} учеников, месяцы ${prevMonth} и ${thisMonth}. База: ${config.databasePath}`,
);
db.close();
