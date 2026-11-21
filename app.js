// Berkeley Restaurant Inspections Explorer: loads data/restaurant-inspections.csv and draws the page.
(function () {
'use strict';
const DATA_URL = 'data/restaurant-inspections.csv';

// Shared logic, also embedded into the page. Tested with node.
function streetOf(addr) {
  let s = String(addr || '').toUpperCase().replace(/,\s*BERKELEY,\s*CA\s*$/, '').replace(/\s+/g, ' ').trim();
  if (!/^\d/.test(s)) return 'Other / event';
  s = s.replace(/^[\d]+[\-\d]*[A-Z]?(-[A-Z0-9]+)?\s+/, '');   // 2519-C, 1834-40, 1400-1A
  s = s.replace(/^([A-Z])\s+(?=\S{3,})/, '');                // "B HEARST", "A 5TH"
  const fix = [
    [/^(M L KING JR|MLK JR\.?|MARTIN LUTHER KING JR)\s+(WY|WAY)\b/, 'MLK JR WAY'],
    [/^UNIVE?R?S[IT]+Y\b|^UNIVESITY\b|^UNIVERSTIY\b|^UNIVERSIIY\b/, 'UNIVERSITY'],
    [/^TELE?G?R?A?PH\b|^TELGRAPH\b|^TELEGRPH\b/, 'TELEGRAPH'],
    [/^FOURTH\b/, '4TH'], [/^FIFTH\b/, '5TH'], [/^SIXTH\b/, '6TH'], [/^SEVENTH\b/, '7TH'],
    [/^EIGHTH\b/, '8TH'], [/^NINTH\b/, '9TH'], [/^TENTH\b/, '10TH'],
  ];
  for (const [re, to] of fix) s = s.replace(re, to);
  const m = s.match(/^(.*?\b(ST|AVE|WAY|WY|BLVD|PL|DR|SQ|RD))\b/);
  let st = m ? m[1] : s;
  st = st.replace(/\bWY$/, 'WAY');
  const canon = {
    'DOMINGO ST': 'DOMINGO AVE', 'ADELINE AVE': 'ADELINE ST', 'SACRAMENTO AVE': 'SACRAMENTO ST',
    'DURANT ST': 'DURANT AVE', 'KALA BAGAI AVE': 'KALA BAGAI WAY', 'TELEGRAPH': 'TELEGRAPH AVE',
    'UNIVERSITY': 'UNIVERSITY AVE',
  };
  st = canon[st] || st;
  return st.replace(/\b(\w)([\w']*)/g, (_, a, b) => a + b.toLowerCase()).replace(/\bMlk Jr\b/, 'MLK Jr');
}

var MONTHS = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
function isoDate(t) {
  const m = String(t || '').match(/^(\d{4}) (\w{3}) (\d{2})/);
  return m ? `${m[1]}-${MONTHS[m[2]]}-${m[3]}` : null;
}

function buildFacilities(inspections) {
  const flag = (r, c) => String(r[c] ?? '').trim() === '1' ? 1 : 0;
  const cols = inspections.length ? Object.keys(inspections[0]) : [];
  const minorCols = cols.filter((c) => c.startsWith('Minor_Violation_'));
  const majorCols = cols.filter((c) => c.startsWith('Major_Violation_'));
  const label = (c) => c.replace(/^(Minor|Major)_Violation_/, '').replace(/_/g, ' ');
  const byId = new Map();
  for (const r of inspections) {
    const id = r.W3ALCD, date = isoDate(r.Inspection_Date);
    let f = byId.get(id);
    if (!f || (date && (!f.date || date > f.date))) {
      f = {id, name: r.Doing_Business_As, address: String(r.Restaurant_Address || '').replace(/\s+,/, ',').replace(/,\s*BERKELEY,\s*CA\s*$/, ''),
           date, minor: new Set(), major: new Set(), pulled: isoDate(r.InDbDate)};
      byId.set(id, f);
    }
    if (f.date !== date) continue;          // older inspection of the same facility
    minorCols.forEach((c) => flag(r, c) && f.minor.add(label(c)));
    majorCols.forEach((c) => flag(r, c) && f.major.add(label(c)));
  }
  return [...byId.values()].map((f) => {
    const nMinor = f.minor.size, nMajor = f.major.size;
    const days = f.date && f.pulled ? Math.round((Date.parse(f.pulled) - Date.parse(f.date)) / 864e5) : null;
    return {
      id: f.id, name: f.name, address: f.address, street: streetOf(f.address), date: f.date,
      result: !f.date ? 'No inspection on record' : nMajor ? 'Major violation' : nMinor ? 'Minor violation' : 'No violations',
      holding: f.minor.has('Improper Holding Temperature') || f.major.has('Improper Holding Temperature') ? 1 : 0,
      equipment: f.minor.has('Contaminated Equipment') || f.major.has('Contaminated Equipment') ? 1 : 0,
      violations: [...[...f.major].map((v) => v + ' (major)'), ...f.minor].join('; '),
      minorCount: nMinor, majorCount: nMajor, daysSince: days, pulled: f.pulled,
    };
  });
}

function buildSummary(facilities) {
  const n = facilities.length;
  const inspected = facilities.filter((f) => f.date);
  const c = (p) => facilities.filter(p).length;
  const clean = c((f) => f.result === 'No violations');
  return [{
    facilities: n,
    inspected: inspected.length,
    clean,
    pctClean: inspected.length ? Math.round(1000 * clean / inspected.length) / 10 : 0,
    anyViolation: c((f) => f.minorCount + f.majorCount > 0),
    major: c((f) => f.majorCount > 0),
    holding: c((f) => f.holding),
    equipment: c((f) => f.equipment),
    both: c((f) => f.holding && f.equipment),
    notInspected: c((f) => !f.date),
    over1yr: c((f) => f.daysSince != null && f.daysSince > 365),
    pulled: facilities[0] ? facilities[0].pulled : null,
  }];
}

function buildStreets(facilities) {
  const g = new Map();
  for (const f of facilities) {
    const s = g.get(f.street) || {street: f.street, facilities: 0, withViolation: 0, clean: 0, notInspected: 0};
    s.facilities++;
    if (!f.date) s.notInspected++; else if (f.minorCount + f.majorCount) s.withViolation++; else s.clean++;
    g.set(f.street, s);
  }
  return [...g.values()].map((s) => ({...s, pctViolation: s.facilities - s.notInspected ? Math.round(1000 * s.withViolation / (s.facilities - s.notInspected)) / 10 : 0}))
    .sort((a, b) => b.facilities - a.facilities || a.street.localeCompare(b.street));
}


function buildMonths(facilities) {
  const pulled = facilities[0] && facilities[0].pulled;
  if (!pulled) return [];
  const [y, m] = pulled.split('-').map(Number);
  const months = [];
  for (let i = 12; i >= 0; i--) months.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return months.map((month) => {
    const inMonth = facilities.filter((f) => f.date && f.date.slice(0, 7) === month);
    return { month, facilities: inMonth.length,
      clean: inMonth.filter((f) => f.result === 'No violations').length,
      withViolation: inMonth.filter((f) => f.result !== 'No violations').length };
  });
}

const D = { facilities: null, summary: null, streets: null, months: null };
const st = { q: '', result: 'all', street: '', sort: 'name', dir: 1 };
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const fmt = d3.format(',');
const fmtDate = (iso) => iso ? d3.utcFormat('%b %-d, %Y')(new Date(iso + 'T00:00:00Z')) : '';

function drawKpis() {
  const s = D.summary[0];
  $$('[data-kpi]').forEach((el) => {
    const f = el.dataset.kpi, v = s[f];
    el.textContent = f === 'pulled' ? fmtDate(v) : f === 'pctClean' ? v + '%' : fmt(v);
  });
}

function matches(f) {
  if (st.q) {
    const hay = (f.name + ' ' + f.address).toLowerCase();
    if (!st.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  if (st.street && f.street !== st.street) return false;
  switch (st.result) {
    case 'any': return f.minorCount + f.majorCount > 0;
    case 'holding': return f.holding === 1;
    case 'equipment': return f.equipment === 1;
    case 'both': return f.holding === 1 && f.equipment === 1;
    case 'clean': return f.result === 'No violations';
    case 'old': return f.daysSince != null && f.daysSince > 365;
    case 'none': return !f.date;
    default: return true;
  }
}
function filtered() {
  const order = { 'Major violation': 0, 'Minor violation': 1, 'No violations': 2, 'No inspection on record': 3 };
  const key = {
    name: (f) => f.name.toLowerCase(),
    date: (f) => f.date || '0000',
    result: (f) => order[f.result] * 10 - (f.minorCount + f.majorCount),
    violations: (f) => f.violations || '~',
  }[st.sort];
  return D.facilities.filter(matches).sort((a, b) => {
    const x = key(a), y = key(b);
    return (x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name)) * st.dir;
  });
}

function drawTable() {
  const rows = filtered(), total = D.facilities.length;
  $('#shown').textContent = rows.length === total ? `Showing all ${fmt(total)} facilities` : `Showing ${fmt(rows.length)} of ${fmt(total)} facilities`;
  const tbody = $('#rows');
  tbody.replaceChildren();
  if (!rows.length) {
    const td = tbody.insertRow().insertCell(); td.colSpan = 4; td.textContent = 'No facilities match these filters.';
    return;
  }
  for (const f of rows) {
    const tr = tbody.insertRow();
    const c1 = tr.insertCell();
    const nm = document.createElement('div'); nm.textContent = f.name;
    const ad = document.createElement('div'); ad.className = 'addr'; ad.textContent = f.address;
    c1.append(nm, ad);
    const c2 = tr.insertCell(); c2.className = 'd';
    c2.textContent = f.date ? fmtDate(f.date) : '—';
    if (f.daysSince != null && f.daysSince > 365) {
      const o = document.createElement('span'); o.className = 'ri-old';
      o.textContent = Math.floor(f.daysSince / 30.44) + ' months before pull'; c2.append(o);
    }
    const p = document.createElement('span');
    p.className = 'ri-pill ' + ({ 'No violations': 'ok', 'Minor violation': 'warn', 'Major violation': 'bad' }[f.result] || 'na');
    p.textContent = f.result; tr.insertCell().append(p);
    tr.insertCell().textContent = f.violations || '—';
  }
}

function fillStreetSelect() {
  const sel = $('#street');
  const list = [...D.streets].sort((a, b) => a.street.localeCompare(b.street));
  sel.replaceChildren(new Option('All streets', ''), ...list.map((r) => new Option(`${r.street} (${r.facilities})`, r.street)));
}

function tipBox(el) {
  const t = document.createElement('div'); t.className = 'ri-tip'; t.hidden = true; el.append(t);
  return {
    show(ev, lines) {
      t.replaceChildren(...lines.map((l, i) => { const d = document.createElement('div'); d.textContent = l; if (i === 0) d.style.fontWeight = '600'; return d; }));
      t.hidden = false;
      const r = el.getBoundingClientRect();
      let x = ev.clientX - r.left + 12, y = ev.clientY - r.top + 12;
      if (x + t.offsetWidth > r.width) x = Math.max(0, ev.clientX - r.left - t.offsetWidth - 12);
      t.style.left = x + 'px'; t.style.top = y + 'px';
    },
    hide() { t.hidden = true; },
  };
}

function drawStreetChart() {
  const el = $('#street-chart');
  el.replaceChildren();
  const data = D.streets.filter((r) => r.facilities >= 8);
  const W = el.clientWidth || 320, bh = 18, gap = 6;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('role', 'img')
    .attr('aria-label', 'Stacked bars of facilities per street, split into no violations, minor violation and no inspection on record');
  const probe = svg.append('g');
  let lw = 0; data.forEach((r) => { const t = probe.append('text').attr('class', 'lbl').text(r.street); lw = Math.max(lw, t.node().getComputedTextLength()); });
  probe.remove();
  lw = Math.ceil(lw) + 8;
  const H = data.length * (bh + gap);
  svg.attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleLinear().domain([0, d3.max(data, (r) => r.facilities) || 1]).range([0, Math.max(40, W - lw - 34)]);
  const tip = tipBox(el);
  const g = svg.selectAll('g.row').data(data).join('g').attr('class', 'row')
    .attr('transform', (r, i) => `translate(0,${i * (bh + gap)})`).style('cursor', 'pointer');
  g.append('text').attr('class', 'lbl').attr('x', lw - 8).attr('y', bh / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text((r) => r.street);
  const parts = [['clean', 'var(--ok)'], ['withViolation', 'var(--warn)'], ['notInspected', 'var(--chart-muted)']];
  g.each(function (r) {
    let x0 = lw;
    for (const [k, col] of parts) {
      const w = x(r[k]);
      if (w > 0) d3.select(this).append('rect').attr('x', x0).attr('y', 0).attr('width', Math.max(0, w - 1)).attr('height', bh).style('fill', col);
      x0 += w;
    }
    d3.select(this).append('text').attr('x', x0 + 4).attr('y', bh / 2).attr('dy', '0.35em').text(fmt(r.facilities));
  });
  g.on('pointermove', (ev, r) => tip.show(ev, [r.street, `${fmt(r.facilities)} facilities`, `${fmt(r.clean)} no violations`, `${fmt(r.withViolation)} with a minor violation (${r.pctViolation}% of inspected)`, `${fmt(r.notInspected)} no inspection on record`]))
   .on('pointerleave', () => tip.hide())
   .on('click', (ev, r) => setStreet(r.street));
}

function drawMonthChart() {
  const el = $('#month-chart');
  el.replaceChildren();
  const data = D.months;
  if (!data.length) return;
  const W = el.clientWidth || 320, H = 220, m = { t: 16, r: 6, b: 24, l: 30 };
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img').attr('aria-label', 'Bar chart of facilities by month of their most recent inspection');
  const x = d3.scaleBand().domain(data.map((d) => d.month)).range([m.l, W - m.r]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.facilities) || 1]).nice().range([H - m.b, m.t]);
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)))
    .call((a) => { a.select('.domain').remove(); a.selectAll('line').style('stroke', 'var(--grid)'); });
  const every = Math.ceil(data.length / Math.max(1, Math.floor((W - m.l) / 42)));
  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).tickValues(data.map((d) => d.month).filter((_, i) => i % every === 0)).tickFormat((mo) => d3.utcFormat('%b')(new Date(mo + '-01T00:00:00Z'))).tickSize(0).tickPadding(6))
    .call((a) => a.select('.domain').style('stroke', 'var(--axis)'));
  const tip = tipBox(el);
  const g = svg.selectAll('g.bar').data(data).join('g').attr('class', 'bar');
  g.append('rect').attr('x', (d) => x(d.month)).attr('width', x.bandwidth()).attr('y', (d) => y(d.clean)).attr('height', (d) => y(0) - y(d.clean)).style('fill', 'var(--ok)');
  g.append('rect').attr('x', (d) => x(d.month)).attr('width', x.bandwidth()).attr('y', (d) => y(d.facilities)).attr('height', (d) => y(d.clean) - y(d.facilities)).style('fill', 'var(--warn)');
  g.append('rect').attr('x', (d) => x(d.month)).attr('width', x.bandwidth()).attr('y', m.t).attr('height', H - m.b - m.t).style('fill', 'transparent')
    .on('pointermove', (ev, d) => tip.show(ev, [d3.utcFormat('%B %Y')(new Date(d.month + '-01T00:00:00Z')), `${fmt(d.facilities)} facilities`, `${fmt(d.clean)} no violations`, `${fmt(d.withViolation)} with a violation`]))
    .on('pointerleave', () => tip.hide());
  if (x.bandwidth() >= 18) g.append('text').attr('x', (d) => x(d.month) + x.bandwidth() / 2).attr('y', (d) => y(d.facilities) - 4).attr('text-anchor', 'middle').text((d) => d.facilities || '');
}

