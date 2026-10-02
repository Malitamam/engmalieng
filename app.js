/* ENGMAliENG v0.1 – vanilla JS, tek dosya. Durum localStorage'da (cihazda). */
(function () {
  'use strict';

  // ---------- içerik ----------
  var BASE = window.ENGM_CONTENT;
  var C = mergeContent(BASE, loadExtraContent());

  function loadExtraContent() {
    try { var t = localStorage.getItem('engm_content_extra'); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }
  function mergeContent(base, extra) {
    var out = JSON.parse(JSON.stringify(base));
    if (!extra) return out;
    Object.keys(extra.weeks || {}).forEach(function (k) { out.weeks[k] = extra.weeks[k]; });
    Object.keys(extra.stories || {}).forEach(function (k) { out.stories[k] = extra.stories[k]; });
    out.order = Object.keys(out.weeks).sort();
    return out;
  }

  // ---------- sabitler ----------
  var KEY = 'engm_state_v1';
  var IS_APP = (function () { try { return window.top === window.self && /^https?:$/.test(location.protocol) && !/claude\.(ai|site)|claudeusercontent/.test(location.hostname); } catch (e) { return false; } })();
  var DAY = 86400000, MIN = 60000;
  var STEPS = [3, 7, 21, 60, 120];
  var NEW_PER_DAY = 7;
  var POOLS = {
    bil: { name: 'Bilemediklerim', every: 3, min: 10, color: 'var(--magenta)', dark: 'var(--magenta-d)', light: 'var(--magenta-l)', rule: '1 kez bilemedin → girer' },
    ym: { name: 'Yanlış modeller', every: 3, min: 5, color: 'var(--amber)', dark: 'var(--amber-d)', light: 'var(--amber-l)', rule: 'Almanca tuzakları + emin ama yanlış', label: 'haftada 2' },
    inat: { name: 'İnatçı kartlar', every: 1, min: 3, color: 'var(--red)', dark: 'var(--red-d)', light: 'var(--red-l)', rule: '3 kez bilemedin → girer' }
  };
  var KIND = {
    aktif: { label: 'Aktif kelime', color: '#2A5FF5', dir: 'BOŞLUĞA GELEN İFADEYİ YAZ' },
    kalip: { label: 'Kalıp', color: '#4F46E5', dir: 'İNGİLİZCESİNİ YAZ' },
    gramer: { label: 'Gramer', color: '#15803D', dir: 'BOŞLUĞU DOLDUR' },
    pasif: { label: 'Pasif kelime', color: '#0EA5E9', dir: 'ANLAMI HANGİSİ?' },
    tuzak: { label: 'Almanca tuzağı', color: '#B45309', dir: 'DOĞRUSU HANGİSİ?' },
    surpriz: { label: 'Sürpriz soru', color: '#7C3AED', dir: '30 SANİYE KONUŞ · 0-P-R-E-P' },
    telaffuz: { label: 'Dinle-yaz', color: '#0F766E', dir: 'DİNLE VE DUYDUĞUNU YAZ' },
    ceviri: { label: 'Karışık çeviri', color: '#4F46E5', dir: 'İNGİLİZCESİNİ YAZ' },
    model: { label: 'Yanlış model', color: '#B45309', dir: 'DOĞRU İNGİLİZCESİNİ YAZ' },
    boss: { label: 'Boss sorusu', color: '#E11D48', dir: 'TEKRAR DENE' }
  };
  var SEED_MODELS = [
    ['Cumaya kadar sonuçları göndereceğim.', 'I will send the results until Friday.', "I'll send the results by Friday.", 'Son tarih = by (bis değil until).'],
    ["Nisan'dan beri MAN'de çalışıyorum.", 'I am working at MAN since April.', "I've been working at MAN since April.", 'seit + şimdiki zaman → present perfect.'],
    ['7 yıldır burada çalışıyorum.', 'I work here since 7 years.', "I've worked here for seven years.", 'Süre = for, başlangıç noktası = since.'],
    ['Geçen hafta tedarikçiyle bir sorun yaşadık.', 'Wir had got a problem with the supplier.', 'We had a problem with the supplier last week.', 'Bitmiş zaman → simple past (had).'],
    ['Bundan emin değilim.', 'I am not sure for that.', "I'm not sure about that.", 'sure about (for değil).'],
    ['Kontrol edip size döneceğim.', 'I will check it and give you feedback.', "I'll check and get back to you.", 'Rückmeldung ≠ feedback → get back to you.'],
    ['Ar-Ge bütçesini yönetiyorum.', 'I am responsible for the steering of the budget.', "I'm responsible for managing the R&D budget.", 'Steuerung ≠ steering → managing / controlling.']
  ];

  // ---------- durum ----------
  function freshState() {
    return { v: 1, created: Date.now(), arrived: {}, cards: {}, newLog: {}, days: {}, reviewDays: {}, xp: 0,
      ticks: {}, comboDays: {}, boss: {}, poolDone: {}, gate: {}, weekly: {}, story: {}, extraCards: {},
      settings: { et: false, testMode: false, timeShift: 0 } };
  }
  var S = load();
  function load() {
    try { var t = localStorage.getItem(KEY); if (t) { var s = JSON.parse(t); return Object.assign(freshState(), s); } } catch (e) { }
    return freshState();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }

  // ---------- zaman ----------
  function now() { return Date.now() + (S.settings.timeShift || 0); }
  function dkey(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function today() { return dkey(now()); }
  function parseDay(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getTime(); }
  function addDays(k, n) { var d = new Date(parseDay(k)); d.setDate(d.getDate() + n); return dkey(d.getTime()); }
  function weekday(t) { return (new Date(t).getDay() + 6) % 7; } // Pzt=0
  function mondayOf(k) { return addDays(k, -weekday(parseDay(k))); }
  var DAYNAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  var MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  function fmtDate(t) { var d = new Date(t); return DAYNAMES[weekday(t)] + ' · ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function shortDate(k) { var p = k.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }

  // ---------- yardımcılar ----------
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clean(s) { return String(s || '').replace(/[«»]/g, '').replace(/\*\*/g, ''); }
  function fam(n) { var b = Math.ceil(n / 4); return b <= 2 ? '#0F766E' : b <= 6 ? '#2A5FF5' : b <= 10 ? '#7C3AED' : '#E11D48'; }
  function weekNum(code) { return parseInt(String(code).replace(/\D/g, ''), 10) || 0; }
  function isReview(code) { var w = C.weeks[code]; return w && w.type === 'tekrar'; }
  var ICON = {
    speaker: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    flame: function (c) { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + c + '" stroke="#1A0D00" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5c.8 3.2 4.8 5.2 4.8 10a4.8 4.8 0 0 1-9.6 0c0-2 1-3.4 2-4.2.1 1.6 1 2.7 2.1 2.9-.6-3.2.1-6.3.7-8.7z"/></svg>'; },
    shield: '<svg width="15" height="15" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z"/></svg>',
    repeat: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A0D00" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>',
    lock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    star: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
    tabs: {
      bugun: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
      tur: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
      kutuphane: '<path d="M4 5h4v15H4zM10 5h4v15h-4z"/><path d="M16.5 5.5l3.8-1 3 14.5-3.8 1z"/>',
      havuz: '<path d="M4 7h16l-1.5 12h-13z"/><path d="M8 7a4 4 0 0 1 8 0"/>',
      ilerleme: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
    }
  };

  // ---------- ses ----------
  var voice = null;
  function pickVoice() {
    try {
      var vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
      voice = vs.find(function (v) { return /en[-_]US/i.test(v.lang) && /google|samantha|aria|jenny/i.test(v.name); }) || vs.find(function (v) { return /en[-_]US/i.test(v.lang); }) || null;
    } catch (e) { }
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(text) {
    if (!window.speechSynthesis) { toast('Bu cihazda sesli okuma yok'); return; }
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(clean(text));
      u.lang = 'en-US'; u.rate = 0.92; if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    } catch (e) { toast('Ses çalınamadı'); }
  }

  // ---------- haftalar ----------
  function arrivedCount() { return C.order.filter(function (c) { return S.arrived[c]; }).length; }
  function currentWeek() { for (var i = 0; i < C.order.length; i++) { if (!S.arrived[C.order[i]]) return C.order[i]; } return C.order[C.order.length - 1]; }
  function unlockedWeeks() { var cur = currentWeek(); var out = []; for (var i = 0; i < C.order.length; i++) { out.push(C.order[i]); if (C.order[i] === cur) break; } return out; }
  function nextAfter(code) { var i = C.order.indexOf(code); return i >= 0 && i < C.order.length - 1 ? C.order[i + 1] : null; }

  // ---------- kartlar ----------
  var defCache = {};
  function cardsForWeek(code) {
    if (defCache[code]) return defCache[code];
    var w = C.weeks[code]; var out = [];
    if (!w) return out;
    if (w.type === 'tekrar') {
      (w.mix_translation || []).forEach(function (x, i) { out.push({ id: code + '-c' + i, week: code, kind: 'ceviri', mode: 'type', main: x.tr, en: x.en, answer: x.en, say: x.en }); });
      (w.grammar_mix || []).forEach(function (x, i) { out.push({ id: code + '-g' + i, week: code, kind: 'gramer', mode: 'type', main: x.q, en: x.answer, answer: x.answer, note: 'Blok ' + (w.block || 1) + ' karışık', say: x.q.replace(/_+/, x.answer.split('/')[0].trim()) }); });
      (w.surpriz || []).forEach(function (x, i) { out.push({ id: code + '-s' + i, week: code, kind: 'surpriz', noStudy: true, main: x.q, en: x.sample_answer, say: x.q, sayBack: x.sample_answer }); });
    } else {
      (w.aktif || []).forEach(function (x, i) {
        var t = x.target || ''; var ex = x.example || '';
        var cloze = t && ex.indexOf(t) >= 0 ? ex.replace(t, '_____') : ex;
        out.push({ id: code + '-a' + i, week: code, kind: 'aktif', mode: 'type', main: x.tr, sub: cloze, en: x.en, answer: t || x.en, full: ex, say: ex });
      });
      (w.kalip || []).forEach(function (x, i) { out.push({ id: code + '-k' + i, week: code, kind: 'kalip', mode: 'type', main: x.tr, en: clean(x.en), answer: clean(x.en), say: x.en }); });
      var g = w.gramer || {};
      (g.anki_variants || []).forEach(function (x, i) { out.push({ id: code + '-g' + i, week: code, kind: 'gramer', mode: 'type', main: x.q, en: x.answer, answer: x.answer, note: g.title, say: x.q.replace(/_+/, String(x.answer).split('/')[0].trim()) }); });
      (w.pasif || []).forEach(function (x, i) { out.push({ id: code + '-p' + i, week: code, kind: 'pasif', mode: 'mc', main: x.en, sub: x.context, en: x.tr, say: x.en, sayFront: true }); });
      if (w.tuzak) { var tz = w.tuzak; var ok = tz.options[tz.answer.charCodeAt(0) - 97]; out.push({ id: code + '-t0', week: code, kind: 'tuzak', mode: 'mc', main: tz.de, opts: tz.options, en: ok, note: tz.rule, say: ok, pool: 'ym' }); }
      (w.surpriz || []).forEach(function (x, i) { out.push({ id: code + '-s' + i, week: code, kind: 'surpriz', noStudy: true, main: x.q, en: x.sample_answer, say: x.q, sayBack: x.sample_answer, sayFront: true }); });
      (w.telaffuz || []).forEach(function (x, i) { out.push({ id: code + '-f' + i, week: code, kind: 'telaffuz', mode: 'listen', main: x.word, en: x.word, hint: x.hint, answer: x.word, note: x.hint + ' · ' + x.note, say: x.word }); });
    }
    defCache[code] = out; return out;
  }
  function seedCards() { return SEED_MODELS.map(function (m, i) { return { id: 'Y00-m' + i, week: 'H00', kind: 'model', mode: 'type', main: m[0], sub: 'Eski hatan: "' + m[1] + '"', en: m[2], answer: m[2], note: m[3], say: m[2], pool: 'ym' }; }); }
  function bossCards() { return Object.keys(S.extraCards).map(function (k) { return S.extraCards[k]; }); }
  function allDefs() {
    var list = seedCards();
    unlockedWeeks().forEach(function (c) { list = list.concat(cardsForWeek(c)); });
    return list.concat(bossCards());
  }
  function defById(id) { var all = allDefs(); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function cs(id) { return S.cards[id]; }
  function ensureCard(d) {
    if (!S.cards[d.id]) { S.cards[d.id] = { s: 0, reps: 0, lapses: 0, consec: 0, due: now(), last: null, pools: {}, seen: now() }; if (d.pool) S.cards[d.id].pools[d.pool] = 1; }
    return S.cards[d.id];
  }
  function isKnown(id) { var c = S.cards[id]; return !!(c && c.last === 'k'); }
  function newIntroducedToday() { return S.newLog[today()] || 0; }

  function dailyQueue() {
    var t = now(); var due = [], fresh = [];
    allDefs().forEach(function (d) {
      if (d.noStudy) return;
      var c = S.cards[d.id];
      if (c) { if (c.due <= t) due.push(d); }
      else if (d.kind !== 'model' && d.kind !== 'boss') fresh.push(d);
    });
    due.sort(function (a, b) { return S.cards[a.id].due - S.cards[b.id].due; });
    var order = ['aktif', 'kalip', 'gramer', 'pasif', 'tuzak', 'surpriz', 'telaffuz', 'ceviri'];
    fresh.sort(function (a, b) { return weekNum(a.week) - weekNum(b.week) || order.indexOf(a.kind) - order.indexOf(b.kind); });
    var room = Math.max(0, NEW_PER_DAY - newIntroducedToday());
    // havuz ağırlığı: vadesi gelmemiş Bilemediklerim/İnatçı kartlardan 5 tanesi her güne eklenir
    var dueIds = {}; due.forEach(function (d) { dueIds[d.id] = 1; });
    var extra = shuffle(allDefs().filter(function (d) { var c = S.cards[d.id]; return !d.noStudy && c && !dueIds[d.id] && (c.pools.bil || c.pools.inat) && c.lastSeenDay !== today(); })).slice(0, 5);
    return { due: due, fresh: fresh.slice(0, room), freshTotal: fresh.length, extra: extra };
  }
  function poolCards(p) { return allDefs().filter(function (d) { var c = S.cards[d.id]; if (!c) return p === 'ym' && d.kind === 'model'; return !!c.pools[p]; }); }

  function rate(d, known, partial) {
    var c = ensureCard(d); var t = now(); c.lastSeenDay = today();
    var wasNew = c.reps === 0 && c.lapses === 0;
    if (wasNew) S.newLog[today()] = (S.newLog[today()] || 0) + 1;
    S.reviewDays[today()] = (S.reviewDays[today()] || 0) + 1;
    var msg = '';
    if (known && partial) {
      // %70+ uzun cümle: geçerli sayılır ama aralık büyümez, yarın tekrar gelir; mezuniyet sayacını ilerletmez
      c.reps++; c.due = t + DAY; c.last = 'k'; c.partial = (c.partial || 0) + 1;
      addXP(3); msg = 'Geçerli (%70+) · eksikler için yarın tekrar gelecek';
    } else if (known) {
      c.reps++; c.consec++; var iv = STEPS[Math.min(c.s, STEPS.length - 1)]; c.s++; c.due = t + iv * DAY; c.last = 'k';
      addXP(5);
      var inPool = Object.keys(c.pools).some(function (k) { return c.pools[k]; });
      if (inPool && c.consec >= 3) { c.pools = {}; addXP(10); msg = 'Mezun! Havuzdan çıktı · +10 XP'; }
    } else {
      c.lapses++; c.consec = 0; c.s = 0; c.due = t + 10 * MIN; c.last = 'u';
      c.pools.bil = 1; if (c.lapses >= 3) c.pools.inat = 1; if (d.kind === 'tuzak' || d.kind === 'model') c.pools.ym = 1;
      addXP(1);
      msg = 'Bilemediklerim havuzuna eklendi';
    }
    save();
    return msg;
  }

  // ---------- XP / seri ----------
  function addXP(n) { S.xp += n; S.days[today()] = (S.days[today()] || 0) + n; }
  function level() { var l = Math.floor(S.xp / 500) + 1; return { l: l, into: S.xp % 500, pct: Math.round((S.xp % 500) / 5) }; }
  var LEVELNAMES = ['Yolcu', 'Kaşif', 'Gezgin', 'Konuşkan', 'Sohbetçi', 'Sunucu', 'Müzakereci', 'Diplomat', 'Kaptan', 'Usta'];
  function jokerDays() {
    var set = {};
    (C.calendar || []).forEach(function (c) { if (c.type === 'joker') { for (var i = 0; i < 7; i++) set[addDays(c.monday, i)] = 1; } });
    return set;
  }
  function streakInfo() {
    var keys = Object.keys(S.days).filter(function (k) { return S.days[k] > 0; }).sort();
    var res = { streak: 0, record: 0, bonus: 0, restLeft: 2, kor: false };
    if (!keys.length) return res;
    var jk = jokerDays(); var tdy = today(); var rest = {}; var since = 0;
    var d = keys[0];
    while (d <= tdy) {
      var wk = mondayOf(d);
      if ((S.days[d] || 0) > 0) { res.streak++; since++; if (since >= 10) { res.bonus = Math.min(3, res.bonus + 1); since = 0; } }
      else if (d === tdy) { /* bugün henüz bitmedi */ }
      else if (jk[d]) { /* joker */ }
      else if ((rest[wk] || 0) < 2) { rest[wk] = (rest[wk] || 0) + 1; }
      else if (res.bonus > 0) { res.bonus--; }
      else {
        var d1 = addDays(d, 1), d2 = addDays(d, 2);
        var saved = (S.days[d1] || 0) >= 60 || (d2 <= tdy && (S.days[d2] || 0) >= 60);
        if (!saved && d2 >= tdy) { res.kor = true; }
        else if (!saved) { res.streak = 0; since = 0; }
      }
      res.record = Math.max(res.record, res.streak);
      d = addDays(d, 1);
    }
    res.restLeft = 2 - (rest[mondayOf(tdy)] || 0);
    return res;
  }
  function flameColor(n) { return n >= 100 ? '#EAB308' : n >= 50 ? '#A78BFA' : n >= 21 ? '#60A5FA' : n >= 7 ? '#FFB547' : '#FF7A7A'; }

  // ---------- havuz takvimi ----------
  function poolStatus(p) {
    var list = poolCards(p); var cfg = POOLS[p];
    if (!list.length) return { count: 0, overdue: 0, dueToday: false };
    var last = S.poolDone[p];
    if (!last) return { count: list.length, overdue: 0, dueToday: true };
    var days = Math.floor((parseDay(today()) - parseDay(dkey(last))) / DAY);
    var over = days - cfg.every;
    return { count: list.length, overdue: Math.max(0, over), dueToday: days >= cfg.every, nextIn: Math.max(0, cfg.every - days) };
  }

  // ---------- kapı ----------
  var THRESH = { normal: { pass: 9, s3: 11, s2: 9, s1: 7 }, review: { pass: 20, s3: 25, s2: 20, s1: 15 } };
  function bossQuestions(code) { var w = C.weeks[code]; if (!w) return []; return w.type === 'tekrar' ? (w.block_test || []) : (w.test || []); }
  function stars(code, score) { var th = isReview(code) ? THRESH.review : THRESH.normal; return score >= th.s3 ? 3 : score >= th.s2 ? 2 : score >= th.s1 ? 1 : 0; }
  function gateInfo(code) {
    var review = isReview(code); var th = review ? THRESH.review : THRESH.normal;
    var defs = cardsForWeek(code); var b = S.boss[code] || {};
    var c1 = (b.best || 0) >= th.pass;
    var aset = defs.filter(function (d) { return d.kind === (review ? 'ceviri' : 'aktif'); });
    var aKnown = aset.filter(function (d) { return isKnown(d.id); }).length;
    var aNeed = Math.ceil(aset.length * 0.8);
    var kset = defs.filter(function (d) { return d.kind === (review ? 'gramer' : 'kalip'); });
    var kKnown = kset.filter(function (d) { return isKnown(d.id); }).length;
    var kNeed = review ? Math.min(kset.length, 5) : Math.min(kset.length, 8);
    var rec = !!(S.gate[code] && S.gate[code].kayit);
    var items = [
      { ok: c1, title: 'Boss ≥ ' + th.pass + '/' + bossQuestions(code).length, sub: b.best != null ? 'En iyi: ' + b.best + ' ' + '★'.repeat(stars(code, b.best)) : 'Henüz denenmedi', act: 'boss' },
      { ok: aKnown >= aNeed, title: (review ? 'Karışık çevirilerin' : 'Aktif kelimelerin') + ' %80\'i "Bildim"', sub: aKnown + '/' + aset.length + ' (gereken ' + aNeed + ')', act: 'study' },
      { ok: kKnown >= kNeed, title: (review ? 'Gramer karışığından ' + kNeed + '/' + kset.length : kNeed + '/' + kset.length + ' kalıp notsuz') , sub: 'Bildim: ' + kKnown, act: 'study' },
      { ok: rec, title: review ? 'Sabit kayıt (2 dk)' : 'Konuşma kaydı (60–90 sn)', sub: rec ? 'Yapıldı' : 'Telefonun ses kaydedicisiyle yap, sonra işaretle', act: 'kayit' }
    ];
    return { items: items, open: items.every(function (i) { return i.ok; }), left: items.filter(function (i) { return !i.ok; }).length };
  }

  // ---------- plan ilerlemesi ----------
  function planInfo() {
    var cal = (C.calendar || []).filter(function (c) { return c.monday; });
    var tdy = today(); var planned = 0; var planLabel = 'Başlamadı'; var started = cal.length && tdy >= cal[0].monday;
    for (var i = 0; i < cal.length; i++) {
      var c = cal[i]; var end = addDays(c.monday, 7);
      if (tdy >= end) { if (c.type !== 'joker') planned += 1; continue; }
      if (tdy >= c.monday) { var into = Math.round((parseDay(tdy) - parseDay(c.monday)) / DAY) + 1; if (c.type !== 'joker') planned += into / 7; planLabel = c.label + ' · gün ' + into + '/7'; }
      break;
    }
    var arrived = arrivedCount(); var cur = currentWeek(); var part = 0;
    if (!S.arrived[cur]) { var gi = gateInfo(cur); part = Math.min(0.9, gi.items.filter(function (x) { return x.ok; }).length / gi.items.length * 0.9 + Math.min(0.1, (Object.keys(S.cards).filter(function (id) { return id.indexOf(cur + '-') === 0; }).length) / 400)); }
    var actual = arrived + part;
    var diffDays = Math.round((actual - planned) * 7);
    var total = cal.filter(function (c) { return c.type !== 'joker'; }).length || 52;
    var lastMon = cal.length ? cal[cal.length - 1].monday : null;
    var planEnd = lastMon ? addDays(lastMon, 6) : null;
    var projEnd = planEnd ? addDays(planEnd, -diffDays) : null;
    return { planned: planned, actual: actual, diffDays: diffDays, total: total, planLabel: started ? planLabel : 'Plan ' + shortDate(cal[0] ? cal[0].monday : tdy) + ' başlar', planEnd: planEnd, projEnd: projEnd };
  }
  function planBadge(pi) {
    if (pi.diffDays > 0) return '<span class="pill" style="background:#22C55E;color:#052E16;font-size:12px">+' + pi.diffDays + ' gün önde</span>';
    if (pi.diffDays < 0) return '<span class="pill" style="background:var(--amber);color:#3B2300;font-size:12px">' + (-pi.diffDays) + ' gün geride</span>';
    return '<span class="pill" style="background:var(--blue);color:#fff;font-size:12px">Planda</span>';
  }
  function planBar(pi, dark) {
    var pct = function (x) { return Math.max(0, Math.min(100, x / pi.total * 100)); };
    var a = pct(pi.actual), p = pct(pi.planned);
    var track = dark ? 'var(--graphite-3)' : '#E3E7F1';
    return '<div style="position:relative;height:14px;border-radius:7px;background:' + track + ';overflow:visible" role="img" aria-label="Gerçek ' + pi.actual.toFixed(1) + ' hafta, plan ' + pi.planned.toFixed(1) + ' hafta">' +
      '<span style="position:absolute;left:0;top:0;bottom:0;width:' + Math.max(a, 1.2) + '%;border-radius:7px;background:' + (pi.diffDays >= 0 ? '#22C55E' : 'var(--amber)') + '"></span>' +
      '<span style="position:absolute;top:-4px;bottom:-4px;left:calc(' + p + '% - 1.5px);width:3px;border-radius:2px;background:' + (dark ? '#fff' : 'var(--graphite)') + '"></span></div>';
  }

  // ---------- görünüm durumu ----------
  var V = { tab: 'bugun', stack: [] };
  var UI = {};
  function go(view, params) { V.stack.push({ view: view, params: params || {} }); window.scrollTo(0, 0); render(); }
  function back() { V.stack.pop(); window.scrollTo(0, 0); render(); }
  function setTab(t) { V.tab = t; V.stack = []; window.scrollTo(0, 0); render(); }

  // ---------- toast / konfeti ----------
  var toastTimer;
  function toast(msg) {
    var r = document.getElementById('toast-root');
    r.innerHTML = '<div class="toast" role="status">' + h(msg) + '</div>';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { r.innerHTML = ''; }, 2200);
  }
  function confetti() {
    var cols = ['#FF7A1A', '#2A5FF5', '#7C3AED', '#15803D', '#EAB308', '#D946EF', '#E11D48'];
    var el = document.createElement('div'); el.className = 'confetti';
    var html = '';
    for (var i = 0; i < 60; i++) html += '<i style="left:' + Math.random() * 100 + '%;background:' + cols[i % cols.length] + ';animation-delay:' + (Math.random() * 0.5) + 's"></i>';
    el.innerHTML = html; document.body.appendChild(el); setTimeout(function () { el.remove(); }, 2400);
  }

  // ---------- render ----------
  var app = document.getElementById('app');
  function render() {
    var top = V.stack[V.stack.length - 1];
    var html = '';
    try {
      if (top) html = (VIEWS[top.view] || VIEWS.notfound)(top.params);
      else html = TABS[V.tab]();
    } catch (e) { html = '<div class="page"><div class="card"><b>Bir hata oluştu</b><span class="small muted">' + h(e.message) + '</span><button class="btn btn-dark" data-a="home">Ana sayfaya dön</button></div></div>'; console.error(e); }
    var hideBar = top && ['study', 'boss'].indexOf(top.view) >= 0;
    app.innerHTML = html + (hideBar ? '' : tabbar());
    var af = app.querySelector('[data-autofocus]'); if (af) { try { af.focus({ preventScroll: true }); } catch (e) { af.focus(); } }
  }
  function tabbar() {
    var tabs = [['bugun', 'Bugün'], ['tur', 'Tur'], ['kutuphane', 'Kütüphane'], ['havuz', 'Havuzlar'], ['ilerleme', 'İlerleme']];
    return '<nav class="tabbar" aria-label="Ana menü"><div class="tabbar-in">' + tabs.map(function (t) {
      var on = V.tab === t[0] && !V.stack.length;
      return '<button class="tab' + (on ? ' on' : '') + '" data-a="tab" data-v="' + t[0] + '"' + (on ? ' aria-current="page"' : '') + '><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON.tabs[t[0]] + '</svg>' + t[1] + '</button>';
    }).join('') + '</div></nav>';
  }
  function headerChips() {
    var st = streakInfo(); var lv = level();
    return '<div class="chips">' +
      '<button class="chip" style="background:var(--orange);color:#1A0D00" data-a="tab" data-v="ilerleme" aria-label="Alev ' + st.streak + ' gün">' + ICON.flame(flameColor(st.streak)) + st.streak + '</button>' +
      '<span class="chip" style="background:var(--blue);color:#fff" aria-label="' + (st.restLeft + st.bonus) + ' kalkan">' + ICON.shield + (st.restLeft + st.bonus) + '</span>' +
      '<span class="chip" style="background:var(--violet);color:#fff">Lv ' + lv.l + '</span></div>';
  }
  function backBar(title, sub, dark) {
    return '<div class="' + (dark ? 'band' : 'page') + '" style="' + (dark ? '' : 'padding-bottom:0') + '"><div class="row"><button class="backbtn" data-a="back" aria-label="Geri">' + ICON.back + '</button><div class="stack grow"><span class="h-display" style="font-size:22px">' + h(title) + '</span>' + (sub ? '<span class="small muted">' + h(sub) + '</span>' : '') + '</div></div></div>';
  }

  // ---------- SEKMELER ----------
  var TABS = {};
  TABS.bugun = function () {
    var code = currentWeek(); var w = C.weeks[code]; var n = weekNum(code); var t = now();
    var wd = weekday(t); var start = (C.meta && C.meta.start) || '2026-10-05';
    var pre = today() < start;
    var q = dailyQueue(); var dueN = q.due.length + q.fresh.length;
    var lv = level();
    var st = streakInfo();
    var city = C.route[n] ? C.route[n][0] : '';
    var html = '<div class="band"><div class="band-top"><div class="stack"><span class="small muted">' + fmtDate(t) + '</span><span class="h-display" style="font-size:22px">' + greeting() + '</span></div>' + headerChips() + '</div>';
    html += '<button class="card" data-a="go" data-v="week" data-p="' + code + '" style="background:var(--graphite-2);border:none;color:#fff;text-align:left;gap:8px">' +
      '<div class="row"><span class="pill" style="background:var(--teal);color:#04231F;font-size:13px">' + code + '</span><b class="grow" style="font-size:15px">' + h(w.title) + '</b><span class="small muted">' + (isReview(code) ? 'Kale haftası' : 'Gün ' + Math.min(wd + 1, 5) + '/5') + '</span></div>' +
      '<div class="weekstrip">' + [0, 1, 2, 3, 4].map(function (i) { var c = i < wd ? 'var(--teal)' : i === wd ? '#FFC53D' : i === 4 ? '#F43F5E' : 'var(--graphite-3)'; return '<span style="background:' + c + '"></span>'; }).join('') + '</div>' +
      '<div class="row tiny muted" style="justify-content:space-between"><span>Hedef durak: ' + h(city) + '</span><span style="color:#FDA4AF;font-weight:800">Cuma: BOSS</span></div></button>';
    var pi = planInfo();
    html += '<button data-a="tab" data-v="ilerleme" style="background:none;border:none;color:#fff;text-align:left;padding:0;display:flex;flex-direction:column;gap:6px"><div class="row" style="justify-content:space-between"><span class="small"><b class="tnum">' + pi.actual.toFixed(1).replace('.', ',') + '</b><span class="muted"> / ' + pi.total + ' hafta · ' + h(pi.planLabel) + '</span></span>' + planBadge(pi) + '</div>' + planBar(pi, true) + '<span class="tiny muted">Yeşil: senin ilerlemen · beyaz çizgi: planın bugün olması gereken yer</span></button></div>';
    html += '<div class="page">';
    if (pre) html += '<div class="alert" style="background:var(--blue-l);color:var(--blue-d)"><b>Deneme modu.</b>&nbsp;Resmi başlangıç ' + shortDate(start) + '. Şimdiden deneyebilirsin; ilerlemen saklanır.</div>';
    if (st.kor) html += '<div class="alert" style="background:var(--red-l);color:#881337"><b>Alev kor halinde.</b>&nbsp;Bugün 60 XP topla, alev geri yansın.</div>';
    var paperDays = Object.keys(S.ticks).filter(function (k) { return k >= mondayOf(today()) && Object.keys(S.ticks[k]).length; }).length;
    html += '<div class="tiles">' +
      tile(S.days[today()] || 0, 'bugün XP', 'var(--orange-d)') +
      tile(weeklyScore(code).total + '/20', 'hafta puanı', 'var(--amber-d)') +
      tile(poolCards('bil').length + poolCards('inat').length + poolCards('ym').length, 'havuzda', 'var(--magenta-d)') +
      tile(lv.pct + '%', 'Lv ' + lv.l + ' →', 'var(--violet)') + '</div>';
    // havuz uyarıları
    var alerts = [];
    Object.keys(POOLS).forEach(function (p) { var s = poolStatus(p); if (s.count && s.overdue >= 1) alerts.push({ p: p, s: s }); });
    alerts.sort(function (a, b) { return b.s.overdue - a.s.overdue; });
    alerts.forEach(function (a) {
      var txt = a.s.overdue >= 3 ? 'alev kor moduna girer – hemen çalış' : a.s.overdue >= 2 ? 'bugünün ilk görevi' : 'hatırlatma';
      html += '<button class="alert" data-a="pool" data-v="' + a.p + '" style="background:var(--amber-l);color:#7A4A00;border:1px solid #FBD38D;text-align:left"><b>Kural:</b>&nbsp;' + POOLS[a.p].name + ' ' + a.s.overdue + ' gün gecikti → ' + txt + '</button>';
    });
    // uygulamada
    html += '<div class="card" style="gap:0;padding:4px 12px"><div class="sec-title" style="padding:8px 0 4px"><span class="eyebrow muted">Uygulamada</span><span class="small muted">~' + (10 + alerts.length * 5) + ' dk</span></div>';
    var poolRows = Object.keys(POOLS).map(function (p) { return { p: p, s: poolStatus(p) }; }).filter(function (x) { return x.s.count && x.s.dueToday; });
    poolRows.sort(function (a, b) { return b.s.overdue - a.s.overdue; });
    var first = poolRows.filter(function (x) { return x.s.overdue >= 2; });
    var rest = poolRows.filter(function (x) { return x.s.overdue < 2; });
    first.forEach(function (x) { html += poolRow(x.p, x.s); });
    html += '<button class="listrow" data-a="study" data-v="daily"><span class="ico" style="background:var(--orange)">' + ICON.repeat + '</span><span class="stack grow"><b>Günlük tekrar</b><span class="small muted">' + (dueN ? dueN + ' kart · ' + q.fresh.length + ' yeni · ~' + Math.max(3, Math.round(dueN * 0.4)) + ' dk' : 'Bugünlük bitti · yarın yeni kartlar') + '</span></span><span class="btn btn-sm btn-blue">' + (dueN ? 'Başla' : 'Bitti') + '</span></button>';
    rest.forEach(function (x) { html += poolRow(x.p, x.s); });
    var gi = gateInfo(code);
    html += '<button class="listrow" data-a="go" data-v="gate" data-p="' + code + '"><span class="ico" style="background:var(--graphite);color:#FF7A1A">' + ICON.lock + '</span><span class="stack grow"><b>Ustalık kapısı → ' + h(city) + '</b><span class="small muted">' + (gi.open ? 'Kapı açık! Geç ve şehre var' : gi.left + ' görev kaldı') + '</span></span><span class="btn btn-sm btn-dark">' + (gi.open ? 'Geç' : 'Bak') + '</span></button>';
    html += '</div>';
    // kâğıtta
    html += paperCard(code);
    html += '<button class="listrow card" data-a="tab" data-v="kutuphane" style="padding:10px 12px;border:1px solid var(--line)"><span class="ico" style="background:var(--graphite);color:#fff"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg></span><span class="stack grow"><b>Odak çalışma</b><span class="small muted">Gramer, konu, blok veya bilemediklerine göre filtrele ve çalış</span></span></button>';
    html += '<button class="btn btn-ghost" data-a="mini" style="border-style:dashed;color:var(--muted)">Zor gün mü? 5 dk mini gün · alev sönmez</button>';
    html += '</div>';
    return html;
  };
  function greeting() { var hr = new Date(now()).getHours(); return hr < 11 ? 'Günaydın!' : hr < 18 ? 'İyi günler!' : 'İyi akşamlar!'; }
  function tile(v, l, col) { return '<div class="tile"><b class="tnum" style="color:' + col + '">' + h(v) + '</b><span class="tiny muted">' + h(l) + '</span></div>'; }
  function poolRow(p, s) {
    var cfg = POOLS[p];
    return '<button class="listrow" data-a="pool" data-v="' + p + '"><span class="ico" style="background:' + cfg.color + ';color:#fff">' + s.count + '</span><span class="stack grow"><b>' + cfg.name + '</b><span class="small muted">' + s.count + ' kart · ' + cfg.min + ' dk' + (s.overdue ? ' · ' + s.overdue + ' gün gecikti' : ' · bugün') + '</span></span><span class="btn btn-sm" style="background:' + cfg.dark + ';color:#fff">Başla</span></button>';
  }
  function paperTasks(code) {
    var wd = weekday(now());
    var src = (C.checklist && (isReview(code) ? C.checklist.daily_ticks_review : C.checklist.daily_ticks_normal)) || [];
    var day = src[wd]; if (!day) return [];
    return day.tasks.filter(function (t) { return !/^Anki/i.test(t) && !/checklist|Kod →/i.test(t); }).map(function (t) { return t.replace(/Anki/g, 'App'); });
  }
  function paperCard(code) {
    var tasks = paperTasks(code); var tk = S.ticks[today()] || {};
    var html = '<div class="card" style="gap:0;padding:4px 12px 10px"><div class="sec-title" style="padding:8px 0 2px"><span class="eyebrow muted">Kâğıtta · PDF ' + code + '</span><span class="small" style="color:var(--green);font-weight:800">' + Object.keys(tk).length + '/' + tasks.length + ' tik</span></div>';
    if (!tasks.length) { html += '<span class="small muted" style="padding:8px 0">Bugün kâğıt görevi yok. Sadece uygulamada tekrar (min. 5 dk).</span></div>'; return html; }
    tasks.forEach(function (t, i) {
      var on = !!tk[i];
      html += '<button class="listrow" style="min-height:46px" data-a="tick" data-v="' + i + '" aria-pressed="' + on + '"><span class="check' + (on ? ' on' : '') + '">' + (on ? ICON.check : '') + '</span><span class="grow" style="font-size:14px;' + (on ? 'color:var(--muted)' : '') + '">' + h(t) + '</span><span class="pill" style="background:' + (on ? 'var(--green)' : 'var(--violet)') + ';color:#fff">+15</span></button>';
    });
    var done = Object.keys(tk).length; var all = done === tasks.length;
    html += '<div class="row" style="margin-top:6px"><div class="bar grow"><span style="width:' + Math.round(done / tasks.length * 100) + '%;background:' + (all ? 'var(--amber)' : 'var(--green)') + '"></span></div><span class="small" style="font-weight:800;color:' + (all ? 'var(--amber-d)' : 'var(--muted)') + '">' + (all ? 'KOMBO ×1,5!' : 'Kombo ' + done + '/' + tasks.length) + '</span></div></div>';
    return html;
  }

  TABS.tur = function () {
    var n = arrivedCount(); var cur = currentWeek(); var cn = weekNum(cur);
    var etap = Math.ceil(Math.max(cn, 1) / 4);
    var html = '<div class="band"><div class="band-top"><div class="stack"><span class="eyebrow" style="color:var(--orange)">Avrupa Turu · Münih → Münih</span><span class="h-display" style="font-size:24px">Etap ' + etap + ' · ' + h(C.etaps[etap - 1] || '') + '</span></div><button class="chip" data-a="go" data-v="passport" style="background:var(--graphite-2);color:#fff;flex-direction:column;gap:0;border-radius:12px"><span class="h-display tnum" style="font-size:18px">' + n + '<span class="small muted">/52</span></span><span class="tiny muted">damga</span></button></div></div>';
    html += '<div class="page">';
    html += '<div class="mapwrap">' + mapSVG() + '</div>';
    html += '<div id="citysheet">' + citySheet(UI.city != null ? UI.city : cn) + '</div>';
    html += etapStrip(etap);
    var lastArr = C.order.filter(function (c) { return S.arrived[c]; }).pop();
    if (lastArr) html += '<button class="btn btn-orange btn-wide" data-a="go" data-v="postcard" data-p="' + lastArr + '" style="background:var(--orange);color:#1A0D00">' + h(C.route[weekNum(lastArr)][0]) + ' kartpostalını aç</button>';
    else html += '<div class="card-dark"><span class="eyebrow" style="color:var(--orange)">İlk durak</span><span class="small">Ustalık kapısını geçince Konstanz\'a varırsın; kartpostal ve ilk damga açılır.</span></div>';
    html += '</div>';
    return html;
  };
  function mapXY(lo, la) { return { x: Math.round((lo + 10) / 29 * 330 + 10), y: Math.round((60.6 - la) / 24 * 410 + 12) }; }
  function mapSVG() {
    var P = C.route.map(function (r, i) { var p = mapXY(r[1], r[2]); p.n = r[0]; p.i = i; return p; });
    var done = arrivedCount(); var cur = weekNum(currentWeek());
    var pts = function (arr) { return arr.map(function (p) { return p.x + ',' + p.y; }).join(' '); };
    var s = '<svg viewBox="0 0 352 430" role="img" aria-label="Avrupa turu haritası, ' + done + ' durak tamamlandı">';
    var lbl = [['İSPANYA', 40, 372], ['FRANSA', 118, 258], ['İTALYA', 268, 312], ['ALMANYA', 222, 170], ['BRİTANYA', 18, 110], ['İSKANDİNAVYA', 196, 78]];
    lbl.forEach(function (l) { s += '<text x="' + l[1] + '" y="' + l[2] + '" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="14" letter-spacing="3" fill="#EAD3AB">' + l[0] + '</text>'; });
    s += '<polyline points="' + pts(P.slice(done)) + '" fill="none" stroke="#C9B48E" stroke-width="2" stroke-dasharray="4 4" stroke-linejoin="round"/>';
    if (done > 0) s += '<polyline points="' + pts(P.slice(0, done + 1)) + '" fill="none" stroke="#FF7A1A" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>';
    P.forEach(function (p) {
      var i = p.i; var home = i === 0 || i === 52; var kale = i > 0 && i % 4 === 0; var isDone = i <= done; var now_ = i === cur && !S.arrived[currentWeek()];
      var col = home ? '#16181D' : fam(i);
      var gold = !home && S.arrived['H' + String(i).padStart(2, '0')] && S.arrived['H' + String(i).padStart(2, '0')].gold;
      var r = now_ ? 7 : kale ? 6 : isDone ? 5 : 3.5;
      if (now_) s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="12" fill="rgba(255,122,26,0.25)" class="pulse" style="transform-origin:' + p.x + 'px ' + p.y + 'px"/>';
      var fill = isDone ? (gold ? '#EAB308' : col) : now_ ? '#FFFFFF' : kale ? '#FFFFFF' : col;
      var stroke = now_ ? '#FF7A1A' : kale ? col : isDone ? '#FFFFFF' : 'none';
      var sw = now_ ? 4 : 2;
      if (kale && !now_) s += '<rect class="city" data-a="city" data-v="' + i + '" x="' + (p.x - r) + '" y="' + (p.y - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" rx="2" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
      else s += '<circle class="city" data-a="city" data-v="' + i + '" cx="' + p.x + '" cy="' + p.y + '" r="' + r + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
      s += '<circle class="city" data-a="city" data-v="' + i + '" cx="' + p.x + '" cy="' + p.y + '" r="11" fill="transparent"/>';
    });
    var show = { 0: 'r', 4: 'r', 8: 'l', 12: 'r', 16: 'r', 20: 'r', 24: 'r', 28: 'l', 32: 'l', 36: 'l', 40: 'r', 44: 'l', 48: 'r' };
    if (show[cur] == null) show[cur] = 'l';
    Object.keys(show).forEach(function (k) {
      var p = P[+k]; var name = +k === 0 ? 'Münih ★' : p.n; var right = show[k] === 'r';
      var x = right ? p.x + 9 : p.x - 9; var cur_ = +k === cur;
      s += '<text x="' + x + '" y="' + (p.y + 4) + '" text-anchor="' + (right ? 'start' : 'end') + '" font-family="DM Sans, sans-serif" font-weight="800" font-size="10" fill="' + (cur_ ? '#C2410C' : '#3B2F1E') + '" stroke="#FFF4DF" stroke-width="3" paint-order="stroke">' + h(name) + '</text>';
    });
    s += '</svg>';
    return s;
  }
  function citySheet(i) {
    i = +i; var r = C.route[i]; if (!r) return '';
    var code = 'H' + String(i).padStart(2, '0'); var arr = S.arrived[code]; var cur = currentWeek() === code;
    var w = C.weeks[code]; var kale = i > 0 && i % 4 === 0;
    var state = i === 0 ? 'Başlangıç noktası' : i === 52 ? 'Final · eve dönüş' : arr ? 'Varıldı · ' + shortDate(dkey(arr.t)) + (arr.gold ? ' · altın damga' : '') : cur ? 'Sıradaki durak · kapıyı geç' : w ? 'Kilitli' : 'İçerik İngilizce ekibinden gelecek';
    var html = '<div class="sheet row"><span class="ico" style="background:' + (i === 0 || i === 52 ? 'var(--graphite)' : fam(i)) + ';color:#fff;border-radius:' + (kale ? '10px' : '50%') + '">' + (i === 0 ? '★' : i) + '</span><span class="stack grow"><b>' + h(r[0]) + (kale ? ' · kale şehir' : '') + '</b><span class="small muted">' + (i > 0 && i < 52 ? code + ' · ' : '') + h(state) + '</span>' + (w && i > 0 ? '<span class="tiny muted">' + h(w.title) + '</span>' : '') + '</span>';
    if (arr && C.stories[code]) html += '<button class="btn btn-sm btn-orange" data-a="go" data-v="postcard" data-p="' + code + '">Kart</button>';
    else if (cur) html += '<button class="btn btn-sm btn-dark" data-a="go" data-v="gate" data-p="' + code + '">Kapı</button>';
    return html + '</div>';
  }
  function etapStrip(etap) {
    var start = (etap - 1) * 4; var idx = [start, start + 1, start + 2, start + 3, start + 4];
    var html = '<div class="card-dark"><span class="eyebrow muted">Yakın plan · Etap ' + etap + '</span><div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;text-align:center">';
    idx.forEach(function (i) {
      var r = C.route[i]; if (!r) return;
      var code = 'H' + String(i).padStart(2, '0'); var done = i === 0 || !!S.arrived[code]; var cur = currentWeek() === code && !S.arrived[code]; var kale = i > 0 && i % 4 === 0;
      var bg = done ? (S.arrived[code] && S.arrived[code].gold ? 'var(--gold)' : 'var(--teal-d)') : cur ? '#fff' : 'var(--graphite-3)';
      html += '<button data-a="city" data-v="' + i + '" style="background:none;border:none;color:#fff;display:flex;flex-direction:column;align-items:center;gap:4px;padding:0"><span style="width:36px;height:36px;border-radius:' + (kale ? '10px' : '50%') + ';background:' + bg + ';border:' + (cur ? '3px solid var(--orange)' : kale ? '2px solid var(--teal)' : 'none') + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:' + (cur ? 'var(--orange-d)' : done ? '#fff' : 'var(--on-dark-muted)') + '">' + (i === 0 ? 'START' : code) + '</span><span class="tiny" style="font-weight:700;color:' + (cur ? '#FF9A4D' : done ? '#fff' : 'var(--on-dark-muted)') + '">' + h(r[0]) + '</span></button>';
    });
    return html + '</div></div>';
  }

  TABS.kutuphane = function () {
    UI.lib = UI.lib || { q: '', kind: {}, week: {}, st: {}, blok: {}, gr: {} };
    UI.lib.blok = UI.lib.blok || {}; UI.lib.gr = UI.lib.gr || {};
    var f = UI.lib;
    var html = '<div class="band"><span class="h-display" style="font-size:24px">Kütüphane</span><label class="row" style="background:#fff;border-radius:14px;padding:0 12px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6478" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><span class="tiny" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Ara</span><input id="libq" type="search" value="' + h(f.q) + '" placeholder="Kelime, kalıp, kural ara…" style="border:none;outline:none;flex:1;min-height:44px;background:transparent;color:var(--ink)"></label></div>';
    html += '<div class="page">';
    var nSel = ['st', 'kind', 'week', 'blok', 'gr'].reduce(function (a, k) { return a + Object.keys(f[k]).filter(function (x) { return f[k][x]; }).length; }, 0);
    html += '<details class="sec" open><summary><span class="ico" style="background:var(--graphite);color:#fff"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg></span><span class="stack grow"><b>Filtreler</b><span class="small muted">' + (nSel ? nSel + ' seçili' : 'Durum · Tür · Blok · Konu · Gramer') + '</span></span>' + (nSel ? '<button class="btn btn-sm btn-ghost" data-a="libclear">Temizle</button>' : '') + '</summary><div class="sec-body" style="gap:12px">';
    html += chipGroup('Durum', 'st', [['bil', 'Bilemediklerim'], ['inat', 'İnatçı'], ['ym', 'Yanlış modeller'], ['k', 'Bildim'], ['new', 'Yeni']]);
    var kinds = ['aktif', 'pasif', 'kalip', 'gramer', 'tuzak', 'surpriz', 'telaffuz', 'ceviri', 'model', 'boss'].map(function (k) { return [k, KIND[k].label]; });
    html += chipGroup('Tür', 'kind', kinds);
    var bloks = []; unlockedWeeks().forEach(function (c) { var b = C.weeks[c].block || Math.ceil(weekNum(c) / 4); if (bloks.indexOf(b) < 0) bloks.push(b); });
    html += chipGroup('Blok (klasman)', 'blok', bloks.map(function (b) { return [String(b), 'Blok ' + b + ' · ' + (C.etaps[b - 1] ? blockTheme(b) : '')]; }));
    html += chipGroup('Konu (hafta)', 'week', unlockedWeeks().map(function (c) { return [c, c + ' · ' + shortTitle(c)]; }));
    html += chipGroup('Gramer konusu', 'gr', grammarTopics().map(function (g) { return [g, g]; }));
    html += '<span class="tiny muted">Kilitli haftalar ustalık kapısını geçince buraya eklenir.</span></div></details>';
    var rows = libFiltered();
    html += '<div class="sec-title"><b>' + rows.length + ' sonuç</b>' + (rows.length ? '<button class="btn btn-sm btn-orange" data-a="study" data-v="lib">Bunları çalış</button>' : '') + '</div>';
    rows.slice(0, 120).forEach(function (d) {
      var k = KIND[d.kind]; var c = S.cards[d.id]; var dot = !c ? '#AAB3C5' : c.pools.inat ? 'var(--red)' : c.pools.bil ? 'var(--magenta)' : c.pools.ym ? 'var(--amber)' : c.last === 'k' ? 'var(--green)' : '#AAB3C5';
      var front = d.kind === 'pasif' || d.kind === 'telaffuz' ? d.main : d.en; var backTxt = d.kind === 'pasif' || d.kind === 'telaffuz' ? d.en : d.main;
      html += '<div class="card" style="flex-direction:row;align-items:flex-start;gap:10px;padding:10px 12px"><span style="width:10px;height:10px;border-radius:50%;background:' + dot + ';margin-top:6px;flex-shrink:0"></span><div class="stack grow"><b style="font-size:14px">' + h(clean(front)) + '</b><span class="small muted">' + h(clean(backTxt)) + '</span></div><div class="stack" style="align-items:flex-end;gap:4px;flex-shrink:0"><span class="tiny" style="font-weight:800;color:' + k.color + '">' + k.label + '</span><span class="tiny muted">' + d.week + '</span><button class="speak sm" data-a="say" data-v="' + h(d.say || d.en) + '" aria-label="Dinle">' + ICON.speaker + '</button></div></div>';
    });
    if (rows.length > 120) html += '<span class="small muted">İlk 120 sonuç gösteriliyor. Filtreyi daralt.</span>';
    html += '</div>';
    return html;
  };
  function chipGroup(title, key, items) {
    var f = UI.lib[key];
    return '<div class="stack" style="gap:6px"><span class="eyebrow muted">' + title + '</span><div class="chips">' + items.map(function (it) {
      var on = !!f[it[0]];
      return '<button class="chip" data-a="libchip" data-k="' + key + '" data-v="' + it[0] + '" aria-pressed="' + on + '" style="font-size:13px;min-height:36px;background:' + (on ? 'var(--graphite)' : '#fff') + ';color:' + (on ? '#fff' : 'var(--ink)') + ';border:1.5px solid ' + (on ? 'var(--graphite)' : '#D0D7DE') + '">' + h(it[1]) + '</button>';
    }).join('') + '</div></div>';
  }
  function blockTheme(b) { for (var i = 0; i < C.order.length; i++) { var w = C.weeks[C.order[i]]; if ((w.block || 0) === b && w.block_theme) return w.block_theme; } return ''; }
  function shortTitle(c) { var t = (C.weeks[c] && C.weeks[c].title) || ''; t = t.split(/ & | \+ | · /)[0]; return t.length > 26 ? t.slice(0, 25) + '…' : t; }
  function grammarTopics() { var out = []; unlockedWeeks().forEach(function (c) { cardsForWeek(c).forEach(function (d) { if (d.kind === 'gramer' && d.note && out.indexOf(d.note) < 0) out.push(d.note); }); }); return out; }
  function libFiltered() {
    var f = UI.lib; var q = (f.q || '').toLowerCase().trim();
    var bs = Object.keys(f.blok || {}).filter(function (k) { return f.blok[k]; });
    var gs = Object.keys(f.gr || {}).filter(function (k) { return f.gr[k]; });
    var ks = Object.keys(f.kind).filter(function (k) { return f.kind[k]; });
    var ws = Object.keys(f.week).filter(function (k) { return f.week[k]; });
    var ss = Object.keys(f.st).filter(function (k) { return f.st[k]; });
    return allDefs().filter(function (d) {
      if (ks.length && ks.indexOf(d.kind) < 0) return false;
      if (ws.length && ws.indexOf(d.week) < 0) return false;
      if (bs.length) { var wb = C.weeks[d.week] ? String(C.weeks[d.week].block || Math.ceil(weekNum(d.week) / 4)) : '0'; if (bs.indexOf(wb) < 0) return false; }
      if (gs.length && !(d.kind === 'gramer' && gs.indexOf(d.note) >= 0)) return false;
      if (ss.length) {
        var c = S.cards[d.id];
        var ok = ss.some(function (s) { if (s === 'new') return !c; if (s === 'k') return c && c.last === 'k'; if (s === 'ym' && !c) return d.kind === 'model'; return c && c.pools[s]; });
        if (!ok) return false;
      }
      if (q) { var hay = (d.main + ' ' + (d.en || '') + ' ' + (d.sub || '')).toLowerCase(); if (hay.indexOf(q) < 0) return false; }
      return true;
    });
  }

  TABS.havuz = function () {
    var html = '<div class="band"><div class="band-top"><span class="h-display" style="font-size:24px">Havuzlar</span><button class="btn btn-sm" data-a="go" data-v="rules" style="background:var(--graphite-2);color:#fff">Kural kitabı</button></div><span class="small muted">Bilemediğin her kart havuza girer. Art arda 3 kez bilince mezun olur (+10 XP).</span></div><div class="page">';
    Object.keys(POOLS).forEach(function (p) {
      var cfg = POOLS[p]; var s = poolStatus(p);
      var badge = !s.count ? '<span class="pill" style="background:var(--green-l);color:#166534">Boş</span>' : s.overdue ? '<span class="pill" style="background:var(--orange-d);color:#fff">' + s.overdue + ' gün gecikti</span>' : s.dueToday ? '<span class="pill" style="background:' + cfg.dark + ';color:#fff">Bugün</span>' : '<span class="pill" style="background:var(--green-l);color:#166534">' + s.nextIn + ' gün sonra</span>';
      html += '<div class="card" style="padding:0;overflow:hidden;' + (s.overdue >= 2 ? 'border:2px solid var(--amber)' : '') + '"><div style="height:6px;background:' + cfg.color + '"></div><div style="padding:12px;display:flex;flex-direction:column;gap:8px"><div class="row"><span class="h-display tnum" style="font-size:26px;color:' + cfg.dark + ';min-width:40px">' + s.count + '</span><span class="stack grow"><b>' + cfg.name + '</b><span class="small muted">' + (cfg.label || (cfg.every === 1 ? 'her gün' : cfg.every + ' günde bir')) + ' · ' + cfg.min + ' dk · ' + cfg.rule + '</span></span>' + badge + '</div>' + (s.count ? '<button class="btn" data-a="pool" data-v="' + p + '" style="background:' + cfg.dark + ';color:#fff">Havuzu çalış</button>' : '') + '</div></div>';
    });
    var grads = Object.keys(S.cards).filter(function (id) { var c = S.cards[id]; return c.lapses > 0 && !Object.keys(c.pools).some(function (k) { return c.pools[k]; }); }).length;
    html += '<div class="card-dark"><span class="eyebrow muted">Mezunlar</span><span class="h-display tnum" style="font-size:26px">' + grads + ' kart</span><span class="small muted">Bir kez bilemeyip sonra 3 kez art arda bildiğin kartlar.</span></div>';
    return html + '</div>';
  };

  TABS.ilerleme = function () {
    var st = streakInfo(); var lv = level(); var code = currentWeek(); var ws = weeklyScore(code);
    var html = '<div class="band"><span class="h-display" style="font-size:24px">İlerleme</span>' +
      '<div class="row" style="background:var(--graphite-2);border-radius:16px;padding:12px"><svg width="56" height="56" viewBox="0 0 24 24" fill="' + flameColor(st.streak) + '" stroke="#C2410C" stroke-width="1.1" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5c.8 3.2 4.8 5.2 4.8 10a4.8 4.8 0 0 1-9.6 0c0-2 1-3.4 2-4.2.1 1.6 1 2.7 2.1 2.9-.6-3.2.1-6.3.7-8.7z"/></svg><span class="stack grow"><span class="h-display tnum" style="font-size:28px">' + st.streak + ' gün alev</span><span class="small muted">Rekor ' + st.record + ' · bu hafta ' + st.restLeft + ' dinlenme kalkanı · bonus ' + st.bonus + '/3</span></span></div>' +
      '<div class="stack"><div class="row small"><b class="grow">Seviye ' + lv.l + ' · ' + LEVELNAMES[Math.min(lv.l - 1, LEVELNAMES.length - 1)] + '</b><span class="muted tnum">' + S.xp + ' XP</span></div><div class="bar" style="background:var(--graphite-3)"><span style="width:' + lv.pct + '%;background:var(--violet)"></span></div></div></div>';
    html += '<div class="page">';
    var pi2 = planInfo();
    html += '<div class="card"><div class="sec-title"><b>Plan ve gerçek</b>' + planBadge(pi2) + '</div>' + planBar(pi2, false) +
      '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;text-align:center">' +
      '<div class="stack"><b class="h-display tnum" style="font-size:20px;color:var(--green)">' + pi2.actual.toFixed(1).replace('.', ',') + '</b><span class="tiny muted">hafta tamam</span></div>' +
      '<div class="stack"><b class="h-display tnum" style="font-size:20px">' + pi2.planned.toFixed(1).replace('.', ',') + '</b><span class="tiny muted">plana göre</span></div>' +
      '<div class="stack"><b class="h-display tnum" style="font-size:16px;color:var(--blue-d)">' + (pi2.projEnd ? shortDate(pi2.projEnd) : '–') + '</b><span class="tiny muted">tahmini bitiş</span></div></div>' +
      '<span class="small muted">Haftayı erken bitirirsen kapıdan geçip sonraki haftaya hemen başlayabilirsin; çubuk planın ne kadar önünde olduğunu gösterir. Plan bitişi: ' + (pi2.planEnd ? shortDate(pi2.planEnd) : '–') + ' (joker haftalar dahil).</span></div>';
    html += '<div class="card"><div class="sec-title"><b>Haftalık puan · ' + code + '</b><span class="h-display tnum" style="font-size:22px;color:' + (ws.total >= 16 ? 'var(--green)' : ws.total >= 11 ? 'var(--amber-d)' : 'var(--red)') + '">' + ws.total + '/20</span></div>';
    ws.rows.forEach(function (r) {
      html += '<div class="row small" style="min-height:36px"><span class="grow">' + h(r.label) + '</span>' + (r.toggle ? '<button class="btn btn-sm ' + (r.on ? 'btn-green' : 'btn-ghost') + '" data-a="wtoggle" data-v="' + r.toggle + '" aria-pressed="' + !!r.on + '">' + (r.on ? 'Evet' : 'Hayır') + '</button>' : '') + '<b class="tnum" style="min-width:34px;text-align:right">' + r.pts + '/' + r.max + '</b></div>';
    });
    var wk = S.weekly[code] || {};
    html += '<div class="row small" style="gap:6px;flex-wrap:wrap"><label class="stack" style="flex:1;min-width:70px">S sn<input id="wS" class="inp-light" inputmode="numeric" value="' + h(wk.S || '') + '"></label><label class="stack" style="flex:1;min-width:70px">D (duraksama)<input id="wD" class="inp-light" inputmode="numeric" value="' + h(wk.D || '') + '"></label><label class="stack" style="flex:1;min-width:70px">A (Almanca)<input id="wA" class="inp-light" inputmode="numeric" value="' + h(wk.A || '') + '"></label></div>';
    html += '<div class="chips">' + ['K', 'N', 'Z'].map(function (x) { var on = (wk.KNZ || 'N') === x; return '<button class="chip" data-a="knz" data-v="' + x + '" aria-pressed="' + on + '" style="font-size:13px;background:' + (on ? 'var(--graphite)' : '#fff') + ';color:' + (on ? '#fff' : 'var(--ink)') + ';border:1.5px solid #D0D7DE">' + { K: 'Kolay', N: 'Normal', Z: 'Zor' }[x] + '</button>'; }).join('') + '</div>';
    html += '<div class="card-dark" style="margin-top:4px"><span class="eyebrow muted">Claude kodu</span><div class="row"><code id="wcode" class="grow" style="font-size:15px;overflow-wrap:anywhere">' + h(weekCode(code)) + '</code><button class="btn btn-sm" style="background:#fff;color:var(--ink)" data-a="copycode">Kopyala</button></div></div></div>';
    html += '<button class="card" data-a="go" data-v="passport" style="flex-direction:row;align-items:center;text-align:left"><span class="ico" style="background:var(--paper);color:#3B2F1E;border:2px solid var(--paper-line)">' + arrivedCount() + '</span><span class="stack grow"><b>Pasaport</b><span class="small muted">' + arrivedCount() + '/52 damga</span></span></button>';
    html += '<div class="card"><b>Ayarlar</b>' +
      settingRow('et', 'Boss\'ta Emin/Tahmin sor', S.settings.et) +
      settingRow('testMode', 'Test modu (bekleme süreleri yok)', S.settings.testMode) +
      (S.settings.testMode ? '<button class="btn btn-ghost btn-sm" data-a="shift">Saati 1 gün ileri sar (test)</button><span class="tiny muted">Kaydırma: ' + Math.round((S.settings.timeShift || 0) / DAY) + ' gün</span>' : '') +
      '<button class="btn btn-ghost" data-a="go" data-v="data">Yedek ve içerik yükleme</button></div>';
    html += '<span class="tiny muted" style="text-align:center">ENGMAliENG v' + h(C.version || '0.1') + ' · içerik ' + C.order.join(', ') + '</span>';
    return html + '</div>';
  };
  function settingRow(k, label, on) { return '<button class="row listrow" style="min-height:48px" data-a="setting" data-v="' + k + '" aria-pressed="' + !!on + '"><span class="grow small">' + label + '</span><span style="width:44px;height:26px;border-radius:13px;background:' + (on ? 'var(--blue)' : '#CBD2DE') + ';display:flex;align-items:center;padding:3px;justify-content:' + (on ? 'flex-end' : 'flex-start') + '"><span style="width:20px;height:20px;border-radius:50%;background:#fff"></span></span></button>'; }

  function weekRange(code) { var w = C.weeks[code]; var m = (w && w.monday) || mondayOf(today()); if (today() < m || code === currentWeek() && today() > addDays(m, 6)) m = mondayOf(today()); return [m, addDays(m, 6)]; }
  function weeklyScore(code) {
    var rg = weekRange(code); var wk = S.weekly[code] || {};
    var paper = 0; for (var i = 0; i < 5; i++) { var k = addDays(rg[0], i); if (S.ticks[k] && Object.keys(S.ticks[k]).length) paper++; }
    var appd = 0; for (var j = 0; j < 7; j++) { if (S.reviewDays[addDays(rg[0], j)]) appd++; }
    var best = (S.boss[code] || {}).best; var review = isReview(code);
    var tp = best == null ? 0 : review ? (best >= 25 ? 3 : best >= 20 ? 2 : best >= 15 ? 1 : 0) : (best >= 11 ? 3 : best >= 9 ? 2 : best >= 7 ? 1 : 0);
    var rows = [
      { label: 'Kâğıt günü (Pzt–Cum): ' + paper, pts: paper >= 5 ? 3 : paper === 4 ? 2 : paper === 3 ? 1 : 0, max: 3 },
      { label: 'Uygulama tekrar günü: ' + appd + '/7', pts: appd >= 7 ? 3 : appd >= 5 ? 2 : appd >= 3 ? 1 : 0, max: 3 },
      { label: 'Boss: ' + (best == null ? '–' : best + '/' + bossQuestions(code).length), pts: tp, max: 3 },
      { label: 'Konuşma kaydı', pts: S.gate[code] && S.gate[code].kayit ? 2 : 0, max: 2, toggle: 'kayit', on: S.gate[code] && S.gate[code].kayit },
      { label: 'İşte 1 kalıp kullandım', pts: wk.is ? 2 : 0, max: 2, toggle: 'is', on: wk.is },
      { label: 'Yanlışları yerinde yeniden yaptım', pts: wk.redo ? 1 : 0, max: 1, toggle: 'redo', on: wk.redo },
      { label: 'Shadowing 3 tur', pts: wk.shadow ? 1 : 0, max: 1, toggle: 'shadow', on: wk.shadow },
      { label: review ? 'Karışık çeviri 10/10' : '3 zincir cümle', pts: wk.zincir ? 1 : 0, max: 1, toggle: 'zincir', on: wk.zincir },
      { label: 'Kalıplar notsuz (gate)', pts: gateInfo(code).items[2].ok ? 2 : 0, max: 2 },
      { label: 'Konuşma: duraksama ≤ 3', pts: wk.D === '' || wk.D == null ? 0 : (+wk.D <= 3 ? 2 : +wk.D <= 6 ? 1 : 0), max: 2 }
    ];
    var total = rows.reduce(function (a, r) { return a + r.pts; }, 0);
    return { rows: rows, total: total };
  }
  function weekCode(code) {
    var wk = S.weekly[code] || {}; var b = S.boss[code] || {};
    return code + ' P' + weeklyScore(code).total + ' T' + (b.best == null ? '__' : b.best) + ' E' + (b.ewrong == null ? '__' : b.ewrong) + ' S' + (wk.S || '__') + ' D' + (wk.D || '__') + ' A' + (wk.A || '__') + ' ' + (wk.KNZ || 'N');
  }

  // ---------- ALT GÖRÜNÜMLER ----------
  var VIEWS = {};
  VIEWS.notfound = function () { return backBar('Bulunamadı', '', true); };

  VIEWS.week = function (p) {
    var code = p.p; var w = C.weeks[code]; if (!w) return backBar('İçerik yok', '', true);
    var n = weekNum(code); var review = w.type === 'tekrar';
    var html = '<div class="band" style="background:' + fam(n) + '"><div class="row"><button class="backbtn" data-a="back" aria-label="Geri">' + ICON.back + '</button><span class="pill" style="background:#fff;color:' + fam(n) + ';font-size:14px">' + code + '</span><span class="small" style="opacity:.92">Blok ' + (w.block || Math.ceil(n / 4)) + (w.monday ? ' · ' + shortDate(w.monday) : '') + '</span></div>' +
      '<span class="h-display" style="font-size:24px;line-height:1.1">' + h(w.title) + '</span><span class="small" style="opacity:.92">' + h(w.title_en || '') + '</span>' +
      '<span class="small" style="background:rgba(255,255,255,.16);border-radius:12px;padding:8px 10px">' + h(w.goal || '') + '</span>' +
      (w.cando ? '<span class="small" style="background:rgba(0,0,0,.18);border-radius:12px;padding:8px 10px"><b>CAN-DO:</b> ' + h(w.cando) + '</span>' : '') +
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px"><button class="btn" data-a="study" data-v="week" data-p="' + code + '" style="background:#fff;color:' + fam(n) + '">Kartları çalış</button><button class="btn" data-a="go" data-v="gate" data-p="' + code + '" style="background:rgba(0,0,0,.25);color:#fff">Kapı · Boss</button></div></div>';
    html += '<div class="page">';
    if (w.scenario) html += '<div class="card-dark"><span class="eyebrow muted">Senaryo</span><span class="small">' + h(w.scenario) + '</span></div>';
    if (review) html += reviewSections(w); else html += normalSections(w);
    html += '<span class="tiny muted" style="text-align:center">PDF çıktısı klasöründe: ' + h((w.file || code) + '.pdf') + '</span>';
    return html + '</div>';
  };
  function sec(title, sub, color, body, open) {
    return '<details class="sec"' + (open ? ' open' : '') + '><summary><span class="ico" style="background:' + color + ';color:#fff">' + h(title.slice(0, 2)) + '</span><span class="stack grow"><b>' + h(title) + '</b>' + (sub ? '<span class="small muted">' + h(sub) + '</span>' : '') + '</span></summary><div class="sec-body">' + body + '</div></details>';
  }
  function sayBtn(t) { return '<button class="speak sm" data-a="say" data-v="' + h(clean(t)) + '" aria-label="Dinle">' + ICON.speaker + '</button>'; }
  function known(id) { return isKnown(id) ? '<span class="pill" style="background:var(--green-l);color:#166534">Bildim</span>' : ''; }
  function normalSections(w) {
    var code = w.code; var out = '';
    out += sec('Aktif kelimeler', (w.aktif || []).length + ' kelime · cümle içinde', 'var(--blue)', (w.aktif || []).map(function (a, i) {
      return '<div class="wrow">' + sayBtn(a.example) + '<div class="stack grow"><b>' + h(a.en) + ' ' + known(code + '-a' + i) + '</b><span class="muted">' + h(a.tr) + '</span><span>' + h(a.example) + '</span></div></div>';
    }).join(''), true);
    out += sec('Pasif kelimeler', (w.pasif || []).length + ' kelime · tanı yeter', '#0EA5E9', (w.pasif || []).map(function (a) { return '<div class="wrow">' + sayBtn(a.en) + '<div class="stack grow"><b>' + h(a.en) + '</b><span class="muted">' + h(a.tr) + ' · ' + h(a.context) + '</span></div></div>'; }).join(''));
    out += sec('Hazır kalıplar', (w.kalip || []).length + ' kalıp · işte doğrudan kullan', '#4F46E5', (w.kalip || []).map(function (k, i) { return '<div class="wrow">' + sayBtn(k.en) + '<div class="stack grow"><b>' + h(clean(k.en)) + ' ' + known(code + '-k' + i) + '</b><span class="muted">' + h(k.tr) + '</span></div></div>'; }).join(''));
    out += sec('Diyalog · shadowing', w.dialog_title || '', 'var(--violet)', '<button class="btn btn-sm btn-blue" data-a="say" data-v="' + h((w.dialog || []).map(function (d) { return clean(d.text); }).join(' ')) + '">Tümünü dinle</button>' + (w.dialog || []).map(function (d) {
      var you = d.speaker === 'You'; return '<div class="wrow">' + sayBtn(d.text) + '<div class="stack grow"><b style="color:' + (you ? 'var(--violet)' : 'var(--ink)') + '">' + h(d.speaker) + '</b><span>' + h(clean(d.text)) + '</span></div></div>';
    }).join('') + '<span class="tiny muted">3 tur: 1) dinle + bak 2) birlikte oku 3) You rolünü metinsiz söyle.</span>');
    var g = w.gramer || {};
    if (g.title) out += sec('Gramer', g.title, 'var(--green)', '<span class="small" style="background:var(--green-l);border-radius:10px;padding:8px">' + h(g.problem) + '</span>' +
      '<div class="tablewrap"><table class="g"><tr><th>Yapı</th><th>Ne zaman</th><th>Örnek</th><th>İpucu</th></tr>' + (g.table || []).map(function (r) { return '<tr><td>' + h(r.form) + '</td><td>' + h(r.use) + '</td><td>' + h(r.example) + '</td><td>' + h(r.hint) + '</td></tr>'; }).join('') + '</table></div>' +
      (g.examples || []).map(function (e) { return '<div class="wrow">' + sayBtn(e) + '<span class="grow">' + h(e) + '</span></div>'; }).join('') +
      '<b>Alıştırma</b>' + (g.exercises || []).map(function (e, i) { return '<div class="wrow"><span class="grow">' + h(e.q) + '</span><button class="btn btn-sm btn-ghost" data-a="reveal" data-v="' + h(e.answer) + '">Cevap</button></div>'; }).join('') +
      '<span class="tiny muted">Kaynak: ' + h(g.source) + '</span>');
    if (w.tuzak) { var tz = w.tuzak; out += sec('Almanca tuzağı', tz.de, 'var(--amber-d)', '<b>' + h(tz.q) + '</b><div id="tuzak-' + code + '" class="stack" style="gap:6px">' + tz.options.map(function (o, i) { return '<button class="btn btn-ghost" style="justify-content:flex-start;text-align:left" data-a="tuzak" data-v="' + code + '" data-i="' + i + '">' + 'abc'[i] + ') ' + h(o) + '</button>'; }).join('') + '</div><span id="tuzak-r-' + code + '"></span>'); }
    if (w.edat) out += sec('Haftanın edatı', w.edat.word, 'var(--green)', w.edat.items.map(function (e) { return '<div class="wrow">' + sayBtn(e.en) + '<div class="stack grow"><b>' + h(e.en) + '</b><span class="muted">' + h(e.note) + '</span></div></div>'; }).join(''));
    if (w.iskelet) out += sec('Konuşma iskeleti', w.iskelet.name, 'var(--violet)', w.iskelet.steps.map(function (s) { return '<div class="wrow"><span class="ico" style="background:var(--violet-l);color:var(--violet)">' + h(s.key) + '</span><div class="stack grow"><b>' + h(s.label) + '</b><span>' + h(s.example) + '</span></div></div>'; }).join('') + (w.iskelet.note ? '<span class="small muted">' + h(w.iskelet.note) + '</span>' : ''));
    if (w.harita) out += sec('Durum → ne derim?', w.harita.title, '#0EA5E9', w.harita.items.map(function (x) { return '<div class="wrow">' + sayBtn(x.text) + '<div class="stack grow"><span class="muted small">' + h(x.label) + '</span><b>' + h(x.text) + '</b></div></div>'; }).join(''));
    if (w.smalltalk) out += sec('Monday small talk', '3 soru', 'var(--orange-d)', w.smalltalk.map(function (x) { return '<div class="wrow">' + sayBtn(x.q + ' ' + x.a) + '<div class="stack grow"><b>' + h(x.q) + '</b><span>' + h(x.a) + '</span></div></div>'; }).join(''));
    if (w.rakam) out += sec('Haftanın rakamları', 'dokun, dinle', 'var(--teal-d)', w.rakam.map(function (x) { return '<div class="wrow">' + sayBtn(x.spoken.split('/')[0]) + '<div class="stack grow"><b>' + h(x.written) + '</b><span class="muted">' + h(x.spoken) + '</span></div></div>'; }).join(''));
    if (w.telaffuz) out += sec('Telaffuz (US)', '6 kelime', 'var(--teal-d)', w.telaffuz.map(function (x) { return '<div class="wrow">' + sayBtn(x.word) + '<div class="stack grow"><b>' + h(x.word) + ' · ' + h(x.hint) + '</b><span class="muted">' + h(x.note) + '</span></div></div>'; }).join(''));
    if (w.zincir) out += sec('Zincir cümleler', '3 kelime → 1 uzun cümle (kâğıda yaz)', 'var(--orange-d)', w.zincir.map(function (z, i) { return '<div class="wrow"><b>' + (i + 1) + '.</b><span class="grow">' + z.map(h).join(' + ') + '</span></div>'; }).join(''));
    if (w.gorev) out += sec('Konuşma görevi', 'Perşembe', 'var(--violet)', '<span>' + h(w.gorev) + '</span>');
    return out;
  }
  function reviewSections(w) {
    var out = '';
    out += sec('Blok haritası', 'H01–H03 özet', 'var(--teal-d)', (w.block_map || []).map(function (b) { return '<div class="wrow"><span class="pill" style="background:var(--teal-l);color:var(--teal-d)">' + h(b.week) + '</span><div class="stack grow"><b>' + h(b.topic) + '</b><span class="small">' + h(b.key_phrases) + '</span><span class="tiny muted">' + h(b.grammar) + ' · tuzak: ' + h(b.trap) + '</span></div></div>'; }).join(''), true);
    out += sec('Senaryo · You rolü', 'Sarah + Erik · sesli cevapla', 'var(--violet)', (w.dialog_you_role || []).map(function (d) { var you = d.speaker === 'You'; return '<div class="wrow">' + (you ? '' : sayBtn(d.text)) + '<div class="stack grow"><b style="color:' + (you ? 'var(--violet)' : 'var(--ink)') + '">' + h(d.speaker) + '</b><span>' + h(d.text) + '</span></div></div>'; }).join('') + '<b>Örnek cevaplar</b>' + (w.dialog_sample_answers || []).map(function (a) { return '<div class="wrow">' + sayBtn(a) + '<span class="grow">' + h(a) + '</span></div>'; }).join(''));
    out += sec('Karışık çeviri', '10 cümle', '#4F46E5', (w.mix_translation || []).map(function (x) { return '<div class="wrow"><span class="grow">' + h(x.tr) + '</span><button class="btn btn-sm btn-ghost" data-a="reveal" data-v="' + h(x.en) + '">EN</button></div>'; }).join(''));
    out += sec('Gramer karışık', '6 soru', 'var(--green)', (w.grammar_mix || []).map(function (x) { return '<div class="wrow"><span class="grow">' + h(x.q) + '</span><button class="btn btn-sm btn-ghost" data-a="reveal" data-v="' + h(x.answer) + '">Cevap</button></div>'; }).join(''));
    out += sec('Sürpriz sorular', '12 soru · 30 sn konuş', 'var(--violet)', (w.surpriz || []).map(function (x) { return '<div class="wrow">' + sayBtn(x.q) + '<div class="stack grow"><b>' + h(x.q) + '</b><span class="small muted">' + h(x.sample_answer) + '</span></div></div>'; }).join(''));
    return out;
  }

  // ----- çalışma oturumu -----
  VIEWS.study = function (p) {
    var ss = UI.session;
    if (!ss || ss.key !== p.key) return '';
    var html = '<div class="page" style="min-height:100vh">';
    var total = ss.total; var pos = ss.done;
    html += '<div class="row"><button class="backbtn" data-a="endstudy" aria-label="Kapat">' + ICON.close + '</button><div class="bar grow" style="height:12px"><span style="width:' + Math.round(pos / Math.max(total, 1) * 100) + '%;background:var(--orange)"></span></div><b class="small tnum">' + pos + '/' + total + '</b></div>';
    if (!ss.queue.length) {
      html += '<div class="card" style="align-items:center;text-align:center;padding:28px 16px;gap:12px"><span class="h-display" style="font-size:28px">Oturum bitti!</span><span class="muted">' + ss.known + ' bildim · ' + ss.unknown + ' bilemedim · +' + ss.xp + ' XP</span>' + (ss.unknown ? '<span class="small" style="color:var(--magenta-d)">Bilemediklerin Bilemediklerim havuzuna girdi. Havuz 3 günde bir ve her günlük tekrarda 5 kartla geri gelir.</span>' : '') + '<button class="btn btn-dark btn-wide" data-a="endstudy">Tamam</button></div>';
      return html + '</div>';
    }
    var d = ss.queue[0]; var k = KIND[d.kind] || KIND.aktif; var mode = d.mode || 'type';
    var c = S.cards[d.id];
    var badge = !c ? '<span class="pill" style="background:var(--green-l);color:#166534">YENİ</span>' : (c.pools.bil || c.pools.inat) ? '<span class="pill" style="background:var(--magenta-l);color:#86198F">HAVUZ</span>' : '';
    html += '<div class="row"><span class="pill" style="background:' + k.color + ';color:#fff;font-size:12px">' + k.label + '</span>' + badge + '<span class="small muted grow">' + h(d.week === 'H00' ? 'Başlangıç testi' : d.week) + '</span><span class="pill" style="background:var(--violet);color:#fff;font-size:12px">+' + ss.xp + ' XP</span></div>';
    html += '<div class="study" style="min-height:0"><div class="study-top" style="background:' + k.color + '"></div><div class="study-body"><span class="eyebrow muted">' + k.dir + '</span>';
    if (mode === 'listen') {
      html += '<div class="row"><button class="speak" style="width:64px;height:64px;border-radius:18px" data-a="say" data-v="' + h(d.say) + '" aria-label="Tekrar dinle">' + ICON.speaker + '</button><span class="small muted grow">Dokun, dinle, kelimeyi yaz.' + (ss.phase === 'ask' && ss.hint ? '<br><b>İpucu:</b> ' + h(d.hint) : '') + '</span></div>';
    } else {
      html += '<div class="row" style="align-items:flex-start"><span class="study-main grow">' + h(clean(d.main)) + '</span>' + (d.sayFront ? '<button class="speak" data-a="say" data-v="' + h(d.say) + '" aria-label="Dinle">' + ICON.speaker + '</button>' : '') + '</div>';
      if (d.sub) html += '<span class="study-sub">' + h(clean(d.sub)) + '</span>';
    }
    if (mode === 'mc') {
      var opts = ss.opts && ss.opts.id === d.id ? ss.opts : (ss.opts = makeOptions(d));
      html += '<div class="stack" style="gap:8px">' + opts.list.map(function (o, i) {
        var st = '', bd = 'var(--line)', bg = '#fff';
        if (ss.phase === 'result') { if (i === opts.correct) { bg = 'var(--green-l)'; bd = 'var(--green)'; } else if (i === ss.res.pick) { bg = 'var(--red-l)'; bd = 'var(--red)'; } }
        return '<button class="btn" data-a="mcpick" data-v="' + i + '" style="justify-content:flex-start;text-align:left;font-weight:600;font-size:15px;background:' + bg + ';border:2px solid ' + bd + ';color:var(--ink)"' + (ss.phase === 'result' ? ' disabled' : '') + '>' + 'abcd'[i] + ') ' + h(o) + '</button>';
      }).join('') + '</div>';
    } else if (ss.phase === 'ask') {
      html += '<label class="stack" style="gap:6px"><span class="tiny muted">Cevabın (İngilizce)</span><input id="ans" class="inp-light" style="font-size:18px;min-height:52px;border-width:2px" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" data-autofocus="1" value="' + h(ss.typed || '') + '"></label>';
    }
    if (ss.phase === 'result') {
      var r = ss.res;
      html += '<div class="study-back"><div class="alert" style="background:' + (r.ok ? 'var(--green-l)' : 'var(--red-l)') + ';color:' + (r.ok ? '#14532D' : '#881337') + ';font-weight:700">' + (r.ok ? (r.partial ? 'Geçerli – %' + r.score + ' doğru (uzun cümle kuralı)' : r.exact ? 'Bildin!' : 'Bildin – küçük yazım farkı var') : 'Bilemedin' + (r.score != null && PARTIAL_KINDS.indexOf(d.kind) >= 0 && r.score > 0 ? ' – %' + r.score + ' (geçmek için %70)' : '')) + '</div>';
      if (mode !== 'mc') html += '<span class="small muted">Senin cevabın</span><span style="font-size:16px;' + (r.ok ? '' : 'text-decoration:line-through;color:var(--red-d)') + '">' + h(ss.typed || '—') + '</span>';
      html += '<div class="row"><span class="stack grow"><span class="small muted">Doğrusu</span><span class="study-en" style="font-size:21px">' + (r.diff || h(clean(d.answer || d.en))) + '</span></span><button class="speak" data-a="say" data-v="' + h(d.sayBack || d.say || d.en) + '" aria-label="Dinle">' + ICON.speaker + '</button></div>';
      if (d.full && d.full !== d.answer) html += '<span>' + h(clean(d.full)) + '</span>';
      if (d.note) html += '<span class="small muted">' + h(d.note) + '</span>';
      html += '</div>';
    }
    html += '</div></div>';
    if (ss.msg && ss.phase === 'result') html += '<div class="alert" style="background:' + (ss.res.partial ? 'var(--amber-l)' : 'var(--magenta-l)') + ';color:' + (ss.res.partial ? '#7A4A00' : '#86198F') + ';font-weight:700">' + h(ss.msg) + '</div>';
    if (ss.phase === 'ask' && mode !== 'mc') html += '<div style="display:grid;grid-template-columns:1fr 2fr;gap:10px"><button class="btn btn-ghost" data-a="dontknow" style="min-height:54px">Bilmiyorum</button><button class="btn btn-dark" data-a="checkans" style="min-height:54px;font-size:16px">Kontrol et</button></div>' + (mode === 'listen' && !ss.hint ? '<button class="btn btn-ghost btn-sm" data-a="hint">İpucu göster</button>' : '');
    if (ss.phase === 'result') html += '<button class="btn btn-wide ' + (ss.res.ok ? 'btn-green' : 'btn-dark') + '" data-a="nextcard" data-autofocus="1">Devam</button>';
    return html + '</div>';
  };
  function makeOptions(d) {
    var list, correct;
    if (d.opts) { list = d.opts.slice(); correct = list.indexOf(d.en); if (correct < 0) correct = 0; return { id: d.id, list: list, correct: correct }; }
    var pool = [];
    Object.keys(C.weeks).forEach(function (code) { var w = C.weeks[code]; (w.pasif || []).concat(w.aktif || []).forEach(function (x) { if (x.tr && x.tr !== d.en) pool.push(x.tr); }); });
    var wrong = shuffle(pool.filter(function (x, i, a) { return a.indexOf(x) === i; })).slice(0, 3);
    list = shuffle(wrong.concat([d.en])); correct = list.indexOf(d.en);
    return { id: d.id, list: list, correct: correct };
  }
  // ---------- yazılı cevap değerlendirme ----------
  function lev(a, b) {
    if (a === b) return 0; var m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    var prev = []; for (var j = 0; j <= n; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) { var cur = [i]; for (var j2 = 1; j2 <= n; j2++) cur[j2] = Math.min(prev[j2] + 1, cur[j2 - 1] + 1, prev[j2 - 1] + (a[i - 1] === b[j2 - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  function wEq(a, b) { if (a === b) return true; var L = Math.max(a.length, b.length); if (L >= 4 && lev(a, b) <= 1) return true; if (L >= 8 && lev(a, b) <= 2) return true; return false; }
  function align(exp, usr) {
    var m = exp.length, n = usr.length, dp = [];
    for (var i = 0; i <= m; i++) { dp[i] = []; for (var j = 0; j <= n; j++) dp[i][j] = 0; }
    for (var i2 = 1; i2 <= m; i2++) for (var j2 = 1; j2 <= n; j2++) dp[i2][j2] = wEq(exp[i2 - 1], usr[j2 - 1]) ? dp[i2 - 1][j2 - 1] + 1 : Math.max(dp[i2 - 1][j2], dp[i2][j2 - 1]);
    var hit = [], uhit = []; var a = m, b = n, exact = true;
    while (a > 0 && b > 0) { if (wEq(exp[a - 1], usr[b - 1]) && dp[a][b] === dp[a - 1][b - 1] + 1) { hit[a - 1] = true; uhit[b - 1] = true; if (exp[a - 1] !== usr[b - 1]) exact = false; a--; b--; } else if (dp[a - 1][b] >= dp[a][b - 1]) a--; else b--; }
    return { matched: dp[m][n], hit: hit, uhit: uhit, exact: exact };
  }
  var FILLER = ['a', 'an', 'the', 'just', 'so', 'oh', 'well', 'really', 'actually', 'ok', 'okay', 'um', 'please', 'very', 'yes', 'sure'];
  var PRON = ['i', 'we', 'you', 'they', 'he', 'she', 'it'];
  var LONG_MIN_WORDS = 6, LONG_PASS = 0.7; // uzun cümle kuralı (kullanıcı kararı)
  var PARTIAL_KINDS = ['kalip', 'ceviri', 'boss'];
  function gradeText(user, answer, allowPartial) {
    var usr = normAns(user).split(' ').filter(Boolean);
    if (!usr.length) return { ok: false, exact: false, diff: null };
    var best = null;
    String(answer).split('/').forEach(function (alt) {
      var raw = clean(alt).trim(); var ell = /…|\.\.\./.test(raw);
      var expW = normAns(raw).split(' ').filter(Boolean); if (!expW.length) return;
      var al = align(expW, usr); var ok;
      // Kural: anahtar kelime eksik ya da fazla olamaz (until↔by gibi hatalar yakalanır); yalnızca yazım hatası ve dolgu kelimeler tolere edilir.
      var missing = expW.filter(function (w, i) { return !al.hit[i] && FILLER.indexOf(w) < 0; }).length;
      var extra = usr.filter(function (w, i) { return !al.uhit[i] && FILLER.indexOf(w) < 0 && PRON.indexOf(w) < 0; }).length;
      if (expW.length <= 3) ok = al.matched === expW.length && usr.length <= expW.length + 1 && extra <= (usr.length > expW.length ? 1 : 0);
      else ok = missing === 0 && (ell || extra === 0);
      var score = al.matched / (ell ? expW.length : Math.max(expW.length, usr.length));
      var partial = false;
      if (!ok && allowPartial && expW.length >= LONG_MIN_WORDS && score >= LONG_PASS) { ok = true; partial = true; }
      var exact = ok && !partial && al.exact && al.matched === expW.length && usr.length === expW.length;
      if (!best || (ok && !best.ok) || (ok === best.ok && (!partial && best.partial || score > best.score))) best = { ok: ok, partial: partial, exact: exact, score: score, raw: raw, expW: expW, hit: al.hit };
    });
    if (!best) return { ok: false, exact: false, diff: null };
    // doğru cevabı göster; eksik/yanlış kelimeleri turuncu işaretle
    var toks = best.raw.split(/\s+/); var wi = 0; var diff = toks.map(function (t) {
      var n = normAns(t).split(' ').filter(Boolean); var miss = false;
      n.forEach(function () { if (!best.hit[wi]) miss = true; wi++; });
      return miss && !best.exact ? '<span style="background:var(--orange-l);color:var(--orange-d);border-radius:4px;padding:0 2px">' + h(t) + '</span>' : h(t);
    }).join(' ');
    return { ok: best.ok, partial: best.partial, exact: best.exact, score: Math.round(best.score * 100), diff: diff };
  }
  function submitAnswer(knownOverride) {
    var ss = UI.session; var d = ss.queue[0]; if (!d || ss.phase !== 'ask') return;
    var inp = document.getElementById('ans'); if (inp) ss.typed = inp.value;
    var res = knownOverride === false ? { ok: false, exact: false, diff: null } : gradeText(ss.typed || '', d.answer || d.en, PARTIAL_KINDS.indexOf(d.kind) >= 0);
    if (knownOverride === false) ss.typed = '';
    ss.res = res; ss.phase = 'result';
    ss.msg = rate(d, res.ok, res.partial); ss.xp += res.ok ? (res.partial ? 3 : 5) : 1;
    if (res.ok) ss.known++; else ss.unknown++;
    render(); speak(d.sayBack || d.say || d.en);
  }
  function nextCard() {
    var ss = UI.session; var d = ss.queue.shift(); ss.done++;
    if (!ss.res.ok) { ss.queue.splice(Math.min(3, ss.queue.length), 0, d); ss.total++; }
    ss.phase = 'ask'; ss.res = null; ss.typed = ''; ss.hint = false; ss.msg = ''; ss.opts = null;
    if (!ss.queue.length && ss.kind === 'pool') { S.poolDone[ss.param] = now(); save(); }
    render();
    var nx = ss.queue[0]; if (nx && nx.mode === 'listen') setTimeout(function () { speak(nx.say); }, 250);
  }
  function nextIntervalText(d) { var c = S.cards[d.id]; var s = c ? c.s : 0; return STEPS[Math.min(s, STEPS.length - 1)] + ' gün'; }
  function startStudy(kind, param) {
    var list = [], key = kind + ':' + (param || '') + ':' + Date.now();
    if (kind === 'daily') { var q = dailyQueue(); list = q.due.concat(q.fresh).slice(0, 40).concat(q.extra); }
    else if (kind === 'pool') { list = shuffle(poolCards(param).filter(function (d) { return !d.noStudy; })).slice(0, 20); }
    else if (kind === 'week') { list = cardsForWeek(param).filter(function (d) { return !d.noStudy; }); }
    else if (kind === 'lib') { list = libFiltered().filter(function (d) { return !d.noStudy; }).slice(0, 40); }
    else if (kind === 'mini') { var q2 = dailyQueue(); list = q2.due.slice(0, 8); if (list.length < 8) list = list.concat(shuffle(allDefs()).slice(0, 8 - list.length)); }
    if (!list.length) { toast(kind === 'daily' ? 'Bugünlük tekrar bitti!' : 'Bu listede kart yok'); return; }
    UI.session = { key: key, kind: kind, param: param, queue: list, total: list.length, done: 0, known: 0, unknown: 0, xp: 0, phase: 'ask', res: null, msg: '' };
    go('study', { key: key });
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // ----- boss -----
  VIEWS.boss = function (p) {
    var b = UI.boss; var code = p.p; if (!b || b.code !== code) return '';
    var qs = b.qs; var html = '<div class="boss"><div class="page" style="gap:14px;min-height:100vh">';
    html += '<div class="row"><button class="backbtn" data-a="back" aria-label="Kapat" style="color:#A3A9B6">' + ICON.close + '</button><div class="stack grow"><div class="row"><span class="h-display grow" style="font-size:18px;color:#FB7185">BOSS · ' + code + '</span><span class="tiny" style="color:#A3A9B6">Tahmin ' + (b.guess == null ? '–' : b.guess) + '/' + qs.length + '</span></div><div style="display:grid;grid-template-columns:repeat(' + qs.length + ',minmax(0,1fr));gap:2px">' + qs.map(function (q, i) { var a = b.ans[i]; var c = a == null ? (i === b.i ? '#fff' : 'var(--graphite-3)') : a ? '#22C55E' : '#F43F5E'; return '<span style="height:7px;border-radius:3px;background:' + c + '"></span>'; }).join('') + '</div></div></div>';
    if (b.phase === 'guess') {
      html += '<span class="h-display" style="font-size:26px">Önce tahmin et</span><span style="color:#A3A9B6">' + qs.length + ' sorudan kaçını doğru yapacaksın? (puansız · metabiliş)</span><div class="chips">' + [0.5, 0.6, 0.7, 0.8, 0.9, 1].map(function (f) { var v = Math.round(qs.length * f); return '<button class="chip" data-a="guess" data-v="' + v + '" style="background:var(--graphite-2);color:#fff;border:2px solid var(--graphite-3);font-size:16px;min-width:56px;justify-content:center;min-height:48px">' + v + '</button>'; }).join('') + '</div>';
      return html + '</div></div>';
    }
    if (b.phase === 'result') {
      var sc = b.ans.filter(Boolean).length; var stc = stars(code, sc); var th = isReview(code) ? THRESH.review : THRESH.normal;
      html += '<div class="card-dark" style="background:var(--graphite-2);align-items:center;text-align:center;padding:24px 14px;gap:10px"><span class="h-display tnum" style="font-size:44px">' + sc + '/' + qs.length + '</span><span style="color:#EAB308;font-size:28px;letter-spacing:4px" aria-label="' + stc + ' yıldız">' + '★'.repeat(stc) + '<span style="color:var(--graphite-3)">' + '★'.repeat(3 - stc) + '</span></span><span style="color:#A3A9B6">Tahminin: ' + b.guess + ' · +' + sc * 10 + ' XP</span><span style="font-weight:800;color:' + (sc >= th.pass ? '#86EFAC' : '#FDA4AF') + '">' + (sc >= th.pass ? 'Kapı şartı tamam!' : 'Kapı için ' + th.pass + ' gerekli. 24 saat sonra rövanş.') + '</span></div>';
      html += '<button class="btn btn-blue btn-wide" data-a="go-replace" data-v="gate" data-p="' + code + '">Kapıya dön</button>';
      return html + '</div></div>';
    }
    var q = qs[b.i];
    var typeLabel = q.type === 'mc' ? 'ÇOKTAN SEÇMELİ' : q.type === 'fill' ? 'BOŞLUK DOLDUR' : 'TÜRKÇE → İNGİLİZCE';
    html += '<span class="eyebrow" style="color:#A3A9B6">Soru ' + (b.i + 1) + ' / ' + qs.length + ' · ' + typeLabel + '</span><span class="h-display" style="font-size:24px;line-height:1.25">' + h(q.q) + '</span>';
    var correctIdx = q.type === 'mc' ? q.answer.charCodeAt(0) - 97 : -1;
    if (q.type === 'mc') {
      html += '<div class="stack" style="gap:10px">' + q.options.map(function (o, i) {
        var cls = 'opt'; if (b.sel === i) cls += ' sel'; if (b.checked && i === correctIdx) cls += ' ok'; if (b.checked && b.sel === i && i !== correctIdx) cls += ' bad';
        return '<button class="' + cls + '" data-a="bsel" data-v="' + i + '"><span class="l">' + 'abcd'[i] + '</span><span>' + h(o) + '</span></button>';
      }).join('') + '</div>';
    } else if (q.type === 'fill') {
      html += '<label class="stack" style="gap:6px"><span class="small" style="color:#A3A9B6">Boşluğa ne gelir?</span><input id="bfill" class="inp" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"' + (b.checked ? ' disabled' : ' data-autofocus="1"') + ' value="' + h(b.input || '') + '"></label>';
    } else {
      html += '<label class="stack" style="gap:6px"><span class="small" style="color:#A3A9B6">İngilizcesini yaz</span><input id="bfill" class="inp" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"' + (b.checked ? ' disabled' : ' data-autofocus="1"') + ' value="' + h(b.input || '') + '"></label>';
    }
    if (S.settings.et && !b.checked) html += '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">' + [['E', 'E · Eminim'], ['T', 'T · Tahmin']].map(function (x) { return '<button class="btn" data-a="bconf" data-v="' + x[0] + '" style="background:var(--graphite-2);color:#fff;border:2px solid ' + (b.conf === x[0] ? '#fff' : 'var(--graphite-3)') + '">' + x[1] + '</button>'; }).join('') + '</div>';
    html += '<div style="flex:1"></div>';
    if (b.checked) {
      var ok = b.ans[b.i];
      html += '<div class="alert" style="background:' + (ok ? 'var(--green)' : 'var(--red-d)') + ';color:#fff;font-size:14px"><span>' + (ok ? (b.partial ? 'Geçerli – %' + b.score + ' doğru · +10 XP' : b.exact === false && q.type !== 'mc' ? 'Doğru (küçük yazım farkı) · +10 XP' : 'Doğru! +10 XP') : 'Bilemedin → Bilemediklerim havuzuna eklendi.') + (q.type !== 'mc' || !ok ? '<br><span style="opacity:.85">Doğrusu:</span> <b>' + (q.type === 'mc' ? h(q.options[correctIdx]) : (b.diff || h(q.answer))) + '</b>' : '') + '</span></div>';
      html += '<button class="btn btn-blue btn-wide" data-a="bnext">' + (b.i === qs.length - 1 ? 'Sonucu gör' : 'Sonraki soru') + '</button>';
    } else {
      var ready = (q.type === 'mc' ? b.sel != null : true) && (!S.settings.et || b.conf);
      html += '<button class="btn btn-wide" data-a="bcheck" style="background:' + (ready ? 'var(--red)' : 'var(--graphite-3)') + ';color:#fff"' + (ready ? '' : ' disabled') + '>Kontrol et</button>';
    }
    return html + '</div></div>';
  };
  function normAns(s) {
    s = String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/…|\.\.\./g, ' ');
    var map = { "'ve": ' have', "'m": ' am', "'re": ' are', "'ll": ' will', "'d": ' would', "n't": ' not', "'s": ' is' };
    Object.keys(map).forEach(function (k) { s = s.split(k).join(map[k]); });
    s = s.replace(/\bcan not\b/g, 'cannot').replace(/[^a-z0-9%€ ]/g, ' ').replace(/\s+/g, ' ').trim();
    // telefon klavyesinde kesme işaretsiz yazımlar
    var NOAP = { ill: 'i will', im: 'i am', ive: 'i have', id: 'i would', dont: 'do not', doesnt: 'does not', didnt: 'did not', cant: 'cannot', wont: 'will not', isnt: 'is not', arent: 'are not', wasnt: 'was not', havent: 'have not', hasnt: 'has not', couldnt: 'could not', shouldnt: 'should not', wouldnt: 'would not', youre: 'you are', theyre: 'they are', weve: 'we have', youve: 'you have', theyve: 'they have', thats: 'that is', whats: 'what is', hows: 'how is', lets: 'let is' };
    s = s.split(' ').map(function (w) { return NOAP[w] || w; }).join(' ');
    return s;
  }
  function checkFill(input, answer) {
    var u = normAns(input); if (!u) return false;
    return String(answer).split('/').some(function (alt) { var a = normAns(alt); return a === u || (a.length > 3 && u.endsWith(a)) || u === a.replace(/^(i|we|you|they|he|she|it) /, ''); });
  }
  function startBoss(code) {
    var b = S.boss[code] || {}; var th = isReview(code) ? THRESH.review : THRESH.normal;
    if (!S.settings.testMode && b.lastAt && (b.best || 0) < th.pass && now() - b.lastAt < DAY) {
      var hrs = Math.ceil((DAY - (now() - b.lastAt)) / 3600000);
      toast('Rövanş ' + hrs + ' saat sonra açılır. Önce Bilemediklerim havuzunu çalış.'); return;
    }
    UI.boss = { code: code, qs: bossQuestions(code), i: 0, ans: [], phase: 'guess', sel: null, conf: null, checked: false, revealed: false, input: '', ewrong: 0 };
    go('boss', { p: code });
  }
  function bossAnswer(ok) {
    var b = UI.boss; var q = b.qs[b.i];
    b.ans[b.i] = ok; b.checked = true;
    if (ok) addXP(10);
    else {
      var id = 'B-' + b.code + '-' + b.i;
      var ans = q.type === 'mc' ? q.options[q.answer.charCodeAt(0) - 97] : q.answer;
      S.extraCards[id] = q.type === 'mc' ? { id: id, week: b.code, kind: 'boss', mode: 'mc', main: q.q, opts: q.options, en: ans, say: ans } : { id: id, week: b.code, kind: 'boss', mode: 'type', main: q.q, en: ans, answer: ans, say: String(ans).split('/')[0] };
      var c = ensureCard(S.extraCards[id]); c.pools.bil = 1; c.last = 'u'; c.lapses = Math.max(1, c.lapses); c.due = now();
      if (S.settings.et && b.conf === 'E') { c.pools.ym = 1; b.ewrong++; }
    }
    save();
  }

  // ----- kapı -----
  VIEWS.gate = function (p) {
    var code = p.p; var gi = gateInfo(code); var n = weekNum(code); var r = C.route[n] || ['?'];
    var arrived = S.arrived[code];
    var html = '<div class="band" style="align-items:center"><div class="row" style="align-self:stretch"><button class="backbtn" data-a="back" aria-label="Geri">' + ICON.back + '</button><span class="eyebrow grow" style="color:var(--orange)">Ustalık kapısı</span></div>' +
      '<div class="row" style="gap:14px"><span class="ico" style="width:56px;height:56px;background:' + fam(n) + ';color:#fff;font-size:15px;border-radius:16px">' + code + '</span><span class="ico ' + (gi.open && !arrived ? 'pulse' : '') + '" style="width:64px;height:64px;border-radius:20px;background:var(--graphite-2);border:2px solid var(--orange);color:var(--orange)">' + ICON.lock + '</span><span class="ico" style="width:56px;height:56px;background:' + (arrived ? 'var(--teal-d)' : 'var(--graphite-3)') + ';color:#fff;font-size:12px;border-radius:50%;text-align:center;padding:2px">' + h(r[0]) + '</span></div>' +
      '<span class="h-display" style="font-size:22px">' + (arrived ? h(r[0]) + '\'a varıldı!' : h(r[0]) + '\'a giden kapı') + '</span><span class="small muted" style="text-align:center">Öğrendiğini kanıtla, sonraki durak açılsın.</span></div>';
    html += '<div class="page"><div class="card" style="gap:0;padding:4px 12px">';
    gi.items.forEach(function (it) {
      var btn = '';
      if (!it.ok && it.act === 'boss') btn = '<button class="btn btn-sm btn-red" data-a="boss" data-v="' + code + '">Boss</button>';
      else if (!it.ok && it.act === 'study') btn = '<button class="btn btn-sm btn-blue" data-a="study" data-v="week" data-p="' + code + '">Çalış</button>';
      else if (it.act === 'kayit') btn = '<button class="btn btn-sm ' + (it.ok ? 'btn-green' : 'btn-ghost') + '" data-a="kayit" data-v="' + code + '" aria-pressed="' + it.ok + '">' + (it.ok ? 'Yapıldı' : 'Yaptım') + '</button>';
      else if (it.ok && it.act === 'boss') btn = '<button class="btn btn-sm btn-ghost" data-a="boss" data-v="' + code + '">Tekrar</button>';
      html += '<div class="listrow"><span class="ico" style="width:28px;height:28px;border-radius:50%;background:' + (it.ok ? 'var(--green)' : '#fff') + ';border:' + (it.ok ? 'none' : '2.5px solid var(--red)') + '">' + (it.ok ? ICON.check : '') + '</span><span class="stack grow"><b style="font-size:14px">' + h(it.title) + '</b><span class="small" style="color:' + (it.ok ? 'var(--muted)' : 'var(--red-d)') + '">' + h(it.sub) + '</span></span>' + btn + '</div>';
    });
    html += '</div>';
    if (arrived) html += '<button class="btn btn-orange btn-wide" data-a="go" data-v="postcard" data-p="' + code + '" style="background:var(--orange);color:#1A0D00">Kartpostalı aç</button>';
    else if (gi.open) html += '<button class="btn btn-wide pulse" data-a="arrive" data-v="' + code + '" style="background:var(--orange);color:#1A0D00">Kapıdan geç → ' + h(r[0]) + '</button>';
    else html += '<div class="alert" style="background:var(--red-l);color:#881337"><b class="h-display" style="font-size:20px">' + gi.left + '</b>&nbsp;görev kaldı. Kapı kapalı.</div>';
    html += '<div class="card"><span class="eyebrow muted">Geçemezsen: rövanş</span><span class="small">Boss eşiğin altında kalırsa 24 saat sonra rövanş açılır: önce Bilemediklerim havuzu, sonra Boss yeniden. Atlama yok.</span></div>';
    return html + '</div>';
  };
  function arrive(code) {
    var gi = gateInfo(code); if (!gi.open || S.arrived[code]) return;
    var b = S.boss[code] || {};
    S.arrived[code] = { t: now(), gold: stars(code, b.best || 0) === 3 };
    addXP(50); save(); confetti();
    V.stack = []; V.tab = 'tur'; go('postcard', { p: code, fresh: true });
  }

  // ----- kartpostal -----
  VIEWS.postcard = function (p) {
    var code = p.p; var n = weekNum(code); var r = C.route[n] || ['?']; var st = C.stories[code]; var arr = S.arrived[code];
    var col = fam(n);
    var html = '<div class="pc-hero" style="background:' + col + '">' + skyline(n) +
      '<button class="backbtn" data-a="back" aria-label="Geri" style="position:absolute;left:18px;top:8px;color:#fff">' + ICON.back + '</button>' +
      '<div style="position:absolute;left:18px;top:56px;display:flex;flex-direction:column"><span class="eyebrow" style="color:rgba(255,255,255,.85)">Durak ' + n + (st ? ' · ' + h(st.country) : '') + '</span><span class="h-display" style="font-size:38px;line-height:1">' + h(r[0]) + '</span><span class="small" style="opacity:.9;margin-top:4px">' + h(st ? st.landmark : '') + '</span></div>' +
      (arr ? '<div class="stamp" style="background:' + (arr.gold ? 'rgba(234,179,8,.95)' : 'rgba(225,29,72,.92)') + '"><span class="tiny" style="letter-spacing:1px">' + (arr.gold ? 'ALTIN' : 'VARILDI') + '</span><span class="h-display" style="font-size:18px">' + code + '</span><span class="tiny">' + shortDate(dkey(arr.t)) + '</span></div>' : '') + '</div>';
    html += '<div class="page">';
    if (p.fresh) html += '<div class="alert" style="background:var(--orange-l);color:#7C2D12;font-weight:700">Hoş geldin, ' + h(r[0]) + '! +50 XP · yeni damga · sonraki hafta açıldı.</div>';
    if (!st) { html += '<div class="card"><b>Kartpostal yolda</b><span class="small muted">Bu şehrin hikâyesi İngilizce ekibinden gelecek içerik dosyasıyla eklenecek.</span></div>'; return html + '</div>'; }
    var used = (st.used_words || []).slice().sort(function (a, b) { return b.length - a.length; });
    var text = h(st.story_en);
    used.forEach(function (u) { var esc = h(u).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); text = text.replace(new RegExp('(^|[^\\w>])(' + esc + ')(?![^<]*<\\/mark>)', 'i'), '$1<mark class="w">$2</mark>'); });
    (st.glossary || []).forEach(function (g) { var w0 = g.en.replace(/^to /, ''); var esc = h(w0).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); text = text.replace(new RegExp('\\b(' + esc + ')\\b(?![^<]*<\\/(mark|button)>)', 'i'), '<button class="gl" data-a="gloss" data-v="' + h(g.en + ' = ' + g.tr) + '">$1</button>'); });
    var words = st.story_en.split(/\s+/).length;
    html += '<div class="card" style="gap:10px;padding:14px"><div class="sec-title"><span class="eyebrow muted">Hikâye · ' + words + ' kelime' + (st.draft ? ' · taslak' : '') + '</span><button class="btn btn-sm btn-blue" data-a="say" data-v="' + h(st.story_en) + '">' + ICON.speaker + 'Dinle</button></div><p style="margin:0;font-size:16px;line-height:1.65">' + text + '</p><div class="chips"><span class="pill" style="background:var(--blue-l);color:var(--blue-d)">' + used.length + ' haftanın ifadesi</span><span class="pill" style="background:var(--amber-l);color:#92400E">Noktalı kelimeye dokun → Türkçesi</span></div></div>';
    var ans = (S.story[code] || {}).a || {};
    html += '<div class="card"><span class="eyebrow muted">Anladın mı? · 3 soru</span>';
    st.questions.forEach(function (q, qi) {
      var chosen = ans[qi]; var correct = q.answer.charCodeAt(0) - 97;
      html += '<b style="font-size:14px;margin-top:4px">' + (qi + 1) + '. ' + h(q.q) + '</b>' + q.options.map(function (o, oi) {
        var bg = '#fff', bd = 'var(--line)';
        if (chosen != null && oi === correct) { bg = 'var(--green-l)'; bd = 'var(--green)'; } else if (chosen === oi) { bg = 'var(--red-l)'; bd = 'var(--red)'; }
        return '<button class="btn" style="justify-content:flex-start;text-align:left;font-weight:500;background:' + bg + ';border:2px solid ' + bd + ';color:var(--ink)" data-a="sq" data-v="' + code + '" data-q="' + qi + '" data-i="' + oi + '"' + (chosen != null ? ' disabled' : '') + '>' + 'abc'[oi] + ') ' + h(o) + '</button>';
      }).join('');
    });
    html += '</div>';
    html += '<div class="card-dark"><span class="eyebrow" style="color:var(--orange)">Biliyor muydun?</span><span class="small">' + h(st.fact_tr) + '</span></div>';
    return html + '</div>';
  };
  function skyline(n) {
    var seed = n * 9301 % 233; var parts = ''; var x = 0;
    for (var i = 0; i < 9; i++) { var w = 26 + (seed * (i + 3)) % 30; var hgt = 36 + (seed * (i + 7)) % 70; parts += '<div style="position:absolute;bottom:22px;left:' + x + 'px;width:' + w + 'px;height:' + hgt + 'px;background:rgba(0,0,0,' + (0.12 + (i % 3) * 0.05) + ');border-radius:' + (i % 3 === 0 ? '12px 12px 0 0' : '2px') + '"></div>'; x += w + 4; }
    return '<div style="position:absolute;inset:0" aria-hidden="true"><div style="position:absolute;right:28px;top:26px;width:34px;height:34px;border-radius:50%;background:#FFC53D"></div>' + parts + '<div style="position:absolute;left:0;right:0;bottom:0;height:22px;background:rgba(0,0,0,.25)"></div></div>';
  }

  // ----- pasaport -----
  VIEWS.passport = function () {
    var html = backBar('Pasaport', arrivedCount() + '/52 damga', true) + '<div class="page"><div class="card" style="background:var(--paper);border-color:var(--paper-line);gap:14px">';
    for (var e = 1; e <= 13; e++) {
      var idx = [4 * e - 3, 4 * e - 2, 4 * e - 1, 4 * e];
      var got = idx.filter(function (i) { return S.arrived['H' + String(i).padStart(2, '0')]; }).length;
      if (e > 2 && got === 0 && e > Math.ceil(weekNum(currentWeek()) / 4) + 1) { html += '<div class="row" style="border-bottom:2px dashed var(--paper-line);padding-bottom:6px;color:#8A7A5E"><b class="grow">Etap ' + e + ' · ' + h(C.etaps[e - 1]) + '</b><span class="small">kilitli</span></div>'; continue; }
      html += '<div class="row" style="border-bottom:2px dashed var(--paper-line);padding-bottom:6px;color:#3B2F1E"><b class="grow h-display" style="font-size:16px">Etap ' + e + ' · ' + h(C.etaps[e - 1]) + '</b><span class="small" style="font-weight:800;color:var(--teal-d)">' + got + '/4</span></div><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px">';
      idx.forEach(function (i, k) {
        var code = 'H' + String(i).padStart(2, '0'); var a = S.arrived[code]; var kale = k === 3; var cur = currentWeek() === code && !a;
        var col = a ? (a.gold ? '#B7791F' : '#E11D48') : cur ? 'var(--orange-d)' : '#B8A47F';
        html += '<button data-a="' + (a ? 'go' : 'city') + '" data-v="' + (a ? 'postcard' : i) + '" data-p="' + code + '" style="background:none;border:none;display:flex;flex-direction:column;align-items:center;gap:4px;padding:0;color:#3B2F1E"><span style="width:64px;height:64px;max-width:100%;border-radius:' + (kale ? '16px' : '50%') + ';border:3px ' + (a ? 'solid' : 'dashed') + ' ' + col + ';background:' + (a ? (a.gold ? 'var(--amber-l)' : '#FFF1F2') : 'transparent') + ';color:' + col + ';display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(' + (a ? (i % 2 ? 6 : -8) : 0) + 'deg)"><span style="font-size:8px;font-weight:800;letter-spacing:1px">' + (a ? (a.gold ? 'ALTIN' : 'VARILDI') : cur ? 'KAPIDA' : kale ? 'KALE' : '') + '</span><span class="h-display" style="font-size:14px">' + code + '</span></span><span class="tiny" style="font-weight:700">' + h(C.route[i][0]) + '</span></button>';
      });
      html += '</div>';
    }
    return html + '</div></div>';
  };

  // ----- kural kitabı -----
  VIEWS.rules = function () {
    var r = function (ico, bg, fg, t, s) { return '<div class="row" style="align-items:flex-start"><span class="ico" style="width:32px;height:32px;background:' + bg + ';color:' + fg + '">' + ico + '</span><span class="stack grow"><b style="font-size:14px">' + t + '</b><span class="small muted">' + s + '</span></span></div>'; };
    var html = backBar('Kural kitabı', 'Uygulama bu kurallarla kendiliğinden çalışır', true) + '<div class="page">';
    html += '<div class="card"><span class="eyebrow" style="color:var(--blue)">1 · Kartlar</span>' + r('✎', 'var(--graphite)', '#fff', 'Yazarak cevap', 'Cevabı yazarsın, uygulama kontrol eder. Yazım hatası ve kesme işaretsiz yazım tolere edilir.') + r('70%', 'var(--amber)', '#3B2300', 'Uzun cümle kuralı', 'Kalıp, karışık çeviri ve Boss çeviri sorularında 6+ kelimelik cümlenin %70\'ini doğru yazarsan geçerli sayılır; eksikler turuncu gösterilir ve kart ertesi gün tekrar gelir. Kısa cevaplarda, gramerde ve yanlış modellerde tam doğruluk gerekir.') + r(ICON.check, 'var(--green)', '#fff', 'Bildim', 'Kart 3 → 7 → 21 → 60 gün sonra döner.') + r('✕', 'var(--red)', '#fff', 'Bilemedim', '10 dk sonra tekrar gelir ve Bilemediklerim havuzuna girer.') + r('+7', 'var(--orange)', '#1A0D00', 'Günlük tekrar', 'Her gün 7 yeni kart + vadesi gelenler · ~10 dk.') + '</div>';
    html += '<div class="card"><span class="eyebrow" style="color:var(--magenta-d)">2 · Havuzlar</span>' + r('', 'var(--magenta)', '#fff', 'Bilemediklerim · 3 günde bir · 10 dk', '1 kez bilemedin → girer.') + r('', 'var(--amber)', '#fff', 'Yanlış modeller · haftada 2 · 5 dk', 'Almanca tuzakları ve başlangıç testindeki hataların.') + r('', 'var(--red)', '#fff', 'İnatçı kartlar · her gün · 3 dk', '3 kez bilemedin → girer.') + '<div class="alert" style="background:var(--green-l);color:#14532D"><b>Mezuniyet:</b>&nbsp;art arda 3 kez bildin → havuzdan çıkar, +10 XP.</div></div>';
    html += '<div class="card"><span class="eyebrow" style="color:var(--orange-d)">3 · Havuz gecikirse</span>' + r('+1', 'var(--amber-l)', '#92400E', 'Hatırlatma', 'Bugün ekranında uyarı çıkar.') + r('+2', 'var(--orange-l)', '#9A3412', 'Bugünün ilk görevi', 'Havuz listede en üste çıkar.') + r('+3', 'var(--red-l)', '#9F1239', 'Kor uyarısı', 'Alev tehlikede; hemen çalış.') + '</div>';
    html += '<div class="card"><span class="eyebrow" style="color:var(--orange-d)">4 · Alev</span>' + r('5dk', '#FFE2CC', '#9A3412', 'Mini gün', 'Herhangi bir çalışma gün sayılır.') + r(ICON.shield, 'var(--blue)', '#fff', 'Kalkan', 'Haftada 2 dinlenme günü otomatik korunur; her 10 günde +1 bonus (en fazla 3).') + r('', 'var(--graphite-3)', '#fff', 'Kor', 'Kalkansız kaçırılan günden sonraki 2 gün içinde 60 XP topla → alev geri gelir.') + r('J', 'var(--amber-l)', '#92400E', 'Joker hafta', 'J1 28.12 · J2 29.03 · J3 16.08 – tüm hafta korunur.') + '</div>';
    html += '<div class="card"><span class="eyebrow" style="color:var(--violet)">5 · XP ve kapı</span><span class="small">Kart: Bildim +5 / Bilemedim +1 · PDF tiki +15 · günün tüm tikleri → kombo ×1,5 · Boss doğru +10 · mezun +10 · şehre varış +50.</span><span class="small">Kapı: Boss ≥ 9/12 (tekrar haftası 20/30) · aktif kelimelerin %80\'i Bildim · 10 kalıbın 8\'i Bildim · konuşma kaydı. 3 yıldız → altın damga.</span></div>';
    return html + '</div>';
  };

  // ----- yedek / içerik -----
  VIEWS.data = function () {
    var html = backBar('Yedek ve içerik', '', true) + '<div class="page">';
    html += '<div class="card"><b>İçerik dosyası yükle</b><span class="small muted">İngilizce ekibinin teslim ettiği .json dosyasını seç (ör. 00_icerik_veri_H05-H08.json). Haftalar ve kartpostallar eklenir; ilerlemen korunur.</span><label class="btn btn-blue" for="contentfile">Dosya seç</label><input id="contentfile" type="file" accept=".json,application/json" style="position:absolute;width:1px;height:1px;opacity:0"><span id="contentmsg" class="small"></span></div>';
    html += '<div class="card"><b>Yedek al</b><span class="small muted">İlerlemen bu cihazda saklanıyor. Aşağıdaki metni kopyalayıp güvenli bir yere (ör. Drive notu) yapıştır.</span><button class="btn btn-ghost" data-a="exportbk">Yedeği göster ve kopyala</button>' + (IS_APP ? '<button class="btn btn-ghost" data-a="dlbk">Yedeği dosya olarak indir</button>' : '') + '<textarea id="bk" class="inp-light" readonly hidden></textarea></div>';
    html += '<div class="card"><b>Yedekten geri yükle</b><textarea id="bkin" class="inp-light" placeholder="Yedek metnini buraya yapıştır"></textarea><button class="btn btn-dark" data-a="importbk">Geri yükle</button></div>';
    html += '<div class="card"><b>Sıfırla</b><span class="small muted">Tüm ilerleme silinir.</span>' + (UI.confirmReset ? '<div class="row"><button class="btn btn-red grow" data-a="reset2">Evet, her şeyi sil</button><button class="btn btn-ghost" data-a="reset0">Vazgeç</button></div>' : '<button class="btn btn-ghost" data-a="reset1" style="color:var(--red-d)">İlerlemeyi sıfırla</button>') + '</div>';
    return html + '</div>';
  };
  function importContent(obj) {
    var extra = loadExtraContent() || { weeks: {}, stories: {} };
    var n = 0;
    (obj.weeks || []).forEach(function (w) { if (w && w.code) { var ww = Object.assign({ type: 'yeni_konu' }, w); extra.weeks[w.code] = ww; if (w.durak) extra.stories[w.code] = w.durak; n++; } });
    (obj.review_weeks || []).forEach(function (w) { if (w && w.code) { extra.weeks[w.code] = Object.assign({ type: 'tekrar' }, w); if (w.durak) extra.stories[w.code] = w.durak; n++; } });
    if (obj.H04_review && obj.H04_review.code) { extra.weeks.H04 = Object.assign({ type: 'tekrar', block: 1 }, obj.H04_review); n++; }
    Object.keys(obj.stories || {}).forEach(function (k) { extra.stories[k] = obj.stories[k]; });
    (obj.calendar || []).forEach(function (c) { if (extra.weeks[c.label]) { extra.weeks[c.label].monday = c.monday; } });
    if (!n && !Object.keys(obj.stories || {}).length) throw new Error('Dosyada hafta bulunamadı (weeks / review_weeks alanı yok).');
    try { localStorage.setItem('engm_content_extra', JSON.stringify(extra)); } catch (e) { throw new Error('Cihaz belleğine yazılamadı.'); }
    C = mergeContent(BASE, extra); defCache = {};
    return n;
  }

  // ---------- olaylar ----------
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-a]'); if (!el) return;
    var a = el.getAttribute('data-a'), v = el.getAttribute('data-v'), pp = el.getAttribute('data-p');
    switch (a) {
      case 'tab': setTab(v); break;
      case 'back': back(); break;
      case 'home': V.stack = []; V.tab = 'bugun'; render(); break;
      case 'go': go(v, { p: pp }); break;
      case 'go-replace': V.stack.pop(); go(v, { p: pp }); break;
      case 'say': speak(v); break;
      case 'study': startStudy(v, pp); break;
      case 'pool': startStudy('pool', v); break;
      case 'mini': startStudy('mini'); break;
      case 'tick': {
        var k = today(); S.ticks[k] = S.ticks[k] || {}; var tasks = paperTasks(currentWeek());
        if (S.ticks[k][v]) { delete S.ticks[k][v]; addXP(-15); }
        else { S.ticks[k][v] = 1; addXP(15); toast('+15 XP'); }
        if (Object.keys(S.ticks[k]).length === tasks.length && tasks.length && !S.comboDays[k]) { S.comboDays[k] = 1; var bonus = Math.round(tasks.length * 15 * 0.5); addXP(bonus); confetti(); toast('KOMBO! +' + bonus + ' XP'); }
        save(); render(); break;
      }
      case 'checkans': submitAnswer(); break;
      case 'dontknow': submitAnswer(false); break;
      case 'hint': UI.session.hint = true; render(); break;
      case 'mcpick': {
        var ssm = UI.session; var dm = ssm.queue[0]; if (ssm.phase !== 'ask') break;
        var okm = +v === ssm.opts.correct; ssm.res = { ok: okm, exact: true, pick: +v, diff: null }; ssm.phase = 'result';
        ssm.msg = rate(dm, okm); ssm.xp += okm ? 5 : 1; if (okm) ssm.known++; else ssm.unknown++;
        render(); speak(dm.say); break;
      }
      case 'nextcard': nextCard(); break;
      case 'endstudy': {
        var s2 = UI.session; if (s2 && s2.kind === 'pool' && s2.done >= Math.min(5, s2.total)) { S.poolDone[s2.param] = now(); save(); }
        UI.session = null; back(); break;
      }
      case 'boss': startBoss(v); break;
      case 'guess': UI.boss.guess = +v; UI.boss.phase = 'q'; render(); break;
      case 'bsel': if (!UI.boss.checked) { UI.boss.sel = +v; render(); } break;
      case 'bconf': UI.boss.conf = v; render(); break;
      case 'bcheck': {
        var b = UI.boss; var q = b.qs[b.i]; var inp = document.getElementById('bfill'); if (inp) b.input = inp.value;
        if (q.type === 'mc') bossAnswer(b.sel === q.answer.charCodeAt(0) - 97);
        else { var gr = gradeText(b.input || '', q.answer, q.type === 'tr'); b.diff = gr.diff; b.exact = gr.exact; b.partial = gr.partial; b.score = gr.score; bossAnswer(gr.ok); }
        render(); break;
      }
      case 'bself': bossAnswer(v === '1'); render(); break;
      case 'bnext': {
        var b2 = UI.boss;
        if (b2.i < b2.qs.length - 1) { b2.i++; b2.sel = null; b2.conf = null; b2.checked = false; b2.revealed = false; b2.input = ''; b2.diff = null; b2.exact = null; b2.partial = false; b2.score = null; }
        else {
          b2.phase = 'result'; var sc = b2.ans.filter(Boolean).length; var rec = S.boss[b2.code] || {};
          rec.best = Math.max(rec.best || 0, sc); rec.lastAt = now(); rec.last = sc; rec.guess = b2.guess; if (S.settings.et) rec.ewrong = b2.ewrong;
          rec.attempts = (rec.attempts || 0) + 1; S.boss[b2.code] = rec; save();
          if (stars(b2.code, sc) === 3) confetti();
        }
        render(); break;
      }
      case 'kayit': { S.gate[v] = S.gate[v] || {}; S.gate[v].kayit = !S.gate[v].kayit; save(); render(); break; }
      case 'arrive': arrive(v); break;
      case 'city': UI.city = +v; if (V.stack.length) { V.stack = []; V.tab = 'tur'; render(); } else { var cs_ = document.getElementById('citysheet'); if (cs_) cs_.innerHTML = citySheet(+v); else render(); } break;
      case 'gloss': toast(v); break;
      case 'sq': {
        S.story[v] = S.story[v] || { a: {} }; var qi = el.getAttribute('data-q'), oi = +el.getAttribute('data-i');
        if (S.story[v].a[qi] == null) { S.story[v].a[qi] = oi; var st = C.stories[v]; if (st && st.questions[qi].answer.charCodeAt(0) - 97 === oi) { addXP(5); toast('Bildin! +5 XP'); } else toast('Doğru cevap yeşil – hikâyeyi tekrar oku'); save(); render(); }
        break;
      }
      case 'tuzak': {
        var w = C.weeks[v]; var i = +el.getAttribute('data-i'); var okT = w.tuzak.answer.charCodeAt(0) - 97 === i;
        var r = document.getElementById('tuzak-r-' + v); if (r) r.innerHTML = '<div class="alert" style="background:' + (okT ? 'var(--green-l)' : 'var(--red-l)') + ';color:var(--ink)"><span><b>' + (okT ? 'Doğru!' : 'Yanlış – doğrusu: ' + h(w.tuzak.options[w.tuzak.answer.charCodeAt(0) - 97])) + '</b><br>' + h(w.tuzak.rule) + '</span></div>';
        break;
      }
      case 'reveal': el.outerHTML = '<b style="color:var(--green)">' + h(v) + '</b>'; break;
      case 'libchip': { var g = UI.lib[el.getAttribute('data-k')]; g[v] = !g[v]; render(); break; }
      case 'libclear': ev.preventDefault(); UI.lib = { q: UI.lib.q, kind: {}, week: {}, st: {}, blok: {}, gr: {} }; render(); break;
      case 'setting': S.settings[v] = !S.settings[v]; if (v === 'testMode' && !S.settings.testMode) S.settings.timeShift = 0; save(); render(); break;
      case 'shift': S.settings.timeShift = (S.settings.timeShift || 0) + DAY; save(); toast('Saat 1 gün ileri alındı'); render(); break;
      case 'wtoggle': {
        var code = currentWeek();
        if (v === 'kayit') { S.gate[code] = S.gate[code] || {}; S.gate[code].kayit = !S.gate[code].kayit; }
        else { S.weekly[code] = S.weekly[code] || {}; S.weekly[code][v] = !S.weekly[code][v]; }
        save(); render(); break;
      }
      case 'knz': { var c2 = currentWeek(); S.weekly[c2] = S.weekly[c2] || {}; S.weekly[c2].KNZ = v; save(); render(); break; }
      case 'copycode': {
        var txt = weekCode(currentWeek());
        var done_ = function () { toast('Kod kopyalandı'); };
        try { navigator.clipboard.writeText(txt).then(done_, function () { selectText('wcode'); toast('Seçildi – uzun basıp kopyala'); }); } catch (e) { selectText('wcode'); }
        break;
      }
      case 'exportbk': {
        var ta = document.getElementById('bk'); ta.hidden = false; ta.value = JSON.stringify(S); ta.select();
        try { navigator.clipboard.writeText(ta.value).then(function () { toast('Yedek kopyalandı'); }, function () { toast('Metin seçildi – kopyala'); }); } catch (e) { }
        break;
      }
      case 'importbk': {
        try { var obj = JSON.parse(document.getElementById('bkin').value); if (!obj || obj.v !== 1 || !obj.cards) throw new Error('x'); S = Object.assign(freshState(), obj); save(); toast('Yedek yüklendi'); V.stack = []; render(); }
        catch (e) { toast('Bu metin geçerli bir yedek değil'); }
        break;
      }
      case 'dlbk': {
        try { var blob = new Blob([JSON.stringify(S)], { type: 'application/json' }); var a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = 'ENGMAliENG_yedek_' + today() + '.json'; document.body.appendChild(a2); a2.click(); setTimeout(function () { URL.revokeObjectURL(a2.href); a2.remove(); }, 500); toast('Yedek dosyası indirildi'); } catch (e) { toast('İndirilemedi – kopyala seçeneğini kullan'); }
        break;
      }
      case 'reset1': UI.confirmReset = true; render(); break;
      case 'reset0': UI.confirmReset = false; render(); break;
      case 'reset2': S = freshState(); save(); UI.confirmReset = false; V.stack = []; V.tab = 'bugun'; toast('Sıfırlandı'); render(); break;
    }
  });
  function selectText(id) { var el = document.getElementById(id); if (!el) return; var r = document.createRange(); r.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id === 'libq') { UI.lib.q = t.value; var pos = t.selectionStart; render(); var n = document.getElementById('libq'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } } }
    else if (t.id === 'bfill' && UI.boss) { UI.boss.input = t.value; }
    else if (t.id === 'ans' && UI.session) { UI.session.typed = t.value; }
    else if (/^w[SDA]$/.test(t.id)) { var code = currentWeek(); S.weekly[code] = S.weekly[code] || {}; S.weekly[code][t.id.slice(1)] = t.value.replace(/\D/g, ''); save(); var c = document.getElementById('wcode'); if (c) c.textContent = weekCode(code); }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    if (ev.target.id === 'bfill') { ev.preventDefault(); var btn = document.querySelector('[data-a="bcheck"]') || document.querySelector('[data-a="bnext"]'); if (btn && !btn.disabled) btn.click(); }
    else if (ev.target.id === 'ans') { ev.preventDefault(); submitAnswer(); }
    else if (UI.session && UI.session.phase === 'result' && V.stack.length && V.stack[V.stack.length - 1].view === 'study') { ev.preventDefault(); nextCard(); }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target.id !== 'contentfile') return;
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var msg = document.getElementById('contentmsg');
      try { var n = importContent(JSON.parse(rd.result)); msg.innerHTML = '<b style="color:var(--green)">' + n + ' hafta yüklendi. Sırası gelince açılacak.</b>'; }
      catch (e) { msg.innerHTML = '<b style="color:var(--red-d)">Yüklenemedi: ' + h(e.message) + '</b>'; }
    };
    rd.readAsText(f);
  });

  // kurulu uygulama (PWA) mı, claude.ai önizlemesi mi?
  // depolamayı kalıcı iste (tarayıcı belleği temizlerken silmesin)
  try { if (IS_APP && navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  if (IS_APP && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
  }
  // test kancası (Bora)
  window.ENGM_TEST = { planInfo: planInfo, state: function () { return S; }, session: function () { return UI.session; }, normAns: normAns, checkFill: checkFill, gradeText: gradeText, streakInfo: streakInfo, gateInfo: gateInfo, cardsForWeek: cardsForWeek, render: render };
  render();
})();
