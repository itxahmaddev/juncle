const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function fmt(bytes) {
  if (!bytes) return "0 KB";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0,
    n = bytes;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return (i >= 2 ? n.toFixed(1) : Math.round(n)) + " " + u[i];
}
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const level = (pct) => (pct >= 90 ? "err" : pct >= 75 ? "warn" : "");
const busy = (el, on) => el.classList.toggle("busy", on);
function setMeter(el, pct) {
  el.style.width = Math.min(100, pct) + "%";
  el.className = level(pct);
}
function setRing(wrap, valEl, pct, lvl = "") {
  valEl.style.strokeDasharray = `${Math.max(0, Math.min(100, pct))} 100`;
  wrap.classList.remove("warn", "err");
  if (lvl) wrap.classList.add(lvl);
}

// ── Toast & confirm dialog ──
let toastTimer;
function status(text) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3800);
}
function ask(title, body, ok = "Continue", danger = false) {
  const d = $("#dlg");
  $("#dlg-title").textContent = title;
  $("#dlg-body").textContent = body;
  const b = $("#dlg-ok");
  b.textContent = ok;
  b.className = "btn " + (danger ? "danger lg" : "primary");
  return new Promise((res) => {
    d.addEventListener("close", () => res(d.returnValue === "ok"), {
      once: true,
    });
    d.returnValue = "cancel";
    d.showModal();
  });
}

// ── Theme (system → light → dark) ──
const themes = ["system", "light", "dark"];
function applyTheme(t) {
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = t;
  $("#theme-label").textContent = t[0].toUpperCase() + t.slice(1);
}
let theme = "system";
try {
  theme = localStorage.getItem("juncle-theme") || "system";
} catch {}
applyTheme(theme);
$("#theme-btn").addEventListener("click", () => {
  theme = themes[(themes.indexOf(theme) + 1) % themes.length];
  try {
    localStorage.setItem("juncle-theme", theme);
  } catch {}
  applyTheme(theme);
});

// ── Navigation ──
function go(page) {
  $$(".nav").forEach((n) =>
    n.classList.toggle("active", n.dataset.page === page),
  );
  $$(".page").forEach((p) =>
    p.classList.toggle("active", p.id === "page-" + page),
  );
  if (page === "home") loadHome();
  if (page === "memory") loadMemory();
  if (page === "disk") loadDrives();
  if (page === "startup") loadStartup();
}
$$(".nav").forEach((n) =>
  n.addEventListener("click", () => go(n.dataset.page)),
);
$$("[data-go]").forEach((b) =>
  b.addEventListener("click", () => go(b.dataset.go)),
);

// ── Overview / health score ──
let sys = { ramPct: null, diskPct: null };
let scanned = false;

function healthScore() {
  let score = 100;
  if (sys.ramPct != null && sys.ramPct > 70) score -= (sys.ramPct - 70) * 0.8;
  if (sys.diskPct != null && sys.diskPct > 75)
    score -= (sys.diskPct - 75) * 0.8;
  const junkGb = junk.reduce((a, j) => a + j.size, 0) / 1073741824;
  score -= Math.min(30, junkGb * 6);
  return Math.max(5, Math.round(score));
}

function renderHealth() {
  const ring = $("#ring");
  if (!scanned) {
    setRing(ring, $("#ring-val"), 0);
    $("#ring-score").textContent = "–";
    $("#ring-label").textContent = "Not scanned";
    return;
  }
  const s = healthScore();
  const lvl = s < 50 ? "err" : s < 75 ? "warn" : "";
  setRing(ring, $("#ring-val"), s, lvl);
  $("#ring-score").textContent = s;
  $("#ring-label").textContent =
    s >= 75 ? "Good" : s >= 50 ? "Could be better" : "Needs attention";
  const total = junk.reduce((a, j) => a + j.size, 0);
  if (total > 0) {
    $("#hero-title").textContent = `${fmt(total)} of junk found`;
    $("#hero-sub").textContent =
      "Clean it now to free up space. You'll be asked to confirm before anything is deleted.";
  } else {
    $("#hero-title").textContent =
      s >= 75 ? "Your PC is in good shape" : "Your PC could use a boost";
    $("#hero-sub").textContent =
      "No junk files found. You can still free memory or review startup programs.";
  }
}

