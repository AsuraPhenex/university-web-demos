import test from 'node:test';import assert from 'node:assert/strict';
import { upcomingDemoScreenings } from '../schedule.js';
test('upcoming screenings are future and aligned to Mongolia 14/18/20 showtimes',()=>{
  const now=new Date('2026-11-23T10:00:00Z');
  const s=upcomingDemoScreenings([{_id:'1',title:'Хотын нууц'}],now);
  assert.ok(s.length>0);assert.ok(s.every(x=>x.startsAt>now));assert.equal(s[0].startsAt.toISOString(),'2026-11-23T12:00:00.000Z');
  assert.equal(s[0].price,15000);
});
test('only seeded titles get auto-generated screenings',()=>assert.equal(upcomingDemoScreenings([{_id:'2',title:'Custom'}]).length,0));
