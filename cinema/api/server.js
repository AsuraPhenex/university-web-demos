import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import {MongoClient,ObjectId} from 'mongodb';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {ROWS,COLS,HOLD_MS,validateSeats,availabilityFilter,holdFilter,activeSeatState} from './logic.js';
import {DEMO_TITLES,upcomingDemoScreenings} from './schedule.js';

const required=['MONGODB_URI','ADMIN_TOKEN'];
for(const key of required)if(!process.env[key]){console.error(`Missing ${key}. Set server environment variables.`);process.exit(1)}
const client=new MongoClient(process.env.MONGODB_URI,{maxPoolSize:8});
const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
// Allow the published cinema site even if FRONTEND_ORIGIN was left empty or has a trailing slash.
const allowedOrigins = new Set([
  'https://university-cinema-site.onrender.com',
  'http://localhost:5500', 'http://127.0.0.1:5500',
  ...(process.env.FRONTEND_ORIGIN || '').split(',')
].map(value => value.trim().replace(/\/$/, '')).filter(Boolean));
app.use(cors({origin(requestOrigin, callback) {
  if (!requestOrigin || allowedOrigins.has(requestOrigin)) return callback(null, true);
  return callback(null, false);
}}));
app.use(express.json({limit:'20kb'}));
app.use('/api',rateLimit({windowMs:60*1000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
const db=client.db(process.env.MONGODB_DB||'cinema_demo');
const movies=db.collection('movies'), screenings=db.collection('screenings'), bookings=db.collection('bookings');
const oid=x=>ObjectId.isValid(x)&&String(new ObjectId(x))===x?new ObjectId(x):null;
const bad=(res,msg,status=400)=>res.status(status).json({error:msg});
const code=()=>randomBytes(8).toString('hex').toUpperCase();
const fromMovie=m=>({_id:m._id,title:m.title,genre:m.genre,duration:m.duration,description:m.description,emoji:m.emoji,tone:m.tone});
const publicScreen=s=>({_id:s._id,movieId:s.movieId,hall:s.hall,startsAt:s.startsAt,price:s.price});
function adminAuth(req,res,next){let got=req.get('authorization')||'';if(got.startsWith('Bearer '))got=got.slice(7);let exp=process.env.ADMIN_TOKEN||'';let a=Buffer.from(got),b=Buffer.from(exp);if(a.length!==b.length||!timingSafeEqual(a,b))return bad(res,'Администраторын нэвтрэх код буруу байна',401);next()}
app.get('/health',(_,res)=>res.json({status:'ok',app:'cinema-api'}));
app.get('/api/movies',async(_,res,next)=>{try{res.json((await movies.find().sort({createdAt:1}).toArray()).map(fromMovie))}catch(e){next(e)}});
app.get('/api/screenings',async(req,res,next)=>{try{let q={startsAt:{$gt:new Date(Date.now()-30*60*1000)}};if(req.query.movieId){const id=oid(String(req.query.movieId));if(!id)return bad(res,'Киноны ID буруу байна');q.movieId=id}res.json((await screenings.find(q).sort({startsAt:1}).limit(120).toArray()).map(publicScreen))}catch(e){next(e)}});
app.get('/api/screenings/:id/seats',async(req,res,next)=>{try{let id=oid(req.params.id);if(!id)return bad(res,'Үзвэрийн ID буруу байна');let s=await screenings.findOne({_id:id});if(!s)return bad(res,'Үзвэр олдсонгүй',404);res.json({...publicScreen(s),rows:ROWS.split(''),columns:COLS,occupied:activeSeatState(s.seats)})}catch(e){next(e)}});
app.post('/api/holds',async(req,res,next)=>{try{const screeningId=oid(req.body.screeningId);if(!screeningId)return bad(res,'Үзвэрийн ID буруу');const chosen=validateSeats(req.body.seats);let now=new Date(),expiresAt=new Date(now.getTime()+HOLD_MS),token=code();let set=Object.fromEntries(chosen.map(seat=>[`seats.${seat}`,{status:'held',token,expiresAt}]));let updated=await screenings.findOneAndUpdate({_id:screeningId,startsAt:{$gt:now},...availabilityFilter(chosen,now)},{$set:set},{returnDocument:'after',projection:{price:1}});if(!updated)return bad(res,'Эдгээр суудлуудаас зарим нь захиалагдсан байна. Дахин сонгоно уу.',409);res.json({token,screeningId:req.body.screeningId,seats:chosen,expiresAt,total:updated.price*chosen.length,paymentMode:'simulation'})}catch(e){if(e.message.includes('суудал')||e.message.includes('Сууд'))return bad(res,e.message);next(e)}});

/**
 * Demonstration-only payment provider. This endpoint NEVER processes real money.
 * A successful simulated payment marks the exact held seats. Confirmation MUST
 * verify that mark inside MongoDB before creating the electronic ticket.
 */
app.post('/api/payments/simulate',async(req,res,next)=>{
  try{
    const id=oid(req.body.screeningId),token=String(req.body.token||''),outcome=req.body.outcome||'approved';
    if(!id||!/^[0-9A-F]{16}$/.test(token)||!['approved','declined','pending'].includes(outcome))
      return bad(res,'Төлбөрийн хүсэлт буруу байна');
    const screen=await screenings.findOne({_id:id});
    if(!screen)return bad(res,'Үзвэр олдсонгүй',404);
    const now=new Date();
    const selected=Object.entries(screen.seats||{}).filter(([,seat])=>seat.status==='held'&&seat.token===token).map(([seat])=>seat).sort();
    if(!selected.length||selected.some(seat=>new Date(screen.seats[seat].expiresAt)<=now))
      return bad(res,'Суудлын хадгалалтын хугацаа дууссан',409);
    if(outcome==='pending')return res.json({status:'pending',mode:'simulation',message:'Төлбөрийн хариу хүлээгдэж байна.'});
    if(outcome==='declined'){
      const unset=Object.fromEntries(selected.map(seat=>['seats.'+seat,'']));
      const result=await screenings.updateOne({_id:id,...holdFilter(selected,token,now)},{$unset:unset});
      if(!result.modifiedCount)return bad(res,'Суудлын төлөв өөрчлөгдсөн',409);
      return res.json({status:'declined',mode:'simulation',message:'Төлбөр амжилтгүй. Суудал чөлөөлөгдлөө.'});
    }
    const reference=code();
    const set=Object.fromEntries(selected.flatMap(seat=>[
      ['seats.'+seat+'.paymentStatus','approved'],
      ['seats.'+seat+'.paymentReference',reference]
    ]));
    const result=await screenings.updateOne({_id:id,...holdFilter(selected,token,now)},{$set:set});
    if(!result.modifiedCount)return bad(res,'Суудлын төлөв өөрчлөгдсөн',409);
    res.json({status:'approved',paymentReference:reference,mode:'simulation',total:screen.price*selected.length});
  }catch(e){next(e)}
});
app.post('/api/holds/release',async(req,res,next)=>{
  try{
    const id=oid(req.body.screeningId),token=String(req.body.token||'');
    if(!id||!/^[0-9A-F]{16}$/.test(token))return bad(res,'Хадгалалтын код буруу');
    const screen=await screenings.findOne({_id:id});
    if(!screen)return bad(res,'Үзвэр олдсонгүй',404);
    const selected=Object.entries(screen.seats||{}).filter(([,seat])=>seat.status==='held'&&seat.token===token).map(([seat])=>seat);
    if(selected.length){
      const filters=selected.map(seat=>({['seats.'+seat+'.token']:token}));
      await screenings.updateOne({_id:id,$and:filters},{$unset:Object.fromEntries(selected.map(seat=>['seats.'+seat,'']))});
    }
    res.json({released:true});
  }catch(e){next(e)}
});

app.post('/api/bookings/confirm',async(req,res,next)=>{try{let {screeningId,token,name}=req.body;let id=oid(screeningId);if(!id||typeof token!=='string'||!(/^[0-9A-F]{16}$/.test(token))||typeof name!=='string'||name.trim().length<2||name.trim().length>80)return bad(res,'Мэдээлэл дутуу эсвэл буруу байна');let s=await screenings.findOne({_id:id});if(!s)return bad(res,'Үзвэр олдсонгүй',404);let selected=Object.entries(s.seats||{}).filter(([,v])=>v.status==='held'&&v.token===token).map(([seat])=>seat).sort();if(!selected.length)return bad(res,'Суудлын түр хадгалалт олдсонгүй',409);if(selected.some(seat=>s.seats[seat].paymentStatus!=='approved'))return bad(res,'Төлбөр баталгаажаагүй. Тасалбар үүсгэх боломжгүй.',409);let paymentReference=s.seats[selected[0]].paymentReference;let bookingCode=code(),now=new Date();let session=client.startSession();let saved;try{await session.withTransaction(async()=>{const booked=Object.fromEntries(selected.map(seat=>[`seats.${seat}`,{status:'booked',bookingCode}]));let result=await screenings.updateOne({_id:id,...holdFilter(selected,token,now),$and:selected.map(seat=>({['seats.'+seat+'.paymentStatus']:'approved'}))},{$set:booked},{session});if(result.modifiedCount!==1)throw Object.assign(new Error('Суудлын хадгалалтын хугацаа дууссан'),{status:409});saved={code:bookingCode,screeningId:id,movieId:s.movieId,seats:selected,amount:s.price*selected.length,customerName:name.trim(),createdAt:now,paymentMode:'simulation',paymentReference,status:'confirmed'};await bookings.insertOne(saved,{session})})}finally{await session.endSession()}res.json({code:saved.code,screeningId,amount:saved.amount,seats:selected,status:'confirmed',paymentMode:'simulation',paymentReference:saved.paymentReference})}catch(e){if(e.status===409)return bad(res,e.message,409);if(e.hasErrorLabel?.('TransientTransactionError')||e.code===112)return bad(res,'Захиалга зэрэг өөрчлөгдсөн тул дахин оролдоно уу',409);next(e)}});
app.get('/api/bookings/:code',async(req,res,next)=>{try{if(!/^[0-9A-F]{16}$/.test(req.params.code))return bad(res,'Захиалгын код буруу');const b=await bookings.findOne({code:req.params.code});if(!b)return bad(res,'Захиалга олдсонгүй',404);const [m,s]=await Promise.all([movies.findOne({_id:b.movieId}),screenings.findOne({_id:b.screeningId})]);res.json({code:b.code,movie:m?.title||'',hall:s?.hall||'',startsAt:s?.startsAt,seats:b.seats,amount:b.amount,status:b.status,paymentMode:b.paymentMode})}catch(e){next(e)}});
app.get('/api/admin/report',adminAuth,async(req,res,next)=>{try{let [mc,sc,bc,stat]=await Promise.all([movies.countDocuments(),screenings.countDocuments(),bookings.countDocuments(),bookings.aggregate([{$group:{_id:null,revenue:{$sum:'$amount'}}}]).toArray()]);res.json({movies:mc,screenings:sc,bookings:bc,totalSimulatedRevenue:stat[0]?.revenue||0})}catch(e){next(e)}});
app.post('/api/admin/movies',adminAuth,async(req,res,next)=>{try{let {title,genre,duration,description}=req.body;if(typeof title!=='string'||title.trim().length<2||title.length>100||!Number.isInteger(+duration)||+duration<30||+duration>300)return bad(res,'Киноны мэдээлэл буруу');const m={title:title.trim(),genre:String(genre||'Төрөл бүрийн').slice(0,40),duration:+duration,description:String(description||'').slice(0,400),emoji:'🎬',tone:'blue',createdAt:new Date()};const ins=await movies.insertOne(m);res.status(201).json({...fromMovie(m),_id:ins.insertedId})}catch(e){next(e)}});
app.post('/api/admin/screenings',adminAuth,async(req,res,next)=>{try{const movieId=oid(req.body.movieId),startsAt=new Date(req.body.startsAt),price=Number(req.body.price);if(!movieId||isNaN(startsAt)||startsAt<=new Date()||!Number.isInteger(price)||price<1000||price>300000)return bad(res,'Үзвэрийн мэдээлэл буруу');if(!await movies.findOne({_id:movieId}))return bad(res,'Кино олдсонгүй',404);const hall=String(req.body.hall||'Танхим 1').slice(0,50);if(await screenings.findOne({hall,startsAt}))return bad(res,'Энэ танхимд тухайн цагт үзвэр бүртгэлтэй.',409);const s={movieId,hall,startsAt,price,seats:{}};const ins=await screenings.insertOne(s);res.status(201).json({...publicScreen(s),_id:ins.insertedId})}catch(e){next(e)}});

const movieInput=body=>{
  const title=typeof body.title==='string'?body.title.trim():'';
  const genre=typeof body.genre==='string'?body.genre.trim():'';
  const duration=Number(body.duration);
  if(title.length<2||title.length>100||genre.length>50||!Number.isInteger(duration)||duration<30||duration>300)return null;
  return {title,genre:genre||'Бусад',duration,description:String(body.description||'').slice(0,400)};
};
const showInput=body=>{
  const startsAt=new Date(body.startsAt),price=Number(body.price),movieId=oid(body.movieId),hall=String(body.hall||'').trim();
  if(!movieId||!Number.isFinite(startsAt.getTime())||startsAt<=new Date()||!Number.isInteger(price)||price<1000||price>300000||!hall||hall.length>50)return null;
  return {movieId,hall,startsAt,price};
};
app.get('/api/admin/screenings',adminAuth,async(req,res,next)=>{
  try{res.json((await screenings.find({startsAt:{$gte:new Date(Date.now()-24*3600000)}}).sort({startsAt:1}).limit(240).toArray()).map(s=>({...publicScreen(s),reservedSeats:Object.keys(activeSeatState(s.seats)).length})))}catch(e){next(e)}
});
app.get('/api/admin/bookings',adminAuth,async(req,res,next)=>{
  try{
    const list=await bookings.find().sort({createdAt:-1}).limit(60).toArray();
    const ids=[...new Set(list.map(b=>String(b.movieId)))].map(oid).filter(Boolean);
    const catalog=new Map((await movies.find({_id:{$in:ids}}).toArray()).map(m=>[String(m._id),m.title]));
    res.json(list.map(b=>({code:b.code,movie:catalog.get(String(b.movieId))||'—',seats:b.seats,amount:b.amount,customerName:b.customerName,createdAt:b.createdAt,status:b.status,paymentMode:b.paymentMode})));
  }catch(e){next(e)}
});
app.patch('/api/admin/movies/:id',adminAuth,async(req,res,next)=>{
  try{
    const id=oid(req.params.id),values=movieInput(req.body);
    if(!id||!values)return bad(res,'Киноны мэдээлэл буруу');
    const movie=await movies.findOneAndUpdate({_id:id},{$set:values},{returnDocument:'after'});
    if(!movie)return bad(res,'Кино олдсонгүй',404);
    res.json(fromMovie(movie));
  }catch(e){next(e)}
});
app.delete('/api/admin/movies/:id',adminAuth,async(req,res,next)=>{
  try{
    const id=oid(req.params.id);if(!id)return bad(res,'Киноны ID буруу');
    const shows=await screenings.find({movieId:id}).toArray();
    if(shows.some(s=>Object.keys(activeSeatState(s.seats)).length)||await bookings.countDocuments({movieId:id}))
      return bad(res,'Энэ киноны суудал эсвэл захиалга байгаа тул устгах боломжгүй.',409);
    await screenings.deleteMany({movieId:id});
    const result=await movies.deleteOne({_id:id});
    if(!result.deletedCount)return bad(res,'Кино олдсонгүй',404);
    res.json({deleted:true});
  }catch(e){next(e)}
});
app.patch('/api/admin/screenings/:id',adminAuth,async(req,res,next)=>{
  try{
    const id=oid(req.params.id),values=showInput(req.body);
    if(!id||!values)return bad(res,'Үзвэрийн мэдээлэл буруу');
    const existing=await screenings.findOne({_id:id});
    if(!existing)return bad(res,'Үзвэр олдсонгүй',404);
    if(existing.startsAt<=new Date()||Object.keys(activeSeatState(existing.seats)).length||await bookings.countDocuments({screeningId:id}))
      return bad(res,'Захиалга/хадгалалттай эсвэл эхэлсэн үзвэрийг өөрчлөх боломжгүй.',409);
    if(!await movies.findOne({_id:values.movieId}))return bad(res,'Кино олдсонгүй',404);
    if(await screenings.findOne({_id:{$ne:id},hall:values.hall,startsAt:values.startsAt}))
      return bad(res,'Энэ танхимд тухайн цагт үзвэр бүртгэлтэй.',409);
    const result=await screenings.findOneAndUpdate({_id:id},{$set:values},{returnDocument:'after'});
    res.json(publicScreen(result));
  }catch(e){next(e)}
});
app.delete('/api/admin/screenings/:id',adminAuth,async(req,res,next)=>{
  try{
    const id=oid(req.params.id);if(!id)return bad(res,'Үзвэрийн ID буруу');
    const existing=await screenings.findOne({_id:id});if(!existing)return bad(res,'Үзвэр олдсонгүй',404);
    if(Object.keys(activeSeatState(existing.seats)).length||await bookings.countDocuments({screeningId:id}))
      return bad(res,'Захиалгатай үзвэрийг устгах боломжгүй.',409);
    await screenings.deleteOne({_id:id});
    res.json({deleted:true});
  }catch(e){next(e)}
});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Серверийн алдаа. Дараа дахин оролдоно уу.'})});
async function seed(){await bookings.createIndex({code:1},{unique:true});await screenings.createIndex({startsAt:1,movieId:1});if(await movies.estimatedDocumentCount())return;const data=[{title:'Хотын нууц',genre:'Нууцлаг · Драма',duration:112,description:'Хотын гудамжинд өрнөх нэгэн нууцлаг түүх.',emoji:'🌃',tone:'blue'},{title:'Оддын мөр',genre:'Шинжлэх ухааны зөгнөлт',duration:126,description:'Ирээдүйн ертөнц рүү хийх адал явдал.',emoji:'🌌',tone:'purple'},{title:'Инээмсэглэл',genre:'Гэр бүлийн · Инээдмийн',duration:94,description:'Гэр бүлээрээ үзэх хөгжилтэй кино.',emoji:'🎈',tone:'gold'}].map(m=>({...m,createdAt:new Date()}));const ins=await movies.insertMany(data);let list=[];for(let i=0;i<3;i++)for(let d=0;d<6;d++)for(let hour of [14,18,20]){let t=new Date();let local=new Date(t.getTime()+8*60*60000);let day=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+d,0,0));let y=day.getUTCFullYear(),mo=String(day.getUTCMonth()+1).padStart(2,'0'),dd=String(day.getUTCDate()).padStart(2,'0');let startsAt=new Date(`${y}-${mo}-${dd}T${String(hour).padStart(2,'0')}:00:00+08:00`);if(startsAt>t)list.push({movieId:ins.insertedIds[i],hall:`Танхим ${i+1}`,startsAt,price:i===2?12000:15000,seats:{}})}if(list.length)await screenings.insertMany(list);console.log('Seeded demo movies and showtimes')}
async function ensureDemoWeek(){
  const seeded=await movies.find({title:{$in:DEMO_TITLES}}).toArray();
  const upcoming=upcomingDemoScreenings(seeded);
  if(!upcoming.length)return;
  await screenings.bulkWrite(upcoming.map(item=>({updateOne:{
    filter:{movieId:item.movieId,hall:item.hall,startsAt:item.startsAt},
    update:{$setOnInsert:{...item,seats:{}}},upsert:true
  }})),{ordered:false});
  console.log('Future demo screenings checked:',upcoming.length);
}
async function start(){
  await client.connect();
  await db.command({ping:1});
  await seed();
  await screenings.createIndex({movieId:1,hall:1,startsAt:1},{unique:true});
  await ensureDemoWeek();
  const port=Number(process.env.PORT||10000);
  app.listen(port,'0.0.0.0',()=>console.log(`Cinema API listening on ${port}`));
  setInterval(()=>ensureDemoWeek().catch(e=>console.error('Schedule refresh failed',e)),6*60*60*1000).unref();
}
start().catch(err=>{console.error('Startup failed',err);process.exit(1)});

