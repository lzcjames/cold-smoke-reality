// Jandri 3S 2026/27 WINTER PUBLISHED TIMETABLE — information only.
// Source: Les 2 Alpes tourism office, updated 2026-10-01:
// https://www.alpes-isere.com/sit/jandri-troncon-1-acces-2600m-5671467/
// The timetable is NOT live lift availability, nor a boarding authorization.
// Times are published local wall-clock time (Europe/Paris).
const JandriWinterSchedule = (() => {
  const source = Object.freeze({
    url: 'https://www.alpes-isere.com/sit/jandri-troncon-1-acces-2600m-5671467/',
    publisher: 'Office de Tourisme des 2 Alpes / Alpes Isère',
    updated: '2026-10-01',
    timezone: 'Europe/Paris',
    verifiedSeason: '2026/27',
    realtime: false,
  });
  const ranges = Object.freeze([
    {from:'2026-11-28',to:'2026-12-18',first:['09:00','16:15'],second:['09:10','16:00'],lastPedestrianUp:'15:45'},
    {from:'2026-12-19',to:'2027-01-01',first:['08:45','16:30'],second:['08:55','16:00'],lastPedestrianUp:'16:00'},
    {from:'2027-01-02',to:'2027-02-05',first:['09:00','16:30'],second:['09:10','16:00'],lastPedestrianUp:'16:00'},
    {from:'2027-02-06',to:'2027-03-05',first:['08:45','16:45'],second:['08:55','16:30'],lastPedestrianUp:'16:15'},
    {from:'2027-03-06',to:'2027-05-02',first:['09:00','16:45'],second:['09:10','16:30'],lastPedestrianUp:'16:15'},
  ].map(s => Object.freeze({...s,first:Object.freeze(s.first),second:Object.freeze(s.second)})));
  function lookup(day, destination) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') ||
        Number.isNaN(Date.parse(day)) ||
        new Date(day + 'T00:00:00Z').toISOString().slice(0,10) !== day) {
      return {reason:'invalid_date', schedule:null, source};
    }
    if (destination !== 'jandri-2600' && destination !== 'jandri-3200') {
      return {reason:'invalid_destination', schedule:null, source};
    }
    const record = ranges.find(s => day >= s.from && day <= s.to);
    if (!record) return {reason:'outside_published_winter_dates', schedule:null, source};
    return {
      reason:'published_schedule_only',
      source,day,destination,
      schedule:{
        first:record.first,
        second:destination === 'jandri-3200' ? record.second : null,
        firstSectionLastPedestrianAscent:record.lastPedestrianUp,
      },
      confirmedOperatingNow:false,
      boardingAllowed:false,
    };
  }
  return Object.freeze({source,ranges,lookup});
})();