function setScanButton() {
  const total = junk.reduce((a, j) => a + j.size, 0);
  const b = $("#h-scan");
  if (scanned && total > 0) {
    b.dataset.mode = "clean";
    b.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>Clean ${fmt(total)}`;
  } else {
    b.dataset.mode = "scan";
    b.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>${scanned ? "Scan again" : "Smart Scan"}`;
  }
}

async function loadHome() {
  try {
    const [m, d, s] = await Promise.all([
      invoke("memory_info"),
      invoke("disk_info"),
      invoke("list_startup"),
    ]);
    sys.ramPct = m.total ? Math.round((m.used / m.total) * 100) : 0;
    $("#h-ram").textContent =
      `${sys.ramPct}% in use · ${fmt(m.available)} available`;
    const main = d.find((x) => /^C:/i.test(x.mount)) || d[0];
    if (main) {
      sys.diskPct = main.total
        ? Math.round(((main.total - main.free) / main.total) * 100)
        : 0;
      $("#h-disk").textContent = `${fmt(main.free)} free on ${main.mount}`;
    }
    const on = s.filter((x) => x.enabled).length;
    $("#h-startup").textContent =
      `${on} program${on === 1 ? "" : "s"} start with Windows`;
    if (scanned) renderHealth();
  } catch (e) {
    status("Could not read system info: " + e);
  }
}

function showJunkSummary() {
  const total = junk.reduce((a, j) => a + j.size, 0);
  $("#h-junk").textContent = total
    ? `${fmt(total)} ready to clean`
    : "Your PC is tidy";
  const nb = $("#nav-junk");
  nb.textContent = total ? fmt(total).replace(" ", "") : "";
}

$("#h-scan").addEventListener("click", async () => {
  const btn = $("#h-scan");
  if (btn.dataset.mode === "clean") {
    const ok = await cleanJunk(junk.filter((j) => j.size > 0));
    if (ok) {
      setScanButton();
      renderHealth();
    }
    return;
  }
  btn.disabled = true;
  btn.textContent = "Scanning…";
  $("#hero-title").textContent = "Scanning your PC…";
  $("#hero-sub").textContent =
    "Looking for junk files, memory pressure and disk space.";
  try {
    await loadHome();
    junk = await invoke("scan_junk");
    scanned = true;
    renderJunk();
    showJunkSummary();
    renderHealth();
  } catch (e) {
    status("Scan failed: " + e);
  }
  btn.disabled = false;
  setScanButton();
});
$("#h-boost").addEventListener("click", () => boost());

// ── Junk cleaner ──
let junk = [];
const junkList = $("#junk-list");

function renderJunk() {
  if (!junk.length) return;
  junkList.innerHTML = junk
    .map(
      (j, i) => `
    <label class="item ${j.size === 0 ? "off" : ""}">
      <input type="checkbox" data-i="${i}" ${j.size > 0 ? "checked" : "disabled"}>
      <span class="name">${esc(j.name)}<small>${esc(j.desc)}</small></span>
      <span class="size">${j.size === 0 ? "Nothing found" : fmt(j.size)}${j.size ? `<small>${j.files.toLocaleString()} files</small>` : ""}</span>
    </label>`,
    )
    .join("");
  updateJunkTotal();
}
junkList.addEventListener("change", updateJunkTotal);
const selectedJunk = () =>
  $$("input:checked", junkList).map((c) => junk[+c.dataset.i]);

function updateJunkTotal() {
  const sel = selectedJunk();
  const all = junk.reduce((a, j) => a + j.size, 0);
  const chosen = sel.reduce((a, j) => a + j.size, 0);
  $("#junk-sel").textContent = fmt(chosen);
  $("#junk-total").textContent = junk.length
    ? `selected of ${fmt(all)} found`
    : "Nothing selected";
  $("#junk-clean").disabled = chosen === 0;
  $("#junk-clean").textContent = chosen ? `Clean ${fmt(chosen)}` : "Clean now";
}

