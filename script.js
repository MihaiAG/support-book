// ---------- Config ----------

// Rotation order. Pokémon artwork comes from the free PokeAPI sprites repo.
const TEAM = [
  { name: "Mihai",   pokemon: "Pikachu",    dex: 25,  tint: "#ffd93d" },
  { name: "Gabi",    pokemon: "Eevee",      dex: 133, tint: "#e8a965" },
  { name: "Andreea", pokemon: "Piplup",     dex: 393, tint: "#6ec6ff" },
];

// A known reference point: the Monday of a week and who was on duty that week.
const ANCHOR_MONDAY = new Date(2026, 9, 12); // 12 Oct 2026 (months are 0-based)
const ANCHOR_INDEX = 1;                      // Gabi

const artwork = (dex) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;

// ---------- Date helpers ----------

const DAY_MS = 24 * 60 * 60 * 1000;

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Math.round absorbs DST hour shifts.
const weeksBetween = (a, b) => Math.round((b - a) / (7 * DAY_MS));
const mod = (n, m) => ((n % m) + m) % m;

const fmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const fmtYear = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

function weekLabel(offset) {
  if (offset === 0) return "This week";
  if (offset === 1) return "Next week";
  if (offset === -1) return "Last week";
  return offset > 0 ? `In ${offset} weeks` : `${-offset} weeks ago`;
}

// ---------- State ----------

const thisMonday = mondayOf(new Date());
const baseSlot = ANCHOR_INDEX + weeksBetween(ANCHOR_MONDAY, thisMonday);

let weekOffset = 0;        // weeks relative to the current one
let target = baseSlot;     // integer carousel position we animate towards
let pos = baseSlot;        // current (fractional) carousel position

// ---------- DOM ----------

const stage = document.getElementById("stage");
const weekTag = document.getElementById("weekTag");
const weekRange = document.getElementById("weekRange");
const dutyName = document.getElementById("dutyName");
const dutyVerb = document.getElementById("dutyVerb");
const todayBtn = document.getElementById("todayBtn");
const upcoming = document.getElementById("upcoming");

function avatarImg(member, alt) {
  const img = new Image();
  img.src = artwork(member.dex);
  img.alt = alt;
  img.draggable = false;
  img.onerror = () => {
    const span = document.createElement("span");
    span.className = "fallback";
    span.textContent = member.name[0];
    img.replaceWith(span);
  };
  return img;
}

const cards = TEAM.map((member, i) => {
  const card = document.createElement("div");
  card.className = "card";
  card.style.setProperty("--tint", member.tint);
  card.innerHTML = `
    <span class="badge">🛟 On duty</span>
    <div class="avatar"></div>
    <p class="name">${member.name}</p>
    <p class="poke">${member.pokemon}</p>`;
  card.querySelector(".avatar").append(avatarImg(member, `${member.name}'s avatar (${member.pokemon})`));
  card.addEventListener("click", () => {
    if (dragMoved) return;
    // Rotate the shortest way so this card lands in the middle.
    let delta = mod(i - target, TEAM.length);
    if (delta > TEAM.length / 2) delta -= TEAM.length;
    go(weekOffset + delta);
  });
  stage.append(card);
  return card;
});

// ---------- Rendering ----------

function layout() {
  const n = TEAM.length;
  const w = stage.clientWidth;
  const radiusX = Math.min(300, w * 0.34);
  const radiusZ = Math.min(260, w * 0.3);

  cards.forEach((card, i) => {
    // Relative position on the ring in (-n/2, n/2]; 0 = front and center.
    let rel = mod(i - pos, n);
    if (rel > n / 2) rel -= n;

    const angle = (rel / n) * Math.PI * 2;
    const x = Math.sin(angle) * radiusX;
    const z = (Math.cos(angle) - 1) * radiusZ;
    const depth = (Math.cos(angle) + 1) / 2; // 1 front, 0 back
    const tilt = -Math.sin(angle) * 30;

    card.style.transform =
      `translate(-50%, -50%) translate3d(${x}px, 0, ${z}px) rotateY(${tilt}deg) scale(${0.75 + 0.25 * depth})`;
    card.style.opacity = (0.3 + 0.7 * depth).toFixed(3);
    card.style.filter = `blur(${((1 - depth) * 3).toFixed(2)}px) saturate(${0.6 + 0.4 * depth})`;
    card.style.zIndex = Math.round(depth * 100);
    card.classList.toggle("active", Math.abs(rel) < 0.5);
  });
}

