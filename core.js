// ARISE core logic: targets, XP, quests, penalties, calendar file. No DOM here so tests can run it in node.
(function (root) {
  const RANKS = [
    { r: 'E', min: 1 }, { r: 'D', min: 6 }, { r: 'C', min: 12 },
    { r: 'B', min: 20 }, { r: 'A', min: 30 }, { r: 'S', min: 45 }
  ];

  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dayKey(d); };

  // ---- XP / levels ----
  const xpForLevel = lvl => 100 + (lvl - 1) * 40; // xp needed to go from lvl to lvl+1
  function levelFromXp(xp) {
    let lvl = 1, left = Math.max(0, xp);
    while (left >= xpForLevel(lvl)) { left -= xpForLevel(lvl); lvl++; }
    return { level: lvl, into: left, need: xpForLevel(lvl) };
  }
  function rankForLevel(lvl) {
    let out = RANKS[0].r;
    for (const x of RANKS) if (lvl >= x.min) out = x.r;
    return out;
  }

  // ---- body targets ----
  // Mifflin-St Jeor. sex: 'm' | 'f'. weight lb, height in, age yr.
  function targets(p) {
    const kg = p.weightLb * 0.45359237, cm = p.heightIn * 2.54;
    const bmr = 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === 'f' ? -161 : 5);
    const tdee = bmr * 1.4;
    const floor = p.sex === 'f' ? 1400 : 1700; // never push below this without a doctor
    const calories = Math.round(Math.max(floor, tdee - 500) / 10) * 10;
    // protein anchored to goal weight, ~0.8 g/lb, keeps muscle while cutting
    const protein = Math.round((p.goalLb || 180) * 0.8 / 5) * 5;
    const toLose = Math.max(0, p.weightLb - (p.goalLb || 180));
    const weeks = Math.ceil(toLose / 1.0); // ~1 lb/wk is the sustainable pace
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), calories, protein, toLose, weeks, months: Math.round(weeks / 4.3) };
  }

  // ---- daily quests ----
  // Walk target ramps with level so week 1 is doable.
  function walkTarget(level) { return Math.min(45, 15 + Math.floor((level - 1) / 2) * 5); }

  function effectiveWalk(day) {
    // Watch exercise ring minutes and manual walk minutes describe the same time: take the larger, never the sum.
    return Math.max(day.walkMin || 0, day.ringMin || 0);
  }

  function questsFor(day, ctx) {
    const wt = walkTarget(ctx.level);
    return [
      { id: 'walk', name: 'Cardio Training', desc: `Walk ${wt} min (talk-test pace)`, xp: 30, stat: 'agi', done: effectiveWalk(day) >= wt },
      { id: 'hold', name: 'Pressure Seal', desc: 'Wall sit / isometric holds, 4 x 30s, breathe the whole time', xp: 25, stat: 'vit', done: !!day.hold },
      { id: 'protein', name: 'Fuel the Body', desc: `Hit ${ctx.protein} g protein`, xp: 25, stat: 'vit', done: (day.protein || 0) >= ctx.protein },
      { id: 'weigh', name: 'Status Check', desc: 'Log your morning weight', xp: 10, stat: 'int', done: !!day.weight },
      { id: 'sleep', name: 'Recovery', desc: 'CPAP on, in bed on time', xp: 20, stat: 'vit', done: !!day.sleep }
    ];
  }

  function dayComplete(day, ctx) {
    return questsFor(day, ctx).every(q => q.done);
  }

  // Missed day = a past day (after signup day) where not all core quests done and no rest pass.
  function penaltyFor(state, today) {
    if (state.signupDay === today) return null;
    const y = addDays(today, -1);
    if (y < state.signupDay) return null;
    const d = state.days[y] || {};
    if (d.rest || d.penaltyCleared) return null;
    const lvl = levelFromXp(xpAt(state, y)).level;
    const ctx = { level: lvl, protein: state.targets.protein };
    const done = questsFor(d, ctx).filter(q => q.done).length;
    if (done >= 3) return null; // 3 of 5 counts as a survived day
    return { day: y, text: 'Penalty Zone: 10 min extra walk plus 2 x 30s wall sit. Breathe out on effort. No gym, no excuses.', xp: 15 };
  }

  function xpAt(state, uptoKey) {
    // XP is stored as an event log so re-syncs cannot double count.
    let t = 0;
    for (const e of state.xpLog) if (e.day <= uptoKey) t += e.xp;
    return t;
  }
  function totalXp(state) { return state.xpLog.reduce((a, e) => a + e.xp, 0); }

  // award once per (day, key). Returns xp granted (0 if already granted).
  function award(state, day, key, xp) {
    if (state.xpLog.some(e => e.day === day && e.key === key)) return 0;
    state.xpLog.push({ day, key, xp });
    return xp;
  }

  // Re-evaluate the day's quests and grant/revoke XP idempotently.
  function settleDay(state, day) {
    const d = state.days[day] || (state.days[day] = {});
    const ctx = { level: levelFromXp(xpAt(state, addDays(day, -1))).level, protein: state.targets.protein };
    let gained = 0;
    for (const q of questsFor(d, ctx)) {
      const k = 'q:' + q.id;
      const has = state.xpLog.findIndex(e => e.day === day && e.key === k);
      if (q.done && has < 0) gained += award(state, day, k, q.xp);
      if (!q.done && has >= 0) state.xpLog.splice(has, 1); // un-ticked: take it back
    }
    const all = dayComplete(d, ctx);
    const hasBonus = state.xpLog.findIndex(e => e.day === day && e.key === 'bonus');
    if (all && hasBonus < 0) gained += award(state, day, 'bonus', 40);
    if (!all && hasBonus >= 0) state.xpLog.splice(hasBonus, 1);
    return gained;
  }

  function streak(state, today) {
    let n = 0, k = today;
    const ctxFor = day => ({ level: levelFromXp(xpAt(state, addDays(day, -1))).level, protein: state.targets.protein });
    const ok = day => { const d = state.days[day]; return d && (d.rest || questsFor(d, ctxFor(day)).filter(q => q.done).length >= 3); };
    if (!ok(k)) k = addDays(k, -1); // today still in progress
    while (ok(k)) { n++; k = addDays(k, -1); }
    return n;
  }

  // stats grow from logged work
  function stats(state) {
    const s = { str: 5, agi: 5, vit: 5, int: 5 };
    for (const e of state.xpLog) {
      if (e.key.startsWith('q:')) {
        const id = e.key.slice(2);
        const st = { walk: 'agi', hold: 'vit', protein: 'vit', weigh: 'int', sleep: 'vit' }[id];
        if (st) s[st] += 0.2;
      }
      if (e.key.startsWith('gate:')) s.str += 1;
    }
    for (const k in s) s[k] = Math.round(s[k]);
    return s;
  }

  // ---- calendar file (.ics) ----
  const icsEsc = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  function fold(line) {
    const out = []; let s = line;
    while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); }
    out.push(s); return out.join('\r\n');
  }
  // reminders: [{id,title,body,time:'HH:MM',days:['MO',...]}]; startDay 'YYYY-MM-DD'
  function buildIcs(reminders, startDay, stamp) {
    const st = stamp || new Date();
    const dtstamp = `${st.getUTCFullYear()}${pad(st.getUTCMonth() + 1)}${pad(st.getUTCDate())}T${pad(st.getUTCHours())}${pad(st.getUTCMinutes())}${pad(st.getUTCSeconds())}Z`;
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ARISE Fitness//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:ARISE System'];
    // dedupe identical (time, title) pairs so two reminders in one minute do not collide on UID
    const seen = new Set();
    for (const r of reminders) {
      if (!r.on && r.on !== undefined) continue;
      const sig = `${r.id}|${r.time}`;
      if (seen.has(sig)) continue; seen.add(sig);
      const [h, m] = r.time.split(':').map(Number);
      const startDt = `${startDay.replace(/-/g, '')}T${pad(h)}${pad(m)}00`;
      const endMin = h * 60 + m + 15;
      const endDt = `${startDay.replace(/-/g, '')}T${pad(Math.floor(endMin / 60) % 24)}${pad(endMin % 60)}00`;
      L.push('BEGIN:VEVENT',
        `UID:arise-${r.id}-${pad(h)}${pad(m)}@arise-fitness`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${startDt}`, `DTEND:${endDt}`,
        r.days && r.days.length < 7 ? `RRULE:FREQ=WEEKLY;BYDAY=${r.days.join(',')}` : 'RRULE:FREQ=DAILY',
        fold(`SUMMARY:${icsEsc('[SYSTEM] ' + r.title)}`),
        fold(`DESCRIPTION:${icsEsc(r.body)}`),
        'BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsEsc('[SYSTEM] ' + r.title)}`), 'TRIGGER:PT0M', 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsEsc('Still not started: ' + r.title)}`), 'TRIGGER:PT10M', 'END:VALARM',
        'END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }

  const api = { RANKS, dayKey, parseKey, addDays, xpForLevel, levelFromXp, rankForLevel, targets, walkTarget, effectiveWalk, questsFor, dayComplete, penaltyFor, xpAt, totalXp, award, settleDay, streak, stats, buildIcs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
