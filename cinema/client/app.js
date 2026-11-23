'use strict';
const API=String(window.CINEMA_API_URL||'').replace(/\/$/,'');
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('mn-MN').format(n)+' ₮';
const dateFmt=d=>new Date(d).toLocaleString('mn-MN',{timeZone:'Asia/Ulaanbaatar',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
let movies=[],currentMovie=null,screening=null,selected=[],hold=null,countdownTimer=null,adminToken=sessionStorage.getItem('cinema_admin')||'';
function toast(s){let t=$('#toast');t.textContent=s;t.style.display='block';clearTimeout(window.toastT);window.toastT=setTimeout(()=>t.style.display='none',5000)}
async function request(path,options={}){if(API.includes('REPLACE-WITH-YOUR-API'))throw Error('Эхлээд config.js файлд Render API хаягаа тохируулна уу');const resp=await fetch(API+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});let data=await resp.json().catch(()=>({error:'Сервер хариу өгсөнгүй'}));if(!resp.ok)throw Error(data.error||`HTTP ${resp.status}`);return data}
const send=(path,data,token)=>request(path,{method:'POST',headers:token?{'Authorization':'Bearer '+token}:{},body:JSON.stringify(data)});
function navigate(name){document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===name));document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.view===name));window.scrollTo({top:0,behavior:'smooth'})}
for(const b of document.querySelectorAll('.nav'))b.addEventListener('click',()=>{navigate(b.dataset.view);if(b.dataset.view==='admin'&&adminToken)loadAdmin()});
$('#explore').onclick=()=>$('#films').scrollIntoView({behavior:'smooth'});
$('#backFilms').onclick=$('#newBooking').onclick=()=>{clearInterval(countdownTimer);hold=null;selected=[];navigate('home');loadMovies()};
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
    $('#movies').innerHTML='<div class="message">'+esc(e.message)+' — API хаяг болон Render сервисээ шалгана уу.</div>';
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
$('#holdBtn').onclick=async()=>{try{$('#holdBtn').disabled=true;hold=await send('/api/holds',{screeningId:screening._id,seats:selected});$('#confirmBtn').disabled=false;$('#seatPanel').classList.add('hidden');$('#checkoutPanel').classList.remove('hidden');$('#checkoutSummary').innerHTML=`<b>${esc(currentMovie.title)}</b><br>${dateFmt(screening.startsAt)} · ${esc(screening.hall)}<br>Суудал: ${esc(hold.seats.join(', '))}<br><strong>${money(hold.total)}</strong>`;$('#checkoutPanel').scrollIntoView({behavior:'smooth'});clearInterval(countdownTimer);const tick=()=>{let sec=Math.max(0,Math.floor((new Date(hold.expiresAt)-new Date())/1000));$('#countdown').textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;if(sec===0){clearInterval(countdownTimer);$('#confirmBtn').disabled=true;toast('Суудлын хадгалалтын хугацаа дууссан. Шинээр сонгоно уу.')}};tick();countdownTimer=setInterval(tick,1000)}catch(e){toast(e.message);await refreshSeats()}finally{$('#holdBtn').disabled=false}};
$('#confirmBtn').onclick=async()=>{let name=$('#customerName').value.trim();if(name.length<2)return toast('Нэрээ оруулна уу');try{$('#confirmBtn').disabled=true;const b=await send('/api/bookings/confirm',{screeningId:hold.screeningId,token:hold.token,name});clearInterval(countdownTimer);$('#checkoutPanel').classList.add('hidden');$('#ticketPanel').classList.remove('hidden');showTicket({code:b.code,movie:currentMovie.title,startsAt:screening.startsAt,hall:screening.hall,seats:b.seats,amount:b.amount});$('#ticketPanel').scrollIntoView({behavior:'smooth'})}catch(e){toast(e.message);$('#checkoutPanel').classList.add('hidden');$('#seatPanel').classList.remove('hidden');await refreshSeats()}finally{$('#confirmBtn').disabled=false}};
function showTicket(t,target='#ticket'){const html=`<div class="ticket-card"><h3>${esc(t.movie)}</h3><div class="ticket-row"><span>Огноо, цаг</span><b>${dateFmt(t.startsAt)}</b></div><div class="ticket-row"><span>Танхим</span><b>${esc(t.hall)}</b></div><div class="ticket-row"><span>Суудал</span><b>${esc(t.seats.join(', '))}</b></div><div class="ticket-row"><span>Үнэ</span><b>${money(t.amount)}</b></div><p>Захиалгын код</p><div class="code">${esc(t.code)}</div><div class="qr-slot"></div><p class="subtle">Төлбөрийн симуляц · Энэ тасалбар бодит кино театрт хүчингүй.</p></div>`;const slot=$(target);slot.innerHTML=html;const q=slot.querySelector('.qr-slot');try{if(typeof window.qrcode==='function'){const qr=window.qrcode(0,'M');qr.addData(t.code);qr.make();q.classList.add('ticket-qr');q.innerHTML=qr.createImgTag(5,3)}else{q.textContent='QR зураг ачаалагдсангүй. Код: '+t.code}}catch(err){q.textContent='Код: '+t.code}}
$('#lookupForm').onsubmit=async e=>{e.preventDefault();const q=$('#lookupCode').value.trim().toUpperCase();try{const t=await request('/api/bookings/'+encodeURIComponent(q));showTicket(t,'#lookupResult')}catch(err){$('#lookupResult').textContent=err.message;toast(err.message)}};
$('#adminLogin').onsubmit=e=>{e.preventDefault();adminToken=$('#adminToken').value.trim();sessionStorage.setItem('cinema_admin',adminToken);loadAdmin()};
async function loadAdmin(){try{const r=await request('/api/admin/report',{headers:{Authorization:'Bearer '+adminToken}});$('#adminContent').classList.remove('hidden');$('#report').innerHTML=[['Кино',r.movies],['Үзвэр',r.screenings],['Захиалга',r.bookings],['Демо борлуулалт',money(r.totalSimulatedRevenue)]].map(([k,v])=>`<div class="stat">${k}<b>${v}</b></div>`).join('')}catch(e){$('#adminContent').classList.add('hidden');toast(e.message)}}
$('#addMovieForm').onsubmit=async e=>{e.preventDefault();try{let v=Object.fromEntries(new FormData(e.target));v.duration=Number(v.duration);await send('/api/admin/movies',v,adminToken);toast('Кино нэмэгдлээ');e.target.reset();await loadMovies();loadAdmin()}catch(err){toast(err.message)}};
$('#addShowForm').onsubmit=async e=>{e.preventDefault();try{let v=Object.fromEntries(new FormData(e.target));if(!v.startsAt)throw Error('Огноо сонгоно уу');v.startsAt=new Date(v.startsAt).toISOString();v.price=Number(v.price);await send('/api/admin/screenings',v,adminToken);toast('Үзвэр нэмэгдлээ');e.target.reset();loadAdmin()}catch(err){toast(err.message)}};
loadMovies();
