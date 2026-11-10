import { firebaseConfig } from './config.js';
import {
  initializeApp, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, query, orderBy, limit, onSnapshot, setDoc, deleteDoc, getDoc, deleteField,
} from './firebase.js';

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const SIDE = { L: 'trái', R: 'phải' };
const DIAPER = { wet: 'Tã ướt', dirty: 'Tã bẩn', both: 'Tã ướt và bẩn' };
const DIAPER_SHORT = { wet: 'Ướt', dirty: 'Bẩn', both: 'Cả hai' };
const KIND = { bm: 'sữa mẹ', f: 'sữa công thức' };
const TYPES = ['breast', 'bottle', 'diaper', 'sleep'];
const PRESETS = [30, 60, 90, 120];
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const LS_SIGNED = 'socuabe.signed';
const APP_VERSION = 'v7';
// Sleep tracking is hidden for now (set to true to bring it back; its code is kept).
const SHOW_SLEEP = false;
const PURGE_SLEEP_KEY = 'socuabe.purge.sleep.v1';

const svg = inner => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
const I = {
  drop: svg('<path d="M12 3.2c3.6 4.4 6 7.7 6 10.8a6 6 0 0 1-12 0c0-3.1 2.4-6.4 6-10.8z" fill="currentColor"/>'),
  mound: svg('<g fill="currentColor"><rect x="4" y="14.6" width="16" height="5.6" rx="2.8"/><rect x="6.6" y="10.2" width="10.8" height="5.4" rx="2.7"/><path d="M8.9 10.9c0-2.1 1.6-3.3 3.3-3.5.2-.9-.1-1.9-.7-2.6 2.7.3 4.1 2.2 4 4.1-.1 1-.5 1.7-1 2z"/></g>'),
  bottle: svg('<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.6 2.8h4.8"/><path d="M10.4 2.8v2.5L8.7 7.5a2 2 0 0 0-.4 1.2V19a2.2 2.2 0 0 0 2.2 2.2h3a2.2 2.2 0 0 0 2.2-2.2V8.7a2 2 0 0 0-.4-1.2l-1.7-2.2V2.8"/><path d="M8.6 11.6h3.2M8.6 15.2h3.2"/></g>'),
  moon: svg('<path d="M20 14.7A8.2 8.2 0 0 1 9.3 4a8.2 8.2 0 1 0 10.7 10.7z" fill="currentColor"/>'),
  sun: svg('<circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 2.6v2.3M12 19.1v2.3M2.6 12h2.3M19.1 12h2.3M5.4 5.4 7 7M17 17l1.6 1.6M5.4 18.6 7 17M17 7l1.6-1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2.6" fill="currentColor"/>'),
  swap: svg('<path d="M6 8h12m0 0-3.2-3.2M18 8l-3.2 3.2M18 16H6m0 0 3.2-3.2M6 16l3.2 3.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  plus: svg('<path d="M12 5.5v13M5.5 12h13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  chevL: svg('<path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  chevR: svg('<path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
};

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p2 = n => String(n).padStart(2, '0');
const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const int = v => { const n = parseInt(v, 10); return isFinite(n) ? n : 0; };
const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const keyDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const shiftKey = (k, n) => { const d = keyDate(k); d.setDate(d.getDate() + n); return dayKey(d.getTime()); };
const todayKey = () => dayKey(Date.now());
const hm = ts => { const d = new Date(ts); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const diaperKey = d => (d === 'dirty' || d === 'both') ? d : 'wet';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };

function dayLabel(k) {
  const t = todayKey();
  if (k === t) return 'Hôm nay';
  if (k === shiftKey(t, -1)) return 'Hôm qua';
  const d = keyDate(k);
  return `${WD[d.getDay()]} ${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
}
function fmtMin(m) { if (m < 60) return m + 'p'; const h = Math.floor(m / 60), r = m % 60; return r ? `${h}g${r}p` : `${h}g`; }
function dur(ms) { const m = Math.round(ms / MIN); return m < 1 ? '<1p' : fmtMin(m); }
function since(ms, floorLabel) { const m = Math.floor(ms / MIN); return m < 1 ? floorLabel : fmtMin(m); }
function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return h ? `${h}:${p2(m)}:${p2(x)}` : `${p2(m)}:${p2(x)}`;
}
function ageText(birth) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth || '')) return '';
  const b = keyDate(birth), t = keyDate(todayKey());
  const days = Math.round((t - b) / DAY);
  if (days < 0) return '';
  if (days === 0) return 'chào đời hôm nay';
  if (days < 14) return `${days} ngày tuổi`;
  if (days < 91) { const w = Math.floor(days / 7), d = days % 7; return d ? `${w} tuần ${d} ngày` : `${w} tuần tuổi`; }
  let mo = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth());
  if (t.getDate() < b.getDate()) mo--;
  return `${mo} tháng tuổi`;
}
function buzz() { try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} }

function sideTotals(segs, now = Date.now()) {
  const t = { L: 0, R: 0 };
  (Array.isArray(segs) ? segs : []).forEach(x => {
    if (!x || (x.s !== 'L' && x.s !== 'R') || num(x.a) === null) return;
    const b = num(x.b) === null ? now : x.b;
    t[x.s] += Math.max(0, b - x.a);
  });
  return t;
}
function sideOrder(segs) {
  const o = [];
  (Array.isArray(segs) ? segs : []).forEach(x => { if (x && (x.s === 'L' || x.s === 'R') && !o.includes(x.s)) o.push(x.s); });
  return o;
}
function segText(segs) { const t = sideTotals(segs); return sideOrder(segs).map(s => `${SIDE[s]} ${dur(t[s])}`).join(', '); }
function breastTotal(e) { const t = sideTotals(e.segs, num(e.end) ?? e.at); return (t.L + t.R) || Math.max(0, (num(e.end) ?? e.at) - e.at); }
function evTitle(e) {
  if (e.t === 'breast') return 'Bú mẹ';
  if (e.t === 'bottle') return 'Bú bình';
  if (e.t === 'diaper') return DIAPER[e.d] || 'Tã';
  return 'Ngủ';
}
function feedDetail(e) { return e.t === 'breast' ? segText(e.segs) : `bình ${num(e.ml) ?? '?'}ml ${KIND[e.k] || 'sữa'}`; }

/* ---------- state ---------- */
const S = {
  ready: false, user: null, uid: null, email: null, denied: false,
  days: {}, extra: {}, loadingDay: {}, active: { feed: null, sleep: null }, meta: null, members: {},
  pend: {}, pendActive: {}, saving: 0,
  loaded: false, synced: false, offline: !navigator.onLine,
  today: todayKey(), selDay: todayKey(), logOpen: false,
  sheet: null, toastData: null, toastTimer: null,
};
let fb = null;          // { auth, db }
let unsubs = [];

function validEv(e) { return !!e && typeof e === 'object' && typeof e.id === 'string' && num(e.at) !== null && TYPES.includes(e.t); }
function validFeed(v) {
  if (!v || num(v.start) === null || !Array.isArray(v.segs)) return null;
  const segs = v.segs.filter(x => x && (x.s === 'L' || x.s === 'R') && num(x.a) !== null);
  return segs.length ? { start: v.start, segs, by: typeof v.by === 'string' ? v.by : null } : null;
}
function validSleep(v) { return v && num(v.start) !== null ? { start: v.start, by: typeof v.by === 'string' ? v.by : null } : null; }

function eventsOf(key) {
  const docData = S.days[key] || S.extra[key];
  const map = Object.assign({}, (docData && docData.events) || {});
  for (const p of Object.values(S.pend)) if (p.key === key) { if (p.ev) map[p.id] = p.ev; else delete map[p.id]; }
  return Object.values(map).filter(validEv);
}
function recentEvents() {
  const keys = new Set([...Object.keys(S.days), ...Object.values(S.pend).map(p => p.key)]);
  const out = [];
  keys.forEach(k => out.push(...eventsOf(k)));
  return out;
}
function latest(evs, pred, field = 'at') {
  let best = null;
  for (const e of evs) if (pred(e) && num(e[field]) !== null && (!best || e[field] > best[field])) best = e;
  return best;
}
function act(kind) {
  if (kind === 'sleep' && !SHOW_SLEEP) return null;
  return S.pendActive[kind] ? S.pendActive[kind].val : S.active[kind];
}
function lastBreastSide() {
  const e = latest(recentEvents(), x => x.t === 'breast' && Array.isArray(x.segs) && x.segs.length);
  if (!e) return null;
  const o = e.segs.filter(x => x && (x.s === 'L' || x.s === 'R'));
  return o.length ? o[o.length - 1].s : null;
}
function lastBottle() { return latest(recentEvents(), x => x.t === 'bottle' && num(x.ml) !== null); }

/* ---------- writes ----------
   Firestore applies a write to the local cache at once (snapshots fire immediately, even offline)
   and syncs in the background; the promise resolves when the server confirms. */
function bump(n) { S.saving = Math.max(0, S.saving + n); renderStatus(); }
function track(promise) {
  bump(1);
  return promise.then(() => bump(-1), e => { bump(-1); fail(e); });
}
function putEv(key, id, ev) {
  S.pend[key + '|' + id] = { key, id, ev };
  if (S.extra[key] && !S.days[key]) {
    const events = Object.assign({}, S.extra[key].events || {});
    if (ev) events[id] = ev; else delete events[id];
    S.extra[key] = Object.assign({}, S.extra[key], { events });
  }
  render();
  return track(setDoc(doc(fb.db, 'days', key), { date: key, events: { [id]: ev ? ev : deleteField() } }, { merge: true }));
}
function saveEv(ev, oldKey) {
  const key = dayKey(ev.at);
  if (oldKey && oldKey !== key) putEv(oldKey, ev.id, null);
  return putEv(key, ev.id, ev);
}
function removeEv(ev) { return putEv(dayKey(ev.at), ev.id, null); }
function putActive(kind, val) {
  S.pendActive[kind] = { val };
  render();
  const ref = doc(fb.db, 'active', kind);
  return track(val ? setDoc(ref, val) : deleteDoc(ref));
}
function fail(e) {
  const c = e && e.code;
  if (c === 'permission-denied') { S.denied = true; render(); toast('Tài khoản này chưa được phép ghi vào sổ.'); return; }
  if (c === 'resource-exhausted') { toast('Đã vượt hạn mức miễn phí của Firebase hôm nay.'); return; }
  toast('Chưa lưu được lên máy chủ. Dữ liệu vẫn nằm trên máy và sẽ thử lại.');
}
function canAct() {
  if (!fb || !S.user) { toast('Đang kết nối, thử lại sau giây lát.'); return false; }
  if (S.denied) { toast('Tài khoản này chưa được phép ghi vào sổ.'); return false; }
  return true;
}
function mkEv(o) {
  return { id: o.id, t: o.t, at: o.at, end: o.end ?? null, segs: o.segs ?? null, ml: o.ml ?? null, k: o.k ?? null, d: o.d ?? null, by: o.by ?? (S.uid || null) };
}

/* ---------- quick actions ---------- */
function tapSide(side) {
  if (!canAct()) return;
  const f = act('feed'), now = Date.now();
  if (!f) {
    putActive('feed', { start: now, segs: [{ s: side, a: now, b: null }], by: S.uid || null });
    buzz();
    toast(`Bắt đầu bú ${SIDE[side]} lúc ${hm(now)}`, { undo: () => putActive('feed', null) });
    return;
  }
  const segs = f.segs.map(x => ({ s: x.s, a: x.a, b: num(x.b) }));
  const last = segs[segs.length - 1];
  if (last.s !== side) {
    last.b = now;
    segs.push({ s: side, a: now, b: null });
    putActive('feed', { start: f.start, segs, by: f.by || null });
    buzz();
    toast(`Đổi sang bên ${SIDE[side]}`, { undo: () => putActive('feed', f) });
    return;
  }
  last.b = now;
  if (now - f.start < 15000) {
    putActive('feed', null);
    toast('Đã hủy cữ bú chưa tới 15 giây', { undo: () => putActive('feed', f) });
    return;
  }
  const ev = mkEv({ id: 'b' + f.start.toString(36), t: 'breast', at: f.start, end: now, segs, by: f.by || S.uid || null });
  saveEv(ev);
  putActive('feed', null);
  buzz();
  toast(`Đã ghi cữ bú: ${segText(segs)}`, { undo: () => { removeEv(ev); putActive('feed', f); }, edit: ev });
}
function tapSleep() {
  if (!canAct()) return;
  const s = act('sleep'), now = Date.now();
  if (!s) {
    putActive('sleep', { start: now, by: S.uid || null });
    buzz();
    toast(`Bắt đầu ngủ lúc ${hm(now)}`, { undo: () => putActive('sleep', null) });
    return;
  }
  if (now - s.start < 15000) {
    putActive('sleep', null);
    toast('Đã hủy giấc ngủ chưa tới 15 giây', { undo: () => putActive('sleep', s) });
    return;
  }
  const ev = mkEv({ id: 's' + s.start.toString(36), t: 'sleep', at: s.start, end: now, by: s.by || S.uid || null });
  saveEv(ev);
  putActive('sleep', null);
  buzz();
  toast(`Đã ghi giấc ngủ ${dur(now - s.start)}`, { undo: () => { removeEv(ev); putActive('sleep', s); }, edit: ev });
}
function logDiaper(d) {
  if (!canAct() || !DIAPER[d]) return;
  const ev = mkEv({ id: newId('d'), t: 'diaper', at: Date.now(), d });
  saveEv(ev);
  buzz();
  toast(`Đã ghi ${DIAPER[d].toLowerCase()} lúc ${hm(ev.at)}`, { undo: () => removeEv(ev), edit: ev });
}
function tapBottle() {
  if (!canAct()) return;
  openEdit(null, 'bottle');   // always confirm amount and milk type; defaults come from the last bottle
}

/* ---------- rendering ---------- */
const htmlCache = {};
function setHTML(el, html) { if (htmlCache[el.id] !== html) { htmlCache[el.id] = html; el.innerHTML = html; } }
const isLoading = () => !S.loaded;

function render() { renderStatus(); renderControls(); if (S.logOpen) renderLogView(); tick(); }

function ringSVG(evs, f, s, now) {
  const C = 80, from = now - DAY;
  const ang = ts => { const d = new Date(ts); return (d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60) / 1440 * 360; };
  const pt = (a, r) => { const t = (a - 90) * Math.PI / 180; return [(C + r * Math.cos(t)).toFixed(1), (C + r * Math.sin(t)).toFixed(1)]; };
  const arc = (a1, a2, r) => {
    let d = a2 - a1; if (d < 0) d += 360; if (d < 2.5) d = 2.5;
    const [x1, y1] = pt(a1, r), [x2, y2] = pt(a1 + d, r);
    return `M${x1} ${y1}A${r} ${r} 0 ${d > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const op = ts => (0.32 + 0.68 * Math.max(0, Math.min(1, 1 - (now - ts) / DAY))).toFixed(2);
  let o = `<circle cx="80" cy="80" r="63" class="rg-track" stroke-width="12"/>${SHOW_SLEEP ? '<circle cx="80" cy="80" r="47" class="rg-track" stroke-width="10"/>' : ''}`;
  for (let h = 0; h < 24; h++) { const major = h % 6 === 0; const [x1, y1] = pt(h * 15, major ? 70.5 : 72.5), [x2, y2] = pt(h * 15, 75.5); o += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="rg-tick${major ? ' is-major' : ''}"/>`; }
  [['0h', 0], ['6h', 90], ['12h', 180], ['18h', 270]].forEach(([t, a]) => { const [x, y] = pt(a, 85); o += `<text x="${x}" y="${y}" class="rg-label" text-anchor="middle" dominant-baseline="central">${t}</text>`; });
  for (const e of evs) {
    if (SHOW_SLEEP && e.t === 'sleep' && num(e.end) !== null && e.end > from) o += `<path d="${arc(ang(Math.max(e.at, from)), ang(e.end), 47)}" class="rg-sleep" stroke-width="10" opacity="${op(e.end)}"/>`;
  }
  if (s) o += `<path d="${arc(ang(Math.max(s.start, from)), ang(now), 47)}" class="rg-sleep" stroke-width="10"/>`;
  for (const e of evs) {
    if ((e.t === 'breast' || e.t === 'bottle') && e.at > from) {
      const end = e.t === 'breast' && num(e.end) !== null ? e.end : e.at;
      o += `<path d="${arc(ang(e.at), ang(end), 63)}" class="rg-feed" stroke-width="12" opacity="${op(e.at)}"/>`;
    }
  }
  if (f) o += `<path d="${arc(ang(f.start), ang(now), 63)}" class="rg-feed" stroke-width="12"/>`;
  for (const e of evs) {
    if (e.t === 'diaper' && e.at > from) { const [x, y] = pt(ang(e.at), 33); o += `<circle cx="${x}" cy="${y}" r="3.4" class="rg-${diaperKey(e.d)}" opacity="${op(e.at)}"/>`; }
  }
  const an = ang(now), [hx, hy] = pt(an, 77), [ix, iy] = pt(an, 22);
  o += `<line x1="${ix}" y1="${iy}" x2="${hx}" y2="${hy}" class="rg-now"/><circle cx="${hx}" cy="${hy}" r="2.8" class="rg-now-dot"/>`;
  o += `<text x="80" y="80" class="rg-center" text-anchor="middle" dominant-baseline="central">24 giờ</text>`;
  return `<svg class="ring" viewBox="-16 -16 192 192" role="img" aria-label="Vòng 24 giờ qua: cữ bú ở vòng ngoài${SHOW_SLEEP ? ', giấc ngủ ở vòng giữa' : ''}, lần thay tã ở vòng trong, kim chỉ giờ hiện tại">${o}</svg>`;
}

function renderStatus() {
  const now = Date.now(), evs = recentEvents(), f = act('feed'), s = act('sleep'), loading = isLoading();
  const m = S.meta || {};
  const name = typeof m.name === 'string' && m.name.trim() ? m.name.trim() : 'Bé yêu';
  document.title = `Sổ của ${name === 'Bé yêu' ? 'bé' : 'bé ' + name}`;
  const age = ageText(m.birth);
  let sync = '';
  if (S.offline) sync = '<span class="sync is-warn"><i></i>ngoại tuyến</span>';
  else if (S.saving > 0) sync = '<span class="sync is-busy"><i></i>đang lưu</span>';
  else if (S.loaded && !S.synced) sync = '<span class="sync is-busy"><i></i>đang đồng bộ</span>';
  const banner = S.denied ? 'Tài khoản này chưa có trong danh sách được phép. Kiểm tra email trong Rules của Firestore.' : '';

  let read;
  if (f) {
    const cur = f.segs[f.segs.length - 1].s;
    read = `<p class="ro-big is-feeding"><span class="digits" data-clock="${f.start}" data-fmt="hero"></span></p>
      <p class="ro-line">đang bú bên ${SIDE[cur]}, từ ${hm(f.start)}</p>
      <p class="ro-line">${sideOrder(f.segs).map(x => `${SIDE[x]} <span data-sidedur="${x}"></span>`).join(', ')}</p>`;
  } else {
    const lf = latest(evs, e => e.t === 'breast' || e.t === 'bottle');
    if (lf) read = `<p class="ro-big"><span data-since="${lf.at}" data-floor="&lt;1p"></span></p>
      <p class="ro-line">kể từ cữ bú lúc ${hm(lf.at)}</p><p class="ro-line">${esc(feedDetail(lf))}</p>`;
    else if (loading) read = '<p class="ro-big quiet">Đang tải…</p>';
    else read = '<p class="ro-big quiet">Chưa có cữ bú nào</p><p class="ro-line">Chạm T hoặc P khi bé bắt đầu bú.</p>';
  }
  const ld = latest(evs, e => e.t === 'diaper');
  const diaperLi = ld
    ? `<li><i class="dot dot-${diaperKey(ld.d)}"></i><span>${esc(DIAPER[ld.d] || 'Tã')} <span data-since="${ld.at}" data-floor="vừa xong"></span><span class="ago"> trước</span></span></li>`
    : `<li><i class="dot dot-wet"></i><span>${loading ? '…' : 'Chưa ghi lần thay tã nào'}</span></li>`;
  let sleepLi;
  if (s) sleepLi = `<li><i class="dot dot-sleep"></i><span>Đang ngủ <span class="digits sm" data-clock="${s.start}"></span></span></li>`;
  else {
    const ls = latest(evs, e => e.t === 'sleep' && num(e.end) !== null, 'end');
    sleepLi = ls ? `<li><i class="dot dot-sleep"></i><span>Thức <span data-since="${ls.end}" data-floor="&lt;1p"></span></span></li>`
      : `<li><i class="dot dot-sleep"></i><span>${loading ? '…' : 'Chưa ghi giấc ngủ nào'}</span></li>`;
  }
  setHTML($('#status'), `<div class="who"><p class="who-name"><b>${esc(name)}</b>${age ? `, ${esc(age)}` : ''}</p>${sync}</div>
    ${banner ? `<p class="banner">${esc(banner)}</p>` : ''}
    <div class="readout">${read}</div>
    ${ringSVG(evs, f, s, now)}
    <ul class="vitals">${diaperLi}${SHOW_SLEEP ? sleepLi : ''}</ul>`);
}

function renderControls() {
  const f = act('feed'), s = act('sleep');
  const cur = f ? f.segs[f.segs.length - 1].s : null;
  const lastSide = f ? null : lastBreastSide();
  const glyph = k => `<span class="bf-glyph">${k === 'L' ? 'T' : 'P'}</span>`;
  const bf = k => {
    if (f && cur === k) return `<button type="button" class="bf bf-${k} is-lit" data-act="side" data-side="${k}" aria-label="Dừng bú, đang bú bên ${SIDE[k]}">
      <span class="bf-state">Đang bú bên ${SIDE[k]}</span><span class="bf-clock digits" data-sideclock="${k}"></span><span class="bf-hint">${I.stop}chạm để dừng</span></button>`;
    if (f) {
      const used = sideTotals(f.segs)[k] > 0;
      return `<button type="button" class="bf bf-${k}" data-act="side" data-side="${k}" aria-label="Đổi sang bú bên ${SIDE[k]}">
        ${glyph(k)}<span class="bf-hint">${I.swap}đổi sang ${SIDE[k]}</span>${used ? `<span class="bf-note">đã bú <span data-sidedur="${k}"></span></span>` : ''}</button>`;
    }
    return `<button type="button" class="bf bf-${k}" data-act="side" data-side="${k}" aria-label="Bắt đầu bú bên ${SIDE[k]}">
      ${glyph(k)}<span class="bf-name">bú ${SIDE[k]}</span>${lastSide === k ? '<span class="bf-last">lần trước</span>' : ''}</button>`;
  };
  const lb = lastBottle();
  const bottleSub = lb ? `lần trước ${lb.ml}ml` : 'chọn lượng sữa';
  const sleepBtn = s
    ? `<button type="button" class="sl is-lit" data-act="sleep" aria-label="Bé dậy, dừng giờ ngủ">${I.sun}<span class="btn-text"><span>Bé dậy</span><span class="btn-sub digits sm" data-clock="${s.start}"></span></span></button>`
    : `<button type="button" class="sl" data-act="sleep" aria-label="Bắt đầu giờ ngủ">${I.moon}<span class="btn-text"><span>Ngủ</span><span class="btn-sub">chạm khi bé ngủ</span></span></button>`;
  const el = $('#controls');
  setHTML(el, `<div class="pair">${bf('L')}${bf('R')}</div>
    <div class="strip">
      <button type="button" class="dp dp-wet" data-act="diaper" data-d="wet" aria-label="Ghi tã ướt">${I.drop}<span>Ướt</span></button>
      <button type="button" class="dp dp-dirty" data-act="diaper" data-d="dirty" aria-label="Ghi tã bẩn">${I.mound}<span>Bẩn</span></button>
      <button type="button" class="dp dp-both" data-act="diaper" data-d="both" aria-label="Ghi tã vừa ướt vừa bẩn"><span class="ico-pair"><span class="ic-wet">${I.drop}</span><span class="ic-dirty">${I.mound}</span></span><span>Cả hai</span></button>
    </div>
    <div class="duo${SHOW_SLEEP ? '' : ' one'}">${SHOW_SLEEP ? sleepBtn : ''}
      <button type="button" class="bt" data-act="bottle" aria-label="Ghi bú bình, ${esc(bottleSub)}">${I.bottle}<span class="btn-text"><span>Bú bình</span><span class="btn-sub">${esc(bottleSub)}</span></span></button>
    </div>`);
  el.classList.toggle('is-off', !S.user || S.denied);
}

function statsFor(evs, from, to, live) {
  const st = { feeds: 0, breastMs: 0, ml: 0, wet: 0, dirty: 0, sleepMs: 0 };
  const seen = new Set();
  for (const e of evs) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const inWin = e.at >= from && e.at < to;
    if (e.t === 'breast' && inWin) { st.feeds++; st.breastMs += breastTotal(e); }
    else if (e.t === 'bottle' && inWin) { st.feeds++; st.ml += num(e.ml) || 0; }
    else if (e.t === 'diaper' && inWin) { if (e.d === 'wet' || e.d === 'both') st.wet++; if (e.d === 'dirty' || e.d === 'both') st.dirty++; }
    else if (SHOW_SLEEP && e.t === 'sleep' && num(e.end) !== null) { const a = Math.max(e.at, from), b = Math.min(e.end, to); if (b > a) st.sleepMs += b - a; }
  }
  if (live) {
    const f = act('feed'), s = act('sleep'), now = Date.now();
    if (f && f.start >= from) { st.feeds++; const t = sideTotals(f.segs, now); st.breastMs += t.L + t.R; }
    if (s) { const a = Math.max(s.start, from); if (now > a) st.sleepMs += now - a; }
  }
  return st;
}
function statsLine(st, scope) {
  const sub = [st.breastMs ? `mẹ <b>${dur(st.breastMs)}</b>` : '', st.ml ? `bình <b>${st.ml}ml</b>` : ''].filter(Boolean).join(', ');
  return `${scope}: <b>${st.feeds}</b> cữ bú${sub ? ` (${sub})` : ''}, <b>${st.wet}</b> tã ướt, <b>${st.dirty}</b> tã bẩn${SHOW_SLEEP ? `, ngủ <b>${st.sleepMs ? dur(st.sleepMs) : '0p'}</b>` : ''}.`;
}
function fetchDay(k) {
  if (!fb || !S.user || S.loadingDay[k]) return;
  S.loadingDay[k] = true;
  getDoc(doc(fb.db, 'days', k))
    .then(snap => { S.extra[k] = snap.exists() ? (snap.data() || { date: k, events: {} }) : { date: k, events: {} }; })
    .catch(() => {})
    .finally(() => { delete S.loadingDay[k]; render(); });
}
function feedGap(e, starts) {
  let prev = null;
  for (const t of starts) { if (t < e.at) prev = t; else break; }
  if (prev === null) return 0;
  const g = e.at - prev;
  return g > 0 && g < 12 * HOUR ? g : 0;
}
function whoBadge(uid, showWho) {
  if (!showWho || !uid) return '';
  const m = S.members[uid];
  const email = m && typeof m.email === 'string' ? m.email : '';
  const order = Object.keys(S.members).sort();
  const letter = (email[0] || '?').toUpperCase();
  return `<span class="who-badge${order.indexOf(uid) === 0 ? ' p1' : ''}" title="${esc(email)}" aria-label="Ghi bởi ${esc(email || 'người khác')}">${esc(letter)}</span>`;
}
function rowHTML(e, starts, showWho) {
  let k, detail = '', meta = '';
  if (e.t === 'breast') { k = 'feed'; detail = segText(e.segs); meta = dur(breastTotal(e)); }
  else if (e.t === 'bottle') { k = 'feed'; detail = `${num(e.ml) ?? '?'}ml ${KIND[e.k] || 'sữa'}`; }
  else if (e.t === 'diaper') { k = diaperKey(e.d); }
  else { k = 'sleep'; const end = num(e.end); if (end) { detail = `từ ${hm(e.at)} đến ${hm(end)}`; meta = dur(end - e.at); } }
  if (e.t === 'breast' || e.t === 'bottle') { const g = feedGap(e, starts); if (g) detail += (detail ? ', ' : '') + 'cách cữ trước ' + dur(g); }
  return `<li><button type="button" class="row k-${k}" data-act="edit" data-id="${esc(e.id)}" data-key="${dayKey(e.at)}" aria-label="Sửa ${esc(evTitle(e).toLowerCase())} lúc ${hm(e.at)}">
    <span class="row-time">${hm(e.at)}</span><span class="row-dot"></span>
    <span class="row-main"><span class="row-title">${esc(evTitle(e))}</span>${detail ? `<span class="row-detail">${esc(detail)}</span>` : ''}</span>
    <span class="row-side">${meta ? `<span class="row-meta">${esc(meta)}</span>` : ''}${whoBadge(e.by, showWho)}</span></button></li>`;
}
function renderLogView() {
  const k = S.selDay, isToday = k === todayKey(), now = Date.now();
  if (!isToday && !(k in S.days) && !(k in S.extra)) fetchDay(k);
  const st = isToday ? statsFor(recentEvents(), now - DAY, now, true)
    : statsFor([...eventsOf(k), ...eventsOf(shiftKey(k, -1))], keyDate(k).getTime(), keyDate(shiftKey(k, 1)).getTime(), false);
  setHTML($('#lvstats'), statsLine(st, isToday ? '24 giờ qua' : `Cả ngày ${dayLabel(k)}`));

  const evs = eventsOf(k).filter(e => SHOW_SLEEP || e.t !== 'sleep').sort((a, b) => b.at - a.at);
  const starts = [...new Set([...recentEvents(), ...evs, ...eventsOf(shiftKey(k, -1))]
    .filter(e => e.t === 'breast' || e.t === 'bottle').map(e => e.at))].sort((a, b) => a - b);
  const showWho = new Set(evs.map(e => e.by).filter(Boolean)).size > 1;

  let rows = '';
  if (isToday) {
    const f = act('feed'), s = act('sleep');
    if (f) rows += `<li class="row row-live k-feed"><span class="row-time">${hm(f.start)}</span><span class="row-dot"></span><span class="row-main"><span class="row-title">Đang bú bên ${SIDE[f.segs[f.segs.length - 1].s]}</span></span><span class="row-side"><span class="row-meta digits sm" data-clock="${f.start}"></span></span></li>`;
    if (s) rows += `<li class="row row-live k-sleep"><span class="row-time">${hm(s.start)}</span><span class="row-dot"></span><span class="row-main"><span class="row-title">Đang ngủ</span></span><span class="row-side"><span class="row-meta digits sm" data-clock="${s.start}"></span></span></li>`;
  }
  rows += evs.map(e => rowHTML(e, starts, showWho)).join('');
  if (!rows) {
    if (isLoading() || S.loadingDay[k]) rows = '<li class="empty"><p>Đang tải dữ liệu…</p></li>';
    else if (isToday && !recentEvents().length) rows = `<li class="empty"><p class="empty-title">Chưa có ghi chép nào</p>
      <p>Mỗi lần chạm ở màn chính tạo một dòng ở đây. Chạm vào dòng để sửa giờ hoặc xóa.</p></li>`;
    else rows = `<li class="empty"><p>Không có ghi chép nào ${isToday ? 'hôm nay' : 'trong ngày này'}.</p></li>`;
  }
  setHTML($('#list'), rows);
  setHTML($('#lvbar'), `<button type="button" class="sq-btn" data-act="day" data-d="-1" aria-label="Ngày trước">${I.chevL}</button>
    <span class="lv-day">${dayLabel(k)}</span>
    <button type="button" class="sq-btn" data-act="day" data-d="1" aria-label="Ngày sau"${isToday ? ' disabled' : ''}>${I.chevR}</button>
    <button type="button" class="txt-btn" data-act="add">${I.plus}Ghi bù</button>
    <button type="button" class="txt-btn" data-act="closelog">Đóng</button>`);
}
function openLog() { S.logOpen = true; S.selDay = todayKey(); $('#logview').hidden = false; renderLogView(); tick(); $('#list').scrollTop = 0; }
function closeLog() { S.logOpen = false; $('#logview').hidden = true; }

function paint(el, v) {
  if (el.dataset.v === v) return;
  el.dataset.v = v;
  if (el.classList.contains('digits')) el.innerHTML = [...v].map(ch => /\d/.test(ch) ? `<span class="d">${ch}</span>` : ch === ':' ? '<span class="c">:</span>' : esc(ch)).join('');
  else el.textContent = v;
}
function tick() {
  const now = Date.now(), f = act('feed');
  $$('[data-clock]').forEach(el => {
    const ms = now - Number(el.dataset.clock);
    paint(el, el.dataset.fmt === 'hero' && ms >= HOUR ? fmtMin(Math.floor(ms / MIN)) : clock(ms));
  });
  $$('[data-since]').forEach(el => {
    const v = since(now - Number(el.dataset.since), el.dataset.floor || 'vừa xong');
    paint(el, v);
    const ago = el.nextElementSibling;
    if (ago && ago.classList.contains('ago')) ago.hidden = v === 'vừa xong';
  });
  if (f) {
    const t = sideTotals(f.segs, now);
    $$('[data-sideclock]').forEach(el => { const ms = t[el.dataset.sideclock] || 0; paint(el, ms >= HOUR ? fmtMin(Math.floor(ms / MIN)) : clock(ms)); });
    $$('[data-sidedur]').forEach(el => paint(el, dur(t[el.dataset.sidedur] || 0)));
  }
}

/* ---------- toast ---------- */
function toast(msg, o = {}) {
  const el = $('#toast');
  clearTimeout(S.toastTimer);
  el.innerHTML = `<span class="toast-msg">${esc(msg)}</span>`
    + (o.edit ? '<button type="button" data-act="t-edit">Sửa</button>' : '')
    + (o.undo ? '<button type="button" data-act="t-undo">Hoàn tác</button>' : '');
  S.toastData = o;
  el.hidden = false;
  el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in');
  S.toastTimer = setTimeout(hideToast, o.undo ? 5000 : 3000);
}
function hideToast() { clearTimeout(S.toastTimer); $('#toast').hidden = true; S.toastData = null; }

/* ---------- sheets ---------- */
function openSheet(html) {
  const sh = $('#sheet');
  sh.innerHTML = html;
  sh.hidden = false;
  $('#scrim').hidden = false;
  sh.classList.remove('is-open'); void sh.offsetWidth; sh.classList.add('is-open');
  sh.scrollTop = 0;
  try { sh.focus({ preventScroll: true }); } catch (e) {}
}
function closeSheet() { S.sheet = null; const sh = $('#sheet'); sh.hidden = true; sh.innerHTML = ''; $('#scrim').hidden = true; }
const pressGroup = btn => $$('button', btn.parentElement).forEach(x => x.setAttribute('aria-pressed', String(x === btn)));
function stepper(id, label, value, unit, step) {
  return `<div class="field"><label for="${id}">${label}</label><div class="stepper">
    <button type="button" data-act="step" data-for="${id}" data-d="-${step}" aria-label="Giảm ${step} ${unit}">−</button>
    <input id="${id}" type="number" inputmode="numeric" min="0" value="${esc(value)}">
    <button type="button" data-act="step" data-for="${id}" data-d="${step}" aria-label="Tăng ${step} ${unit}">+</button>
    <span class="unit">${unit}</span></div></div>`;
}
function gaugeSVG(ml) {
  const v = Math.max(0, Math.min(150, int(ml))), y = x => 114 - 90 * x / 150;
  const ticks = [50, 100, 150].map(x => `<line x1="40" x2="45" y1="${y(x)}" y2="${y(x)}" class="g-tick"/><text x="48" y="${y(x)}" class="g-lab" dominant-baseline="central">${x}</text>`).join('');
  return `<svg class="gauge" viewBox="0 0 70 124" aria-hidden="true"><defs><clipPath id="gclip"><path d="M14 22h22v92a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z"/></clipPath></defs>
    <path d="M19 6h12v8l5 6v94a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V20l5-6z" class="g-body"/>
    <rect x="12" y="${y(v).toFixed(1)}" width="26" height="${(118 - y(v)).toFixed(1)}" clip-path="url(#gclip)" class="g-milk"/>${ticks}</svg>`;
}
function defaultAt() { return S.logOpen && S.selDay !== todayKey() ? keyDate(S.selDay).getTime() + 12 * HOUR : Date.now(); }

function openEdit(ev, fixedType) {
  const isNew = !ev;
  const lb = lastBottle();
  const t = ev ? sideTotals(ev.segs, num(ev.end) ?? ev.at) : { L: 0, R: 0 };
  S.sheet = {
    type: 'edit', isNew, fixed: !!fixedType, orig: ev || null, armed: false, at: ev ? ev.at : defaultAt(),
    draft: {
      t: ev ? ev.t : (fixedType || 'breast'),
      time: hm(ev ? ev.at : defaultAt()),
      L: ev && ev.t === 'breast' ? Math.round(t.L / MIN) : 0,
      R: ev && ev.t === 'breast' ? Math.round(t.R / MIN) : 0,
      mins: ev && ev.t === 'sleep' && num(ev.end) ? Math.round((ev.end - ev.at) / MIN) : 0,
      ml: ev && ev.t === 'bottle' ? (num(ev.ml) || 0) : ((lb && num(lb.ml)) || 60),
      k: ev && ev.t === 'bottle' ? (ev.k === 'f' ? 'f' : 'bm') : (lb && lb.k === 'f' ? 'f' : 'bm'),
      d: ev && ev.t === 'diaper' ? diaperKey(ev.d) : 'wet',
    },
  };
  openSheet(editHTML());
}
function editHTML() {
  const sh = S.sheet, d = sh.draft, t = d.t;
  const title = !sh.isNew ? `${evTitle(sh.orig)} lúc ${hm(sh.orig.at)}` : sh.fixed ? 'Bú bình' : 'Ghi bù';
  const typeSeg = sh.isNew && !sh.fixed ? `<div class="seg" role="group" aria-label="Loại ghi chép">${TYPES.filter(x => SHOW_SLEEP || x !== 'sleep').map(x =>
    `<button type="button" data-act="etype" data-t="${x}" aria-pressed="${x === t}">${x === 'diaper' ? 'Tã' : evTitle({ t: x })}</button>`).join('')}</div>` : '';
  let fields = '';
  if (t === 'breast') fields = stepper('f-L', 'Bên trái', d.L, 'phút', 5) + stepper('f-R', 'Bên phải', d.R, 'phút', 5);
  else if (t === 'sleep') fields = stepper('f-mins', 'Ngủ trong bao lâu', d.mins, 'phút', 5);
  else if (t === 'bottle') fields = `<div class="field"><span class="field-label">Loại sữa</span><div class="seg" role="group" aria-label="Loại sữa">
      <button type="button" data-act="ek" data-k="bm" aria-pressed="${d.k === 'bm'}">Sữa mẹ</button>
      <button type="button" data-act="ek" data-k="f" aria-pressed="${d.k === 'f'}">Sữa công thức</button></div></div>
    <div class="field"><label for="f-mlv">Lượng sữa</label><div class="ml-wrap"><div id="gauge">${gaugeSVG(d.ml)}</div>
      <div class="ml-side"><div class="stepper">
        <button type="button" data-act="step" data-for="f-mlv" data-d="-10" aria-label="Giảm 10 ml">−</button>
        <input id="f-mlv" type="number" inputmode="numeric" min="1" max="500" value="${esc(d.ml)}">
        <button type="button" data-act="step" data-for="f-mlv" data-d="10" aria-label="Tăng 10 ml">+</button></div>
        <div class="presets">${PRESETS.map(v => `<button type="button" class="preset" data-act="preset" data-ml="${v}">${v}ml</button>`).join('')}</div></div></div></div>`;
  else fields = `<div class="field"><span class="field-label">Loại tã</span><div class="seg" role="group" aria-label="Loại tã">${Object.keys(DIAPER).map(x =>
      `<button type="button" data-act="ed" data-d="${x}" aria-pressed="${d.d === x}">${DIAPER_SHORT[x]}</button>`).join('')}</div></div>`;
  return `<h2 class="sheet-title">${esc(title)}</h2>${typeSeg}
    <form class="form" data-form="edit" novalidate>
      <div class="field"><label for="f-time">${t === 'breast' || t === 'sleep' ? 'Giờ bắt đầu' : 'Giờ'}</label>
        <div class="field-row"><input id="f-time" type="time" value="${esc(d.time)}" required><span class="unit">${esc(dayLabel(dayKey(sh.at)).toLowerCase())}</span></div></div>
      ${fields}
      <p class="form-err" id="f-err" hidden></p>
      <div class="actions">${sh.isNew ? '' : '<button type="button" class="btn btn-danger" data-act="del">Xóa</button>'}
        <button type="button" class="btn btn-quiet" data-act="cancel">Hủy</button><button type="submit" class="btn btn-save">${sh.isNew && t === 'bottle' ? 'Ghi bình' : 'Lưu'}</button></div>
    </form>`;
}
function readDraft() {
  const d = S.sheet && S.sheet.draft;
  if (!d) return;
  const map = { 'f-time': 'time', 'f-L': 'L', 'f-R': 'R', 'f-mins': 'mins', 'f-mlv': 'ml' };
  for (const id in map) { const el = document.getElementById(id); if (el) d[map[id]] = el.value; }
}
function submitEdit() {
  const sh = S.sheet;
  if (!sh || sh.type !== 'edit' || !canAct()) return;
  readDraft();
  const d = sh.draft, now = Date.now();
  const errEl = $('#f-err');
  const err = m => { errEl.textContent = m; errEl.hidden = false; };
  if (!/^\d{2}:\d{2}$/.test(d.time || '')) return err('Chọn giờ.');
  let at;
  if (!sh.isNew && d.time === hm(sh.orig.at)) at = sh.orig.at;
  else {
    const base = new Date(sh.at);
    const [hh, mm] = d.time.split(':').map(Number);
    base.setHours(hh, mm, 0, 0);
    at = base.getTime();
    if (at > now + 5 * MIN) at -= DAY;
  }
  const o = { id: sh.isNew ? null : sh.orig.id, t: d.t, at, by: sh.isNew ? (S.uid || null) : (sh.orig.by || null) };
  if (d.t === 'breast') {
    const want = { L: int(d.L), R: int(d.R) };
    if (want.L < 0 || want.R < 0 || want.L + want.R <= 0) return err('Nhập số phút cho ít nhất một bên.');
    if (want.L > 180 || want.R > 180) return err('Mỗi bên tối đa 180 phút.');
    const ot = sh.isNew || sh.orig.t !== 'breast' ? { L: 0, R: 0 } : sideTotals(sh.orig.segs, num(sh.orig.end) ?? sh.orig.at);
    const order = sh.isNew ? [] : sideOrder(sh.orig.segs);
    ['L', 'R'].forEach(x => { if (!order.includes(x)) order.push(x); });
    let cur = at; const segs = [];
    for (const x of order) {
      const ms = Math.round(ot[x] / MIN) === want[x] ? ot[x] : want[x] * MIN;
      if (ms > 0) { segs.push({ s: x, a: cur, b: cur + ms }); cur += ms; }
    }
    o.segs = segs; o.end = cur; o.id = o.id || 'b' + at.toString(36);
  } else if (d.t === 'sleep') {
    const m = int(d.mins);
    if (m <= 0) return err('Nhập thời gian ngủ.');
    if (m > 1440) return err('Tối đa 24 giờ.');
    const oms = !sh.isNew && num(sh.orig.end) ? sh.orig.end - sh.orig.at : 0;
    o.end = at + (Math.round(oms / MIN) === m ? oms : m * MIN);
    o.id = o.id || 's' + at.toString(36);
  } else if (d.t === 'bottle') {
    const ml = int(d.ml);
    if (ml < 1 || ml > 500) return err('Lượng sữa từ 1 đến 500ml.');
    o.ml = ml; o.k = d.k === 'f' ? 'f' : 'bm'; o.id = o.id || newId('m');
  } else {
    o.d = diaperKey(d.d); o.id = o.id || newId('d');
  }
  if (num(o.end) !== null && o.end > now + MIN) return err(`Giờ kết thúc (${hm(o.end)}) đang ở tương lai. Lùi giờ bắt đầu hoặc giảm số phút.`);
  const ev = mkEv(o);
  const orig = sh.orig;
  saveEv(ev, orig ? dayKey(orig.at) : null);
  closeSheet();
  buzz();
  if (orig) toast('Đã lưu thay đổi', { undo: () => saveEv(orig, dayKey(ev.at)) });
  else toast(ev.t === 'bottle' ? `Đã ghi bình ${ev.ml}ml lúc ${hm(ev.at)}` : `Đã ghi ${evTitle(ev).toLowerCase()} lúc ${hm(ev.at)}`, { undo: () => removeEv(ev), edit: ev });
}
function deleteFromSheet(btn) {
  const sh = S.sheet;
  if (!sh || !sh.orig || !canAct()) return;
  if (!sh.armed) {
    sh.armed = true;
    btn.classList.add('is-armed');
    btn.textContent = 'Chạm lần nữa để xóa';
    setTimeout(() => { if (S.sheet === sh && sh.armed) { sh.armed = false; btn.classList.remove('is-armed'); btn.textContent = 'Xóa'; } }, 4000);
    return;
  }
  const ev = sh.orig;
  removeEv(ev);
  closeSheet();
  toast(`Đã xóa ${evTitle(ev).toLowerCase()} lúc ${hm(ev.at)}`, { undo: () => saveEv(ev) });
}
function setMl(v) {
  const inp = document.getElementById('f-mlv');
  if (!inp) return;
  inp.value = Math.max(0, Math.min(500, int(v)));
  const g = document.getElementById('gauge');
  if (g) g.innerHTML = gaugeSVG(inp.value);
}

function openSettings() {
  const m = S.meta || {};
  S.sheet = { type: 'meta' };
  openSheet(`<h2 class="sheet-title">Thông tin bé</h2>
    <form class="form" data-form="meta">
      <div class="field"><label for="f-name">Tên bé</label><input id="f-name" type="text" maxlength="40" autocomplete="off" value="${esc(m.name || '')}" placeholder="Tên ở nhà của bé"></div>
      <div class="field"><label for="f-birth">Ngày sinh</label><input id="f-birth" type="date" max="${todayKey()}" value="${esc(m.birth || '')}"></div>
      <div class="actions"><button type="button" class="btn btn-quiet" data-act="cancel">Đóng</button><button type="submit" class="btn btn-save">Lưu</button></div>
    </form>
    <details class="import" id="export-box">
      <summary>Xuất dữ liệu</summary>
      <div class="form">
        <p class="hint">Lấy toàn bộ ghi chép dưới dạng văn bản để gửi đi phân tích. Không kèm email hay tài khoản.</p>
        <div class="actions"><button type="button" class="btn btn-save" data-act="export-load" id="export-load">Lấy dữ liệu</button></div>
        <textarea id="f-export" rows="4" readonly hidden></textarea>
        <p class="hint" id="export-info" hidden></p>
        <div class="actions" id="export-copy-row" hidden><button type="button" class="btn btn-save" data-act="export-copy">Sao chép</button></div>
      </div>
    </details>
    <details class="import">
      <summary>Nhập dữ liệu từ bản cũ</summary>
      <form class="form" data-form="import">
        <div class="field"><label for="f-import">Dán đoạn dữ liệu vào đây</label><textarea id="f-import" rows="4" spellcheck="false" autocomplete="off"></textarea></div>
        <p class="form-err" id="imp-err" hidden></p>
        <div class="actions"><button type="submit" class="btn btn-save">Nhập</button></div>
      </form>
    </details>
    <div class="help">
      <div class="account"><span>Đang đăng nhập: ${esc(S.email || '')}<br>Phiên bản ${APP_VERSION}</span><button type="button" class="btn btn-danger" data-act="signout">Đăng xuất</button></div>
      <h3>Mở bằng một chạm</h3>
      <p>Trên iPhone: mở trang trong Safari, bấm nút Chia sẻ rồi chọn Thêm vào MH chính. Trên Android: mở trong Chrome, bấm menu rồi chọn Cài đặt ứng dụng. Từ lần sau, mở bằng icon trên màn hình chính sẽ không cần tải lại từ mạng.</p>
      <h3>Đọc vòng 24 giờ</h3>
      <p>Vòng ngoài là các cữ bú${SHOW_SLEEP ? ', vòng giữa là giấc ngủ' : ''}, chấm bên trong là lần thay tã. Kim chỉ giờ hiện tại; mục càng cũ càng mờ.</p>
      <h3>Khi mất mạng</h3>
      <p>Vẫn ghi bình thường. Dữ liệu lưu trên máy và tự gửi lên khi có mạng lại.</p>
    </div>`);
}
function submitMeta() {
  if (!canAct()) return;
  const name = ($('#f-name').value || '').trim().slice(0, 40);
  const birth = $('#f-birth').value || '';
  if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return;
  S.meta = { name, birth };
  closeSheet();
  render();
  track(setDoc(doc(fb.db, 'meta', 'baby'), { name, birth })).then(() => toast('Đã lưu thông tin bé'));
}

/* ---------- export: every stored day, compact, no account details ---------- */
function exportLoad(btn) {
  if (!fb || !S.user) { toast('Đang kết nối, thử lại sau giây lát.'); return; }
  btn.disabled = true; btn.textContent = 'Đang lấy…';
  let unsub = null, done = false;
  const finish = (text, info) => {
    if (done) return; done = true;
    try { unsub && unsub(); } catch (e) {}
    btn.disabled = false; btn.textContent = 'Lấy lại';
    const ta = $('#f-export'), inf = $('#export-info');
    if (!ta) return;
    if (text) { ta.value = text; ta.hidden = false; $('#export-copy-row').hidden = false; }
    inf.textContent = info; inf.hidden = false;
  };
  const timer = setTimeout(() => finish('', 'Chưa lấy được dữ liệu. Kiểm tra mạng rồi thử lại.'), 15000);
  unsub = onSnapshot(collection(fb.db, 'days'), snap => {
    if (snap.metadata.fromCache && navigator.onLine) return;   // wait for the server copy
    clearTimeout(timer);
    const events = [];
    snap.docs.forEach(d => {
      const ev = (d.data() && d.data().events) || {};
      for (const e of Object.values(ev)) {
        if (!validEv(e)) continue;
        const o = { t: e.t, at: e.at };
        if (num(e.end) !== null) o.end = e.end;
        if (e.t === 'bottle') { o.ml = e.ml; o.k = e.k; }
        if (e.t === 'diaper') o.d = e.d;
        if (e.t === 'breast' && Array.isArray(e.segs)) o.segs = e.segs.map(x => ({ s: x.s, a: x.a, b: x.b }));
        events.push(o);
      }
    });
    events.sort((x, y) => x.at - y.at);
    const m = S.meta || {};
    const out = { v: 1, exported: Date.now(), tz: 'Asia/Ho_Chi_Minh', birth: m.birth || null, events };
    const bottles = events.filter(e => e.t === 'bottle').length;
    finish(JSON.stringify(out), `${events.length} ghi chép, trong đó ${bottles} lần bú bình. Bấm Sao chép rồi dán vào nơi cần gửi.`);
  }, () => { clearTimeout(timer); finish('', 'Tài khoản này chưa đọc được dữ liệu.'); });
}
function exportCopy() {
  const ta = $('#f-export');
  if (!ta || !ta.value) return;
  const ok = () => toast('Đã sao chép dữ liệu');
  const fallback = () => { ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length); toast('Đã chọn sẵn, giữ vào ô chữ rồi chọn Sao chép'); };
  try { navigator.clipboard.writeText(ta.value).then(ok, fallback); } catch (e) { fallback(); }
}

function submitImport() {
  if (!canAct()) return;
  const errEl = $('#imp-err');
  const err = m => { errEl.textContent = m; errEl.hidden = false; };
  let data;
  try { data = JSON.parse(($('#f-import').value || '').trim()); }
  catch (e) { return err('Đoạn dữ liệu không đúng định dạng. Copy lại toàn bộ đoạn được gửi.'); }
  let n = 0;
  for (const raw of (Array.isArray(data && data.events) ? data.events : [])) {
    const ev = mkEv({ ...raw, by: S.uid || null });
    if (!validEv(ev) || (ev.t === 'sleep' && !SHOW_SLEEP) || (num(ev.end) !== null && ev.end < ev.at)) continue;
    saveEv(ev);
    n++;
  }
  const extra = [];
  const a = (data && data.active) || {};
  const sl = SHOW_SLEEP ? validSleep(a.sleep) : null;
  if (sl && !act('sleep')) { putActive('sleep', { start: sl.start, by: S.uid || null }); extra.push('giấc ngủ đang chạy'); }
  const fd = validFeed(a.feed);
  if (fd && !act('feed')) { putActive('feed', { start: fd.start, segs: fd.segs.map(x => ({ s: x.s, a: x.a, b: num(x.b) })), by: S.uid || null }); extra.push('cữ bú đang chạy'); }
  const m = data && data.meta, cur = S.meta || {};
  if (m && typeof m.name === 'string' && !(typeof cur.name === 'string' && cur.name.trim())) {
    const val = { name: m.name.trim().slice(0, 40), birth: /^\d{4}-\d{2}-\d{2}$/.test(m.birth || '') ? m.birth : (cur.birth || '') };
    S.meta = val;
    track(setDoc(doc(fb.db, 'meta', 'baby'), val));
    extra.push('thông tin bé');
  }
  if (!n && !extra.length) return err('Không có gì mới để nhập.');
  closeSheet();
  render();
  toast(`Đã nhập ${n} mục${extra.length ? ', ' + extra.join(', ') : ''}.`);
}

/* ---------- events ---------- */
function findEv(key, id) { return eventsOf(key).find(e => e.id === id) || null; }
function freshest(ev) { return findEv(dayKey(ev.at), ev.id) || ev; }

document.addEventListener('click', e => {
  if (e.target.closest('#toast') && !e.target.closest('button')) { hideToast(); return; }
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === 'side') tapSide(b.dataset.side);
  else if (a === 'diaper') logDiaper(b.dataset.d);
  else if (a === 'sleep') tapSleep();
  else if (a === 'bottle') tapBottle();
  else if (a === 'log') openLog();
  else if (a === 'closelog') closeLog();
  else if (a === 'day') { const nk = shiftKey(S.selDay, Number(b.dataset.d)); if (nk <= todayKey()) { S.selDay = nk; renderLogView(); tick(); $('#list').scrollTop = 0; } }
  else if (a === 'add') { if (canAct()) openEdit(null); }
  else if (a === 'edit') { if (canAct()) { const ev = findEv(b.dataset.key, b.dataset.id); if (ev) openEdit(ev); } }
  else if (a === 'settings') openSettings();
  else if (a === 'signout') { closeSheet(); signOut(fb.auth); }
  else if (a === 'export-load') exportLoad(b);
  else if (a === 'export-copy') exportCopy();
  else if (a === 'cancel') closeSheet();
  else if (a === 'etype') { readDraft(); S.sheet.draft.t = b.dataset.t; openSheet(editHTML()); }
  else if (a === 'ed') { S.sheet.draft.d = b.dataset.d; pressGroup(b); }
  else if (a === 'ek') { S.sheet.draft.k = b.dataset.k; pressGroup(b); }
  else if (a === 'preset') setMl(b.dataset.ml);
  else if (a === 'step') {
    const inp = document.getElementById(b.dataset.for);
    if (!inp) return;
    if (inp.id === 'f-mlv') setMl(int(inp.value) + Number(b.dataset.d));
    else inp.value = Math.max(0, int(inp.value) + Number(b.dataset.d));
  }
  else if (a === 'del') deleteFromSheet(b);
  else if (a === 't-undo') { const o = S.toastData; hideToast(); if (o && o.undo) o.undo(); }
  else if (a === 't-edit') { const o = S.toastData; hideToast(); if (o && o.edit && canAct()) openEdit(freshest(o.edit)); }
});
document.addEventListener('input', e => { if (e.target.id === 'f-mlv') { const g = document.getElementById('gauge'); if (g) g.innerHTML = gaugeSVG(e.target.value); } });
$('#scrim').addEventListener('click', closeSheet);
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.dataset.form;
  if (f === 'edit') submitEdit();
  else if (f === 'meta') submitMeta();
  else if (f === 'import') submitImport();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#sheet').hidden) closeSheet();
  else if (S.logOpen) closeLog();
});
window.addEventListener('online', () => { S.offline = false; render(); });
window.addEventListener('offline', () => { S.offline = true; render(); });

function rollover() {
  const t = todayKey();
  if (t !== S.today) { if (S.selDay === S.today) S.selDay = t; S.today = t; render(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { rollover(); render(); } });
setInterval(tick, 1000);
setInterval(() => { rollover(); renderStatus(); if (S.logOpen) renderLogView(); tick(); }, 30000);

/* ---------- sign-in ---------- */
const SIGNIN_ERR = {
  'auth/invalid-credential': 'Email hoặc mật khẩu chưa đúng.',
  'auth/invalid-email': 'Email chưa đúng định dạng.',
  'auth/user-disabled': 'Tài khoản này đã bị khóa trong Firebase.',
  'auth/too-many-requests': 'Thử sai quá nhiều lần. Chờ vài phút rồi thử lại.',
  'auth/network-request-failed': 'Không có mạng. Lần đăng nhập đầu tiên cần có mạng.',
};
$('#signin-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#si-email').value.trim(), pass = $('#si-pass').value;
  const errEl = $('#si-err'), btn = $('#si-btn');
  if (!email || !pass) { errEl.textContent = 'Nhập email và mật khẩu.'; errEl.hidden = false; return; }
  btn.disabled = true; btn.textContent = 'Đang đăng nhập…'; errEl.hidden = true;
  try { await signInWithEmailAndPassword(fb.auth, email, pass); }
  catch (err) { errEl.textContent = SIGNIN_ERR[err && err.code] || 'Chưa đăng nhập được. Thử lại sau.'; errEl.hidden = false; }
  finally { btn.disabled = false; btn.textContent = 'Đăng nhập'; }
});

/* ---------- one-time cleanup: delete stored sleep data (requested while sleep is hidden) ---------- */
let purging = false;
function purgeSleepOnce() {
  if (SHOW_SLEEP || purging || lsGet(PURGE_SLEEP_KEY) || !S.synced || !fb) return;
  purging = true;
  const writes = [];
  for (const [key, d] of Object.entries(S.days)) {
    const ids = Object.entries((d && d.events) || {}).filter(([, e]) => e && e.t === 'sleep').map(([id]) => id);
    if (ids.length) writes.push(setDoc(doc(fb.db, 'days', key), { events: Object.fromEntries(ids.map(id => [id, deleteField()])) }, { merge: true }));
  }
  writes.push(deleteDoc(doc(fb.db, 'active', 'sleep')));
  Promise.all(writes).then(() => lsSet(PURGE_SLEEP_KEY, '1')).catch(() => {}).finally(() => { purging = false; });
}

/* ---------- data connection ---------- */
function stopListening() { unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = []; }
function onErr(err) {
  if (err && err.code === 'permission-denied') S.denied = true;
  S.loaded = true;
  render();
}
function startListening() {
  stopListening();
  const db = fb.db;
  unsubs.push(onSnapshot(query(collection(db, 'days'), orderBy('date', 'desc'), limit(3)), { includeMetadataChanges: true }, snap => {
    const m = {};
    snap.docs.forEach(d => { const v = d.data(); if (v && typeof v.date === 'string') m[v.date] = v; });
    S.days = m;
    S.pend = {};
    S.loaded = true;
    S.synced = !snap.metadata.fromCache;
    render();
    purgeSleepOnce();
  }, onErr));
  unsubs.push(onSnapshot(collection(db, 'active'), snap => {
    const a = { feed: null, sleep: null };
    snap.docs.forEach(d => {
      if (d.id === 'feed') a.feed = validFeed(d.data());
      else if (d.id === 'sleep') a.sleep = validSleep(d.data());
    });
    S.active = a;
    S.pendActive = {};
    render();
  }, onErr));
  unsubs.push(onSnapshot(doc(db, 'meta', 'baby'), d => { S.meta = d.exists() ? (d.data() || null) : null; render(); }, onErr));
  unsubs.push(onSnapshot(collection(db, 'members'), snap => {
    const m = {};
    snap.docs.forEach(d => { m[d.id] = d.data(); });
    S.members = m;
    if (S.logOpen) renderLogView();
  }, () => {}));
}
function showGate(which) {
  $('#signin').hidden = which !== 'signin';
  $('#setup').hidden = which !== 'setup';
}

function boot() {
  showGate(lsGet(LS_SIGNED) ? null : 'signin');
  render();
  if (!firebaseConfig || !firebaseConfig.apiKey) { showGate('setup'); return; }
  const app = initializeApp(firebaseConfig);
  let db;
  try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch (e) { db = initializeFirestore(app, {}); }
  fb = { auth: getAuth(app), db };
  onAuthStateChanged(fb.auth, user => {
    S.user = user; S.uid = user ? user.uid : null; S.email = user ? user.email : null; S.denied = false;
    if (user) {
      lsSet(LS_SIGNED, '1');
      showGate(null);
      startListening();
      setDoc(doc(fb.db, 'members', user.uid), { email: user.email || '' }, { merge: true }).catch(() => {});
    } else {
      lsSet(LS_SIGNED, null);
      stopListening();
      S.days = {}; S.extra = {}; S.active = { feed: null, sleep: null }; S.meta = null; S.loaded = false;
      showGate('signin');
    }
    render();
  });
}
boot();

if ('serviceWorker' in navigator) {
  // When a newer version takes over, reload once so the new files show on this open instead of the next.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading || $('#sheet').hidden === false) return;
    reloading = true;
    location.reload();
  });
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
