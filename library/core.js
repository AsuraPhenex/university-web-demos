/** Seminar 2 domain rules: reader, title, physical copy, loan, fine, reservation and notification.
 * Browser-only educational simulation. Not a shared database or security boundary.
 */
export const FINE_PER_OVERDUE_DAY = 500; // Demo assumption, not specified in seminar.
export const HOLD_DAYS = 3; // Demo assumption, not specified in seminar.
const DAY = 86400000;
const uid = prefix => `${prefix}${Math.random().toString(36).slice(2, 10)}`;
const clean = value => String(value ?? '').trim();
const must = (condition, message) => { if (!condition) throw new Error(message); };
const activeReservation = r => r.status === 'waiting' || r.status === 'held';
const bookBy = (s, id) => s.books.find(b => b.id === id);
const readerBy = (s, id) => s.readers.find(r => r.id === id);
const copyBy = (s, id) => s.copies.find(c => c.id === id);
const notify = (s, readerId, message, now) => s.notifications.unshift({ id: uid('N'), readerId, message, at: now, read: false });
const log = (s, message, now) => { s.activities.unshift({ at: now, message }); s.activities = s.activities.slice(0, 50); };
const copyId = s => `C${String(s.nextCopy++).padStart(4, '0')}`;

export function seedData() {
  const now = Date.now();
  const s = { version: 2, nextReader: 3, nextBook: 4, nextCopy: 1,
    books: [
      { id: 'B0001', title: 'Программ хангамжийн инженерчлэл', author: 'И. Соммервилл', isbn: '9780133943030', genre: 'Технологи', year: 2016 },
      { id: 'B0002', title: 'Өгөгдлийн сангийн үндэс', author: 'Н. Бат', isbn: '9780000001020', genre: 'Технологи', year: 2021 },
      { id: 'B0003', title: 'Алгоритм ба өгөгдлийн бүтэц', author: 'Г. Тэмүүлэн', isbn: '9780000001030', genre: 'Сургалт', year: 2020 }
    ],
    readers: [
      { id: 'R0001', code: 'R0001', name: 'Ө. Энхжин', phone: '99112233', active: true },
      { id: 'R0002', code: 'R0002', name: 'А. Даваацэнгэл', phone: '99887766', active: true }
    ], copies: [], loans: [], reservations: [], fines: [], notifications: [],
    activities: [{ at: now, message: 'Семинар 2-ын туршилтын өгөгдлийг бэлдлээ' }] };
  for (const [index, quantity] of [3, 2, 1].entries()) {
    for (let i = 0; i < quantity; i++) {
      s.copies.push({ id: copyId(s), bookId: s.books[index].id, location: `Тавиур ${index + 1}`, status: 'available', reservationId: null });
    }
  }
  return s;
}

