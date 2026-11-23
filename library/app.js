import { seedData, registerReader, updateReader, registerBook, updateBook, addCopies, borrowBook, returnCopy,
  reserveBook, cancelReservation, reconcile, availableCopies, activeLoans, unpaidFines, queuePosition, payFine, markNotification,
  FINE_PER_OVERDUE_DAY } from './core.js';
'use strict';
const KEY = 'library_demo_v2', $ = s => document.querySelector(s);
const esc = text => String(text ?? '').replace(/[&<>"']/g, x => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[x]));
const money = n => Number(n).toLocaleString('mn-MN') + ' ₮';
const date = n => n ? new Date(n).toLocaleString('mn-MN',{timeZone:'Asia/Ulaanbaatar',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const statusNames = {available:'Бэлэн',held:'Хадгалсан',loaned:'Олгогдсон',damaged:'Гэмтсэн',waiting:'Хүлээж байна',fulfilled:'Биелсэн',cancelled:'Цуцалсан',expired:'Хугацаа дууссан'};
let db; try {const previous = JSON.parse(localStorage.getItem(KEY));db = previous?.version === 2 ? previous : seedData()} catch {db=seedData()}
let role = 'librarian'; let identity = db.readers[0]?.id || '';
const save = () => localStorage.setItem(KEY,JSON.stringify(db));
function toast(message) {const t=$('#toast'); t.textContent=message;t.classList.add('show');clearTimeout(window.noticeTimeout);window.noticeTimeout=setTimeout(()=>t.classList.remove('show'),4500)}
const book = id => db.books.find(x=>x.id===id);
const reader = id => db.readers.find(x=>x.id===id);
const copy = id => db.copies.find(x=>x.id===id);
const label = (kind,status) => `<span class="tag ${kind==='bad'?'out':''}">${esc(status)}</span>`;
const table = (columns,rows) => !rows.length ? '<div class="empty">Бүртгэл байхгүй байна</div>' : `<div class="table-wrap"><table><thead><tr>${columns.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const option = (value,text) => `<option value="${esc(value)}">${esc(text)}</option>`;
function populate(id, data, placeholder) {const el=$('#'+id), previous=el.value;el.innerHTML=option('',placeholder)+data.map(x=>option(x.id,x.label)).join('');if(data.some(x=>x.id===previous))el.value=previous;}
function refreshDueDate(){const el=$('#loanForm [name=due]');if(!el.value){const d=new Date(Date.now()+7*86400000);el.value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ulaanbaatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}}
function render() {
  if(reconcile(db))save();
  const loans = activeLoans(db), reservations=db.reservations, currentReader=reader(identity);
  $('#metrics').innerHTML=[['Номын гарчиг',db.books.length],['Физик хувь',db.copies.length],['Уншигч',db.readers.length],['Идэвхтэй олголт',loans.length]].map(([name,value])=>`<div class="metric"><small>${name}</small><div class="num">${value}</div></div>`).join('');
  $('#activity').innerHTML=db.activities.slice(0,20).map(x=>`<div class="activity">${date(x.at)} — ${esc(x.message)}</div>`).join('');
  const term=$('#bookSearch').value.toLocaleLowerCase('mn-MN');
  const bookRows = db.books.filter(b=>[b.title,b.author,b.isbn].join(' ').toLocaleLowerCase('mn-MN').includes(term)).map(b=>{
    const copies=db.copies.filter(x=>x.bookId===b.id);return `<tr><td>${esc(b.id)}<br><small>${esc(b.isbn)}</small></td><td><b>${esc(b.title)}</b><br><small>${esc(b.author)}</small></td><td>${esc(b.genre)} · ${esc(b.year)}</td><td>${availableCopies(db,b.id).length} / ${copies.length}</td><td><button class="action" data-addcopy="${esc(b.id)}">+ Хувь</button> <button class="action secondary" data-editbook="${esc(b.id)}">Засах</button></td></tr>`});
  $('#booksTable').innerHTML=table(['Бүртгэл / ISBN','Нэр, зохиогч','Төрөл / он','Бэлэн / нийт','Үйлдэл'],bookRows);
  $('#copiesTable').innerHTML=table(['Хувийн дугаар','Ном','Байршил','Төлөв'],db.copies.map(c=>`<tr><td><b>${esc(c.id)}</b></td><td>${esc(book(c.bookId)?.title)}</td><td>${esc(c.location)}</td><td>${label(c.status==='damaged'?'bad':'good',statusNames[c.status]||c.status)}</td></tr>`));
  $('#readersTable').innerHTML=table(['Код','Нэр','Утас','Төлөв','Үйлдэл'],db.readers.map(r=>`<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${label(r.active?'good':'bad',r.active?'Идэвхтэй':'Идэвхгүй')}</td><td><button class="action secondary" data-editreader="${esc(r.id)}">Засах / төлөв</button></td></tr>`));
  $('#loansTable').innerHTML=table(['Уншигч','Ном, хувь','Олгосон / буцаах','Төлөв / буцаах'],db.loans.slice().reverse().map(l=>`<tr><td>${esc(reader(l.readerId)?.name)}</td><td><b>${esc(book(copy(l.copyId)?.bookId)?.title)}</b><br>${esc(l.copyId)}</td><td>${date(l.issuedAt)}<br>Дуусах: ${esc(l.due)}</td><td>${l.returnedAt?label('good','Буцаасан '+date(l.returnedAt)):`<button class="action" data-return="${esc(l.copyId)}">Буцаах</button> <button class="action danger" data-damaged="${esc(l.copyId)}">Гэмтэлтэй</button>`}</td></tr>`));
  const status = r => r.status==='waiting'?`Дараалал №${queuePosition(db,r.id)}`:r.status==='held'?`Хадгалсан · ${date(r.holdUntil)} хүртэл`:(statusNames[r.status]||r.status);
  const reservationsTable = rows => table(['Уншигч','Ном','Үүсгэсэн','Төлөв','Үйлдэл'],rows.map(r=>`<tr><td>${esc(reader(r.readerId)?.name)}</td><td>${esc(book(r.bookId)?.title)}${r.copyId?`<br><small>${esc(r.copyId)}</small>`:''}</td><td>${date(r.createdAt)}</td><td>${label(r.status==='expired'?'bad':'good',status(r))}</td><td>${['waiting','held'].includes(r.status)?`<button class="action secondary" data-cancel="${esc(r.id)}">Цуцлах</button>`:''}</td></tr>`));
  $('#reserveTable').innerHTML=reservationsTable(reservations.slice().reverse());
  $('#finesTable').innerHTML=table(['Уншигч','Хугацаа','Торгууль','Төлөв'],db.fines.slice().reverse().map(f=>`<tr><td>${esc(reader(f.readerId)?.name)}</td><td>${f.days} хоног</td><td>${money(f.amount)}</td><td>${f.paidAt?label('good','Төлсөн'): `<button class="action" data-payfine="${esc(f.id)}">Төлөлт бүртгэх</button>`}</td></tr>`));
  $('#allNotices').innerHTML=table(['Уншигч','Цаг','Мэдэгдэл'],db.notifications.map(n=>`<tr><td>${esc(reader(n.readerId)?.name)}</td><td>${date(n.at)}</td><td>${esc(n.message)}</td></tr>`));
  populate('loanReader',db.readers.map(r=>({id:r.id,label:`${r.code} · ${r.name}${r.active?'':' (идэвхгүй)'}`})),'Уншигч сонгох');
  populate('reserveReader',db.readers.map(r=>({id:r.id,label:`${r.code} · ${r.name}`})),'Уншигч сонгох');
  populate('loanBook',db.books.map(b=>({id:b.id,label:`${b.title} (${availableCopies(db,b.id).length} бэлэн)`})),'Ном сонгох');
  populate('reserveBook',db.books.map(b=>({id:b.id,label:`${b.title} (${availableCopies(db,b.id).length} бэлэн)`})),'Ном сонгох');
  const readerPick=$('#readerIdentity'), before=identity;
  readerPick.innerHTML=db.readers.map(r=>option(r.id,`${r.code} — ${r.name}`)).join('');
  identity=db.readers.some(r=>r.id===before)?before:db.readers[0]?.id || '';readerPick.value=identity;
  $('#readerSummary').innerHTML=currentReader ? `${label(currentReader.active?'good':'bad',currentReader.active?'Идэвхтэй':'Идэвхгүй')} <b>${esc(currentReader.name)}</b> · ${esc(currentReader.code)} · Төлөгдөөгүй торгууль: <b>${money(unpaidFines(db,identity).reduce((n,f)=>n+f.amount,0))}</b>`:'Уншигч бүртгэлгүй байна.';
  const rt=$('#readerSearch').value.toLocaleLowerCase('mn-MN');
  $('#readerBooks').innerHTML=table(['Ном','ISBN','Бэлэн хувь','Үйлдэл'],db.books.filter(b=>[b.title,b.author,b.isbn].join(' ').toLocaleLowerCase('mn-MN').includes(rt)).map(b=>`<tr><td><b>${esc(b.title)}</b><br>${esc(b.author)}</td><td>${esc(b.isbn)}</td><td>${availableCopies(db,b.id).length}</td><td>${availableCopies(db,b.id).length>0?label('good','Бэлэн — номын санчаас авах'): `<button class="action" data-readerreserve="${esc(b.id)}" ${!currentReader?.active?'disabled':''}>Захиалах</button>`}</td></tr>`));
  $('#readerLoans').innerHTML=table(['Ном, хувь','Буцаах хугацаа','Төлөв'],db.loans.filter(l=>l.readerId===identity).slice().reverse().map(l=>`<tr><td>${esc(book(copy(l.copyId)?.bookId)?.title)} · ${esc(l.copyId)}</td><td>${esc(l.due)}</td><td>${l.returnedAt?'Буцаасан':'Олгогдсон'}</td></tr>`));
  $('#readerReservations').innerHTML=reservationsTable(db.reservations.filter(r=>r.readerId===identity).slice().reverse());
  $('#readerNotices').innerHTML=table(['Хугацаа','Мэдэгдэл','Үйлдэл'],db.notifications.filter(n=>n.readerId===identity).map(n=>`<tr><td>${date(n.at)}</td><td>${esc(n.message)}</td><td>${n.read?'Уншсан':`<button class="action secondary" data-readnotice="${esc(n.id)}">Уншсан</button>`}</td></tr>`));
}
function transact(action,success){try{const result=action();save();render();toast(typeof success==='function'?success(result):success);return result}catch(e){toast(e.message);return null}}
function handler(formId, fn, done){$('#'+formId).addEventListener('submit',e=>{e.preventDefault();if(role!=='librarian')return toast('Энэ үйлдлийг зөвхөн номын санч гүйцэтгэнэ.');const values=Object.fromEntries(new FormData(e.target));const ok=transact(()=>fn(values),done);if(ok!==null){e.target.reset();refreshDueDate();}})}
handler('readerForm', v => registerReader(db,v), r=>`Уншигч бүртгэгдлээ: ${r.code}`);
handler('bookForm', v => registerBook(db,v), r=>r.reused?'ISBN бүртгэлтэй байсан: нэмэлт хувь бүртгэлээ.':'Шинэ ном, физик хувь бүртгэгдлээ.');
handler('loanForm', v => borrowBook(db,v), r=>`Номын ${copy(r.copyId)?.id} хувийг олголоо.`);
handler('reserveForm',v=>reserveBook(db,v.readerId,v.bookId),r=>`Захиалга үүсгэв — FIFO дараалал №${queuePosition(db,r.id)}.`);
function changeRole(next){role=next;document.querySelectorAll('.librarian-nav').forEach(b=>b.hidden=next!=='librarian');document.querySelectorAll('.reader-nav').forEach(b=>b.hidden=next!=='reader');$('#reset').hidden=next!=='librarian';navigate(next==='reader'?'readerPortal':'dashboard')}
function navigate(name){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===name));document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===name));$('#pageTitle').textContent=document.querySelector(`nav button[data-page="${name}"]`)?.textContent.trim()||'Номын сан';render()}
$('#roleMode').addEventListener('change',e=>changeRole(e.target.value));
document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{if(!b.hidden)navigate(b.dataset.page)}));
$('#readerIdentity').addEventListener('change',e=>{identity=e.target.value;render()});
$('#bookSearch').addEventListener('input',render);$('#readerSearch').addEventListener('input',render);
$('#reset').addEventListener('click',()=>{if(!confirm('Бүх демо өөрчлөлтийг устгаад анхны өгөгдлийг сэргээх үү?'))return;db=seedData();identity=db.readers[0].id;save();render();toast('Демо өгөгдөл сэргээгдлээ.')});
document.addEventListener('click',e=>{const btn=e.target.closest('button[data-return],button[data-damaged],button[data-addcopy],button[data-editbook],button[data-editreader],button[data-cancel],button[data-payfine],button[data-readerreserve],button[data-readnotice]');if(!btn)return;
  const d=btn.dataset;
  if(d.return||d.damaged){if(role!=='librarian')return;if(d.damaged&&!confirm('Энэ номын хувийг гэмтсэн төлөвтэй буцаах уу?'))return;transact(()=>returnCopy(db,d.return||d.damaged,Boolean(d.damaged)),r=>r.fine?`Буцаалт бүртгэгдлээ; ${money(r.fine.amount)} торгууль үүслээ.`:'Буцаалт бүртгэгдлээ.');}
  if(d.addcopy){if(role!=='librarian')return;const quantity=prompt('Нэмэх физик хувийн тоо:', '1');if(quantity===null)return;const location=prompt('Хувийн байршил:', 'А1 тавиур');if(location===null)return;transact(()=>{addCopies(db,d.addcopy,Number(quantity),location);return true},'Нэмэлт хувь бүртгэгдлээ.');}
  if(d.editbook){if(role!=='librarian')return;const b=book(d.editbook);const title=prompt('Номын нэр',b.title);if(title===null)return;const author=prompt('Зохиогч',b.author);if(author===null)return;const genre=prompt('Төрөл',b.genre);if(genre===null)return;transact(()=>updateBook(db,b.id,{title,author,genre}),'Номын мэдээлэл шинэчлэгдлээ.');}
  if(d.editreader){if(role!=='librarian')return;const r=reader(d.editreader);const name=prompt('Уншигчийн нэр',r.name);if(name===null)return;const phone=prompt('Утасны дугаар',r.phone);if(phone===null)return;const active=confirm('Уншигчийн бүртгэл ИДЭВХТЭЙ хэвээр байх уу? (Cancel = идэвхгүй)');transact(()=>updateReader(db,r.id,{name,phone,active}),'Уншигчийн мэдээлэл шинэчлэгдлээ.');}
  if(d.cancel){const r=db.reservations.find(x=>x.id===d.cancel);if(role==='reader'&&r?.readerId!==identity)return toast('Зөвхөн өөрийн захиалгыг цуцална.');transact(()=>cancelReservation(db,d.cancel,role==='reader'?identity:null),'Захиалга цуцлагдлаа.');}
  if(d.payfine){if(role!=='librarian')return;transact(()=>payFine(db,d.payfine),'Торгуулийн төлөлт бүртгэгдлээ.');}
  if(d.readerreserve){if(role!=='reader')return;transact(()=>reserveBook(db,identity,d.readerreserve),r=>`Захиалгын дараалал №${queuePosition(db,r.id)}.`);}
  if(d.readnotice){if(role!=='reader')return;transact(()=>markNotification(db,d.readnotice,identity),'Мэдэгдлийг уншсанаар тэмдэглэлээ.');}
});
refreshDueDate();render();setInterval(()=>{if(reconcile(db)){save();render()}},60000);