async function scanJunk() {
  const bar = $("#junk-progress");
  $("#junk-scan").disabled = $("#junk-clean").disabled = true;
  busy(bar, true);
  try {
    junk = await invoke("scan_junk");
    scanned = true;
    renderJunk();
    showJunkSummary();
    setScanButton();
    status(
      `Scan complete: ${fmt(junk.reduce((a, j) => a + j.size, 0))} of junk found.`,
    );
  } catch (e) {
    status("Scan failed: " + e);
  }
  busy(bar, false);
  $("#junk-scan").disabled = false;
  updateJunkTotal();
}
$("#junk-scan").addEventListener("click", scanJunk);
$("#junk-all").addEventListener("click", () => {
  $$("input:not(:disabled)", junkList).forEach((c) => (c.checked = true));
  updateJunkTotal();
});
$("#junk-none").addEventListener("click", () => {
  $$("input", junkList).forEach((c) => (c.checked = false));
  updateJunkTotal();
});

async function cleanJunk(sel) {
  const size = sel.reduce((a, j) => a + j.size, 0);
  if (
    !sel.length ||
    !(await ask(
      "Clean junk files?",
      `${fmt(size)} will be deleted from ${sel.length} location(s).\nFiles that are in use are skipped.`,
      "Clean",
      false,
    ))
  )
    return false;
  const bar = $("#junk-progress");
  $("#junk-scan").disabled = $("#junk-clean").disabled = true;
  busy(bar, true);
  let done = false;
  try {
    const r = await invoke("clean_junk", { ids: sel.map((j) => j.id) });
    status(
      `Cleaned ${fmt(r.freed)} (${r.deleted.toLocaleString()} files)` +
        (r.failed ? ` · ${r.failed.toLocaleString()} in use, skipped` : ""),
    );
    junk = await invoke("scan_junk");
    renderJunk();
    showJunkSummary();
    done = true;
  } catch (e) {
    status("Clean failed: " + e);
  }
  busy(bar, false);
  $("#junk-scan").disabled = false;
  updateJunkTotal();
  return done;
}
$("#junk-clean").addEventListener("click", async () => {
  if (await cleanJunk(selectedJunk())) {
    setScanButton();
    renderHealth();
  }
});

// ── Memory ──
async function loadMemory() {
  try {
    const m = await invoke("memory_info");
    const pct = m.total ? Math.round((m.used / m.total) * 100) : 0;
    sys.ramPct = pct;
    setRing($("#gauge"), $("#gauge-val"), pct, level(pct));
    $("#ram-pct").textContent = pct + "%";
    $("#ram-used").textContent = fmt(m.used);
    $("#ram-free").textContent = fmt(m.available);
    $("#ram-total").textContent = fmt(m.total);
    $("#swap-text").textContent = m.swap_total
      ? `${fmt(m.swap_used)} of ${fmt(m.swap_total)}`
      : "None";
    $("#proc-table tbody").innerHTML = m.top
      .map(
        (p) =>
          `<tr><td>${esc(p.name)}</td><td class="num">${p.pid}</td><td class="num">${fmt(p.memory)}</td></tr>`,
      )
      .join("");
  } catch (e) {
    status("Could not read memory: " + e);
  }
}
$("#mem-refresh").addEventListener("click", loadMemory);

async function boost() {
  const btns = [$("#mem-boost"), $("#h-boost")];
  btns.forEach((b) => (b.disabled = true));
  status("Boosting memory…");
  try {
    const r = await invoke("optimize_memory");
    const freed = fmt(Math.max(0, r.before - r.after));
    $("#boost-last").textContent = `Released ${freed}`;
    status(`Boost complete: released ${freed} · ${r.trimmed} programs trimmed`);
    loadMemory();
    loadHome();
  } catch (e) {
    status("Boost failed: " + e);
  }
  btns.forEach((b) => (b.disabled = false));
}
$("#mem-boost").addEventListener("click", boost);