function updateText() {
  const monday = addDays(thisMonday, weekOffset * 7);
  const sunday = addDays(monday, 6);
  const member = TEAM[mod(target, TEAM.length)];

  weekTag.textContent = weekLabel(weekOffset);
  weekTag.classList.toggle("other", weekOffset !== 0);
  weekRange.textContent = `${fmt.format(monday)} – ${fmtYear.format(sunday)}`;
  dutyName.textContent = member.name;
  dutyVerb.textContent = weekOffset < 0 ? "Was on duty" : weekOffset > 0 ? "Will be on duty" : "On duty";
  todayBtn.hidden = weekOffset === 0;
  cards.forEach((c) => {
    c.querySelector(".badge").textContent = weekOffset === 0 ? "🛟 On duty" : `🛟 ${weekLabel(weekOffset)}`;
  });
}

function renderUpcoming() {
  upcoming.innerHTML = "";
  for (let k = 1; k <= 4; k++) {
    const member = TEAM[mod(baseSlot + k, TEAM.length)];
    const monday = addDays(thisMonday, k * 7);
    const li = document.createElement("li");
    li.append(avatarImg(member, ""));
    li.insertAdjacentHTML(
      "beforeend",
      `<div><span class="who">${member.name}</span><span class="when">${weekLabel(k)} · ${fmt.format(monday)}</span></div>`
    );
    li.style.cursor = "pointer";
    li.addEventListener("click", () => go(k));
    upcoming.append(li);
  }
}

// ---------- Animation ----------

let animating = false;

function tick() {
  const diff = target - pos;
  if (!dragging && Math.abs(diff) < 0.001) {
    pos = target;
    layout();
    animating = false;
    return;
  }
  if (!dragging) pos += diff * 0.1;
  layout();
  requestAnimationFrame(tick);
}

function animate() {
  if (!animating) {
    animating = true;
    requestAnimationFrame(tick);
  }
}

function go(offset) {
  weekOffset = offset;
  target = baseSlot + weekOffset;
  updateText();
  animate();
}

// ---------- Input ----------

document.getElementById("prevBtn").addEventListener("click", () => go(weekOffset - 1));
document.getElementById("nextBtn").addEventListener("click", () => go(weekOffset + 1));
todayBtn.addEventListener("click", () => go(0));

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") go(weekOffset - 1);
  else if (e.key === "ArrowRight") go(weekOffset + 1);
  else if (e.key === "Home") go(0);
});

// Drag / swipe to spin the ring.
let dragging = false;
let dragMoved = false;
let dragStartX = 0;
let dragStartPos = 0;

stage.addEventListener("pointerdown", (e) => {
  dragging = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartPos = pos;
  stage.classList.add("dragging");
});

window.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragStartX;
  if (Math.abs(dx) > 5) dragMoved = true;
  pos = dragStartPos - dx / (stage.clientWidth * 0.4);
  animate();
});

window.addEventListener("pointerup", () => {
  if (!dragging) return;
  dragging = false;
  stage.classList.remove("dragging");
  if (dragMoved) go(Math.round(pos) - baseSlot);
  // Let the click handler see dragMoved before resetting it.
  setTimeout(() => (dragMoved = false), 0);
});

window.addEventListener("resize", layout);

// ---------- Init ----------

updateText();
renderUpcoming();
layout();