export function availableCopies(s, bookId) { return s.copies.filter(c => c.bookId === bookId && c.status === 'available'); }
export function activeLoans(s) { return s.loans.filter(l => !l.returnedAt); }
export function unpaidFines(s, readerId) { return s.fines.filter(f => f.readerId === readerId && !f.paidAt); }
export function queuePosition(s, reservationId) {
  const r = s.reservations.find(x => x.id === reservationId);
  if (!r || r.status !== 'waiting') return null;
  return s.reservations.filter(x => x.bookId === r.bookId && x.status === 'waiting' && (x.createdAt < r.createdAt || (x.createdAt === r.createdAt && x.id <= r.id))).length;
}
export function registerReader(s, input, now = Date.now()) {
  const name = clean(input.name), phone = clean(input.phone);
  must(name.length >= 2 && name.length <= 100, 'Уншигчийн нэр 2–100 тэмдэгт байна (S-1, 3a).');
  must(/^\d{8}$/.test(phone), 'Утас 8 оронтой байх ёстой (S-1, 3a).');
  const existing = s.readers.find(r => r.phone === phone);
  must(!existing, `Уншигч өмнө нь бүртгэгдсэн: ${existing?.code ?? ''}. Бүртгэл засварлахыг ашиглана уу (S-1, 4a).`);
  const code = `R${String(s.nextReader++).padStart(4, '0')}`;
  const reader = { id: code, code, name, phone, active: true };
  s.readers.push(reader); log(s, `Уншигч бүртгэлээ: ${code} / ${name}`, now);
  return reader;
}
export function updateReader(s, id, input, now = Date.now()) {
  const r = readerBy(s, id); must(r, 'Уншигч олдсонгүй.');
  const name = clean(input.name), phone = clean(input.phone);
  must(name.length >= 2 && /^\d{8}$/.test(phone), 'Уншигчийн мэдээлэл дутуу эсвэл буруу.');
  must(!s.readers.some(x => x.id !== id && x.phone === phone), 'Ижил утасны дугаартай уншигч бүртгэлтэй.');
  r.name = name; r.phone = phone; r.active = input.active === true;
  log(s, `Уншигчийн мэдээлэл шинэчиллээ: ${r.code}`, now); return r;
}
function addPhysicalCopies(s, bookId, count, location, now) {
  must(Number.isInteger(count) && count >= 1 && count <= 100, '1–100 физик хувь нэмнэ.');
  must(clean(location).length >= 2, 'Номын хувь бүрийн байршлыг оруулна уу.');
  for (let i = 0; i < count; i++) {
    const copy = { id: copyId(s), bookId, location: clean(location), status: 'available', reservationId: null };
    s.copies.push(copy);
    assignToWaiting(s, copy, now);
  }
  log(s, `Номын хувь ${count} ширхэг нэмлээ: ${bookBy(s, bookId).title}`, now);
}
export function registerBook(s, input, now = Date.now()) {
  const title = clean(input.title), author = clean(input.author), isbn = clean(input.isbn);
  const genre = clean(input.genre) || 'Бусад', year = Number(input.year);
  const count = Number(input.count), location = clean(input.location);
  must(title.length >= 2 && author.length >= 2 && /^[0-9Xx-]{10,20}$/.test(isbn), 'Нэр, зохиогч эсвэл ISBN буруу байна (S-2, 2a).');
  must(Number.isInteger(year) && year >= 1450 && year <= new Date(now).getUTCFullYear() + 1, 'Хэвлэгдсэн он буруу байна.');
  must(Number.isInteger(count) && count >= 1 && count <= 100 && location.length >= 2, 'Физик хувь болон байршлыг зөв оруулна уу.');
  const existing = s.books.find(b => b.isbn === isbn);
  if (existing) {
    must(existing.title.toLocaleLowerCase() === title.toLocaleLowerCase(), 'ISBN бүртгэлтэй боловч нэр өөр байна. Бүртгэлээ шалгана уу.');
    addPhysicalCopies(s, existing.id, count, location, now);
    return { book: existing, reused: true };
  }
  const id = `B${String(s.nextBook++).padStart(4, '0')}`;
  const book = { id, title, author, isbn, genre, year }; s.books.push(book);
  addPhysicalCopies(s, id, count, location, now); return { book, reused: false };
}
export function updateBook(s, id, input, now = Date.now()) {
  const b = bookBy(s, id); must(b, 'Ном олдсонгүй.');
  must(clean(input.title).length >= 2 && clean(input.author).length >= 2, 'Номын мэдээлэл дутуу байна.');
  b.title = clean(input.title); b.author = clean(input.author); b.genre = clean(input.genre) || 'Бусад';
  log(s, `Номын мэдээлэл шинэчиллээ: ${b.title}`, now); return b;
}
export function addCopies(s, bookId, count, location, now = Date.now()) {
  must(bookBy(s, bookId), 'Ном олдсонгүй.'); addPhysicalCopies(s, bookId, Number(count), location, now);
}

