'use strict';
let API=String(localStorage.getItem('cinema_api_url')||window.CINEMA_API_URL||'').replace(/\/$/,'');
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('mn-MN').format(n)+' ₮';
const dateFmt=d=>new Date(d).toLocaleString('mn-MN',{timeZone:'Asia/Ulaanbaatar',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
let movies=[],currentMovie=null,screening=null,selected=[],hold=null,countdownTimer=null,adminToken=sessionStorage.getItem('cinema_admin')||'';
function toast(s){let t=$('#toast');t.textContent=s;t.style.display='block';clearTimeout(window.toastT);window.toastT=setTimeout(()=>t.style.display='none',5000)}
async function request(path,options={}) {
  if(!/^https:\/\/[^\s/]+$/i.test(API)&&!/^http:\/\/localhost:\d+$/i.test(API))throw Error('API хаяг буруу. ⚙ тохиргооноос Render API URL оруулна уу.');
  let resp;
  try{
    resp=await fetch(API+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  }catch(error){
    throw Error('API холболт амжилтгүй: '+API+' — сервисийн хаяг, Render төлөв болон CORS тохиргоог шалгана уу.');
  }
  let data=await resp.json().catch(()=>({error:'Сервер хариу өгсөнгүй'}));
  if(!resp.ok)throw Error(data.error||'HTTP '+resp.status);
  return data;
}
$('#apiBase').value=API;
$('#apiSettingsToggle').onclick=()=>$('#apiSettings').classList.toggle('hidden');
$('#apiSave').onclick=async()=>{
  const address=$('#apiBase').value.trim().replace(/\/$/,'');
  if(!/^https:\/\/[^\s/]+$/i.test(address)&&!/^http:\/\/localhost:\d+$/i.test(address))return toast('https:// хаяг оруулна уу');
  API=address;localStorage.setItem('cinema_api_url',API);$('#apiSettings').classList.add('hidden');await loadMovies();
};
$('#apiRetry').onclick=()=>loadMovies();
const send=(path,data,token)=>request(path,{method:'POST',headers:token?{'Authorization':'Bearer '+token}:{},body:JSON.stringify(data)});
function navigate(name){document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===name));document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.view===name));window.scrollTo({top:0,behavior:'smooth'})}
for(const b of document.querySelectorAll('.nav'))b.addEventListener('click',()=>{navigate(b.dataset.view);if(b.dataset.view==='admin'&&adminToken)loadAdmin()});
$('#explore').onclick=()=>$('#films').scrollIntoView({behavior:'smooth'});
$('#backFilms').onclick=$('#newBooking').onclick=()=>{clearInterval(countdownTimer);if(hold)send('/api/holds/release',{screeningId:hold.screeningId,token:hold.token}).catch(()=>{});hold=null;selected=[];navigate('home');loadMovies()};
$('#printTicket').onclick=()=>window.print();
$('#cancelHold').onclick=async()=>{
  clearInterval(countdownTimer);
  if(hold)await send('/api/holds/release',{screeningId:hold.screeningId,token:hold.token}).catch(()=>{});
  hold=null;$('#checkoutPanel').classList.add('hidden');$('#seatPanel').classList.remove('hidden');await refreshSeats();
};
function displayMovies(){
  const term=$('#movieSearch').value.trim().toLocaleLowerCase('mn-MN');
  const genre=$('#genreFilter').value;
  const filtered=movies.filter(m=>(genre==='all'||(m.genre||'').split(' · ')[0]===genre)&&
    [m.title,m.genre,m.description].join(' ').toLocaleLowerCase('mn-MN').includes(term));
  $('#movieCount').textContent=filtered.length+' кино';
  $('#movies').innerHTML=filtered.map(m=>`
    <article class="movie">
      <div class="poster ${esc(m.tone)}">
        <div class="poster-icon" aria-hidden="true">${esc(m.emoji||'🎬')}</div>
        <div class="poster-title">${esc(m.title)}</div>
        
      </div>
      <div class="movie-detail"><small>${esc(m.genre)} · ${m.duration} минут</small>
        <h3>${esc(m.title)}</h3><p>${esc(m.description)}</p>
        <button class="primary" data-movie="${m._id}">Үзвэрийн цаг сонгох ↗</button>
      </div>
    </article>`).join('')||'<div class="message">Хайлтад тохирох кино олдсонгүй.</div>';
}
async function loadMovies(){
  try{
    movies=await request('/api/movies');
    $('#apiStatus').textContent='● API холбогдсон';
    $('#apiStatus').classList.add('connected');
    const genres=[...new Set(movies.map(m=>String(m.genre||'Бусад').split(' · ')[0]))];
    const old=$('#genreFilter').value;
    $('#genreFilter').innerHTML='<option value="all">Бүх төрөл</option>'+genres.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
    $('#genreFilter').value=genres.includes(old)?old:'all';
    $('#adminMovieId').innerHTML=movies.map(m=>`<option value="${m._id}">${esc(m.title)}</option>`).join('');
    displayMovies();
  }catch(e){
    $('#apiStatus').textContent='● API холболтгүй';
    $('#apiStatus').classList.remove('connected');
    $('#movies').innerHTML='<div class="message">'+esc(e.message)+' <button type="button" class="ghost" id="retryMovies">↻ Дахин оролдох</button></div>';$('#retryMovies').onclick=loadMovies;$('#apiSettings').classList.remove('hidden');
    toast(e.message);
  }
}
$('#movieSearch').addEventListener('input',displayMovies);
$('#genreFilter').addEventListener('change',displayMovies);

