// app.js — Public Wall (Realtime, no collapsing) with p5 + Firebase Firestore
// Everyone sees all answers. Anonymous IDs. No sign-in required.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// --- CONFIG: paste your Firebase web config here ---
export const firebaseConfig = {

  apiKey: "AIzaSyD76ijeMbGsekl4SbV7VSfPhgGPINNEC0s",

  authDomain: "selfportraitbrainstorm.firebaseapp.com",

  projectId: "selfportraitbrainstorm",

  storageBucket: "selfportraitbrainstorm.firebasestorage.app",

  messagingSenderId: "399144197171",

  appId: "1:399144197171:web:c4dab6d652a34a0fc29746",

  measurementId: "G-9TBSP2SHNE"

};

// --- INIT ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Anonymous identifiers (stored locally)
const SESSION_KEY = 'qa_session_id_v2';
const ANON_KEY = 'qa_anon_id_v2';
let SESSION_ID = localStorage.getItem(SESSION_KEY);
let ANON_ID = localStorage.getItem(ANON_KEY);
if (!SESSION_ID) {
  SESSION_ID = crypto.getRandomValues(new Uint32Array(4)).join('-');
  localStorage.setItem(SESSION_KEY, SESSION_ID);
}
if (!ANON_ID) {
  const rand = Math.random().toString(36).slice(2, 8);
  ANON_ID = `anon-${rand}`;
  localStorage.setItem(ANON_KEY, ANON_ID);
}

