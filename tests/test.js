const assert = require('assert');
const C = require('../core.js'), P = require('../program.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };

const mk = () => ({ signupDay: '2026-10-01', targets: { protein: 145 }, days: {}, xpLog: [] });

t('levels increase and rank thresholds', () => {
  assert.strictEqual(C.levelFromXp(0).level, 1);
  assert.strictEqual(C.levelFromXp(100).level, 2);
  assert.strictEqual(C.rankForLevel(1), 'E'); assert.strictEqual(C.rankForLevel(12), 'C'); assert.strictEqual(C.rankForLevel(45), 'S');
});
t('targets: sane calories/protein, floor respected', () => {
  const x = C.targets({ age: 40, heightIn: 70, sex: 'm', weightLb: 255, goalLb: 180 });
  assert(x.calories >= 1700 && x.calories < 3000); assert.strictEqual(x.protein, 145); assert.strictEqual(x.toLose, 75);
  const y = C.targets({ age: 80, heightIn: 60, sex: 'f', weightLb: 120, goalLb: 110 });
  assert(y.calories >= 1400);
});
t('watch ring minutes: higher wins, never summed', () => {
  assert.strictEqual(C.effectiveWalk({ walkMin: 20, ringMin: 30 }), 30);
  assert.strictEqual(C.effectiveWalk({ walkMin: 40, ringMin: 30 }), 40);
});
t('re-settling a day does not double count XP', () => {
  const s = mk(), d = '2026-10-05'; s.days[d] = { weight: 250, hold: true, sleep: true };
  const a = C.settleDay(s, d), b = C.settleDay(s, d);
  assert.strictEqual(a, 10 + 25 + 20); assert.strictEqual(b, 0);
  assert.strictEqual(C.totalXp(s), 55);
});
t('unticking takes XP back', () => {
  const s = mk(), d = '2026-10-05'; s.days[d] = { hold: true }; C.settleDay(s, d);
  s.days[d].hold = false; C.settleDay(s, d); assert.strictEqual(C.totalXp(s), 0);
});
t('all five quests gives bonus once', () => {
  const s = mk(), d = '2026-10-05'; s.days[d] = { walkMin: 20, hold: true, protein: 150, weight: 250, sleep: true };
  C.settleDay(s, d); C.settleDay(s, d);
  assert.strictEqual(C.totalXp(s), 30 + 25 + 25 + 10 + 20 + 40);
});
t('gym walking steps count toward walk quest via ring minutes', () => {
  const s = mk(), d = '2026-10-05'; s.days[d] = { ringMin: 30 };
  C.settleDay(s, d); assert(s.xpLog.some(e => e.key === 'q:walk'));
});
t('no penalty on signup day; penalty after a failed day; none with rest pass', () => {
  const s = mk();
  assert.strictEqual(C.penaltyFor(s, '2026-10-01'), null);
  assert(C.penaltyFor(s, '2026-10-03'));
  s.days['2026-10-02'] = { rest: true }; assert.strictEqual(C.penaltyFor(s, '2026-10-03'), null);
  s.days['2026-10-02'] = { hold: true, sleep: true, weight: 250 }; assert.strictEqual(C.penaltyFor(s, '2026-10-03'), null); // 3 of 5
});
t('streak counts survived days, today in progress ok', () => {
  const s = mk();
  s.days['2026-10-03'] = { hold: true, sleep: true, weight: 1 }; s.days['2026-10-04'] = { hold: true, sleep: true, weight: 1 };
  assert.strictEqual(C.streak(s, '2026-10-05'), 2);
});
t('schedule: Planet Fitness only Wed and Thu', () => {
  const gyms = P.WEEK.map((k, i) => [i, P.GATES[k].where]).filter(x => x[1] === 'gym').map(x => x[0]);
  assert.deepStrictEqual(gyms, [3, 4]);
});
t('every exercise key resolves; plans scale up over weeks', () => {
  for (const g of Object.values(P.GATES)) for (const k of g.ex) assert(P.EX[k], k);
  const a = P.plan(P.GATES.homeA, 0), b = P.plan(P.GATES.homeA, 8);
  assert(b.ex[1].reps > a.ex[1].reps); assert(b.rounds >= a.rounds);
});
t('ics: valid structure, alarms, no duplicate UIDs, off reminders skipped', () => {
  const rem = JSON.parse(JSON.stringify(P.REMINDERS)); rem[1].on = false;
  rem.push({ id: 'morning', title: 'x', body: 'y', time: '07:00', days: P.ICS_DAYS, on: true }); // same id+time collides
  const ics = C.buildIcs(rem, '2026-10-19', new Date(Date.UTC(2026, 9, 19)));
  assert(ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR'));
  const uids = ics.match(/UID:.*/g); assert.strictEqual(new Set(uids).size, uids.length); assert.strictEqual(uids.length, 3);
  assert((ics.match(/BEGIN:VALARM/g) || []).length === 6); assert(ics.includes('RRULE:FREQ=DAILY'));
  assert(ics.split('\r\n').every(l => l.length <= 75));
});
t('steps or minutes clear walk quest, not summed; watch sleep hours clear sleep quest', () => {
  const s = mk(), d = '2026-10-05';
  s.days[d] = { steps: 4000, sleepHr: 7.4 }; C.settleDay(s, d);
  assert(s.xpLog.some(e => e.key === 'q:walk')); assert(s.xpLog.some(e => e.key === 'q:sleep'));
  s.days[d] = { steps: 3000, sleepHr: 5 }; C.settleDay(s, d);
  assert(!s.xpLog.some(e => e.key === 'q:walk')); assert(!s.xpLog.some(e => e.key === 'q:sleep'));
  s.days[d] = { steps: 4000, walkMin: 20 }; C.settleDay(s, d);
  assert.strictEqual(s.xpLog.filter(e => e.key === 'q:walk').length, 1);
});
console.log(`\n${n} checks passed`);