$('#movies').addEventListener('click',e=>{const id=e.target.closest('[data-movie]')?.dataset.movie;if(id)selectMovie(id)});
const dayLabel=dt=>new Date(dt).toLocaleDateString('mn-MN',{timeZone:'Asia/Ulaanbaatar',month:'short',day:'numeric',weekday:'long'});
function displayShowtimes(shows){
  const groups=new Map();
  for(const s of shows){
    const day=dayLabel(s.startsAt);
    if(!groups.has(day))groups.set(day,[]);
    groups.get(day).push(s);
  }
  return [...groups].map(([day,group])=>`<div class="day-group"><h4>${esc(day)}</h4><div class="day-times">${group.map(s=>`<button class="time" data-show="${s._id}"><b>${new Date(s.startsAt).toLocaleTimeString('mn-MN',{timeZone:'Asia/Ulaanbaatar',hour:'2-digit',minute:'2-digit'})}</b><small>${esc(s.hall)} · ${money(s.price)}</small></button>`).join('')}</div></div>`).join('')||'<p class="subtle">Энэ киноны үзвэрийн цаг бүртгэгдээгүй байна. Администратор хуваарь нэмнэ.</p>';
}
async function selectMovie(id){
  currentMovie=movies.find(m=>m._id===id);
  if(!currentMovie)return;
  screening=null;selected=[];hold=null;
  $('#bookingHeading').innerHTML=`<h1 class="sub-title">${esc(currentMovie.title)}</h1><p class="subtle">${esc(currentMovie.genre)} · ${currentMovie.duration} минут</p>`;
  $('#seatPanel').classList.add('hidden');
  $('#checkoutPanel').classList.add('hidden');
  $('#ticketPanel').classList.add('hidden');
  $('#confirmBtn').disabled=false;
  navigate('booking');
  try{
    const shows=await request('/api/screenings?movieId='+encodeURIComponent(id));
    window.currentShows=shows;
    $('#showtimes').innerHTML=displayShowtimes(shows);
  }catch(e){toast(e.message)}
}

