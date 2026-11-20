'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'../src/02c_jandri_winter_schedule.js'),'utf8');
const schedule=vm.runInNewContext(code+'\nJandriWinterSchedule;');

test('season source is explicitly planned and not a live lift availability feed',()=>{
  assert.equal(schedule.source.updated,'2026-10-01');
  assert.equal(schedule.source.timezone,'Europe/Paris');
  assert.equal(schedule.source.realtime,false);
  assert.equal(schedule.ranges.length,5);
  for(const s of schedule.ranges) {
    assert.match(s.from,/^202[67]-\d\d-\d\d$/);
    assert.ok(s.from <= s.to);
    assert.match(s.first[0],/^\d\d:\d\d$/);
    assert.match(s.second[1],/^\d\d:\d\d$/);
  }
});
test('published Jandri winter schedules match 2026/27 tourism office dates',()=>{
  const data=[
    ['2026-11-28','09:00','16:15','09:10','16:00'],
    ['2026-12-18','09:00','16:15','09:10','16:00'],
    ['2026-12-19','08:45','16:30','08:55','16:00'],
    ['2027-01-01','08:45','16:30','08:55','16:00'],
    ['2027-01-02','09:00','16:30','09:10','16:00'],
    ['2027-02-05','09:00','16:30','09:10','16:00'],
    ['2027-02-06','08:45','16:45','08:55','16:30'],
    ['2027-03-05','08:45','16:45','08:55','16:30'],
    ['2027-03-06','09:00','16:45','09:10','16:30'],
    ['2027-05-02','09:00','16:45','09:10','16:30'],
  ];
  for(const [day,a,b,c,d] of data) {
    const r=schedule.lookup(day,'jandri-3200');
    assert.equal(r.reason,'published_schedule_only');
    assert.deepEqual([...r.schedule.first],[a,b]);
    assert.deepEqual([...r.schedule.second],[c,d]);
    assert.equal(r.confirmedOperatingNow,false);
    assert.equal(r.boardingAllowed,false);
    const mid=schedule.lookup(day,'jandri-2600');
    assert.equal(mid.schedule.second,null);
    assert.deepEqual([...mid.schedule.first],[a,b]);
  }
});
test('dates outside sourced winter season or invalid are never asserted closed/open',()=>{
  for(const day of ['2026-11-20','2026-11-27','2027-05-03','2027-07-15']) {
    const r=schedule.lookup(day,'jandri-3200');
    assert.equal(r.reason,'outside_published_winter_dates');
    assert.equal(r.schedule,null);
  }
  for(const day of ['2027-02-30','bad','2027-13-01','2027-02-5','']) {
    const r=schedule.lookup(day,'jandri-3200');
    assert.equal(r.reason,'invalid_date');
  }
  const bad=schedule.lookup('2027-03-15','fake-3500');
  assert.equal(bad.reason,'invalid_destination');
  assert.equal(bad.schedule,null);
});