// ── Disk ──
async function loadDrives() {
  try {
    const d = await invoke("disk_info");
    $("#drives").innerHTML =
      d
        .map((x) => {
          const pct = x.total
            ? Math.round(((x.total - x.free) / x.total) * 100)
            : 0;
          return `<div class="drive"><b>${esc(x.mount)}</b>
        <div class="meter"><i class="${level(pct)}" style="width:${pct}%"></i></div>
        <span>${fmt(x.free)} free of ${fmt(x.total)}</span></div>`;
        })
        .join("") || '<div class="empty">No drives found.</div>';
  } catch (e) {
    status("Could not read drives: " + e);
  }
}

let big = [];
const bigList = $("#big-list");
function updateBigTotal() {
  const sel = $$("input:checked", bigList);
  const size = sel.reduce((a, c) => a + big[+c.dataset.i].size, 0);
  $("#big-sel").textContent = fmt(size);
  $("#big-total").textContent = sel.length
    ? `${sel.length} file(s) selected. Deleted files cannot be recovered.`
    : "Deleted files cannot be recovered.";
  $("#big-delete").disabled = sel.length === 0;
}
bigList.addEventListener("change", updateBigTotal);

$("#big-scan").addEventListener("click", async () => {
  const btn = $("#big-scan");
  btn.disabled = true;
  bigList.innerHTML = '<div class="empty"><b>Searching…</b></div>';
  try {
    big = await invoke("find_large_files", { minMb: +$("#big-min").value });
    bigList.innerHTML = big.length
      ? big
          .map((f, i) => {
            const cut = f.path.lastIndexOf("\\");
            return `<label class="item"><input type="checkbox" data-i="${i}">
        <span class="name" title="${esc(f.path)}">${esc(f.path.slice(cut + 1))}<small>${esc(f.path.slice(0, cut))}</small></span>
        <span class="size">${fmt(f.size)}</span></label>`;
          })
          .join("")
      : '<div class="empty"><b>No files that large</b><span>Try a smaller size.</span></div>';
    status(`Found ${big.length} large file(s).`);
  } catch (e) {
    status("Search failed: " + e);
  }
  btn.disabled = false;
  updateBigTotal();
});

$("#big-delete").addEventListener("click", async () => {
  const sel = $$("input:checked", bigList).map((c) => big[+c.dataset.i]);
  if (
    !(await ask(
      "Delete files permanently?",
      `${sel.length} file(s) will be deleted.\nThis cannot be undone.`,
      "Delete",
      true,
    ))
  )
    return;
  try {
    const r = await invoke("delete_files", { paths: sel.map((f) => f.path) });
    status(
      `Deleted ${r.deleted} file(s), freed ${fmt(r.freed)}` +
        (r.failed ? ` · ${r.failed} failed` : ""),
    );
    $("#big-scan").click();
    loadDrives();
  } catch (e) {
    status("Delete failed: " + e);
  }
});

// ── Startup ──
async function loadStartup() {
  const box = $("#startup-list");
  try {
    const items = await invoke("list_startup");
    const countOn = () => $$("input:checked", box).length;
    box.innerHTML = items.length
      ? items
          .map(
            (s, i) => `
      <label class="item ${s.enabled ? "" : "off"}">
        <span class="name">${esc(s.name)}<small title="${esc(s.command)}">${esc(s.command)}</small></span>
        <input type="checkbox" class="switch" data-i="${i}" ${s.enabled ? "checked" : ""}>
      </label>`,
          )
          .join("")
      : '<div class="empty"><b>No startup programs</b><span>Nothing starts with Windows for your account.</span></div>';
    const label = () =>
      ($("#startup-count").textContent =
        `${countOn()} of ${items.length} enabled`);
    label();
    $$("input", box).forEach((c) =>
      c.addEventListener("change", async () => {
        const it = items[+c.dataset.i];
        try {
          await invoke("set_startup", { name: it.name, enabled: c.checked });
          c.closest(".item").classList.toggle("off", !c.checked);
          label();
          status(
            `${it.name} ${c.checked ? "will start" : "will no longer start"} with Windows.`,
          );
        } catch (e) {
          c.checked = !c.checked;
          status("Could not change: " + e);
        }
      }),
    );
  } catch (e) {
    status("Could not read startup list: " + e);
  }
}
$("#startup-refresh").addEventListener("click", loadStartup);

document.addEventListener("contextmenu", (e) => e.preventDefault());
loadHome();