$('#showtimes').addEventListener('click',e=>{let id=e.target.closest('[data-show]')?.dataset.show;if(id)chooseScreening(id)});
async function chooseScreening(id){screening=window.currentShows?.find(s=>s._id===id);selected=[];hold=null;$('#confirmBtn').disabled=false;$('#checkoutPanel').classList.add('hidden');$('#ticketPanel').classList.add('hidden');document.querySelectorAll('.time').forEach(t=>t.classList.toggle('active',t.dataset.show===id));await refreshSeats();$('#seatPanel').classList.remove('hidden');$('#seatPanel').scrollIntoView({behavior:'smooth'})}
async function refreshSeats(){if(!screening)return;try{const data=await request('/api/screenings/'+screening._id+'/seats');const occupied=data.occupied||{};selected=selected.filter(s=>!occupied[s]);$('#seatMap').innerHTML=data.rows.map(row=>`<span class="row-label">${row}</span>`+Array.from({length:data.columns},(_,n)=>{const seat=row+(n+1),taken=Boolean(occupied[seat]);return `<button class="seat ${taken?'taken':selected.includes(seat)?'chosen':''}" ${taken?'disabled':''} data-seat="${seat}" aria-label="Суудал ${seat}" aria-pressed="${selected.includes(seat)}">${seat}</button>`}).join('')).join('');updateSeats()}catch(e){toast(e.message)}}
$('#refreshSeats').onclick=()=>refreshSeats();
$('#seatMap').addEventListener('click',e=>{const seat=e.target.closest('[data-seat]')?.dataset.seat;if(!seat)return;selected=selected.includes(seat)?selected.filter(x=>x!==seat):selected.length<6?[...selected,seat]:selected;updateSeats();for(const b of document.querySelectorAll('[data-seat]')){b.classList.toggle('chosen',selected.includes(b.dataset.seat));b.setAttribute('aria-pressed',String(selected.includes(b.dataset.seat)))}});
function updateSeats(){$('#selectedSeats').textContent=selected.join(', ')||'—';$('#priceTotal').textContent=money((screening?.price||0)*selected.length);$('#holdBtn').disabled=!selected.length}
$('#holdBtn').onclick=async()=>{try{$('#holdBtn').disabled=true;hold=await send('/api/holds',{screeningId:screening._id,seats:selected});$('#confirmBtn').disabled=false;$('#paymentState').textContent='';$('#paymentOutcome').value='approved';$('#seatPanel').classList.add('hidden');$('#checkoutPanel').classList.remove('hidden');$('#checkoutSummary').innerHTML=`<b>${esc(currentMovie.title)}</b><br>${dateFmt(screening.startsAt)} · ${esc(screening.hall)}<br>Суудал: ${esc(hold.seats.join(', '))}<br><strong>${money(hold.total)}</strong>`;$('#checkoutPanel').scrollIntoView({behavior:'smooth'});clearInterval(countdownTimer);const tick=()=>{let sec=Math.max(0,Math.floor((new Date(hold.expiresAt)-new Date())/1000));$('#countdown').textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;if(sec===0){clearInterval(countdownTimer);$('#confirmBtn').disabled=true;toast('Суудлын хадгалалтын хугацаа дууссан. Шинээр сонгоно уу.')}};tick();countdownTimer=setInterval(tick,1000)}catch(e){toast(e.message);await refreshSeats()}finally{$('#holdBtn').disabled=false}};
$('#confirmBtn').onclick=async()=>{
  const name=$('#customerName').value.trim();
  if(name.length<2)return toast('Тасалбар дээрх нэрээ оруулна уу');
  if(!hold)return toast('Суудлаа дахин сонгоно уу');
  $('#confirmBtn').disabled=true;
  try{
    const payment=await send('/api/payments/simulate',{screeningId:hold.screeningId,token:hold.token,outcome:$('#paymentOutcome').value});
    if(payment.status==='pending'){
      $('#paymentState').textContent='Төлбөрийн хариу хүлээгдэж байна. Тасалбар үүсээгүй.';return;
    }
    if(payment.status==='declined'){
      $('#paymentState').textContent='Төлбөр амжилтгүй. Суудал чөлөөлөгдлөө.';
      toast('Төлбөр амжилтгүй. Өөр суудал сонгоно уу.');
      hold=null;clearInterval(countdownTimer);$('#checkoutPanel').classList.add('hidden');$('#seatPanel').classList.remove('hidden');await refreshSeats();return;
    }
    if(payment.status!=='approved')throw Error('Төлбөр баталгаажаагүй');
    const b=await send('/api/bookings/confirm',{screeningId:hold.screeningId,token:hold.token,name});
    clearInterval(countdownTimer);hold=null;
    $('#checkoutPanel').classList.add('hidden');$('#ticketPanel').classList.remove('hidden');
    showTicket({code:b.code,movie:currentMovie.title,startsAt:screening.startsAt,hall:screening.hall,seats:b.seats,amount:b.amount});
    $('#ticketPanel').scrollIntoView({behavior:'smooth'});
  }catch(e){
    $('#paymentState').textContent=e.message;toast(e.message);
    if(/хадгалалтын хугацаа|өөрчлөгдсөн/.test(e.message)){
      hold=null;$('#checkoutPanel').classList.add('hidden');$('#seatPanel').classList.remove('hidden');await refreshSeats();
    }
  }finally{$('#confirmBtn').disabled=false}
};
function showTicket(t,target='#ticket'){const html=`<div class="ticket-card"><h3>${esc(t.movie)}</h3><div class="ticket-row"><span>Огноо, цаг</span><b>${dateFmt(t.startsAt)}</b></div><div class="ticket-row"><span>Танхим</span><b>${esc(t.hall)}</b></div><div class="ticket-row"><span>Суудал</span><b>${esc(t.seats.join(', '))}</b></div><div class="ticket-row"><span>Үнэ</span><b>${money(t.amount)}</b></div><p>Захиалгын код</p><div class="code">${esc(t.code)}</div><div class="qr-slot"></div><p class="subtle">Төлбөрийн симуляц · Энэ тасалбар бодит кино театрт хүчингүй.</p></div>`;const slot=$(target);slot.innerHTML=html;const q=slot.querySelector('.qr-slot');try{if(typeof window.qrcode==='function'){const qr=window.qrcode(0,'M');qr.addData(t.code);qr.make();q.classList.add('ticket-qr');q.innerHTML=qr.createImgTag(5,3)}else{q.textContent='QR зураг ачаалагдсангүй. Код: '+t.code}}catch(err){q.textContent='Код: '+t.code}}
$('#lookupForm').onsubmit=async e=>{e.preventDefault();const q=$('#lookupCode').value.trim().toUpperCase();try{const t=await request('/api/bookings/'+encodeURIComponent(q));showTicket(t,'#lookupResult')}catch(err){$('#lookupResult').textContent=err.message;toast(err.message)}};

