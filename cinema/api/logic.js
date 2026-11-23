// Pure functions shared by the API and its automated tests.
export const ROWS='ABCDEF';
export const COLS=8;
export const HOLD_MS=5*60*1000;
export function validateSeats(input){
  if(!Array.isArray(input)||input.length<1||input.length>6)throw Error('1–6 суудал сонгоно уу');
  const seats=input.map(x=>String(x).toUpperCase());
  if(new Set(seats).size!==seats.length||seats.some(x=>!new RegExp(`^[${ROWS}][1-${COLS}]$`).test(x)))throw Error('Суудлын код буруу байна');
  return seats.sort();
}
export function availabilityFilter(seats,now=new Date()){
  return {$and:seats.map(seat=>({$or:[{[`seats.${seat}`]:{$exists:false}},{$and:[{[`seats.${seat}.status`]:'held'},{[`seats.${seat}.expiresAt`]:{$lte:now}}]}]}))};
}
export function holdFilter(seats,token,now=new Date()){
  return {$and:seats.map(seat=>({[`seats.${seat}.status`]:'held',[`seats.${seat}.token`]:token,[`seats.${seat}.expiresAt`]:{$gt:now}}))};
}
export function activeSeatState(seatData,now=new Date()){
  return Object.fromEntries(Object.entries(seatData||{}).filter(([,v])=>v.status==='booked'||(v.status==='held'&&new Date(v.expiresAt)>now)).map(([k,v])=>[k,v.status]));
}