// --- ELEMENTS ---
const anonEl = document.getElementById('anon');
const exportBtn = document.getElementById('exportBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const resetBtn = document.getElementById('resetBtn');
const questionsHost = document.getElementById('questions');
if (anonEl) anonEl.textContent = ANON_ID;

// --- p5 header animation ---
new p5(p => {
  let dots = [];
  p.setup = () => {
    const c = p.createCanvas(880, 120);
    c.parent('p5-holder');
    for (let i = 0; i < 60; i++) dots.push({
      x: p.random(p.width), y: p.random(p.height), r: p.random(2, 5),
      dx: p.random(-0.6, 0.6), dy: p.random(-0.4, 0.4)
    });
  };
  p.draw = () => {
    p.background('#0b0b10'); p.noStroke();
    for (const d of dots) {
      d.x += d.dx; d.y += d.dy;
      if (d.x < 0 || d.x > p.width) d.dx *= -1;
      if (d.y < 0 || d.y > p.height) d.dy *= -1;
      p.fill(20, 60 + d.r * 20, 120 + d.r * 25);
      p.circle(d.x, d.y, d.r * 2);
    }
    p.fill('#e9eef5'); p.textAlign(p.LEFT, p.BOTTOM); p.textSize(20);
    p.text('IMAGINE YOURSELF...', 16, p.height - 16);
  };
});

// --- QUESTION SET (your prompts as 30 pairs) ---
const followUp = "Imagine how you would translate this into abstract, geometric, simple, or primitive shapes. What does this convey about your identity?";
const pairs = [
  ["What if you were an animal? What would you be? Why?", followUp],
  ["Imagine yourself as a technology. What technology would it be? Why?", followUp],
  ["Imagine yourself in the style of Vera Molnar. What do you look like? Why?", followUp],
  ["Imagine yourself as your doppelgänger.  What would you look like? Why?", followUp],
  ["What does your “digital twin” look like? Why?", followUp],
  ["Imagine yourself as your nemesis. What do you look like? Why?", followUp],
  ["Imagine yourself in the style of Van Gogh or Tschabalala Self. What do you look like? Why?", followUp],
  ["Imagine yourself as a robot. What do you look like? Why?", followUp],
  ["Imagine a version of you that reveals something about your lived experience. What do you look like? Why?", followUp],
  ["Imagine yourself as a collage. What do you look like? Why?", followUp],
  ["Imagine yourself as a object. What do you look like? Why?", followUp],
  ["What is something that you do everyday. What do you look like when you perform this task?", followUp],
  ["What is something that is very important to you. How could you depict this idea? How could you depict this idea as a “portrait”?", followUp],
  ["What expression do you make often? How could you depict this expression? What does this expression reveal about you?", followUp],
  ["What makes you unique? How could you depict this uniqueness in an image?", followUp],
  ["What color/s represent you? How could you depict yourself with this color?", followUp],
  ["What cultural events shape your identity? How could you depict these in a portrait of you?", followUp],
  ["Imagine if you could tell a story with your face. What would this look like?", followUp],
  ["What is your favorite song? How could you depict this song through a portrait?", followUp],
  ["Who is your hero? How can you depict yourself as your hero? What similarities do you share?", followUp],
  ["What is your favorite poem? Why? How could you express a similar idea through a portrait of you?", followUp],
  ["What is your favorite place? How could you show this through a portrait of you? ", followUp],
  ["What is your favorite or least favorite selfie of you? What do either of these images reveal about you? How can you translate that into a portrait?", followUp],
  ["What is a strong opinion that you have? How can you make a portrait of yourself that reveals this opinion?", followUp],
  ["Think of a political view that you hold. How can you make a portrait of yourself that reveals this view?", followUp],
  ["Who is your favorite artist? What would a self-portrait look like if you made it in their style?", followUp],
  ["What is a word that describes you? How can you make a self-portrait that shows this concept?", followUp]
];
// Fill to 30 with the lived-experience pair
while (pairs.length < 30) {
  pairs.push([
    "Imagine a version of you that reveals something about your lived experience. What do you look like? Why?",
    followUp
  ]);
}

// --- Build UI (NO COLLAPSING) + Realtime listeners ---
const unsubscribers = [];
buildQuestionsUI();
attachAllListeners();

function clearListeners() {
  while (unsubscribers.length) {
    const u = unsubscribers.pop();
    try { u && u(); } catch (_) {}
  }
}

function attachAllListeners() {
  clearListeners();
  for (let i = 1; i <= pairs.length; i++) {
    attachSubQListener(i, 1);
    attachSubQListener(i, 2);
  }
}

function buildQuestionsUI() {
  questionsHost.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'grid';

  for (let i = 0; i < pairs.length; i++) {
    const pairIdx = i + 1;
    const [q1, q2] = pairs[i];

    const wrap = document.createElement('div');
    wrap.className = 'card';

    // Simple label (no <details>/<summary>)
    const label = document.createElement('div');
    label.className = 'pair-label';
    label.textContent = `Question ${pairIdx}`;
    wrap.appendChild(label);

    const inner = document.createElement('div');
    inner.className = 'inner';

    inner.appendChild(makeSubQuestionBlock(pairIdx, 1, q1, false));
    inner.appendChild(makeSubQuestionBlock(pairIdx, 2, q2, true));

    wrap.appendChild(inner);
    container.appendChild(wrap);
  }

  questionsHost.appendChild(container);

  exportBtn.onclick = exportAllJSON;
  exportCsvBtn.onclick = exportAllCSV;
  resetBtn.onclick = resetMyInputs;
}

function makeSubQuestionBlock(pairIdx, subIdx, promptText, indent) {
  const block = document.createElement('div');
  block.className = 'pair' + (indent ? ' subq' : '');

  const pQ = document.createElement('div');
  pQ.className = 'q';
  pQ.textContent = `${pairIdx}.${subIdx} ${promptText}`;
  block.appendChild(pQ);

  const ta = document.createElement('textarea');
  ta.id = `p${pairIdx}_s${subIdx}`;
  ta.maxLength = 1000; // up to 1,000 chars
  ta.placeholder = 'Type your response here (up to 1000 characters)…';
  block.appendChild(ta);

  const row = document.createElement('div');
  row.className = 'row';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save Response';
  saveBtn.addEventListener('click', async () => {
    const text = ta.value.trim();
    if (!text) { alert('Please enter some text.'); return; }
    try {
      await addDoc(collection(db, 'answers'), {
        anonId: ANON_ID,
        sessionId: SESSION_ID,
        pairNumber: pairIdx,
        subQuestion: subIdx,
        text,
        createdAt: serverTimestamp()
      });
      ta.value = '';
      // onSnapshot will refresh automatically
    } catch (e) {
      console.error(e);
      alert('Error saving response. Check console.');
    }
  });
  row.appendChild(saveBtn);

  const info = document.createElement('span');
  info.className = 'muted';
  info.textContent = ' IMAGINE YOURSELF...';
  row.appendChild(info);

  block.appendChild(row);

  const ul = document.createElement('ul');
  ul.id = `list_p${pairIdx}_s${subIdx}`;
  ul.className = 'resp-list';
  ul.innerHTML = '<li class="muted">Listening…</li>';
  block.appendChild(ul);

  return block;
}

// Realtime listener for a sub-question
function attachSubQListener(pairIdx, subIdx) {
  const ul = document.getElementById(`list_p${pairIdx}_s${subIdx}`);
  if (!ul) return;

  const qRef = query(
    collection(db, 'answers'),
    where('pairNumber', '==', pairIdx),
    where('subQuestion', '==', subIdx),
    orderBy('createdAt', 'asc')
  );

  const unsub = onSnapshot(qRef, (snap) => {
    ul.innerHTML = '';
    if (snap.empty) {
      ul.innerHTML = '<li class="muted">No responses yet.</li>';
      return;
    }
    snap.forEach(docu => {
      const data = docu.data();
      const li = document.createElement('li');
      const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
      const who = data.anonId || 'anon';
      li.innerHTML = `<div><strong>${escapeHtml(who)}</strong> · ${escapeHtml(date.toLocaleString())}</div><div>${escapeHtml(data.text)}</div>`;
      ul.appendChild(li);
    });
  }, (err) => {
    console.error(err);
    ul.innerHTML = '<li class="muted">Listener error. Check rules/indexes.</li>';
  });

  unsubscribers.push(unsub);
}

// --- Export (ALL) & Reset inputs ---
async function exportAllJSON() {
  try {
    const qRef = query(
      collection(db, 'answers'),
      orderBy('pairNumber', 'asc'),
      orderBy('subQuestion', 'asc'),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(qRef);
    const rows = [];
    snap.forEach(d => {
      const data = d.data();
      const created = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : '';
      rows.push({
        anonId: data.anonId, sessionId: data.sessionId,
        pairNumber: data.pairNumber, subQuestion: data.subQuestion,
        text: data.text, createdAt: created
      });
    });
    const exported = { exportedAt: new Date().toISOString(), responses: rows };
    downloadBlob(JSON.stringify(exported, null, 2), `all_responses.json`, 'application/json');
  } catch (e) {
    console.error(e);
    alert('Export failed. Check console.');
  }
}

async function exportAllCSV() {
  try {
    const qRef = query(
      collection(db, 'answers'),
      orderBy('pairNumber', 'asc'),
      orderBy('subQuestion', 'asc'),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(qRef);
    const rows = [];
    snap.forEach(d => {
      const data = d.data();
      const created = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : '';
      rows.push({
        anonId: data.anonId, sessionId: data.sessionId,
        pairNumber: data.pairNumber, subQuestion: data.subQuestion,
        createdAt: created, text: data.text
      });
    });
    const csv = toCSV(rows, ['anonId','sessionId','pairNumber','subQuestion','createdAt','text']);
    downloadBlob(csv, `all_responses.csv`, 'text/csv');
  } catch (e) {
    console.error(e);
    alert('CSV export failed. Check console.');
  }
}

function resetMyInputs() {
  for (let i = 1; i <= pairs.length; i++) {
    for (let s = 1; s <= 2; s++) {
      const ta = document.getElementById(`p${i}_s${s}`);
      if (ta) ta.value = '';
    }
  }
  alert('Inputs cleared. (Saved answers remain on the public wall.)');
}

// --- Utils ---
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toCSV(rows, headers) {
  const esc = v => {
    if (v == null) return '';
    const s = String(v).replaceAll('"', '""');
    if (/[",\n]/.test(s)) return '"' + s + '"';
    return s;
  };
  const lines = [];
  lines.push(headers.join(','));
  for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(','));
  return lines.join('\n');
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/*
Firestore DEV-ONLY public rules (use for quick trials, then lock down)
--------------------------------------------------------------------
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /answers/{docId} {
      allow read, write: if true; // public (NOT for production)
    }
  }
}
*/