$('#adminLogin').onsubmit=e=>{e.preventDefault();adminToken=$('#adminToken').value.trim();sessionStorage.setItem('cinema_admin',adminToken);loadAdmin()};
const authorized=(path,method='GET',data)=>request(path,{method,headers:{Authorization:'Bearer '+adminToken},...(data?{body:JSON.stringify(data)}:{})});
const asMongoDate=iso=>new Date(iso).toLocaleString('sv-SE',{timeZone:'Asia/Ulaanbaatar'}).replace(' ','T').slice(0,16);
let adminShows=[];
function renderAdminMovies(){
  $('#adminMovies').innerHTML=movies.length?'<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Кино</th><th>Төрөл</th><th>Мин</th><th></th></tr></thead><tbody>'+
    movies.map(m=>'<tr><td><strong>'+esc(m.title)+'</strong></td><td>'+esc(m.genre)+'</td><td>'+Number(m.duration)+'</td><td><button class="table-btn" data-editmovie="'+esc(m._id)+'">Засах</button><button class="table-btn danger" data-deletemovie="'+esc(m._id)+'">Устгах</button></td></tr>').join('')+'</tbody></table></div>':'Кино бүртгэлгүй';
}
function renderAdminShows(){
  $('#adminShows').innerHTML=adminShows.length?'<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Кино</th><th>Огноо, цаг</th><th>Танхим</th><th>Үнэ</th><th></th></tr></thead><tbody>'+
    adminShows.slice(0,80).map(show=>'<tr><td>'+esc(movies.find(m=>m._id===show.movieId)?.title||'—')+'</td><td>'+esc(dateFmt(show.startsAt))+'</td><td>'+esc(show.hall)+'</td><td>'+money(show.price)+'</td><td><button class="table-btn" data-editshow="'+esc(show._id)+'" '+(show.reservedSeats?'disabled title="Суудал захиалагдсан"':'')+'>Засах</button><button class="table-btn danger" data-deleteshow="'+esc(show._id)+'" '+(show.reservedSeats?'disabled title="Суудал захиалагдсан"':'')+'>Устгах</button></td></tr>').join('')+'</tbody></table></div>':'Үзвэр бүртгэлгүй';
}
function renderAdminBookings(list){
  $('#adminBookings').innerHTML=list.length?'<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Код</th><th>Кино</th><th>Үйлчлүүлэгч</th><th>Суудал</th><th>Дүн</th></tr></thead><tbody>'+
    list.slice(0,30).map(b=>'<tr><td>'+esc(b.code)+'</td><td>'+esc(b.movie)+'</td><td>'+esc(b.customerName)+'</td><td>'+esc(b.seats.join(', '))+'</td><td>'+money(b.amount)+'</td></tr>').join('')+'</tbody></table></div>':'Захиалга бүртгэлгүй';
}
async function loadAdmin(){
  try{
    const [report,shows,bookings]=await Promise.all([
      authorized('/api/admin/report'),authorized('/api/admin/screenings'),authorized('/api/admin/bookings')
    ]);
    adminShows=shows;
    $('#adminContent').classList.remove('hidden');
    $('#report').innerHTML=[['Кино',report.movies],['Үзвэр',report.screenings],['Захиалга',report.bookings],['Демо борлуулалт',money(report.totalSimulatedRevenue)]]
      .map(([key,value])=>'<div class="stat">'+key+'<b>'+value+'</b></div>').join('');
    renderAdminMovies();renderAdminShows();renderAdminBookings(bookings);
  }catch(error){$('#adminContent').classList.add('hidden');toast(error.message)}
}
$('#adminMovies').onclick=async e=>{
  const edit=e.target.closest('[data-editmovie]')?.dataset.editmovie,del=e.target.closest('[data-deletemovie]')?.dataset.deletemovie;
  if(edit){
    const m=movies.find(x=>x._id===edit),form=$('#addMovieForm');if(!m)return;
    for(const key of ['title','genre','duration','description'])form.elements[key].value=m[key]||'';
    form.dataset.editId=edit;$('#movieSubmit').textContent='Өөрчлөлт хадгалах';$('#cancelMovieEdit').classList.remove('hidden');
    form.scrollIntoView({behavior:'smooth'});
  }
  if(del&&confirm('Энэ киног устгах уу?')){
    try{await authorized('/api/admin/movies/'+del,'DELETE');toast('Кино устгагдлаа');await loadMovies();await loadAdmin()}catch(error){toast(error.message)}
  }
};
$('#adminShows').onclick=async e=>{
  const edit=e.target.closest('[data-editshow]')?.dataset.editshow,del=e.target.closest('[data-deleteshow]')?.dataset.deleteshow;
  if(edit){
    const show=adminShows.find(x=>x._id===edit),form=$('#addShowForm');if(!show)return;
    form.elements.movieId.value=show.movieId;
    form.elements.startsAt.value=asMongoDate(show.startsAt);
    form.elements.hall.value=show.hall;form.elements.price.value=show.price;
    form.dataset.editId=edit;$('#showSubmit').textContent='Өөрчлөлт хадгалах';$('#cancelShowEdit').classList.remove('hidden');
    form.scrollIntoView({behavior:'smooth'});
  }
  if(del&&confirm('Энэ үзвэрийг устгах уу?')){
    try{await authorized('/api/admin/screenings/'+del,'DELETE');toast('Үзвэр устгагдлаа');await loadAdmin()}catch(error){toast(error.message)}
  }
};
function clearEditor(formId,buttonId,cancelId,original){
  const form=$('#'+formId);delete form.dataset.editId;form.reset();$('#'+buttonId).textContent=original;$('#'+cancelId).classList.add('hidden');
}
$('#cancelMovieEdit').onclick=()=>clearEditor('addMovieForm','movieSubmit','cancelMovieEdit','+ Кино нэмэх');
$('#cancelShowEdit').onclick=()=>clearEditor('addShowForm','showSubmit','cancelShowEdit','+ Үзвэр нэмэх');
$('#addMovieForm').onsubmit=async e=>{
  e.preventDefault();const form=e.target,v=Object.fromEntries(new FormData(form));
  v.duration=Number(v.duration);
  try{
    const edit=form.dataset.editId;
    await authorized(edit?'/api/admin/movies/'+edit:'/api/admin/movies',edit?'PATCH':'POST',v);
    toast(edit?'Кино шинэчлэгдлээ':'Кино нэмэгдлээ');
    clearEditor('addMovieForm','movieSubmit','cancelMovieEdit','+ Кино нэмэх');
    await loadMovies();await loadAdmin();
  }catch(error){toast(error.message)}
};
$('#addShowForm').onsubmit=async e=>{
  e.preventDefault();const form=e.target,v=Object.fromEntries(new FormData(form));
  if(!v.startsAt)return toast('Огноо сонгоно уу');
  v.startsAt=new Date(v.startsAt+':00+08:00').toISOString();
  v.price=Number(v.price);
  try{
    const edit=form.dataset.editId;
    await authorized(edit?'/api/admin/screenings/'+edit:'/api/admin/screenings',edit?'PATCH':'POST',v);
    toast(edit?'Үзвэр шинэчлэгдлээ':'Үзвэр нэмэгдлээ');
    clearEditor('addShowForm','showSubmit','cancelShowEdit','+ Үзвэр нэмэх');
    await loadAdmin();
  }catch(error){toast(error.message)}
};

loadMovies();
