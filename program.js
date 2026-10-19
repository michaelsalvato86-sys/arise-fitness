// ARISE program: Gates (workouts) and the weekly schedule. Built around high BP + sleep apnea:
// exhale on effort, never hold breath, no max lifts, talk-test pace, isometric holds daily.
(function (root) {
  const SAFETY = [
    'Breathe out on the hard part. Never hold your breath.',
    'Talk test: you can say a full sentence. If not, slow down.',
    'Stop and sit if you get chest pain, dizziness, or unusual shortness of breath. Call your doctor.',
    'Stand up slowly after floor work. Your BP can drop.',
    'If you take a beta blocker, ignore the heart rate number and use the talk test.'
  ];

  // sets/reps are the Week 1-2 base; progress() scales them
  const EX = {
    wallsit: { n: 'Wall Sit', hold: 30, cue: 'Back on wall, knees ~90 degrees. Breathe slow and steady.' },
    chairsquat: { n: 'Chair Squat', reps: 8, cue: 'Sit to a chair and stand. Exhale as you stand.' },
    inclinepush: { n: 'Counter Push-up', reps: 8, cue: 'Hands on counter or wall. Exhale as you push.' },
    bridge: { n: 'Glute Bridge', reps: 10, cue: 'Squeeze glutes at the top, exhale up.' },
    deadbug: { n: 'Dead Bug', reps: 6, cue: 'Opposite arm and leg, low back flat. Slow.' },
    birddog: { n: 'Bird Dog', reps: 6, cue: 'Reach long, keep hips level.' },
    plank: { n: 'Incline Plank', hold: 20, cue: 'Hands on counter, body straight line. Keep breathing.' },
    stepup: { n: 'Step-up', reps: 8, cue: 'Sturdy stair or step, each leg. Drive through the heel.' },
    latlunge: { n: 'Lateral Lunge', reps: 6, cue: 'Hockey hips. Sit back into one side, other leg straight.' },
    skater: { n: 'Skater Step', reps: 8, cue: 'Step side to side, low and controlled, no big hops yet.' },
    calfraise: { n: 'Calf Raise', reps: 12, cue: 'Hold a wall for balance.' },
    march: { n: 'High Knee March', hold: 40, cue: 'Marching in place, tall posture.' },
    legpress: { n: 'Leg Press Machine', reps: 10, cue: 'Light weight, smooth reps, exhale on the push. Do not lock knees.' },
    chestpress: { n: 'Chest Press Machine', reps: 10, cue: 'Light to moderate, exhale on the push.' },
    latpull: { n: 'Lat Pulldown', reps: 10, cue: 'Pull to upper chest, exhale on the pull.' },
    seatedrow: { n: 'Seated Row Machine', reps: 10, cue: 'Squeeze shoulder blades, exhale on the pull.' },
    shoulderpress: { n: 'Shoulder Press Machine', reps: 8, cue: 'Light. Do not strain, keep breathing.' },
    legcurl: { n: 'Leg Curl Machine', reps: 10, cue: 'Smooth and controlled.' },
    incline: { n: 'Treadmill Incline Walk', hold: 600, cue: '10 min, incline 3-6%, talk-test pace. Do not hold the rails hard.' },
    bike: { n: 'Recumbent Bike', hold: 600, cue: '10 min easy to moderate.' },
    handgrip: { n: 'Squeeze Hold', hold: 30, cue: 'Squeeze a towel or hand gripper at moderate effort, 30s each hand, breathe.' }
  };

  const GATES = {
    homeA: { id: 'homeA', name: 'Gate: Home Foundation', where: 'home', watch: 'Traditional Strength Training', min: 25,
      ex: ['wallsit', 'chairsquat', 'inclinepush', 'bridge', 'deadbug', 'march'], rounds: 2 },
    homeB: { id: 'homeB', name: 'Gate: Home Core + Hips', where: 'home', watch: 'Functional Strength Training', min: 25,
      ex: ['wallsit', 'stepup', 'bridge', 'birddog', 'plank', 'calfraise'], rounds: 2 },
    gymA: { id: 'gymA', name: 'Gate: Planet Fitness Push/Legs', where: 'gym', watch: 'Traditional Strength Training', min: 45,
      ex: ['bike', 'legpress', 'chestpress', 'shoulderpress', 'legcurl', 'wallsit'], rounds: 2 },
    gymB: { id: 'gymB', name: 'Gate: Planet Fitness Pull + Cardio', where: 'gym', watch: 'Traditional Strength Training', min: 45,
      ex: ['latpull', 'seatedrow', 'legpress', 'plank', 'incline'], rounds: 2 },
    puck: { id: 'puck', name: 'Gate: Ice Hockey Prep', where: 'home', watch: 'Hockey (check Add Workout list)', min: 25,
      ex: ['latlunge', 'skater', 'stepup', 'bridge', 'deadbug', 'wallsit'], rounds: 2 },
    walk: { id: 'walk', name: 'Gate: Cardio Walk', where: 'home', watch: 'Outdoor Walk', min: 30, ex: [], rounds: 0 },
    rest: { id: 'rest', name: 'Rest Day', where: 'home', watch: 'none', min: 0, ex: [], rounds: 0 }
  };

  // Planet Fitness Wed + Thu, everything else at home. Index 0=Sun.
  const WEEK = ['rest', 'homeA', 'homeB', 'gymA', 'gymB', 'walk', 'puck'];
  const DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  function gateForDate(date) { return GATES[WEEK[date.getDay()]]; }

  // Phase by week since signup: scales reps/holds
  function phase(weekIdx) {
    if (weekIdx < 2) return { name: 'Awakening', mult: 1, rounds: 0 };
    if (weekIdx < 6) return { name: 'Rising', mult: 1.25, rounds: 0 };
    if (weekIdx < 12) return { name: 'Hunter', mult: 1.5, rounds: 1 };
    return { name: 'Monarch', mult: 1.75, rounds: 1 };
  }

  function scaled(exKey, weekIdx) {
    const e = EX[exKey], p = phase(weekIdx);
    const o = { key: exKey, n: e.n, cue: e.cue };
    if (e.reps) o.reps = Math.round(e.reps * p.mult);
    if (e.hold) o.hold = e.hold >= 300 ? e.hold + Math.min(weekIdx, 12) * 30 : Math.round(e.hold * Math.min(p.mult, 1.5) / 5) * 5;
    return o;
  }

  function plan(gate, weekIdx) {
    return { gate, phase: phase(weekIdx), rounds: gate.rounds ? gate.rounds + phase(weekIdx).rounds : 0, ex: gate.ex.map(k => scaled(k, weekIdx)) };
  }

  // Default reminders. days = ICS codes.
  const REMINDERS = [
    { id: 'morning', title: 'Morning Quest: weigh in, then move', body: 'Weigh in, then do today\'s Gate. Open ARISE.', time: '07:00', days: ICS_DAYS, on: true },
    { id: 'meal', title: 'Fuel check: protein', body: 'Hit your protein. Log it in ARISE.', time: '12:30', days: ICS_DAYS, on: true },
    { id: 'evening', title: 'Evening Quest: finish the Gate', body: 'Daily quest is not done. Penalty Zone awaits if you skip.', time: '18:30', days: ICS_DAYS, on: true },
    { id: 'sleep', title: 'Recovery: CPAP and bed', body: 'CPAP on. Sleep is part of the training.', time: '22:00', days: ICS_DAYS, on: true }
  ];

  const LINES = [
    'You have been selected. Get up.',
    'The System does not care how you feel. Move anyway.',
    'Weak hunters make excuses. Arise.',
    'Ten minutes. Just start. The rest follows.',
    'Every rep is XP. Every skipped day is a penalty.',
    'The old you stays in the E-rank. Leave him there.',
    'Hockey does not play itself. Get your legs back.',
    'Your heart is on the line. This is the real dungeon.'
  ];

  const api = { SAFETY, EX, GATES, WEEK, DAYNAMES, ICS_DAYS, gateForDate, phase, plan, scaled, REMINDERS, LINES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Program = api;
})(typeof window !== 'undefined' ? window : globalThis);