function assignToWaiting(s, copy, now) {
  const next = s.reservations.filter(r => r.bookId === copy.bookId && r.status === 'waiting' && readerBy(s, r.readerId)?.active)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0];
  if (!next) { copy.status = 'available'; copy.reservationId = null; return false; }
  next.status = 'held'; next.copyId = copy.id; next.holdUntil = now + HOLD_DAYS * DAY;
  copy.status = 'held'; copy.reservationId = next.id;
  notify(s, next.readerId, `${bookBy(s, next.bookId)?.title}: ${copy.id} хувь таны нэр дээр ${HOLD_DAYS} хоног хадгалагдлаа.`, now);
  log(s, `FIFO захиалгад хадгаллаа: ${copy.id} → ${readerBy(s, next.readerId)?.code}`, now);
  return true;
}
/** Expire missed pickup windows and reassign released physical copies to next waiting reader. */
export function reconcile(s, now = Date.now()) {
  let changes = 0;
  for (const r of s.reservations) {
    if (r.status !== 'held' || r.holdUntil > now) continue;
    const copy = copyBy(s, r.copyId); r.status = 'expired';
    notify(s, r.readerId, `Захиалга авах хугацаа дууссан: ${bookBy(s, r.bookId)?.title}`, now);
    if (copy && copy.status === 'held' && copy.reservationId === r.id) {
      copy.reservationId = null; assignToWaiting(s, copy, now);
    }
    changes++;
  }
  return changes;
}
export function reserveBook(s, readerId, bookId, now = Date.now()) {
  reconcile(s, now);
  const r = readerBy(s, readerId), b = bookBy(s, bookId);
  must(r && b, 'Уншигч эсвэл ном олдсонгүй.');
  must(r.active, 'Уншигчийн бүртгэл идэвхгүй байна (S-5, 4a).');
  must(availableCopies(s, bookId).length === 0, 'Номын бэлэн хувь байна. Захиалахын оронд ном олгоно (S-5, 2a).');
  const existing = s.reservations.find(x => x.readerId === readerId && x.bookId === bookId && activeReservation(x));
  must(!existing, `Идэвхтэй захиалга аль хэдийн байна${existing?.status === 'waiting' ? ` (дараалал #${queuePosition(s, existing.id)})` : ''} (S-5, 5a).`);
  const rec = { id: uid('Q'), readerId, bookId, createdAt: now, status: 'waiting', copyId: null, holdUntil: null };
  s.reservations.push(rec); notify(s, readerId, `${b.title}: таны захиалга хүлээлгийн дараалалд бүртгэгдлээ.`, now);
  log(s, `Захиалга бүртгэлээ: ${b.title} / ${r.code}`, now); return rec;
}
export function cancelReservation(s, id, readerId, now = Date.now()) {
  const r = s.reservations.find(x => x.id === id); must(r && activeReservation(r), 'Цуцлах боломжтой захиалга олдсонгүй.');
  must(!readerId || r.readerId === readerId, 'Зөвхөн өөрийн захиалгыг цуцална.');
  r.status = 'cancelled';
  const copy = copyBy(s, r.copyId);
  if (copy && copy.status === 'held' && copy.reservationId === id) { copy.reservationId = null; assignToWaiting(s, copy, now); }
  log(s, `Захиалга цуцлагдлаа: ${bookBy(s, r.bookId)?.title}`, now); return r;
}
export function borrowBook(s, { readerId, bookId, due }, now = Date.now()) {
  reconcile(s, now);
  const r = readerBy(s, readerId), b = bookBy(s, bookId);
  must(r && b, 'Уншигч эсвэл ном олдсонгүй.'); must(r.active, 'Уншигчийн бүртгэл идэвхгүй байна (S-3, 3a).');
  must(unpaidFines(s, readerId).length === 0, 'Төлөгдөөгүй торгуультай байна. Эхлээд төлбөрийг бүртгэнэ (S-3, 4a).');
  const dueDate = Date.parse(`${due}T23:59:59+08:00`);
  must(Number.isFinite(dueDate) && dueDate > now, 'Буцаах огноо ирээдүйд байх ёстой.');
  must(!activeLoans(s).some(x => x.readerId === readerId && copyBy(s, x.copyId)?.bookId === bookId), 'Энэ уншигч тухайн номыг буцаагаагүй байна.');
  const ownHeld = s.copies.find(c => c.bookId === bookId && c.status === 'held' && s.reservations.some(x => x.id === c.reservationId && x.readerId === readerId && x.status === 'held'));
  const copy = ownHeld || availableCopies(s, bookId)[0];
  must(copy, 'Олгох боломжтой хувь байхгүй. Ном захиалах урсгалыг сонгоно уу (S-3, 6a).');
  if (ownHeld) { const reservation = s.reservations.find(x => x.id === copy.reservationId); reservation.status = 'fulfilled'; }
  copy.status = 'loaned'; copy.reservationId = null;
  const loan = { id: uid('L'), copyId: copy.id, readerId, issuedAt: now, due, returnedAt: null };
  s.loans.push(loan); log(s, `${copy.id} хувийг ${r.code} уншигчид олгов`, now); return loan;
}
export function returnCopy(s, copyId, damaged = false, now = Date.now()) {
  reconcile(s, now);
  const copy = copyBy(s, copyId); const loan = activeLoans(s).find(l => l.copyId === copyId);
  must(copy && loan, 'Энэ физик хувьд идэвхтэй олголт олдсонгүй (S-4, 3a).');
  loan.returnedAt = now;
  const deadline = Date.parse(`${loan.due}T23:59:59+08:00`);
  const overdue = Math.max(0, Math.ceil((now - deadline) / DAY));
  let fine = null;
  if (overdue > 0) {
    fine = { id: uid('F'), loanId: loan.id, readerId: loan.readerId, days: overdue, amount: overdue * FINE_PER_OVERDUE_DAY, at: now, paidAt: null };
    s.fines.push(fine);
    notify(s, loan.readerId, `${overdue} хоног хугацаа хэтэрсэн тул ${fine.amount.toLocaleString('mn-MN')} ₮ торгууль бүртгэгдлээ.`, now);
  }
  copy.status = damaged ? 'damaged' : 'available'; copy.reservationId = null;
  if (!damaged) assignToWaiting(s, copy, now);
  log(s, `${copyId} хувь буцаалаа${damaged ? ' (гэмтсэн)' : ''}${fine ? ` / торгууль ${fine.amount} ₮` : ''}`, now);
  return { loan, fine, damaged };
}
export function payFine(s, fineId, now = Date.now()) {
  const f = s.fines.find(x => x.id === fineId); must(f && !f.paidAt, 'Төлөгдөөгүй торгууль олдсонгүй.');
  f.paidAt = now; log(s, `Торгууль төлөлт бүртгэлээ: ${f.amount} ₮`, now); return f;
}
export function markNotification(s, id, readerId) {
  const n = s.notifications.find(x => x.id === id); must(n && n.readerId === readerId, 'Мэдэгдэл олдсонгүй.'); n.read = true;
}
