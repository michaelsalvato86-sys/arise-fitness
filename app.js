(function () {
  const C = window.Core, P = window.Program;
  const KEY = 'arise.v1';
  const $ = s => document.querySelector(s);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => C.dayKey(new Date());

  let S = load();
  let tab = 'status';
  let run = null; // active workout

  function load() {
    try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.profile) return j; } catch (e) { }
    return null;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }

  const ctx = () => ({ level: C.levelFromXp(C.xpAt(S, C.addDays(today(), -1))).level, protein: S.targets.protein });
  const lv = () => C.levelFromXp(C.totalXp(S));
  const day = () => S.days[today()] || (S.days[today()] = {});

  // ---------- System popup ----------
  function sys(title, msg, buttons, red) {
    const el = $('#sys');
    el.innerHTML = `<div class="win ${red ? 'red' : ''}"><div class="hd">${esc(title)}</div><div class="msg"></div><div id="sb"></div></div>`;
    el.classList.remove('hidden');
    const m = el.querySelector('.msg'); let i = 0;
    (function t() { m.textContent = msg.slice(0, i += 3); if (i < msg.length + 3) setTimeout(t, 14); })();
    if (navigator.vibrate) try { navigator.vibrate(red ? [200, 100, 200] : 80); } catch (e) { }
    const sb = el.querySelector('#sb');
    buttons.forEach(b => {
      const x = document.createElement('button'); x.textContent = b.t; if (b.cls) x.className = b.cls;
      x.style.marginTop = '8px';
      x.onclick = () => { el.classList.add('hidden'); b.f && b.f(); };
      sb.appendChild(x);
    });
  }

  // ---------- first-run setup ----------
  function setup() {
    $('#app').innerHTML = `<h1>ARISE</h1>
    <div class="win"><h2>[System] Player detected</h2>
    <p class="dim">You were chosen. Fill in your status window. Stays on this phone only.</p>
    <label>Age</label><input id="age" type="number" inputmode="numeric" value="">
    <label>Height (ft / in)</label><div class="inl"><input id="ft" type="number" inputmode="numeric" placeholder="ft"><input id="inch" type="number" inputmode="numeric" placeholder="in"></div>
    <label>Sex (for calorie math)</label><select id="sex"><option value="m">Male</option><option value="f">Female</option></select>
    <label>Current weight (lb)</label><input id="wt" type="number" inputmode="decimal" value="255">
    <label>Goal weight (lb)</label><input id="goal" type="number" inputmode="decimal" value="180">
    <label>Beta blocker? (name ends in -olol)</label><select id="bb"><option value="0">No / not sure</option><option value="1">Yes</option></select>
    <button class="go" id="start" style="margin-top:16px">Accept</button></div>
    <p class="dim">Not medical advice. You said your doctor cleared you. Keep following their guidance on BP and CPAP.</p>`;
    $('#start').onclick = () => {
      const age = +$('#age').value, ft = +$('#ft').value, inch = +$('#inch').value || 0, wt = +$('#wt').value, goal = +$('#goal').value;
      const heightIn = ft * 12 + inch;
      if (!(age >= 14 && age <= 90) || !(heightIn >= 48 && heightIn <= 90) || !(wt >= 90 && wt <= 600) || !(goal >= 90 && goal < wt)) {
        $('#start').classList.add('shake'); setTimeout(() => $('#start').classList.remove('shake'), 400);
        sys('ERROR', 'Status window incomplete. Enter your real age, height, weight, and a goal below your weight.', [{ t: 'OK' }], true); return;
      }
      const profile = { age, heightIn, sex: $('#sex').value, weightLb: wt, goalLb: goal, startLb: wt, betaBlocker: $('#bb').value === '1' };
      S = { profile, signupDay: today(), targets: C.targets(profile), days: {}, xpLog: [], gates: {}, bp: [], reminders: JSON.parse(JSON.stringify(P.REMINDERS)), popup: '' };
      save(); render();
      sys('SYSTEM', `Player registered.\n\nDaily target: ${S.targets.calories} kcal, ${S.targets.protein} g protein.\nEstimated time to ${profile.goalLb} lb: about ${S.targets.months} months at a safe pace.\n\nGo to SYSTEM and import the reminder calendar so I can wake you up.`, [{ t: 'Arise' }]);
    };
  }

  // ---------- views ----------
  function render() {
    if (!S) return setup();
    const v = { status, quests, gate, system }[tab]();
    $('#app').innerHTML = v + navHtml();
    document.querySelectorAll('nav button').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); window.scrollTo(0, 0); });
    bind();
  }
  const navHtml = () => `<nav>${[['status', 'Status'], ['quests', 'Quests'], ['gate', 'Gate'], ['system', 'System']].map(([k, n]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</nav>`;

  function status() {
    const l = lv(), rk = C.rankForLevel(l.level), st = C.stats(S), cur = S.profile.weightLb;
    const lost = Math.max(0, S.profile.startLb - cur), toGo = Math.max(0, cur - S.profile.goalLb);
    const pct = Math.min(100, Math.round(lost / Math.max(1, S.profile.startLb - S.profile.goalLb) * 100));
    return `<h1>ARISE</h1>
    <div class="win"><div class="row"><div><h3>Rank</h3><div class="rank" style="color:${rk === 'S' ? 'var(--gold)' : 'var(--glow)'}">${rk}</div></div>
    <div style="text-align:right"><h3>Level</h3><div class="big">${l.level}</div></div></div>
    <div class="bar" style="margin-top:10px"><i style="width:${Math.round(l.into / l.need * 100)}%"></i></div>
    <div class="dim" style="margin-top:4px">${l.into} / ${l.need} XP</div></div>
    <div class="win"><h2>Stats</h2><div class="stats">
    <div class="stat"><span>STR</span><b>${st.str}</b></div><div class="stat"><span>AGI</span><b>${st.agi}</b></div>
    <div class="stat"><span>VIT</span><b>${st.vit}</b></div><div class="stat"><span>INT</span><b>${st.int}</b></div></div>
    <div class="dim" style="margin-top:8px">Streak: <b style="color:var(--gold)">${C.streak(S, today())} days</b></div></div>
    <div class="win"><h2>Body</h2><div class="row"><div><div class="big" style="font-size:30px">${cur} lb</div><div class="dim">${toGo.toFixed(1)} lb to ${S.profile.goalLb}</div></div>
    <div class="dim" style="text-align:right">${S.targets.calories} kcal<br>${S.targets.protein} g protein</div></div>
    <div class="bar" style="margin-top:10px"><i style="width:${pct}%"></i></div><div class="dim">${pct}% of the way</div></div>
    <div class="win"><h2>Today</h2><div>${esc(todayGateLine())}</div><button class="go" data-go="gate" style="margin-top:10px">Enter the Gate</button></div>`;
  }
  function todayGateLine() {
    const g = P.gateForDate(new Date());
    return `${P.DAYNAMES[new Date().getDay()]}: ${g.name}${g.where === 'gym' ? ' (Planet Fitness)' : ''}`;
  }

  function quests() {
    const d = day(), c = ctx(), qs = C.questsFor(d, c), pen = C.penaltyFor(S, today());
    const bpHtml = S.bp.slice(-3).reverse().map(b => `${b.day.slice(5)}: ${b.sys}/${b.dia}`).join('  |  ') || 'none yet';
    return `<h1>Daily Quests</h1>
    ${pen ? `<div class="win red"><h2>Penalty Zone</h2><div>${esc(pen.text)}</div><button class="warn" data-act="pen" style="margin-top:10px">Penalty done</button></div>` : ''}
    <div class="win">${qs.map(q => `<div class="q ${q.done ? 'done' : ''}"><div class="chk">${q.done ? '&#10003;' : ''}</div><div style="flex:1"><div class="nm">${esc(q.name)}</div><div class="dim">${esc(q.desc)}</div></div><div class="xp">+${q.xp}</div></div>`).join('')}
    <div class="dim" style="margin-top:8px">All five: +40 XP bonus</div></div>
    <div class="win"><h2>Log</h2>
    <label>Morning weight (lb)</label><div class="inl"><input id="in-weight" type="number" inputmode="decimal" value="${d.weight || ''}"></div>
    <label>Walk minutes (manual)</label><input id="in-walk" type="number" inputmode="numeric" value="${d.walkMin || ''}">
    <label>Apple Watch green Exercise minutes</label><input id="in-ring" type="number" inputmode="numeric" value="${d.ringMin || ''}">
    <div class="dim">Walk quest uses the higher of the two, never both added.</div>
    <label>Protein today (g)</label><div class="inl"><input id="in-prot" type="number" inputmode="numeric" value="${d.protein || ''}"><button class="sm" data-add="20">+20</button><button class="sm" data-add="30">+30</button></div>
    <label>Isometric holds done</label><div class="inl"><input type="checkbox" id="in-hold" ${d.hold ? 'checked' : ''}> <span>Wall sit / squeeze holds</span></div>
    <label>CPAP on + bed on time (last night)</label><div class="inl"><input type="checkbox" id="in-sleep" ${d.sleep ? 'checked' : ''}> <span>Done</span></div>
    <label>Blood pressure (sys / dia)</label><div class="inl"><input id="in-sys" type="number" inputmode="numeric" placeholder="sys"><input id="in-dia" type="number" inputmode="numeric" placeholder="dia"><button class="sm" data-act="bp">Save</button></div>
    <div class="dim">Recent: ${bpHtml}</div>
    <label>Sick or doctor said rest</label><div class="inl"><input type="checkbox" id="in-rest" ${d.rest ? 'checked' : ''}> <span>Rest pass (keeps streak, no penalty)</span></div></div>`;
  }

  function gate() {
    const g = P.gateForDate(new Date());
    const wk = Math.floor((C.parseKey(today()) - C.parseKey(S.signupDay)) / 6048e5);
    const pl = P.plan(g, wk);
    if (run) return runView();
    const done = S.gates[today()];
    const exList = pl.ex.map(e => `<div class="ex"><div><b>${esc(e.n)}</b><div class="dim">${esc(e.cue)}</div></div><div>${e.reps ? e.reps + ' reps' : e.hold >= 120 ? Math.round(e.hold / 60) + ' min' : e.hold + 's'}</div></div>`).join('');
    const sched = P.WEEK.map((k, i) => `<div class="stat"><span>${P.DAYNAMES[i].slice(0, 3)}</span><span>${P.GATES[k].name.replace('Gate: ', '')}</span></div>`).join('');
    return `<h1>${esc(g.name)}</h1>
    <div class="win"><span class="tag">${esc(pl.phase.name)}</span><span class="tag">${g.where === 'gym' ? 'Planet Fitness' : 'Home, no equipment'}</span>
    <p class="dim">Apple Watch: start a "${esc(g.watch)}" workout.</p>
    ${g.ex.length ? exList + `<div class="dim" style="margin-top:8px">${pl.rounds} rounds. Rest 45-60s between.</div>` : g.id === 'rest' ? '<p>Easy day. Walk if you feel good, stretch, sleep well.</p>' : `<p>Walk ${C.walkTarget(lv().level)}+ minutes at talk-test pace. Log it in Quests.</p>`}
    ${done ? '<div class="xp" style="margin-top:10px">Gate cleared today &#10003;</div>' : g.ex.length ? '<button class="go" data-act="startgate" style="margin-top:12px">Begin</button>' : ''}</div>
    <div class="win"><h2>Safety</h2>${P.SAFETY.map(s => `<p class="dim" style="margin:6px 0">&bull; ${esc(s)}</p>`).join('')}</div>
    <div class="win"><h2>Weekly map</h2>${sched}</div>`;
  }

  // ---- workout runner ----
  function startGate() {
    const g = P.gateForDate(new Date());
    const wk = Math.floor((C.parseKey(today()) - C.parseKey(S.signupDay)) / 6048e5);
    const pl = P.plan(g, wk), steps = [];
    for (let r = 1; r <= pl.rounds; r++) pl.ex.forEach(e => steps.push({ e, r }));
    run = { g, steps, i: 0, left: 0, timer: null };
    prepStep(); render();
  }
  function prepStep() { const s = run.steps[run.i]; run.left = s && s.e.hold ? s.e.hold : 0; run.running = false; }
  function runView() {
    const s = run.steps[run.i], total = run.steps.length;
    const timed = !!s.e.hold;
    const t = run.left;
    return `<h1>${esc(run.g.name)}</h1><div class="win">
    <div class="dim">Step ${run.i + 1} / ${total} &middot; Round ${s.r}</div>
    <h2 style="margin-top:8px">${esc(s.e.n)}</h2><p>${esc(s.e.cue)}</p>
    ${timed ? `<div class="timer" id="tm">${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</div>
      <button class="go" data-act="tm">${run.running ? 'Pause' : 'Start timer'}</button>` : `<div class="timer">${s.e.reps}</div><div class="dim" style="text-align:center">reps, exhale on effort</div>`}
    <button data-act="next" style="margin-top:10px">${run.i + 1 >= total ? 'Finish Gate' : 'Done, next'}</button>
    <button class="warn" data-act="quit" style="margin-top:10px">Abort</button></div>`;
  }
  function tick() {
    if (!run || !run.running) return;
    run.left--; const tm = $('#tm');
    if (run.left <= 0) { run.running = false; run.left = 0; if (navigator.vibrate) try { navigator.vibrate([150, 80, 150]); } catch (e) { } render(); return; }
    if (tm) tm.textContent = `${Math.floor(run.left / 60)}:${String(run.left % 60).padStart(2, '0')}`;
  }
  setInterval(tick, 1000);
  function nextStep() {
    run.i++;
    if (run.i >= run.steps.length) return finishGate();
    prepStep(); render();
  }
  function finishGate() {
    const g = run.g; run = null;
    const gained = C.award(S, today(), 'gate:' + g.id, 60);
    S.gates[today()] = g.id;
    day().hold = true; // every Gate includes isometric work
    const before = lv().level; const g2 = C.settleDay(S, today());
    save(); render();
    sys('GATE CLEARED', `${g.name}\n\n+${gained + g2} XP.\nThe System acknowledges you.`, [{ t: 'Continue' }]);
    levelCheck(before);
  }
  function levelCheck(before) {
    const after = lv().level;
    if (after > before) setTimeout(() => sys('LEVEL UP', `Level ${before} -> ${after}\nRank: ${C.rankForLevel(after)}\n\nStats increased.`, [{ t: 'Arise' }]), 400);
  }

  function system() {
    const rem = S.reminders.map((r, i) => `<div class="stat" style="align-items:center"><span><input type="checkbox" data-rem-on="${i}" ${r.on ? 'checked' : ''}> ${esc(r.title.split(':')[0])}</span><input type="time" data-rem-t="${i}" value="${r.time}" style="width:130px"></div>`).join('');
    return `<h1>System</h1>
    <div class="win"><h2>Reminders</h2>
    <p class="dim">iPhone cannot wake a web app. So the System exports a calendar file with repeating alarms. Import once; it fires on its own, including on your watch.</p>
    ${rem}
    <button class="go" data-act="ics" style="margin-top:12px">Download reminder calendar</button>
    <p class="dim">Tap the file, then "Add All" to a calendar. Changed a time? Delete the old ARISE System calendar first.</p>
    <p class="dim">Backup: also set 2 alarms in the Clock app (7:00 and 18:30), since calendar alerts can be silenced by Focus modes.</p></div>
    <div class="win"><h2>Apple Watch</h2>
    <p class="dim">1. Watch app on iPhone &gt; Calendar &gt; Mirror my iPhone, so alarms tap your wrist.<br>2. Start the named workout type from the Gate screen.<br>3. Type your green Exercise minutes into Quests. No double counting.<br>4. The watch BP and sleep apnea alerts are not for you. Use your cuff and CPAP.<br>5. Beta blocker: use the talk test, not heart rate.</p></div>
    <div class="win"><h2>Targets</h2><div class="stat"><span>Calories</span><b>${S.targets.calories}</b></div><div class="stat"><span>Protein</span><b>${S.targets.protein} g</b></div>
    <p class="dim">Pace ~1 lb/week. About ${S.targets.months} months to goal. If you lose faster than 2 lb/week, eat more.</p>
    <label>Goal weight (lb)</label><input id="s-goal" type="number" value="${S.profile.goalLb}"><button data-act="goal" style="margin-top:8px">Update goal</button></div>
    <div class="win"><h2>Install</h2><p class="dim">Safari &gt; Share &gt; Add to Home Screen. Open from the icon. Works offline.</p>
    <button class="warn" data-act="reset">Reset everything</button></div>`;
  }

  // ---------- bindings ----------
  function afterEdit() {
    const before = lv().level;
    const g = C.settleDay(S, today()); save();
    render();
    if (g > 0) toast(`+${g} XP`);
    levelCheck(before);
  }
  function toast(t) { const x = document.createElement('div'); x.textContent = t; x.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top) + 12px);left:50%;transform:translateX(-50%);background:#0d2250;border:1px solid var(--gold);color:var(--gold);padding:8px 16px;z-index:30;font-weight:800;border-radius:4px'; document.body.appendChild(x); setTimeout(() => x.remove(), 1400); }

  function bind() {
    document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { tab = b.dataset.go; render(); });
    const num = id => { const e = $(id); return e ? (e.value === '' ? 0 : +e.value) : 0; };
    const on = (id, f) => { const e = $(id); if (e) e.onchange = f; };
    on('#in-weight', () => { const w = num('#in-weight'); if (w >= 90 && w <= 600) { day().weight = w; S.profile.weightLb = w; S.targets = C.targets(S.profile); afterEdit(); } });
    on('#in-walk', () => { day().walkMin = num('#in-walk'); afterEdit(); });
    on('#in-ring', () => { day().ringMin = num('#in-ring'); afterEdit(); });
    on('#in-prot', () => { day().protein = num('#in-prot'); afterEdit(); });
    on('#in-hold', () => { day().hold = $('#in-hold').checked; afterEdit(); });
    on('#in-sleep', () => { day().sleep = $('#in-sleep').checked; afterEdit(); });
    on('#in-rest', () => { day().rest = $('#in-rest').checked; afterEdit(); });
    document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { day().protein = (day().protein || 0) + +b.dataset.add; afterEdit(); });
    document.querySelectorAll('[data-rem-on]').forEach(e => e.onchange = () => { S.reminders[+e.dataset.remOn].on = e.checked; save(); });
    document.querySelectorAll('[data-rem-t]').forEach(e => e.onchange = () => { if (e.value) { S.reminders[+e.dataset.remT].time = e.value; save(); } });
    document.querySelectorAll('[data-act]').forEach(b => b.onclick = () => act(b.dataset.act));
  }

  function act(a) {
    if (a === 'bp') {
      const sy = +$('#in-sys').value, di = +$('#in-dia').value;
      if (!(sy >= 70 && sy <= 260 && di >= 40 && di <= 160)) return sys('ERROR', 'Enter sys and dia from your cuff.', [{ t: 'OK' }], true);
      S.bp.push({ day: today(), sys: sy, dia: di }); save();
      if (sy >= 180 || di >= 120) sys('WARNING', `${sy}/${di} is very high. Rest, recheck in 5 minutes. If it stays this high, or you have chest pain, headache, or vision changes, call your doctor or 911. No training today.`, [{ t: 'OK' }], true);
      else if (sy >= 160 || di >= 100) sys('CAUTION', `${sy}/${di} is high. Keep it to an easy walk today, skip the hard Gate, and tell your doctor if it stays up.`, [{ t: 'OK' }], true);
      render();
    }
    if (a === 'pen') {
      const pen = C.penaltyFor(S, today()); if (!pen) return;
      (S.days[pen.day] || (S.days[pen.day] = {})).penaltyCleared = true;
      C.award(S, today(), 'penalty:' + pen.day, pen.xp); save(); render(); toast('Penalty cleared +' + pen.xp);
    }
    if (a === 'startgate') startGate();
    if (a === 'tm') { run.running = !run.running; render(); }
    if (a === 'next') nextStep();
    if (a === 'quit') { run = null; render(); }
    if (a === 'goal') { const g = +$('#s-goal').value; if (g >= 90 && g < S.profile.weightLb) { S.profile.goalLb = g; S.targets = C.targets(S.profile); save(); render(); } }
    if (a === 'reset') sys('RESET', 'Delete all progress on this phone?', [{ t: 'Cancel' }, { t: 'Delete', cls: 'warn', f: () => { localStorage.removeItem(KEY); S = null; render(); } }], true);
    if (a === 'ics') {
      const txt = C.buildIcs(S.reminders, today());
      try {
        const url = URL.createObjectURL(new Blob([txt], { type: 'text/calendar' }));
        const l = document.createElement('a'); l.href = url; l.download = 'arise-system.ics'; document.body.appendChild(l); l.click(); l.remove();
      } catch (e) { location.href = 'data:text/calendar;charset=utf8,' + encodeURIComponent(txt); }
    }
  }

  // ---------- launch ----------
  function launch() {
    render();
    if (!S) return;
    if (S.popup === today()) return;
    S.popup = today(); save();
    const pen = C.penaltyFor(S, today());
    const line = P.LINES[Math.floor(Math.random() * P.LINES.length)];
    const g = P.gateForDate(new Date());
    const msg = `${line}\n\nToday's quest: ${g.name}${g.where === 'gym' ? ' (Planet Fitness)' : ''}\nWalk ${C.walkTarget(lv().level)} min. ${S.targets.protein} g protein. CPAP tonight.`;
    if (pen) sys('PENALTY ZONE', `You failed yesterday's quests.\n\n${pen.text}\n\nThe System does not forget.`, [{ t: 'Accept penalty', cls: 'warn', f: () => { tab = 'quests'; render(); } }], true);
    else sys('DAILY QUEST ARRIVED', msg, [{ t: 'Accept', cls: 'go' }]);
  }
  launch();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
