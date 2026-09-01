/* ============================================================
   MyTrainer — single-file vanilla app (no build step)
   Data: localStorage per profile.  Design: Bodies By Mel style.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Profile & theme ---------- */
  var PROFILE = (window.MYTRAINER_PROFILE || "guest").toLowerCase();
  var KEY = "mytrainer:v1:" + PROFILE;
  var THEME_BY_PROFILE = { char: "pink", adam: "blue" };

  /* ---------- Small utils ---------- */
  var $app = document.getElementById("app");
  function uid() { return Math.random().toString(36).slice(2, 9) + (seedCounter++).toString(36); }
  var seedCounter = 0;
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }

  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function dateKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function today() { return new Date(); }
  function todayKey() { return dateKey(today()); }
  function parseKey(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function planDow(d) { return (d.getDay() + 6) % 7; } // 0=Mon..6=Sun
  function fmtShort(d) { return DAYS[planDow(d)] + " " + d.getDate() + " " + MON[d.getMonth()]; }
  function daysBetween(a, b) { // whole days from a→b (dates)
    var ms = parseKey(dateKey(b)) - parseKey(dateKey(a));
    return Math.round(ms / 86400000);
  }
  function e1rm(w, r) { if (!w || !r) return 0; return w * (1 + r / 30); } // Epley
  function round1(n) { return Math.round(n * 10) / 10; }
  function fmtDur(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? pad(h) + ":" : "") + pad(m) + ":" + pad(s);
  }
  function fmtRest(sec) {
    if (!sec) return "—";
    var m = Math.floor(sec / 60), s = sec % 60;
    if (m && s) return m + "m " + s + "s";
    if (m) return m + "m";
    return s + "s";
  }

  /* ---------- State / storage ---------- */
  var S = null;      // persisted profile data (workouts, plan, logs, weights, settings)
  var EX = null;     // SHARED exercise library (same for Adam & Char on this device)
  var SHARED_KEY = "mytrainer:v1:exercises";
  var SEED_VERSION = 2; // bump to refresh the starter program on existing (unused) profiles
  var UI = { route: locationRoute(), toast: null, expanded: {} }; // transient

  function save() { var ok = true; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { ok = false; } Cloud.scheduleProfile(); return ok; }
  function saveEx() { var ok = true; try { localStorage.setItem(SHARED_KEY, JSON.stringify(EX)); } catch (e) { ok = false; } Cloud.scheduleEx(); return ok; }

  /* ============================================================
     CLOUD SYNC — Firebase Realtime Database (optional).
     Source of truth when configured; localStorage is the offline cache.
     Enabled by filling window.MYTRAINER_FIREBASE (app/firebase-config.js).
     ============================================================ */
  var Cloud = {
    ready: false, db: null, pRef: null, eRef: null,
    lastP: null, lastE: null, pTimer: null, eTimer: null,
    init: function () {
      if (this.ready) return true;
      if (!window.MYTRAINER_FIREBASE || !window.firebase || !window.firebase.database) return false;
      try {
        if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(window.MYTRAINER_FIREBASE);
        this.db = firebase.database();
        this.pRef = this.db.ref("profiles/" + PROFILE);
        this.eRef = this.db.ref("exercises");
        this.ready = true;
        return true;
      } catch (e) { this.ready = false; return false; }
    },
    start: function () {
      if (!this.ready) return;
      var self = this, firstP = true, firstE = true;
      this.eRef.on("value", function (snap) {
        var v = snap.val();
        if (firstE) { firstE = false; if (v != null) adoptEx(v); else self.pushEx(); return; }
        if (v != null && JSON.stringify(v) !== self.lastE) adoptEx(v);
      }, function () {});
      this.pRef.on("value", function (snap) {
        var v = snap.val();
        if (firstP) { firstP = false; if (v != null) adoptProfile(v); else self.pushProfile(); return; }
        if (v != null && JSON.stringify(v) !== self.lastP) adoptProfile(v);
      }, function () {});
    },
    scheduleProfile: function () { if (!this.ready) return; var s = this; clearTimeout(this.pTimer); this.pTimer = setTimeout(function () { s.pushProfile(); }, 700); },
    scheduleEx: function () { if (!this.ready) return; var s = this; clearTimeout(this.eTimer); this.eTimer = setTimeout(function () { s.pushEx(); }, 700); },
    pushProfile: function () { if (!this.ready) return; try { this.lastP = JSON.stringify(S); this.pRef.set(JSON.parse(this.lastP)); } catch (e) {} },
    pushEx: function () { if (!this.ready) return; try { this.lastE = JSON.stringify(EX); this.eRef.set(JSON.parse(this.lastE)); } catch (e) {} }
  };
  function asArray(v) { return Array.isArray(v) ? v : (v && typeof v === "object" ? Object.keys(v).map(function (k) { return v[k]; }) : []); }
  function adoptProfile(val) {
    Cloud.lastP = JSON.stringify(val);
    S = val;
    applyProfileDefaults();
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    applyTheme();
    safeRerender();
  }
  function adoptEx(val) {
    Cloud.lastE = JSON.stringify(val);
    EX = asArray(val);
    try { localStorage.setItem(SHARED_KEY, JSON.stringify(EX)); } catch (e) {}
    safeRerender();
  }
  function safeRerender() {
    var ae = document.activeElement;
    if (ae && ae.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.closest && ae.closest("#app")) return; // don't yank focus mid-edit
    render();
    if (UI.route.name === "home") scrollStrip();
  }
  // Defaults / array normalisation (RTDB drops empty arrays to null).
  function applyProfileDefaults() {
    S = S || {};
    S.settings = S.settings || {};
    if (S.settings.unit == null) S.settings.unit = "kg";
    if (S.settings.restDefault == null) S.settings.restDefault = 75;
    if (!S.settings.theme) S.settings.theme = THEME_BY_PROFILE[PROFILE] || "pink";
    if (S.settings.dark == null) S.settings.dark = false;
    if (!S.settings.displayName) S.settings.displayName = PROFILE.charAt(0).toUpperCase() + PROFILE.slice(1);
    S.workouts = asArray(S.workouts);
    S.logs = asArray(S.logs);
    S.weights = asArray(S.weights);
    if (!S.plan) S.plan = emptyPlan();
    S.plan.weeks = asArray(S.plan.weeks);
    S.plan.weeks.forEach(function (wk) { for (var i = 0; i < 7; i++) { wk[i] = asArray(wk[i]); } });
    S.workouts.forEach(function (w) { w.items = asArray(w.items); });
    S.logs.forEach(function (l) { l.items = asArray(l.items); l.items.forEach(function (it) { it.sets = asArray(it.sets); }); });
  }

  function normName(n) { return String(n == null ? "" : n).trim().toLowerCase().replace(/\s+/g, " "); }
  function findExByName(n) { var k = normName(n); for (var i = 0; i < EX.length; i++) if (normName(EX[i].name) === k) return EX[i]; return null; }
  function exIdByName(n) { var e = findExByName(n); return e ? e.id : null; }

  function loadEx() {
    var raw = null; try { raw = localStorage.getItem(SHARED_KEY); } catch (e) {}
    if (raw) { try { EX = JSON.parse(raw); } catch (e) { EX = null; } }
    if (!EX) { EX = seedExercises(); saveEx(); }
  }
  // Make sure every current seed exercise exists in the shared library (add missing by name).
  function ensureSeedExercises() {
    var added = false;
    seedExercises().forEach(function (se) { if (!findExByName(se.name)) { EX.push(se); added = true; } });
    if (added) saveEx();
  }

  // Merge any legacy per-profile exercises into the shared library, remapping references.
  function migrateProfileExercises() {
    if (S.exercises && S.exercises.length) {
      var remap = {};
      S.exercises.forEach(function (e) {
        var m = findExByName(e.name);
        if (m) { if (m.id !== e.id) remap[e.id] = m.id; }
        else { EX.push(e); }
      });
      if (Object.keys(remap).length) {
        (S.workouts || []).forEach(function (w) { (w.items || []).forEach(function (it) { if (remap[it.exerciseId]) it.exerciseId = remap[it.exerciseId]; }); });
        (S.logs || []).forEach(function (l) { (l.items || []).forEach(function (it) { if (remap[it.exerciseId]) it.exerciseId = remap[it.exerciseId]; }); });
        if (S.active) (S.active.items || []).forEach(function (it) { if (remap[it.exerciseId]) it.exerciseId = remap[it.exerciseId]; });
      }
      saveEx();
    }
    if (S.exercises) delete S.exercises;
  }

  function load() {
    loadEx();
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (raw) { try { S = JSON.parse(raw); } catch (e) { S = null; } }
    if (!S) { S = seed(); save(); }
    applyProfileDefaults();
    migrateProfileExercises();
    // Legacy: convert an old in-progress S.active into a saved session log.
    if (S.active && S.active.items) {
      var la = S.active, adk = la.startedAt ? dateKey(new Date(la.startedAt)) : todayKey();
      if (!findSession(adk, la.workoutId)) {
        S.logs.push({
          id: uid(), workoutId: la.workoutId, name: la.name, date: adk, startedAt: la.startedAt || Date.now(),
          items: (la.items || []).map(function (it) {
            return {
              exerciseId: it.exerciseId, name: it.name, section: it.section, reps: it.reps, rest: it.rest,
              tempo: it.tempo, bw: it.bw, note: it.note, videoUrl: it.videoUrl || "", icon: it.icon || "",
              sets: (it.sets || []).map(function (s) { return { weight: s.weight || "", reps: s.reps || "" }; })
            };
          })
        });
      }
      delete S.active;
    }
    // Refresh the starter program to the current seed (accurate Bodies By Mel split).
    // Safe: only replaces workouts/plan when the profile has never logged a workout;
    // a used profile just gets any missing seed workouts added (no data lost).
    if (S.seedVersion !== SEED_VERSION) {
      ensureSeedExercises();
      var fresh = seed();
      if (!S.logs || S.logs.length === 0) {
        S.workouts = fresh.workouts;
        S.plan = fresh.plan;
      } else {
        fresh.workouts.forEach(function (fw) {
          if (!S.workouts.some(function (x) { return x.name === fw.name; })) S.workouts.push(fw);
        });
      }
      S.seedVersion = SEED_VERSION;
    }
    save();
    applyTheme();
  }
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", S.settings.theme || "pink");
    document.documentElement.setAttribute("data-mode", S.settings.dark ? "dark" : "light");
  }
  function unit() { return S.settings.unit; }

  function emptyPlan() {
    var wk = {}; for (var i = 0; i < 7; i++) wk[i] = [];
    return { name: "My Plan", startDate: todayKey(), repeat: true, weeks: [wk] };
  }

  /* ---------- Seed data ---------- */
  function ex(name, muscle, opts) {
    opts = opts || {};
    return { id: uid(), name: name, muscle: muscle || "", videoUrl: opts.video || "", note: opts.note || "", bw: !!opts.bw };
  }
  function item(exId, o) {
    o = o || {};
    return {
      id: uid(), exerciseId: exId, section: o.section || "Workout",
      sets: o.sets || 3, reps: o.reps || "12", rest: o.rest != null ? o.rest : 75,
      tempo: o.tempo || "", bw: !!o.bw, note: o.note || "", target: o.target || ""
    };
  }
  // Bodies By Mel — exact exercises from Char's 3-day split (reference photos)
  function seedExercises() {
    var list = [];
    [
      ["Cable Rope Face Pulls", "Back / Rear delts"],
      ["Shoulder Press Machine", "Shoulders"], ["DB Lateral Raises", "Shoulders"],
      ["Rope Tricep Pushdown", "Triceps"], ["Tricep Dips Machine", "Triceps"],
      ["DB Bicep Curl", "Biceps"], ["Dual Cable Bicep Curls", "Biceps"],
      ["Pre Workout Stretches", "Mobility", { bw: true }], ["Banded Crab Walks", "Glutes", { bw: true }],
      ["Barbell Glute Drive / Hip Thrusts", "Glutes"], ["Lying Hamstring Curls", "Hamstrings"],
      ["Leg Press", "Quads"], ["Abductor", "Glutes"], ["Hyper Extension", "Lower back"],
      ["Smith Machine Squats", "Quads"], ["DB RDL", "Hamstrings"], ["Adductor", "Adductors"]
    ].forEach(function (r) { list.push(ex(r[0], r[1], r[2] || {})); });
    return list;
  }
  function seed() {
    var s = {
      profile: PROFILE,
      settings: {
        displayName: PROFILE.charAt(0).toUpperCase() + PROFILE.slice(1),
        unit: "kg", restDefault: 75, theme: THEME_BY_PROFILE[PROFILE] || "pink", dark: false
      },
      workouts: [], logs: [], weights: [], plan: emptyPlan(), seedVersion: SEED_VERSION
    };
    function I(name, o) { return item(exIdByName(name), o); }

    // Workout 1 — Tricep / Bicep / Shoulders
    s.workouts.push({
      id: uid(), name: "Tricep / Bicep / Shoulders",
      items: [
        I("Cable Rope Face Pulls", { sets: 3, reps: "15", rest: 75, note: "Squeeze the back at the end of the movement." }),
        I("Shoulder Press Machine", { sets: 2, reps: "4-4-4", rest: 180, note: "Cluster set: 4, rest 10s, 4, rest 10s, finish 4." }),
        I("DB Lateral Raises", { sets: 3, reps: "10", rest: 75, note: "Don't throw the weight or shrug your neck." }),
        I("Rope Tricep Pushdown", { sets: 4, reps: "12-15", rest: 75, note: "Keep shoulders stationary, only use elbows." }),
        I("Tricep Dips Machine", { sets: 3, reps: "10", rest: 75 }),
        I("DB Bicep Curl", { sets: 2, reps: "12", rest: 75, note: "Don't use shoulders to pull the weight up, squeeze." }),
        I("Dual Cable Bicep Curls", { sets: 2, reps: "10", rest: 75, note: "Squeeze the bicep as you come up." })
      ]
    });
    // Workout 2 — Glutes and Hamstrings
    s.workouts.push({
      id: uid(), name: "Glutes and Hamstrings",
      items: [
        I("Pre Workout Stretches", { section: "Warm Up", sets: 1, reps: "1", rest: 0, bw: true, note: "Repeat each side, hold each stretch for 20–30s." }),
        I("Banded Crab Walks", { section: "Warm Up", sets: 2, reps: "20", rest: 0, bw: true, note: "Slight squat position, keep tension on the band." }),
        I("Barbell Glute Drive / Hip Thrusts", { sets: 3, reps: "15", rest: 75, tempo: "3-0-0-1", note: "Use your glutes to drive the weight up." }),
        I("Lying Hamstring Curls", { sets: 3, reps: "10-12", rest: 75, note: "Keep hips pressed into the pad." }),
        I("Leg Press", { sets: 2, reps: "12", rest: 180, tempo: "3-0-0-1", note: "Full depth, no partial reps. Don't lock knees." }),
        I("Abductor", { sets: 2, reps: "16", rest: 120, note: "8 normal reps, 8 slightly leaning forward." }),
        I("Hyper Extension", { sets: 2, reps: "12", rest: 75, note: "Use your glutes to pull yourself up." })
      ]
    });
    // Workout 3 — Posterior / Quads
    s.workouts.push({
      id: uid(), name: "Posterior / Quads",
      items: [
        I("Smith Machine Squats", { sets: 2, reps: "12", rest: 120, tempo: "3-0-0-1", note: "Feet closer together to target quads." }),
        I("DB RDL", { sets: 2, reps: "12", rest: 80, note: "Slight bend in the knees, slow and controlled." }),
        I("Adductor", { sets: 2, reps: "10-12", rest: 75, note: "Hold at the inner movement." })
      ]
    });
    // Plan — Mon: Glutes & Hams · Wed: Tricep/Bicep/Shoulders · Fri: Posterior/Quads
    var wk = {}; for (var i = 0; i < 7; i++) wk[i] = [];
    wk[0] = [s.workouts[1].id]; // Monday   — Glutes and Hamstrings
    wk[2] = [s.workouts[0].id]; // Wednesday — Tricep / Bicep / Shoulders
    wk[4] = [s.workouts[2].id]; // Friday    — Posterior / Quads
    s.plan = { name: "3 Day Split", startDate: todayKey(), repeat: true, weeks: [wk] };
    return s;
  }

  /* ---------- Lookups ---------- */
  function exById(id) { for (var i = 0; i < EX.length; i++) if (EX[i].id === id) return EX[i]; return null; }
  // Parse a video URL into { kind, embed, thumb } for thumbnails + in-app playback.
  function videoInfo(url) {
    if (!url) return null;
    url = String(url).trim();
    var yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{6,})/);
    if (yt) return { kind: "youtube", embed: "https://www.youtube.com/embed/" + yt[1] + "?autoplay=1&playsinline=1&rel=0", thumb: "https://img.youtube.com/vi/" + yt[1] + "/hqdefault.jpg" };
    var vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vm) return { kind: "vimeo", embed: "https://player.vimeo.com/video/" + vm[1] + "?autoplay=1", thumb: null };
    if (/\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i.test(url)) return { kind: "file", embed: url, thumb: null };
    return { kind: "other", embed: url, thumb: null };
  }
  // Thumbnail inner HTML: uploaded icon > video thumbnail (with play) > video play glyph > dumbbell
  function exIconInner(e) {
    if (e && e.icon) return '<img class="exicon" src="' + e.icon + '" alt="">';
    var v = e && e.videoUrl ? videoInfo(e.videoUrl) : null;
    if (v && v.thumb) return '<img class="exicon" src="' + esc(v.thumb) + '" alt="" onerror="this.remove()"><span class="play">▶</span>';
    if (v) return '<span class="play">▶</span>';
    return "🏋️";
  }
  function exLeadInner(e) {
    if (e && e.icon) return '<img class="exicon" src="' + e.icon + '" alt="">';
    var v = e && e.videoUrl ? videoInfo(e.videoUrl) : null;
    if (v && v.thumb) return '<img class="exicon" src="' + esc(v.thumb) + '" alt="" onerror="this.remove()">';
    return "🏋️";
  }
  // Full thumb element (with click-to-play when there's a video).
  function thumbTag(e) {
    var vid = e && e.videoUrl ? e.videoUrl : "";
    return vid
      ? '<div class="thumb has-video" data-playvideo="' + esc(vid) + '">' + exIconInner(e) + "</div>"
      : '<div class="thumb">' + exIconInner(e) + "</div>";
  }
  function exName(id) { var e = exById(id); return e ? e.name : "Exercise"; }
  function workoutById(id) { for (var i = 0; i < S.workouts.length; i++) if (S.workouts[i].id === id) return S.workouts[i]; return null; }
  function logById(id) { for (var i = 0; i < S.logs.length; i++) if (S.logs[i].id === id) return S.logs[i]; return null; }

  /* ---------- Plan helpers ---------- */
  function weekIndexFor(d) {
    var p = S.plan; var n = p.weeks.length || 1;
    var diff = daysBetween(parseKey(p.startDate), d);
    if (diff < 0) return 0;
    var w = Math.floor(diff / 7);
    return p.repeat ? (w % n) : clamp(w, 0, n - 1);
  }
  function workoutsForDate(d) {
    var p = S.plan; if (!p || !p.weeks.length) return [];
    if (!p.repeat && daysBetween(parseKey(p.startDate), d) >= p.weeks.length * 7) return [];
    var wk = p.weeks[weekIndexFor(d)] || {};
    var ids = wk[planDow(d)] || [];
    return ids.map(workoutById).filter(Boolean);
  }
  function nextWorkout() {
    // today first, else scan forward up to 14 days
    for (var i = 0; i < 14; i++) {
      var d = new Date(); d.setDate(d.getDate() + i);
      var ws = workoutsForDate(d);
      if (ws.length) return { date: d, workout: ws[0], offset: i };
    }
    return null;
  }

  /* ---------- Check-in / streak ---------- */
  function weightOn(key) { for (var i = 0; i < S.weights.length; i++) if (S.weights[i].date === key) return S.weights[i]; return null; }
  function workoutDoneOn(key) { for (var i = 0; i < S.logs.length; i++) if (S.logs[i].date === key) return true; return false; }
  function checkedIn(key) { return !!weightOn(key) || workoutDoneOn(key); }
  function streak() {
    var d = new Date(), n = 0;
    // if today not checked in yet, streak counts back from yesterday
    if (!checkedIn(dateKey(d))) d.setDate(d.getDate() - 1);
    for (var i = 0; i < 400; i++) {
      if (checkedIn(dateKey(d))) { n++; d.setDate(d.getDate() - 1); } else break;
    }
    return n;
  }

  /* ---------- Personal bests ---------- */
  function bestForExercise(exId, excludeLogId) {
    var best = { weight: 0, reps: 0, e1rm: 0, wAt: null };
    S.logs.forEach(function (lg) {
      if (excludeLogId && lg.id === excludeLogId) return;
      lg.items.forEach(function (it) {
        if (it.exerciseId !== exId) return;
        it.sets.forEach(function (st) {
          var w = num(st.weight) || 0, r = num(st.reps) || 0;
          if (!w && !r) return;
          if (w > best.weight) { best.weight = w; best.wAt = r; }
          if (r > best.reps) best.reps = r;
          var e = e1rm(w, r); if (e > best.e1rm) best.e1rm = e;
        });
      });
    });
    return best;
  }

  // Most recent PRIOR logged performance of an exercise: { date, sets:[{reps,weight}] }
  function lastPerformance(exId) {
    var logs = S.logs.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : (a.date > b.date ? -1 : (b.startedAt || 0) - (a.startedAt || 0));
    });
    for (var i = 0; i < logs.length; i++) {
      var it = null;
      for (var j = 0; j < logs[i].items.length; j++) {
        if (logs[i].items[j].exerciseId === exId) { it = logs[i].items[j]; break; }
      }
      if (it) {
        var used = it.sets.filter(function (s) {
          return (s.reps != null && s.reps !== "") || (s.weight != null && s.weight !== "");
        });
        if (used.length) return { date: logs[i].date, sets: used };
      }
    }
    return null;
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function h(strings) { return strings; } // marker only

  function render() {
    var r = UI.route;
    var body = "", chrome = "";
    switch (r.name) {
      case "home": body = viewHome(); break;
      case "plan": body = viewPlan(); break;
      case "planEdit": body = viewPlanEdit(); break;
      case "progress": body = viewProgress(); break;
      case "exProgress": body = viewExProgress(r.id); break;
      case "weight": body = viewWeight(); break;
      case "more": body = viewMore(); break;
      case "workouts": body = viewWorkouts(); break;
      case "workoutEdit": body = viewWorkoutEdit(r.id); break;
      case "exercises": body = viewExercises(); break;
      case "exerciseEdit": body = viewExerciseEdit(r.id); break;
      case "history": body = viewHistory(); break;
      case "settings": body = viewSettings(); break;
      case "session": body = viewSession(); break;
      default: body = viewHome();
    }
    var showTabs = ["home", "plan", "progress", "weight", "more"].indexOf(r.name) >= 0;
    $app.innerHTML = body + (showTabs ? tabbar(r.name) : "");
    if (r.name === "session") renderRestTimer();
    if (r.name === "home") scrollStrip();
  }
  function scrollStrip() {
    var apply = function () {
      var strip = document.getElementById("daystrip"); if (!strip) return;
      var cell = strip.querySelector(".daycell.selected") || strip.querySelector(".daycell.today");
      if (cell) strip.scrollLeft = Math.max(0, cell.offsetLeft - strip.clientWidth / 2 + cell.clientWidth / 2);
    };
    apply();
    if (window.requestAnimationFrame) requestAnimationFrame(apply);
  }

  function tabbar(active) {
    function t(route, ico, label) {
      return '<button data-nav="' + route + '" class="' + (active === route ? "on" : "") + '">' +
        '<span class="ico">' + ico + '</span>' + label + '</button>';
    }
    return '<nav class="tabbar">' +
      t("home", "🏠", "Home") +
      t("plan", "🗓️", "Plan") +
      t("progress", "📈", "Progress") +
      t("weight", "⚖️", "Weight") +
      t("more", "⋯", "More") +
      '</nav>';
  }

  function topbar(title, opts) {
    opts = opts || {};
    return '<header class="topbar">' +
      (opts.back ? '<button class="back" data-back="' + esc(opts.back) + '">‹</button>' : "") +
      '<div class="title">' + esc(title) + "</div>" +
      (opts.right || "") + "</header>";
  }

  /* ---------- HOME ---------- */
  function sessionComplete(log) { var p = sessionProgress(log); return p.total > 0 && p.done === p.total; }
  function dayStatus(dk, d) {
    var ws = workoutsForDate(d);
    if (!ws.length) return weightOn(dk) ? "done" : "rest"; // rest day ticks once a weight is logged
    var anyDone = false, anyProg = false;
    ws.forEach(function (w) { var s = findSession(dk, w.id); if (s) { if (sessionComplete(s)) anyDone = true; else anyProg = true; } });
    return anyDone ? "done" : (anyProg ? "progress" : "todo");
  }
  function workoutStreak() {
    var n = 0, d = new Date();
    for (var i = 0; i < 400; i++) {
      var dk = dateKey(d), ws = workoutsForDate(new Date(d));
      if (ws.length) {
        var done = ws.some(function (w) { var s = findSession(dk, w.id); return s && sessionComplete(s); });
        if (done) n++;
        else if (i !== 0) break;   // a past scheduled day left undone breaks the streak (today still pending is OK)
      }
      d.setDate(d.getDate() - 1);
    }
    return n;
  }
  function fmtNiceDate(d) { return DAYS_FULL[planDow(d)] + " " + d.getDate() + " " + MON[d.getMonth()]; }
  function buildDayStrip(sel) {
    var cells = "", start = new Date(); start.setDate(start.getDate() - 30);
    for (var i = 0; i < 38; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      var dk = dateKey(d), isToday = dk === todayKey(), isSel = dk === sel, st = dayStatus(dk, d);
      cells += '<button class="daycell' + (isSel ? " selected" : "") + (isToday ? " today" : "") + '" data-day="' + dk + '">' +
        '<div class="dot ' + st + '">' + (st === "done" ? "✓" : "") + "</div>" +
        '<div class="dow">' + DAYS[planDow(d)].toUpperCase() + "</div>" +
        '<div class="dnum">' + d.getDate() + "</div></button>";
    }
    return '<div class="strip" id="daystrip">' + cells + "</div>";
  }

  function viewHome() {
    var name = S.settings.displayName;
    var initials = name.split(/\s+/).map(function (x) { return x[0]; }).join("").slice(0, 2).toUpperCase();
    var sel = UI.selectedDate || todayKey();
    var selDate = parseKey(sel), isToday = sel === todayKey();
    var todays = workoutsForDate(selDate);
    var wOnSel = weightOn(sel), wAsOf = weightAsOf(sel);
    var w = wOnSel || wAsOf; // show the selected day's weight, else the most recent up to it
    var wchart = weightSparkline();
    var streakN = workoutStreak();

    var dayHtml;
    if (!todays.length) {
      dayHtml = '<div class="card" style="text-align:center;padding:26px 16px">' +
        '<div style="font-size:34px">😌</div><b style="font-size:18px">Rest day</b>' +
        '<div class="muted" style="font-size:14px;margin-top:2px">No workout scheduled &mdash; recover well.</div></div>';
    } else {
      dayHtml = todays.map(function (wk) {
        var s = findSession(sel, wk.id);
        var pr = s ? sessionProgress(s) : null;
        var complete = pr && pr.total > 0 && pr.done === pr.total;
        var status = complete ? "✓ Completed · tap to edit" : (s ? "In progress · " + pr.done + "/" + pr.total : (isToday ? "Tap to start" : "Tap to log"));
        return '<div class="card actioncard' + (complete ? " done" : "") + (isToday ? " today-tint" : "") + '" data-open="' + wk.id + '" data-date="' + sel + '">' +
          '<div class="txt"><small>' + esc(S.plan.name) + " · " + (isToday ? "Today" : fmtNiceDate(selDate)) + "</small>" +
          "<b>" + esc(wk.name) + "</b>" +
          '<span class="muted" style="font-size:12.5px">' + status + "</span></div>" +
          (complete ? '<span class="donebadge">✓</span>' : "<span class='chev'>›</span>") + "</div>";
      }).join("");
    }

    return '<header class="appbar">' +
      '<div class="logo">' + esc(initials) + "</div>" +
      '<div class="hi"><small>Hi there</small><b>' + esc(name) + "</b></div>" +
      '<button class="iconbtn" data-nav="settings">⚙️</button>' +
      "</header>" +
      '<div class="view">' +
      '<div class="section-label">Calendar</div>' +
      buildDayStrip(sel) +
      '<div class="streak">' + (streakN > 0 ? "🔥 " + streakN + " day streak" : "No streak yet &mdash; finish a workout") + "</div>" +

      '<div class="between" style="margin:18px 2px 10px">' +
      '<div class="section-label" style="margin:0">' + (isToday ? "Today’s Workout" : esc(fmtNiceDate(selDate))) + "</div>" +
      (isToday ? "" : '<button class="btn sm soft" data-day="' + todayKey() + '">Jump to today</button>') +
      "</div>" +
      dayHtml +

      '<div class="section-label">Progress</div>' +
      '<div class="tiles">' +
      '<div class="tile" data-nav="weight"><div class="k">Weight</div>' +
      '<div class="v">' + (w ? w.weight + ' <small>' + unit() + "</small>" : "—") + "</div>" +
      '<div class="cap">' + (w ? (wOnSel ? (isToday ? "Today" : esc(fmtNiceDate(selDate))) : "as of " + relDay(w.date).toLowerCase()) : (isToday ? "Tap to log" : "No weight this day")) + "</div>" +
      (wchart || "") + "</div>" +
      '<div class="tile" data-nav="progress"><div class="k">This Week</div>' +
      '<div class="v">' + workoutsThisWeek() + ' <small>workouts</small></div>' +
      '<div class="cap">Tap for progress</div></div>' +
      "</div>" +
      "</div>";
  }
  function relDay(k) {
    var diff = daysBetween(parseKey(k), today());
    if (diff === 0) return "Today"; if (diff === 1) return "Yesterday";
    return diff + " days ago";
  }
  function latestWeight() {
    if (!S.weights.length) return null;
    return S.weights.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
  }
  // Weight logged on dk, else the most recent one on or before dk.
  function weightAsOf(dk) {
    var best = null;
    S.weights.forEach(function (x) { if (x.date <= dk && (!best || x.date > best.date)) best = x; });
    return best;
  }
  function workoutsThisWeek() {
    var now = new Date(); var start = new Date(); start.setDate(now.getDate() - planDow(now));
    var sk = dateKey(start), n = 0;
    S.logs.forEach(function (l) { if (l.date >= sk) n++; });
    return n;
  }
  function weightSparkline() {
    var pts = S.weights.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-8);
    if (pts.length < 2) return "";
    return miniLine(pts.map(function (p) { return p.weight; }), 210, 54);
  }

  /* ---------- Chart helpers ---------- */
  function miniLine(vals, w, hgt) {
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max === min) { max += 1; min -= 1; }
    var pad = 4, W = w, H = hgt;
    function x(i) { return pad + i * (W - 2 * pad) / (vals.length - 1); }
    function y(v) { return H - pad - (v - min) / (max - min) * (H - 2 * pad); }
    var d = "", area = "M" + x(0) + "," + (H - pad);
    vals.forEach(function (v, i) { d += (i ? "L" : "M") + round1(x(i)) + "," + round1(y(v)) + " "; area += "L" + round1(x(i)) + "," + round1(y(v)) + " "; });
    area += "L" + x(vals.length - 1) + "," + (H - pad) + "Z";
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" style="margin-top:10px">' +
      '<path class="area" d="' + area + '"/><path class="line" d="' + d + '"/></svg>';
  }
  function fullLine(points, opts) {
    // points: [{label, value}].  opts.unit -> appended to y-axis labels.
    opts = opts || {};
    if (points.length < 2) return '<div class="empty">Not enough data yet.</div>';
    var u = opts.unit ? " " + opts.unit : "";
    var vals = points.map(function (p) { return p.value; });
    var dmin = Math.min.apply(null, vals), dmax = Math.max.apply(null, vals);
    var pad = (dmax - dmin) || Math.max(1, dmax * 0.1);
    var min = dmin - pad * 0.18, max = dmax + pad * 0.18;
    if (min < 0 && dmin >= 0) min = 0;
    var W = 340, H = 194, padL = 42, padR = 14, padT = 12, padB = 28;
    function x(i) { return padL + i * (W - padL - padR) / (points.length - 1); }
    function y(v) { return padT + (max - v) / (max - min) * (H - padT - padB); }
    function fmtY(v) { return (Math.abs(v) >= 20 ? Math.round(v) : round1(v)) + u; }

    // horizontal gridlines + y-axis value labels (actual weight / 1RM)
    var grid = "", TICKS = 4;
    for (var t = 0; t < TICKS; t++) {
      var gv = min + (max - min) * (t / (TICKS - 1));
      var gy = round1(y(gv));
      grid += '<line class="grid" x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '"/>' +
        '<text class="lbl" x="' + (padL - 6) + '" y="' + (gy + 3.5) + '" text-anchor="end">' + esc(fmtY(gv)) + "</text>";
    }
    var d = "", area = "M" + x(0) + "," + (H - padB);
    points.forEach(function (p, i) { d += (i ? "L" : "M") + round1(x(i)) + "," + round1(y(p.value)) + " "; area += "L" + round1(x(i)) + "," + round1(y(p.value)) + " "; });
    area += "L" + x(points.length - 1) + "," + (H - padB) + "Z";
    var dots = "", labels = "", step = Math.max(1, Math.ceil(points.length / 4));
    points.forEach(function (p, i) {
      dots += '<circle class="dot" cx="' + round1(x(i)) + '" cy="' + round1(y(p.value)) + '" r="3"/>';
      if (i % step === 0 || i === points.length - 1) {
        var anchor = i === 0 ? "start" : (i === points.length - 1 ? "end" : "middle");
        labels += '<text class="lbl" x="' + round1(x(i)) + '" y="' + (H - 8) + '" text-anchor="' + anchor + '">' + esc(p.label) + "</text>";
      }
    });
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet">' +
      grid + '<path class="area" d="' + area + '"/><path class="line" d="' + d + '"/>' + dots + labels + "</svg>";
  }

  /* ---------- PLAN ---------- */
  function viewPlan() {
    var p = S.plan;
    var todayIdx = planDow(today());
    var curWeek = weekIndexFor(today());
    var weekStart = new Date(); weekStart.setDate(weekStart.getDate() - todayIdx);
    var rows = "";
    for (var i = 0; i < 7; i++) {
      var ids = (p.weeks[curWeek] || {})[i] || [];
      var ws = ids.map(workoutById).filter(Boolean);
      var isToday = i === todayIdx;
      var dd = new Date(weekStart); dd.setDate(weekStart.getDate() + i);
      var dk = dateKey(dd);
      rows += '<div class="planday' + (ws.length ? "" : " isrest") + (isToday ? " istoday" : "") + '">' +
        '<div class="dname">' + DAYS[i].toUpperCase() + "</div>" +
        '<div class="content">' +
        (ws.length ? ws.map(function (w) {
          var s = findSession(dk, w.id); var pr = s ? sessionProgress(s) : null;
          var done = pr && pr.total > 0 && pr.done === pr.total;
          return '<div class="w" data-open="' + w.id + '" data-date="' + dk + '">' + (done ? "✓ " : "") + esc(w.name) + "</div>";
        }).join("") : '<div class="w">Rest day</div>') +
        "</div>" + (ws.length ? '<span class="chev">›</span>' : "") + "</div>";
    }
    return topbar("Plan", { right: '<button class="btn sm soft" data-nav="planEdit">Edit</button>' }) +
      '<div class="view">' +
      '<div class="h1">' + esc(p.name) + "</div>" +
      '<div class="sub">' + (p.weeks.length > 1 ? p.weeks.length + "-week rotation" : "Weekly") +
      (p.repeat ? " · repeats" : "") + " · starts " + esc(p.startDate) +
      (p.weeks.length > 1 ? " · currently week " + (curWeek + 1) : "") + "</div>" +
      '<div class="card">' + rows + "</div>" +
      '<button class="btn soft" data-nav="planEdit">Edit plan</button>' +
      "</div>";
  }

  function viewPlanEdit() {
    var p = S.plan;
    UI.planWeek = UI.planWeek != null ? clamp(UI.planWeek, 0, p.weeks.length - 1) : 0;
    var wIdx = UI.planWeek;
    var weekTabs = "";
    if (p.weeks.length > 1) {
      weekTabs = '<div class="seg" style="margin:10px 0">';
      for (var i = 0; i < p.weeks.length; i++)
        weekTabs += '<button class="' + (i === wIdx ? "on" : "") + '" data-planweek="' + i + '">Week ' + (i + 1) + "</button>";
      weekTabs += "</div>";
    }
    var rows = "";
    for (var d = 0; d < 7; d++) {
      var ids = (p.weeks[wIdx] || {})[d] || [];
      var chips = ids.map(function (id) {
        var w = workoutById(id);
        return '<span class="pill" style="margin:2px 4px 2px 0">' + esc(w ? w.name : "?") +
          ' <b data-plandel="' + d + ":" + id + '" style="cursor:pointer;color:var(--accent-ink)">✕</b></span>';
      }).join("");
      rows += '<div style="padding:12px 0;border-bottom:1px solid var(--line)">' +
        '<div class="between"><b>' + DAYS_FULL[d] + "</b>" +
        '<button class="btn sm soft" data-planadd="' + d + '">+ Add</button></div>' +
        '<div style="margin-top:8px">' + (chips || '<span class="muted">Rest day</span>') + "</div></div>";
    }
    return topbar("Edit Plan", { back: "plan" }) +
      '<div class="view has-sticky">' +
      '<label class="field-label">Plan name</label>' +
      '<input class="input" data-set="plan.name" value="' + esc(p.name) + '">' +
      '<div class="two">' +
      '<div><label class="field-label">Start date</label>' +
      '<input class="input" type="date" data-set="plan.startDate" value="' + esc(p.startDate) + '"></div>' +
      '<div><label class="field-label">Rotation (weeks)</label>' +
      '<select class="select" data-planlen>' +
      [1, 2, 3, 4].map(function (n) { return '<option value="' + n + '"' + (p.weeks.length === n ? " selected" : "") + ">" + n + "</option>"; }).join("") +
      "</select></div></div>" +
      '<label class="field-label" style="display:flex;align-items:center;gap:10px;margin-top:14px">' +
      '<input type="checkbox" data-set="plan.repeat" ' + (p.repeat ? "checked" : "") + '> Repeat this rotation continuously</label>' +
      weekTabs +
      '<div class="card">' + rows + "</div>" +
      "</div>" +
      '<div class="sticky-action"><button class="btn" data-back="plan">Done</button></div>';
  }

  /* ---------- WORKOUTS (templates) ---------- */
  function viewWorkouts() {
    var list = S.workouts.length ? S.workouts.map(function (w) {
      return '<div class="listitem" data-nav="workoutEdit:' + w.id + '">' +
        '<div class="lead">💪</div><div class="lt"><b>' + esc(w.name) + "</b>" +
        "<small>" + w.items.length + " exercise" + (w.items.length === 1 ? "" : "s") + "</small></div>" +
        '<span class="chev">›</span></div>';
    }).join("") : '<div class="empty"><div class="big">🏋️</div>No workouts yet.<br>Create your first one.</div>';
    return topbar("Workouts", { back: "more", right: '<button class="btn sm soft" data-nav="workoutEdit:new">+ New</button>' }) +
      '<div class="view"><div class="card">' + list + "</div>" +
      '<button class="btn" data-nav="workoutEdit:new">+ New workout</button></div>';
  }

  function viewWorkoutEdit(id) {
    var w;
    if (id === "new") { w = { id: uid(), name: "", items: [], _new: true }; UI.draftWorkout = UI.draftWorkout && !UI.draftWorkout._committed ? UI.draftWorkout : w; w = UI.draftWorkout; }
    else { w = workoutById(id); if (!w) return topbar("Not found", { back: "workouts" }) + '<div class="view empty">Workout not found.</div>'; }
    UI.editingWorkout = w;

    var sec = ["Warm Up", "Workout", "Cool Down"];
    var byGroup = groupLetters(w.items);
    var itemsHtml = "";
    var lastSection = null;
    w.items.forEach(function (it, idx) {
      if (it.section !== lastSection) { itemsHtml += '<div class="section-label">' + esc(it.section) + "</div>"; lastSection = it.section; }
      var e = exById(it.exerciseId);
      itemsHtml += '<div class="card exq" data-itemid="' + it.id + '"><div class="head">' +
        '<button class="draghandle" data-drag title="Drag to reorder">⋮⋮</button>' +
        thumbTag(e) +
        '<div class="grow"><div class="name">' + esc(e ? e.name : "Exercise") + "</div>" +
        '<div class="pills">' +
        '<span class="pill">Sets: ' + it.sets + "</span>" +
        '<span class="pill">Reps: ' + esc(it.reps) + "</span>" +
        '<span class="pill">Rest: ' + fmtRest(it.rest) + "</span>" +
        (it.tempo ? '<span class="pill">Tempo: ' + esc(it.tempo) + "</span>" : "") +
        (it.bw ? '<span class="pill">BW</span>' : "") +
        "</div></div>" +
        '<div class="badge">' + byGroup[idx] + "</div></div>" +
        (it.note ? '<div class="note clamp">' + esc(it.note) + "</div>" : "") +
        '<div class="btn-row" style="margin-top:10px">' +
        '<button class="btn sm outline" data-itemedit="' + idx + '">Edit</button>' +
        '<button class="btn sm danger" data-itemdel="' + idx + '">Delete</button>' +
        "</div></div>";
    });
    if (!w.items.length) itemsHtml = '<div class="empty">No exercises yet. Add one below.</div>';

    return topbar(w._new ? "New Workout" : "Edit Workout", { back: "workouts" }) +
      '<div class="view has-sticky">' +
      '<label class="field-label">Workout name</label>' +
      '<input class="input" data-workoutname value="' + esc(w.name) + '" placeholder="e.g. Push Day">' +
      itemsHtml +
      '<button class="btn soft" data-additem style="margin-top:12px">+ Add exercise</button>' +
      "</div>" +
      '<div class="sticky-action"><button class="btn" data-savework>' + (w._new ? "Create workout" : "Save workout") + "</button></div>";
  }
  function groupLetters(items) {
    // assign A,B,C… per section order
    var out = {}, counters = {};
    items.forEach(function (it, i) {
      var s = it.section || "Workout";
      counters[s] = (counters[s] || 0);
      out[i] = String.fromCharCode(65 + (counters[s] % 26));
      counters[s]++;
    });
    return out;
  }

  /* ---------- EXERCISES (library) ---------- */
  function viewExercises() {
    var groups = {};
    EX.forEach(function (e) { var m = e.muscle || "Other"; (groups[m] = groups[m] || []).push(e); });
    var keys = Object.keys(groups).sort();
    var html = keys.length ? keys.map(function (m) {
      return '<div class="section-label">' + esc(m) + "</div><div class='card'>" +
        groups[m].map(function (e) {
          return '<div class="listitem" data-nav="exerciseEdit:' + e.id + '">' +
            '<div class="lead">' + exLeadInner(e) + "</div>" +
            '<div class="lt"><b>' + esc(e.name) + "</b>" + (e.bw ? "<small>Bodyweight</small>" : "") + "</div>" +
            '<span class="chev">›</span></div>';
        }).join("") + "</div>";
    }).join("") : '<div class="empty"><div class="big">📚</div>No exercises yet.</div>';
    return topbar("Exercises", { back: "more", right: '<button class="btn sm soft" data-nav="exerciseEdit:new">+ New</button>' }) +
      '<div class="view">' + html + '<button class="btn" data-nav="exerciseEdit:new">+ New exercise</button></div>';
  }
  function viewExerciseEdit(id) {
    var isNew = id === "new";
    var e = isNew ? { id: uid(), name: "", muscle: "", videoUrl: "", note: "", bw: false, icon: "" } : exById(id);
    if (!e) return topbar("Not found", { back: "exercises" }) + '<div class="view empty">Exercise not found.</div>';
    UI.editingExercise = { obj: e, isNew: isNew };
    return topbar(isNew ? "New Exercise" : "Edit Exercise", { back: "exercises" }) +
      '<div class="view has-sticky">' +
      '<div class="muted" style="font-size:13px;margin:6px 2px 2px">📚 Exercises are shared between Adam and Char.</div>' +
      '<label class="field-label">Icon</label>' +
      '<div class="row" style="gap:14px">' +
      '<div class="iconpreview" id="iconpreview">' + exIconInner(e) + "</div>" +
      '<div class="grow"><button class="btn sm soft" data-iconupload>Upload image</button>' +
      (e.icon ? ' <button class="btn sm outline" data-iconclear>Remove</button>' : "") +
      '<div class="muted" style="font-size:12px;margin-top:6px">Replaces the emoji. Square images look best.</div></div>' +
      "</div>" +
      '<label class="field-label">Name</label><input class="input" data-ex="name" value="' + esc(e.name) + '" placeholder="e.g. Bench Press">' +
      '<label class="field-label">Muscle group</label><input class="input" data-ex="muscle" value="' + esc(e.muscle) + '" placeholder="e.g. Chest">' +
      '<label class="field-label">Demo video link (optional)</label><input class="input" data-ex="videoUrl" value="' + esc(e.videoUrl) + '" placeholder="https://...">' +
      '<label class="field-label">Default note / cues (optional)</label><textarea class="input" data-ex="note" placeholder="Form cues...">' + esc(e.note) + "</textarea>" +
      '<label class="field-label" style="display:flex;align-items:center;gap:10px;margin-top:14px"><input type="checkbox" data-ex="bw" ' + (e.bw ? "checked" : "") + "> Bodyweight exercise</label>" +
      (isNew ? "" : '<button class="btn danger" data-exdel style="margin-top:18px">Delete exercise</button>') +
      "</div>" +
      '<div class="sticky-action"><button class="btn" data-saveex>' + (isNew ? "Create" : "Save") + "</button></div>";
  }

  /* ---------- WEIGHT ---------- */
  function viewWeight() {
    var sel = UI.selectedDate || todayKey(), isToday = sel === todayKey();
    var sorted = S.weights.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var selW = weightOn(sel);
    var chartPts = sorted.slice().reverse().slice(-30).map(function (p) {
      return { label: p.date.slice(5).replace("-", "/"), value: p.weight };
    });
    var latest = sorted.length ? sorted[0] : null;
    var first = sorted.length ? sorted[sorted.length - 1] : null;
    var change = (latest && first && latest.date !== first.date) ? round1(latest.weight - first.weight) : null;
    var list = sorted.slice(0, 30).map(function (p) {
      return '<div class="listitem"><div class="lt"><b>' + p.weight + " " + unit() + "</b>" +
        "<small>" + esc(p.date) + (p.note ? " · " + esc(p.note) : "") + "</small></div>" +
        '<button class="del" data-wdel="' + p.date + '" style="color:var(--muted-2);font-size:18px">✕</button></div>';
    }).join("");
    var dayLabel = isToday ? "Today" : fmtNiceDate(parseKey(sel));
    return topbar("Weight", { back: "home" }) +
      '<div class="view">' +
      '<div class="card">' +
      '<div class="smallcap">Check-in for ' + esc(dayLabel) + "</div>" +
      '<div class="setrow" style="margin-top:10px">' +
      '<div class="field"><input inputmode="decimal" data-wnew value="' + (selW ? selW.weight : "") + '" placeholder="Weight"><span class="unit">' + unit() + "</span></div>" +
      '<button class="btn sm" data-wsave style="width:auto;padding:14px 18px">Save</button></div>' +
      (selW ? '<div class="muted" style="margin-top:8px;font-size:13px">✓ Logged for ' + esc(dayLabel.toLowerCase()) + ". Saving updates it.</div>" : "") +
      (isToday ? "" : '<div class="muted" style="margin-top:8px;font-size:12.5px">Pick a different day on the Home calendar to log for it.</div>') +
      "</div>" +
      '<div class="tiles" style="margin-bottom:14px">' +
      '<div class="tile"><div class="k">Latest</div><div class="v">' + (latest ? latest.weight + ' <small>' + unit() + "</small>" : "—") + '</div><div class="cap">' + (latest ? relDay(latest.date) : "") + "</div></div>" +
      '<div class="tile"><div class="k">Change</div><div class="v">' + (change != null ? (change > 0 ? "+" : "") + change + ' <small>' + unit() + "</small>" : "—") + '</div><div class="cap">since first log</div></div>' +
      "</div>" +
      '<div class="card"><div class="smallcap">Trend</div>' + fullLine(chartPts, { unit: unit() }) + "</div>" +
      '<div class="section-label">History</div><div class="card">' + (list || '<div class="empty">No entries yet.</div>') + "</div>" +
      "</div>";
  }

  /* ---------- PROGRESS ---------- */
  function viewProgress() {
    // PBs for every exercise that has any logged data (data-based, not tick-based)
    var logged = {};
    S.logs.forEach(function (l) { l.items.forEach(function (it) { logged[it.exerciseId] = true; }); });
    var pbList = Object.keys(logged).map(function (id) {
      return { id: id, e: exById(id), b: bestForExercise(id) };
    }).filter(function (x) { return x.e && (x.b.weight || x.b.reps); })
      .sort(function (a, b) { return a.e.name.toLowerCase() < b.e.name.toLowerCase() ? -1 : 1; });
    var pbCards = pbList.map(function (x) {
      var b = x.b;
      return '<div class="listitem" data-nav="exProgress:' + x.id + '">' +
        '<div class="lead">🏅</div><div class="lt"><b>' + esc(x.e.name) + "</b>" +
        "<small>Best: " + (b.weight ? b.weight + unit() + " × " + (b.wAt || "?") : b.reps + " reps") +
        (b.e1rm ? " · e1RM " + Math.round(b.e1rm) + unit() : "") + "</small></div><span class='chev'>›</span></div>";
    }).join("");

    var wchartPts = S.weights.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-30)
      .map(function (p) { return { label: p.date.slice(5).replace("-", "/"), value: p.weight }; });

    return topbar("Progress", { back: "home" }) +
      '<div class="view">' +
      '<div class="tiles" style="margin-bottom:6px">' +
      '<div class="tile"><div class="k">Workouts</div><div class="v">' + S.logs.length + '</div><div class="cap">all time</div></div>' +
      '<div class="tile"><div class="k">This week</div><div class="v">' + workoutsThisWeek() + '</div><div class="cap">sessions</div></div>' +
      "</div>" +
      '<div class="section-label">Bodyweight</div>' +
      '<div class="card">' + fullLine(wchartPts, { unit: unit() }) + "</div>" +
      '<div class="section-label">Personal Bests</div>' +
      '<div class="card">' + (pbCards || '<div class="empty">Log a workout to see your PBs.</div>') + "</div>" +
      "</div>";
  }
  function viewExProgress(id) {
    var e = exById(id); if (!e) return topbar("Not found", { back: "progress" }) + '<div class="view empty">—</div>';
    var b = bestForExercise(id);
    // top-set e1RM over time
    var pts = [];
    S.logs.slice().sort(function (a, c) { return a.date < c.date ? -1 : 1; }).forEach(function (l) {
      var best = 0, tw = 0, tr = 0;
      l.items.forEach(function (it) {
        if (it.exerciseId !== id) return;
        it.sets.forEach(function (st) { var ee = e1rm(num(st.weight), num(st.reps)); if (ee > best) { best = ee; tw = num(st.weight); tr = num(st.reps); } });
      });
      if (best) pts.push({ label: l.date.slice(5).replace("-", "/"), value: Math.round(best), tw: tw, tr: tr, date: l.date });
    });
    var hist = pts.slice().reverse().map(function (p) {
      return '<div class="listitem"><div class="lt"><b>' + p.tw + unit() + " × " + p.tr + "</b><small>" + esc(p.date) + " · est 1RM " + p.value + unit() + "</small></div></div>";
    }).join("");
    return topbar(e.name, { back: "progress" }) +
      '<div class="view">' +
      '<div class="tiles"><div class="tile"><div class="k">Best set</div><div class="v">' + (b.weight ? b.weight + '<small>' + unit() + "</small>" : "—") + '</div><div class="cap">× ' + (b.wAt || "?") + " reps</div></div>" +
      '<div class="tile"><div class="k">Est. 1RM</div><div class="v">' + (b.e1rm ? Math.round(b.e1rm) + '<small>' + unit() + "</small>" : "—") + '</div><div class="cap">Epley</div></div></div>' +
      '<div class="section-label">Estimated 1RM trend</div><div class="card">' + fullLine(pts, { unit: unit() }) + "</div>" +
      '<div class="section-label">History</div><div class="card">' + (hist || '<div class="empty">No sets logged.</div>') + "</div>" +
      "</div>";
  }

  /* ---------- MORE ---------- */
  function viewMore() {
    function row(nav, ico, label, sub) {
      return '<div class="listitem" data-nav="' + nav + '"><div class="lead">' + ico + "</div>" +
        '<div class="lt"><b>' + label + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div><span class='chev'>›</span></div>";
    }
    return topbar("More") +
      '<div class="view">' +
      '<div class="card">' +
      row("workouts", "💪", "Workouts", S.workouts.length + " templates") +
      row("exercises", "📚", "Exercise library", EX.length + " exercises · shared") +
      row("history", "🕘", "Workout history", S.logs.length + " logged") +
      row("planEdit", "🗓️", "Edit plan", S.plan.name) +
      "</div>" +
      '<div class="card">' +
      row("settings", "⚙️", "Settings", S.settings.displayName + " · " + unit()) +
      '<div class="listitem" data-export><div class="lead">⬇️</div><div class="lt"><b>Export backup</b><small>Download your data as JSON</small></div></div>' +
      '<div class="listitem" data-import><div class="lead">⬆️</div><div class="lt"><b>Import backup</b><small>Restore from a JSON file</small></div></div>' +
      "</div>" +
      '<div class="card"><div class="listitem" data-switch><div class="lead">🔀</div><div class="lt"><b>Switch profile</b><small>Back to Adam / Char picker</small></div></div></div>' +
      '<div class="muted" style="text-align:center;font-size:12px;margin-top:8px">MyTrainer · profile: ' + esc(PROFILE) + '<br>Data is stored on this device.</div>' +
      "</div>";
  }

  /* ---------- HISTORY ---------- */
  function viewHistory() {
    var logs = S.logs.slice().sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : (b.startedAt || 0) - (a.startedAt || 0)); });
    var list = logs.length ? logs.map(function (l) {
      var pr = sessionProgress(l), complete = pr.total > 0 && pr.done === pr.total;
      return '<div class="listitem" data-nav="session:' + l.id + '">' +
        '<div class="lead">' + (complete ? "✅" : "📋") + '</div><div class="lt"><b>' + esc(l.name) + "</b>" +
        "<small>" + esc(l.date) + " · " + pr.done + "/" + pr.total + " exercises" + (complete ? " · complete" : "") + "</small></div>" +
        '<span class="chev">›</span></div>';
    }).join("") : '<div class="empty"><div class="big">🕘</div>No workouts logged yet.</div>';
    return topbar("History", { back: "more" }) + '<div class="view"><div class="card">' + list + "</div></div>";
  }

  /* ---------- SETTINGS ---------- */
  function viewSettings() {
    var themes = [["pink", "Pink"], ["blue", "Blue"], ["teal", "Teal"], ["violet", "Violet"]];
    return topbar("Settings", { back: "more" }) +
      '<div class="view">' +
      '<label class="field-label">Display name</label><input class="input" data-set="settings.displayName" value="' + esc(S.settings.displayName) + '">' +
      '<label class="field-label">Units</label>' +
      '<div class="seg"><button class="' + (unit() === "kg" ? "on" : "") + '" data-unit="kg">Kilograms (kg)</button>' +
      '<button class="' + (unit() === "lb" ? "on" : "") + '" data-unit="lb">Pounds (lb)</button></div>' +
      '<label class="field-label">Default rest (seconds)</label>' +
      '<input class="input" inputmode="numeric" data-set="settings.restDefault" value="' + esc(S.settings.restDefault) + '">' +
      '<label class="field-label">Appearance</label>' +
      '<div class="seg"><button class="' + (!S.settings.dark ? "on" : "") + '" data-dark="0">☀️ Light</button>' +
      '<button class="' + (S.settings.dark ? "on" : "") + '" data-dark="1">🌙 Dark</button></div>' +
      '<label class="field-label">Theme colour</label>' +
      '<div class="seg">' + themes.map(function (t) { return '<button class="' + (S.settings.theme === t[0] ? "on" : "") + '" data-settheme="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>" +
      '<div style="height:20px"></div>' +
      '<button class="btn danger" data-reset>Reset all data for this profile</button>' +
      "</div>";
  }


  /* ============================================================
     SESSION LOGGER  (a session IS a log entry; auto-saves; auto-completes)
     ============================================================ */
  function curSession() { return logById(UI.route.id); }
  function findSession(dk, workoutId) {
    for (var i = 0; i < S.logs.length; i++) if (S.logs[i].date === dk && S.logs[i].workoutId === workoutId) return S.logs[i];
    return null;
  }
  function createSession(workoutId, dk) {
    var w = workoutById(workoutId); if (!w) return null;
    return {
      id: uid(), workoutId: workoutId, name: w.name, date: dk, startedAt: Date.now(),
      items: w.items.map(function (it) {
        var e = exById(it.exerciseId);
        var n = Math.max(1, it.sets | 0), sets = [];
        for (var i = 0; i < n; i++) sets.push({
          weight: (it.target != null && it.target !== "") ? String(it.target) : "",
          reps: ""   // reps start empty; the target shows as a placeholder hint
        });
        return {
          exerciseId: it.exerciseId, name: e ? e.name : "Exercise", section: it.section,
          reps: it.reps, rest: it.rest, tempo: it.tempo, bw: it.bw, note: it.note,
          videoUrl: e ? e.videoUrl : "", icon: e ? (e.icon || "") : "", sets: sets
        };
      })
    };
  }
  function openWorkoutSession(workoutId, dk) {
    dk = dk || todayKey();
    var log = findSession(dk, workoutId);
    if (!log) { log = createSession(workoutId, dk); if (!log) return; S.logs.push(log); save(); }
    stopRest();
    go("session:" + log.id);
  }
  function setFilled(st, bw) {
    var r = st.reps != null && String(st.reps).trim() !== "";
    var wv = st.weight != null && String(st.weight).trim() !== "";
    return r && (bw || wv);
  }
  function itemComplete(it) { return it.sets.length > 0 && it.sets.every(function (s) { return setFilled(s, it.bw); }); }
  function sessionProgress(log) {
    var done = 0; log.items.forEach(function (it) { if (itemComplete(it)) done++; });
    return { done: done, total: log.items.length };
  }

  function viewSession() {
    var a = curSession();
    if (!a) return topbar("Workout", { back: "home" }) + '<div class="view empty">This session was not found.<br><button class="btn" data-nav="home" style="margin-top:16px">Home</button></div>';
    var byGroup = groupLetters(a.items);
    var lastSection = null, html = "";
    a.items.forEach(function (it, idx) {
      if (it.section !== lastSection) { html += '<div class="section-label">' + esc(it.section) + "</div>"; lastSection = it.section; }
      var noteHtml = "";
      if (it.note) {
        var expanded = UI.expanded[idx];
        noteHtml = '<div class="note ' + (expanded ? "" : "clamp") + '" data-notetoggle="' + idx + '">' + esc(it.note) + (it.note.length > 40 ? (expanded ? " ▲" : " ▾") : "") + "</div>";
      }
      var wUnit = it.bw ? "KG" : unit().toUpperCase();
      var lastPerf = lastPerformance(it.exerciseId);
      var exdone = itemComplete(it);
      var setsHtml = it.sets.map(function (st, si) {
        var phr = it.reps || "";
        var lp = lastPerf && lastPerf.sets[si] ? lastPerf.sets[si] : null;
        var lastHtml = lp
          ? '<span class="lastwo"><span class="k">LAST WORKOUT:</span> <b>' + esc(lp.reps || "–") + "</b> REPS @ <b>" + esc(lp.weight || "–") + "</b> " + wUnit + "</span>"
          : (lastPerf ? '<span class="lastwo"></span>' : '<span class="lastwo firsttime">First time</span>');
        var fill = setFilled(st, it.bw);
        return '<div class="setblk">' +
          '<div class="setblk-top">' +
          '<span class="setno">Set ' + (si + 1) + "</span>" +
          lastHtml +
          "</div>" +
          '<div class="setblk-row">' +
          '<div class="fieldbox ' + (fill ? "done" : "") + '">' +
          '<span class="fb-label">REPS:</span>' +
          '<input inputmode="numeric" data-sr="' + idx + ":" + si + '" value="' + esc(st.reps) + '" placeholder="' + esc(phr) + '">' +
          '<span class="fb-unit">EA</span></div>' +
          '<div class="fieldbox ' + (fill ? "done" : "") + '">' +
          '<span class="fb-label">WEIGHT:</span>' +
          '<input inputmode="decimal" data-sw="' + idx + ":" + si + '" value="' + esc(st.weight) + '" placeholder="">' +
          '<span class="fb-unit">' + wUnit + "</span></div>" +
          "</div></div>";
      }).join("");
      var eLive = exById(it.exerciseId);
      var liveIcon = (eLive && eLive.icon) ? eLive.icon : (it.icon || "");
      var liveVid = (eLive && eLive.videoUrl) ? eLive.videoUrl : (it.videoUrl || "");
      html += '<div class="card exq' + (exdone ? " exdone" : "") + '"><div class="head">' +
        thumbTag({ icon: liveIcon, videoUrl: liveVid }) +
        '<div class="grow"><div class="name">' + esc(it.name) + '<span class="exdone-tick">' + (exdone ? " ✓" : "") + "</span></div>" +
        '<div class="pills"><span class="pill">Reps: ' + esc(it.reps) + "</span>" +
        (it.rest > 0
          ? '<button class="pill pill-rest" data-restpill="' + it.rest + '" data-restname="' + esc(it.name) + '">Rest: ' + fmtRest(it.rest) + " ⏱</button>"
          : '<span class="pill">Rest: —</span>') +
        (it.tempo ? '<span class="pill">Tempo: ' + esc(it.tempo) + "</span>" : "") + "</div></div>" +
        '<div class="badge">' + byGroup[idx] + "</div></div>" +
        noteHtml + setsHtml + "</div>";
    });
    var pr = sessionProgress(a), complete = pr.total > 0 && pr.done === pr.total;
    var pill = '<div class="timer-pill' + (complete ? " done" : "") + '" id="sessprog">' + (complete ? "✓ Complete" : pr.done + " / " + pr.total) + "</div>";
    return topbar(a.name, { back: "home", right: pill }) +
      '<div class="view" id="sessionbody">' +
      (complete ? '<div class="card" style="background:var(--accent-softer);text-align:center"><b>✓ Workout complete</b><div class="muted" style="font-size:13px;margin-top:2px">Tap any field to adjust it.</div></div>' : "") +
      html +
      '<button class="btn danger" data-sessdel style="margin-top:6px">Delete this session</button>' +
      "</div>";
  }

  /* ---------- Fullscreen rest timer ---------- */
  function fmtClock(sec) { sec = Math.max(0, Math.ceil(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ":" + pad(s); }
  function renderRestTimer() {
    var old = document.getElementById("resttimer");
    if (old) old.remove();
    if (!UI.rest) return;
    var el = document.createElement("div");
    el.className = "restfs"; el.id = "resttimer";
    el.innerHTML =
      '<div class="restfs-card">' +
      '<div class="restfs-label">REST</div>' +
      '<div class="restfs-sub" id="restname"></div>' +
      '<div class="restfs-ring">' +
      '<svg viewBox="0 0 200 200"><circle class="ring-bg" cx="100" cy="100" r="88"/>' +
      '<circle class="ring-fg" id="restring" cx="100" cy="100" r="88" transform="rotate(-90 100 100)"/></svg>' +
      '<div class="restfs-time" id="resttime">0:00</div>' +
      "</div>" +
      '<div class="restfs-controls">' +
      '<button data-restsub15>&minus;15s</button>' +
      '<button data-restadd>+15s</button>' +
      "</div>" +
      '<button class="restfs-skip" data-restskip>Skip rest</button>' +
      "</div>";
    document.body.appendChild(el);
    updateRestTimer();
  }
  function updateRestTimer() {
    var el = document.getElementById("resttimer");
    if (!el || !UI.rest) return;
    var remain = Math.max(0, (UI.rest.endsAt - Date.now()) / 1000);
    var t = document.getElementById("resttime"); if (t) t.textContent = remain <= 0 ? "Done!" : fmtClock(remain);
    var nm = document.getElementById("restname"); if (nm) nm.textContent = UI.rest.label || "";
    var ring = document.getElementById("restring");
    if (ring) {
      var C = 2 * Math.PI * 88;
      var pct = clamp(remain / UI.rest.total, 0, 1);
      ring.setAttribute("stroke-dasharray", round1(C));
      ring.setAttribute("stroke-dashoffset", round1(C * (1 - pct)));
    }
  }
  var restTick = null;
  function startRest(label, seconds) {
    if (!seconds) return;
    UI.rest = { endsAt: Date.now() + seconds * 1000, total: seconds, label: label, beeped: false };
    renderRestTimer();
    if (restTick) clearInterval(restTick);
    restTick = setInterval(function () {
      if (!UI.rest) { clearInterval(restTick); restTick = null; return; }
      var remain = (UI.rest.endsAt - Date.now()) / 1000;
      if (remain <= 0 && !UI.rest.beeped) { UI.rest.beeped = true; beep(); }
      if (remain <= -1) { stopRest(); return; }
      updateRestTimer();
    }, 250);
  }
  function stopRest() {
    UI.rest = null;
    if (restTick) { clearInterval(restTick); restTick = null; }
    var el = document.getElementById("resttimer"); if (el) el.remove();
  }
  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      var ctx = new Ctx();
      [0, 0.18, 0.36].forEach(function (t) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.type = "sine";
        o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.16);
      });
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 800);
    } catch (e) {}
  }

  /* ============================================================
     SHEETS (exercise picker, item editor)
     ============================================================ */
  function openSheet(html) {
    closeSheet();
    var bd = document.createElement("div");
    bd.className = "sheet-backdrop"; bd.id = "sheet";
    bd.innerHTML = '<div class="sheet"><div class="grip"></div>' + html + "</div>";
    document.body.appendChild(bd);
    bd.addEventListener("click", function (e) { if (e.target === bd) closeSheet(); });
  }
  function closeSheet() { var s = document.getElementById("sheet"); if (s) s.remove(); }

  /* ---------- In-app video player ---------- */
  function openVideo(url) {
    var v = videoInfo(url); if (!v) return;
    closeVideo();
    var frame = v.kind === "file"
      ? '<video src="' + esc(v.embed) + '" controls autoplay playsinline></video>'
      : '<iframe src="' + esc(v.embed) + '" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
    var bd = document.createElement("div");
    bd.className = "videofs"; bd.id = "videofs";
    bd.innerHTML =
      '<div class="videofs-inner">' +
      '<div class="videofs-bar"><button class="videofs-close" data-closevideo>✕ Close</button></div>' +
      '<div class="videofs-frame">' + frame + "</div>" +
      '<a class="videofs-open" href="' + esc(url) + '" target="_blank" rel="noopener">Open in browser ↗</a>' +
      "</div>";
    document.body.appendChild(bd);
    bd.addEventListener("click", function (e) { if (e.target === bd) closeVideo(); });
  }
  function closeVideo() { var el = document.getElementById("videofs"); if (el) el.remove(); }

  function openExercisePicker(onPick) {
    UI._pick = onPick;
    var groups = {};
    EX.forEach(function (e) { var m = e.muscle || "Other"; (groups[m] = groups[m] || []).push(e); });
    var keys = Object.keys(groups).sort();
    var list = keys.map(function (m) {
      return '<div class="smallcap" style="margin:12px 2px 4px">' + esc(m) + "</div>" +
        groups[m].map(function (e) {
          return '<div class="listitem" data-pick="' + e.id + '"><div class="lead">' + exLeadInner(e) + '</div><div class="lt"><b>' + esc(e.name) + "</b></div></div>";
        }).join("");
    }).join("");
    openSheet('<h3>Add exercise</h3>' +
      '<input class="input" id="pickfilter" placeholder="Search…" oninput="window.__mtFilter(this.value)">' +
      '<div id="picklist">' + list + "</div>" +
      '<div class="divider" style="margin:14px 0"></div>' +
      '<button class="btn soft" data-picknew>+ Create new exercise</button>');
    window.__mtFilter = function (q) {
      q = q.toLowerCase();
      var items = document.querySelectorAll("#picklist [data-pick]");
      items.forEach(function (el) {
        var t = el.textContent.toLowerCase();
        el.style.display = t.indexOf(q) >= 0 ? "" : "none";
      });
    };
  }

  function openItemEditor(item, onSave) {
    UI._itemSave = onSave; UI._itemDraft = JSON.parse(JSON.stringify(item));
    var it = UI._itemDraft;
    var e = exById(it.exerciseId);
    var secOpts = ["Warm Up", "Workout", "Cool Down"].map(function (s) { return '<option ' + (it.section === s ? "selected" : "") + ">" + s + "</option>"; }).join("");
    openSheet('<h3>' + esc(e ? e.name : "Exercise") + "</h3>" +
      '<label class="field-label">Section</label><select class="select" data-idf="section">' + secOpts + "</select>" +
      '<div class="two"><div><label class="field-label">Sets</label><input class="input" inputmode="numeric" data-idf="sets" value="' + esc(it.sets) + '"></div>' +
      '<div><label class="field-label">Reps</label><input class="input" data-idf="reps" value="' + esc(it.reps) + '" placeholder="12 or 10-12"></div></div>' +
      '<div class="two"><div><label class="field-label">Rest (sec)</label><input class="input" inputmode="numeric" data-idf="rest" value="' + esc(it.rest) + '"></div>' +
      '<div><label class="field-label">Tempo</label><input class="input" data-idf="tempo" value="' + esc(it.tempo) + '" placeholder="3-0-0-1"></div></div>' +
      '<label class="field-label">Starting weight (optional — pre-fills each set)</label><input class="input" data-idf="target" value="' + esc(it.target) + '" placeholder="e.g. 32">' +
      '<label class="field-label">Note</label><textarea class="input" data-idf="note">' + esc(it.note) + "</textarea>" +
      '<label class="field-label" style="display:flex;align-items:center;gap:10px;margin-top:12px"><input type="checkbox" data-idf="bw" ' + (it.bw ? "checked" : "") + "> Bodyweight</label>" +
      '<button class="btn" data-idsave style="margin-top:16px">Save exercise</button>');
  }

  /* ---------- Toast ---------- */
  var toastT = null;
  function toast(msg) {
    var old = document.getElementById("toast"); if (old) old.remove();
    var el = document.createElement("div"); el.className = "toast"; el.id = "toast"; el.textContent = msg;
    document.body.appendChild(el);
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(function () { el.remove(); }, 2200);
  }

  /* ============================================================
     ROUTER
     ============================================================ */
  function locationRoute() { return parseRoute(location.hash.replace(/^#\/?/, "")); }
  function parseRoute(str) {
    if (!str) return { name: "home" };
    var parts = str.split(":");
    var map = {
      home: "home", plan: "plan", planEdit: "planEdit", progress: "progress", weight: "weight",
      more: "more", workouts: "workouts", exercises: "exercises", history: "history",
      settings: "settings"
    };
    var head = parts[0];
    if (map[head]) return { name: map[head] };
    // param routes
    var withId = ["workoutEdit", "exerciseEdit", "exProgress", "session"];
    if (withId.indexOf(head) >= 0) return { name: head, id: parts[1] };
    return { name: "home" };
  }
  /* Menu stack — back walks UP this hierarchy, not the browser history.
     Roots (bottom-nav tabs) reset the stack; drilling in pushes; returning
     to an ancestor truncates; back pops to the parent. */
  var ROOTS = { home: 1, plan: 1, progress: 1, weight: 1, more: 1 };
  function routeName(str) { return (str || "home").split(":")[0]; }
  function curRouteStr() { var h = location.hash.replace(/^#\/?/, ""); return h || "home"; }
  function pushRoute(str) {
    if (ROOTS[routeName(str)]) { UI.stack = [str]; return; }
    var idx = UI.stack.indexOf(str);
    if (idx >= 0) UI.stack = UI.stack.slice(0, idx + 1);
    else UI.stack.push(str);
  }
  function go(str) {
    var target = "#/" + str;
    if (location.hash === target) return;
    pushRoute(str);
    UI._navByCode = true;
    location.hash = target;
  }
  function goBack(fallback) {
    UI.stack.pop();
    var parent = UI.stack[UI.stack.length - 1];
    if (!parent) { parent = fallback || "home"; UI.stack = [parent]; }
    UI._navByCode = true;
    location.hash = "#/" + parent;
  }
  window.addEventListener("hashchange", function () {
    var str = curRouteStr();
    UI.route = parseRoute(str);
    if (!UI._navByCode) pushRoute(str); // hash changed by the browser back/forward — resync stack
    UI._navByCode = false;
    if (UI.route.name !== "session") stopRest();
    render();
    if (UI.route.name === "session" && UI.rest) renderRestTimer();
    window.scrollTo(0, 0);
  });

  /* ============================================================
     EVENT DELEGATION
     ============================================================ */
  document.addEventListener("click", function (e) {
    var t = e.target;
    var el = t.closest ? t.closest("[data-nav],[data-back],[data-open],[data-day],[data-playvideo],[data-closevideo],[data-additem],[data-itemedit],[data-itemdel],[data-savework],[data-saveex],[data-exdel],[data-delset],[data-sessdel],[data-notetoggle],[data-wsave],[data-wdel],[data-unit],[data-reset],[data-export],[data-import],[data-switch],[data-planadd],[data-plandel],[data-planweek],[data-restadd],[data-restskip],[data-restsub15],[data-restpill],[data-pick],[data-picknew],[data-idsave],[data-logdel],[data-settheme],[data-iconupload],[data-iconclear],[data-dark]") : null;
    if (!el) return;
    var d = el.dataset;

    if (d.nav != null) { go(d.nav); return; }
    if (d.back != null) { goBack(d.back); return; }
    if (d.day != null) { UI.selectedDate = d.day; render(); return; }
    if (d.playvideo != null) { openVideo(d.playvideo); return; }
    if (d.closevideo != null) { closeVideo(); return; }
    if (d.open != null) { openWorkoutSession(d.open, el.dataset.date || todayKey()); return; }

    /* ----- workout editor ----- */
    if (d.additem != null) {
      openExercisePicker(function (exId) {
        var w = UI.editingWorkout;
        var added = item(exId, { rest: S.settings.restDefault });
        w.items.push(added);
        closeSheet(); render();
        // immediately let them define sets / reps / weight for the new exercise
        var idx = w.items.length - 1;
        openItemEditor(w.items[idx], function (updated) { w.items[idx] = updated; closeSheet(); render(); });
      });
      return;
    }
    if (d.itemup != null) { var i = +d.itemup, w = UI.editingWorkout; if (i > 0) { var x = w.items.splice(i, 1)[0]; w.items.splice(i - 1, 0, x); render(); } return; }
    if (d.itemdown != null) { var i2 = +d.itemdown, w2 = UI.editingWorkout; if (i2 < w2.items.length - 1) { var x2 = w2.items.splice(i2, 1)[0]; w2.items.splice(i2 + 1, 0, x2); render(); } return; }
    if (d.itemedit != null) {
      var idx = +d.itemedit, wk = UI.editingWorkout;
      openItemEditor(wk.items[idx], function (updated) { wk.items[idx] = updated; closeSheet(); render(); });
      return;
    }
    if (d.itemdel != null) { UI.editingWorkout.items.splice(+d.itemdel, 1); render(); return; }
    if (d.savework != null) {
      var w3 = UI.editingWorkout;
      var nameInput = document.querySelector("[data-workoutname]");
      if (nameInput) w3.name = nameInput.value.trim();
      if (!w3.name) { toast("Give the workout a name"); return; }
      if (w3._new) { delete w3._new; w3._committed = true; S.workouts.push(w3); UI.draftWorkout = null; }
      save(); go("workouts"); toast("Saved");
      return;
    }

    /* ----- exercise editor (shared library) ----- */
    if (d.saveex != null) {
      var ee = UI.editingExercise; var o = ee.obj;
      readExerciseForm(o);
      if (!o.name.trim()) { toast("Name required"); return; }
      if (ee.isNew) EX.push(o);
      saveEx(); go("exercises"); toast("Saved");
      return;
    }
    if (d.exdel != null) {
      var o2 = UI.editingExercise.obj;
      EX = EX.filter(function (x) { return x.id !== o2.id; });
      saveEx(); go("exercises"); toast("Deleted");
      return;
    }
    if (d.iconupload != null) {
      var fin = document.createElement("input"); fin.type = "file"; fin.accept = "image/*";
      fin.onchange = function () {
        var f = fin.files && fin.files[0]; if (!f) return;
        fileToIcon(f, function (dataUrl) {
          if (!dataUrl) { toast("Couldn’t read that image"); return; }
          var ee = UI.editingExercise; ee.obj.icon = dataUrl;
          var pv = document.getElementById("iconpreview"); if (pv) pv.innerHTML = '<img class="exicon" src="' + dataUrl + '" alt="">';
          // Persist immediately for existing exercises so it carries through everywhere
          // without needing the Save button. (New exercises persist when Created.)
          if (!ee.isNew) { toast(saveEx() ? "Icon saved ✓" : "Couldn’t save — storage may be full"); }
          else { toast("Icon added — press Create to save"); }
        });
      };
      fin.click();
      return;
    }
    if (d.iconclear != null) {
      var ee2 = UI.editingExercise; ee2.obj.icon = "";
      var pv2 = document.getElementById("iconpreview"); if (pv2) pv2.innerHTML = exIconInner(ee2.obj);
      if (!ee2.isNew) saveEx();
      toast("Icon removed");
      return;
    }

    /* ----- exercise picker sheet ----- */
    if (d.pick != null) { if (UI._pick) UI._pick(d.pick); return; }
    if (d.picknew != null) { closeSheet(); go("exerciseEdit:new"); return; }

    /* ----- item editor sheet ----- */
    if (d.idsave != null) {
      var draft = UI._itemDraft;
      document.querySelectorAll("[data-idf]").forEach(function (inp) {
        var f = inp.dataset.idf;
        if (f === "bw") draft.bw = inp.checked;
        else if (f === "sets" || f === "rest") draft[f] = clamp(parseInt(inp.value, 10) || 0, 0, 999);
        else draft[f] = inp.value;
      });
      if (!draft.sets) draft.sets = 1;
      if (UI._itemSave) UI._itemSave(draft);
      return;
    }

    /* ----- session logger ----- */
    if (d.delset != null) {
      var p = d.delset.split(":"), lg = curSession();
      if (lg) { var it2 = lg.items[+p[0]]; if (it2.sets.length > 1) it2.sets.splice(+p[1], 1); save(); render(); }
      return;
    }
    if (d.notetoggle != null) { UI.expanded[+d.notetoggle] = !UI.expanded[+d.notetoggle]; render(); return; }
    if (d.sessdel != null) {
      if (confirm("Delete this workout session? This removes it from your history.")) {
        var lg2 = curSession();
        if (lg2) { S.logs = S.logs.filter(function (x) { return x.id !== lg2.id; }); save(); }
        stopRest(); goBack("history");
      }
      return;
    }
    if (d.restpill != null) { var rsecs = parseInt(d.restpill, 10) || 0; if (rsecs > 0) startRest(el.dataset.restname || "Rest", rsecs); return; }
    if (d.restadd != null) { if (UI.rest) { UI.rest.endsAt += 15000; UI.rest.total += 15; UI.rest.beeped = false; updateRestTimer(); } return; }
    if (d.restsub15 != null) { if (UI.rest) { UI.rest.endsAt -= 15000; if (UI.rest.endsAt < Date.now()) UI.rest.endsAt = Date.now(); updateRestTimer(); } return; }
    if (d.restskip != null) { stopRest(); return; }

    /* ----- weight ----- */
    if (d.wsave != null) {
      var wdk = UI.selectedDate || todayKey();
      var inp = document.querySelector("[data-wnew]"); var v = num(inp && inp.value);
      if (v == null) { toast("Enter a weight"); return; }
      var existing = weightOn(wdk);
      if (existing) existing.weight = v; else S.weights.push({ date: wdk, weight: v, note: "" });
      save(); toast("Weight saved");
      goBack("home");   // close back to home after logging
      return;
    }
    if (d.wdel != null) { S.weights = S.weights.filter(function (x) { return x.date !== d.wdel; }); save(); render(); return; }

    /* ----- plan editor ----- */
    if (d.planweek != null) { UI.planWeek = +d.planweek; render(); return; }
    if (d.planadd != null) {
      var day = +d.planadd;
      openWorkoutPicker(function (wid) {
        var wk = S.plan.weeks[UI.planWeek || 0];
        wk[day] = wk[day] || []; wk[day].push(wid);
        save(); closeSheet(); render();
      });
      return;
    }
    if (d.plandel != null) {
      var pr = d.plandel.split(":"), day2 = +pr[0], wid2 = pr[1];
      var wk2 = S.plan.weeks[UI.planWeek || 0];
      wk2[day2] = (wk2[day2] || []).filter(function (x) { return x !== wid2; });
      save(); render();
      return;
    }

    /* ----- settings ----- */
    if (d.unit != null) { S.settings.unit = d.unit; save(); render(); return; }
    if (d.settheme != null) { S.settings.theme = d.settheme; applyTheme(); save(); render(); return; }
    if (d.dark != null) { S.settings.dark = d.dark === "1"; applyTheme(); save(); render(); return; }
    if (d.reset != null) {
      if (confirm("Delete ALL data for " + PROFILE + "? This cannot be undone.")) {
        localStorage.removeItem(KEY); S = null; load(); go("home"); toast("Reset");
      }
      return;
    }

    /* ----- more: export / import / switch ----- */
    if (d.export != null) { exportData(); return; }
    if (d.import != null) { importData(); return; }
    if (d.switch != null) { location.href = "../"; return; }

    /* ----- history delete ----- */
    if (d.logdel != null) {
      if (confirm("Delete this logged workout?")) { S.logs = S.logs.filter(function (x) { return x.id !== d.logdel; }); save(); go("history"); }
      return;
    }
  });

  function openWorkoutPicker(onPick) {
    var list = S.workouts.length ? S.workouts.map(function (w) {
      return '<div class="listitem" data-pickw="' + w.id + '"><div class="lead">💪</div><div class="lt"><b>' + esc(w.name) + "</b><small>" + w.items.length + " exercises</small></div></div>";
    }).join("") : '<div class="empty">No workouts yet. Create one first.</div>';
    openSheet("<h3>Add to day</h3>" + list);
    // wire picks (simple, since data-pickw not in main delegation)
    document.querySelectorAll("[data-pickw]").forEach(function (el) {
      el.addEventListener("click", function () { onPick(el.dataset.pickw); });
    });
  }

  /* ---------- Form readers (live-bind) ---------- */
  document.addEventListener("input", function (e) {
    var t = e.target;
    // session set inputs -> write straight into the current session log
    if (t.dataset && t.dataset.sw != null) { var p = t.dataset.sw.split(":"); var lg = curSession(); if (lg) { lg.items[+p[0]].sets[+p[1]].weight = t.value; save(); } return; }
    if (t.dataset && t.dataset.sr != null) { var q = t.dataset.sr.split(":"); var l2 = curSession(); if (l2) { l2.items[+q[0]].sets[+q[1]].reps = t.value; save(); } return; }
    // generic data-set bindings (settings, plan)
    if (t.dataset && t.dataset.set != null) { setPath(t.dataset.set, t.type === "checkbox" ? t.checked : t.value); save(); return; }
    // workout name kept in draft (read on save; also live so re-render keeps it)
    if (t.dataset && t.dataset.workoutname != null && UI.editingWorkout) { UI.editingWorkout.name = t.value; return; }
    if (t.dataset && t.dataset.ex != null && UI.editingExercise) { /* read on save */ }
  });
  // Highlight (select-all) reps/weight on focus so typing replaces the value.
  document.addEventListener("focusin", function (e) {
    var t = e.target;
    if (t && t.dataset && (t.dataset.sw != null || t.dataset.sr != null) && t.select) {
      try { t.select(); } catch (err) {}
    }
  });

  // On blur of a set field: update completion visuals + start rest, without a full re-render.
  function onSetChange(input) {
    var log = curSession(); if (!log) return;
    var isW = input.dataset.sw != null;
    var key = (isW ? input.dataset.sw : input.dataset.sr).split(":");
    var it = log.items[+key[0]]; if (!it) return;
    var st = it.sets[+key[1]]; if (!st) return;
    var fill = setFilled(st, it.bw);
    var blk = input.closest(".setblk");
    if (blk) blk.querySelectorAll(".fieldbox").forEach(function (b) { b.classList.toggle("done", fill); });
    var card = input.closest(".exq"), exdone = itemComplete(it);
    if (card) {
      card.classList.toggle("exdone", exdone);
      var tickEl = card.querySelector(".exdone-tick"); if (tickEl) tickEl.textContent = exdone ? " ✓" : "";
    }
    var pr = sessionProgress(log), comp = pr.total > 0 && pr.done === pr.total;
    var pill = document.getElementById("sessprog");
    if (pill) { pill.textContent = comp ? "✓ Complete" : pr.done + " / " + pr.total; pill.classList.toggle("done", comp); }
    save();
  }

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset && (t.dataset.sw != null || t.dataset.sr != null)) { onSetChange(t); return; }
    if (t.dataset && t.dataset.planlen != null) {
      var n = +t.value, weeks = S.plan.weeks;
      while (weeks.length < n) { var wk = {}; for (var i = 0; i < 7; i++) wk[i] = []; weeks.push(wk); }
      while (weeks.length > n) weeks.pop();
      UI.planWeek = clamp(UI.planWeek || 0, 0, n - 1);
      save(); render();
    }
  });

  /* ---------- Calendar strip: click-drag to scroll (mouse; touch scrolls natively) ---------- */
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType && e.pointerType !== "mouse") return; // let touch use native scrolling
    var strip = e.target.closest && e.target.closest("#daystrip");
    if (!strip) return;
    var startX = e.clientX, startScroll = strip.scrollLeft, moved = false;
    function move(ev) {
      var dx = ev.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      strip.scrollLeft = startScroll - dx;
      if (moved) ev.preventDefault();
    }
    function up() {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if (moved) { // swallow the click so a drag doesn't select a day
        var swallow = function (ce) { ce.stopPropagation(); ce.preventDefault(); document.removeEventListener("click", swallow, true); };
        document.addEventListener("click", swallow, true);
      }
    }
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
  });

  /* ---------- Drag to reorder (workout editor) ---------- */
  document.addEventListener("pointerdown", function (e) {
    var handle = e.target.closest && e.target.closest("[data-drag]");
    if (!handle || UI.route.name !== "workoutEdit") return;
    var card = handle.closest("[data-itemid]");
    if (!card) return;
    e.preventDefault();
    beginDrag(card, handle, e);
  });
  function beginDrag(card, handle, e) {
    var view = card.closest(".view");
    var cards = Array.prototype.slice.call(view.querySelectorAll("[data-itemid]"));
    var fromIndex = cards.indexOf(card);
    var rects = cards.map(function (c) { return c.getBoundingClientRect(); });
    var startY = e.clientY, pid = e.pointerId, curTarget = fromIndex;
    card.classList.add("dragging");
    try { handle.setPointerCapture(pid); } catch (err) {}
    var indicator = document.createElement("div"); indicator.className = "drop-line";
    function placeIndicator(t) {
      if (indicator.parentNode) indicator.parentNode.removeChild(indicator);
      var others = cards.filter(function (c, i) { return i !== fromIndex; });
      if (!others.length) return;
      if (t >= others.length) others[others.length - 1].after(indicator);
      else others[t].before(indicator);
    }
    function move(ev) {
      ev.preventDefault();
      card.style.transform = "translateY(" + (ev.clientY - startY) + "px)";
      var y = ev.clientY, t = 0;
      cards.forEach(function (c, i) { if (i === fromIndex) return; var r = rects[i]; if (y > r.top + r.height / 2) t++; });
      curTarget = t; placeIndicator(t);
    }
    function up() {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      if (indicator.parentNode) indicator.parentNode.removeChild(indicator);
      card.classList.remove("dragging"); card.style.transform = "";
      var arr = UI.editingWorkout && UI.editingWorkout.items;
      if (arr && curTarget !== fromIndex) {
        var moved = arr.splice(fromIndex, 1)[0];
        arr.splice(curTarget, 0, moved);
        render();
      }
    }
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  }

  function readExerciseForm(o) {
    document.querySelectorAll("[data-ex]").forEach(function (inp) {
      var f = inp.dataset.ex;
      if (f === "bw") o.bw = inp.checked; else o[f] = inp.value;
    });
  }
  function setPath(path, val) {
    var parts = path.split("."), obj = S;
    for (var i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    var key = parts[parts.length - 1];
    if (key === "restDefault") val = parseInt(val, 10) || 0;
    obj[key] = val;
    if (path === "settings.theme") applyTheme();
  }

  /* ---------- Icon image -> small data URL ---------- */
  function fileToIcon(file, cb) {
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 160, w = img.width, h = img.height, scale = Math.min(1, max / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var c = document.createElement("canvas"); c.width = cw; c.height = ch;
        try {
          c.getContext("2d").drawImage(img, 0, 0, cw, ch);
          cb(c.toDataURL("image/jpeg", 0.82));
        } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = rd.result;
    };
    rd.onerror = function () { cb(null); };
    rd.readAsDataURL(file);
  }

  /* ---------- Export / import ---------- */
  function exportData() {
    var payload = { _mytrainer: 1, profile: S, exercises: EX };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "mytrainer-" + PROFILE + "-" + todayKey() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("Backup downloaded");
  }
  function importData() {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/json,.json";
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var data = JSON.parse(rd.result);
          if (!confirm("Replace all current data for " + PROFILE + " with this backup?")) return;
          if (data && data._mytrainer && data.profile) {
            S = data.profile;
            if (Array.isArray(data.exercises)) { EX = data.exercises; saveEx(); }
          } else if (data && data.settings) {
            S = data; // legacy single-profile backup (may contain its own exercises → migrated in load())
          } else { throw new Error("bad"); }
          save(); load(); go("home"); toast("Imported");
        } catch (err) { toast("Invalid backup file"); }
      };
      rd.readAsText(f);
    };
    inp.click();
  }

  /* ============================================================
     BOOT
     ============================================================ */
  load();
  UI.stack = [curRouteStr()];
  render();
  if (Cloud.init()) Cloud.start();   // begin cloud sync if Firebase is configured
  document.addEventListener("visibilitychange", function () { if (!document.hidden && UI.rest) updateRestTimer(); });
})();
