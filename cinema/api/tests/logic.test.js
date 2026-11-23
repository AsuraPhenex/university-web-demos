import test from 'node:test';import assert from 'node:assert/strict';
import {validateSeats,availabilityFilter,holdFilter,activeSeatState} from '../logic.js';
test('seat input is validated and deduplicated',()=>{assert.deepEqual(validateSeats(['B2','A1']),['A1','B2']);assert.throws(()=>validateSeats(['A1','A1']));assert.throws(()=>validateSeats(['X9']));assert.throws(()=>validateSeats([]))});
test('atomic filter covers every seat',()=>{const q=availabilityFilter(['A1','B2']);assert.equal(q.$and.length,2);assert.deepEqual(q.$and[0].$or[0],{'seats.A1':{$exists:false}})});
test('confirmed booking only matches a live hold token',()=>{const q=holdFilter(['A1'],'my-token');assert.equal(q.$and[0]['seats.A1.token'],'my-token');assert.equal(q.$and[0]['seats.A1.status'],'held')});
test('expired holds are ignored, confirmed bookings remain occupied',()=>{const x=activeSeatState({A1:{status:'held',expiresAt:new Date(0)},A2:{status:'booked'},A3:{status:'held',expiresAt:new Date(Date.now()+30000)}});assert.deepEqual(x,{A2:'booked',A3:'held'})});
