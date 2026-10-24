// Тонкий клиент к REST API этого же сервера.

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? `Сервер ответил ошибкой ${status}`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details ?? [];
  }
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: { message: 'Нет связи с сервером. Проверьте интернет и повторите.' } });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  calendar: () => request('GET', '/calendar'),
  students: () => request('GET', '/students'),
  createStudent: (input) => request('POST', '/students', input),
  updateStudent: (id, patch) => request('PATCH', `/students/${id}`, patch),
  deleteStudent: (id) => request('DELETE', `/students/${id}`),
  payments: (studentId, month) =>
    request('GET', `/students/${studentId}/payments${month ? `?month=${encodeURIComponent(month)}` : ''}`),
  addPayment: (input) => request('POST', '/payments', input),
  deletePayment: (id) => request('DELETE', `/payments/${id}`),
  debtors: (month) => request('GET', `/debtors?month=${encodeURIComponent(month)}`),
};