const syncCards = () => $$('.ri-kpi').forEach((b) => b.classList.toggle('on', b.dataset.filter === st.result && st.result !== 'all'));
const toList = () => $('#explorer').scrollIntoView({ behavior: 'smooth', block: 'start' });
function setStreet(street) { st.street = street; $('#street').value = street; drawTable(); toList(); }

function wire() {
  $('#q').addEventListener('input', (e) => { st.q = e.target.value.trim(); drawTable(); });
  $('#result').addEventListener('change', (e) => { st.result = e.target.value; syncCards(); drawTable(); });
  $('#street').addEventListener('change', (e) => { st.street = e.target.value; drawTable(); });
  $$('.ri-kpi').forEach((b) => b.addEventListener('click', () => {
    st.result = b.dataset.filter; $('#result').value = st.result; syncCards(); drawTable(); toList();
  }));
  $('#reset').addEventListener('click', () => {
    Object.assign(st, { q: '', result: 'all', street: '' });
    $('#q').value = ''; $('#result').value = 'all'; $('#street').value = '';
    syncCards(); drawTable();
  });
  $$('.ri-table th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.sort;
    if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = k === 'date' ? -1 : 1; }
    $$('.ri-table th[data-sort]').forEach((h) => h.setAttribute('aria-sort', h.dataset.sort === st.sort ? (st.dir === 1 ? 'ascending' : 'descending') : 'none'));
    drawTable();
  }));
  let w = window.innerWidth, t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => { if (window.innerWidth !== w) { w = window.innerWidth; drawStreetChart(); drawMonthChart(); } }, 150);
  });
}

fetch(DATA_URL)
  .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
  .then((text) => {
    const rows = d3.csvParse(text, (r) => { for (const k in r) if (r[k] === '') r[k] = null; return r; });
    D.facilities = buildFacilities(rows);
    D.summary = buildSummary(D.facilities);
    D.streets = buildStreets(D.facilities);
    D.months = buildMonths(D.facilities);
    drawKpis(); fillStreetSelect(); drawTable(); drawStreetChart(); drawMonthChart(); wire();
  })
  .catch((err) => {
    const e = $('#load-error'); e.hidden = false;
    e.textContent = 'Could not load the inspection data (' + err.message + '). If you opened this file directly from your computer, serve the folder with a web server instead; see README.md.';
    $('#shown').textContent = '';
  });
})();
