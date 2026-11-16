const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function fmt(bytes) {
  if (!bytes) return "0 KB";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i >= 2 ? n.toFixed(1) : Math.round(n)) + " " + u[i];
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const level = (pct) => (pct >= 90 ? "err" : pct >= 75 ? "warn" : "");
function setMeter(el, pct) { el.style.width = Math.min(100, pct) + "%"; el.className = level(pct); }
function busy(el, on) { el.classList.toggle("busy", on); }

// ── Toast & confirm dialog ──
let toastTimer;
function status(text) {
  const t = $("#toast");
  t.textContent = text; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3800);
}
function ask(title, body, ok = "Continue", danger = false) {
  const d = $("#dlg");
  $("#dlg-title").textContent = title;
  $("#dlg-body").textContent = body;
  const b = $("#dlg-ok");
  b.textContent = ok; b.className = "btn " + (danger ? "danger" : "primary");
  return new Promise((res) => {
    d.addEventListener("close", () => res(d.returnValue === "ok"), { once: true });
    d.returnValue = "cancel";
    d.showModal();
  });
}

// ── Theme (system → light → dark) ──
const themes = ["system", "light", "dark"];
function applyTheme(t) {
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = t;
  $("#theme-label").textContent = t[0].toUpperCase() + t.slice(1) + " theme";
}
let theme = "system";
try { theme = localStorage.getItem("juncle-theme") || "system"; } catch {}
applyTheme(theme);
$("#theme-btn").addEventListener("click", () => {
  theme = themes[(themes.indexOf(theme) + 1) % themes.length];
  try { localStorage.setItem("juncle-theme", theme); } catch {}
  applyTheme(theme);
});

// ── Navigation ──
function go(page) {
  $$(".nav").forEach((n) => n.classList.toggle("active", n.dataset.page === page));
  $$(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + page));
  if (page === "home") loadHome();
  if (page === "memory") loadMemory();
  if (page === "disk") loadDrives();
  if (page === "startup") loadStartup();
}
$$(".nav").forEach((n) => n.addEventListener("click", () => go(n.dataset.page)));
$$("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));

// ── Overview ──
async function loadHome() {
  try {
    const [m, d] = await Promise.all([invoke("memory_info"), invoke("disk_info")]);
    const rp = m.total ? Math.round((m.used / m.total) * 100) : 0;
    $("#h-ram").textContent = rp + "%";
    setMeter($("#h-ram-bar"), rp);
    $("#h-ram-sub").textContent = `${fmt(m.used)} of ${fmt(m.total)} in use`;
    const main = d.find((x) => /^C:/i.test(x.mount)) || d[0];
    if (main) {
      const dp = main.total ? Math.round(((main.total - main.free) / main.total) * 100) : 0;
      $("#h-disk").textContent = fmt(main.free) + " free";
      setMeter($("#h-disk-bar"), dp);
      $("#h-disk-sub").textContent = `${main.mount} · ${fmt(main.total)} total`;
    }
  } catch (e) { status("Could not read system info: " + e); }
}

function showJunkSummary() {
  const total = junk.reduce((a, j) => a + j.size, 0);
  $("#h-junk").textContent = fmt(total);
  setMeter($("#h-junk-bar"), Math.min(100, total / 5e7)); // full at ~5 GB
  $("#h-junk-sub").textContent = total ? "Ready to clean" : "Your PC is tidy";
}
$("#h-scan").addEventListener("click", () => { go("junk"); $("#junk-scan").click(); });
$("#h-boost").addEventListener("click", () => boost());

// ── Junk cleaner ──
let junk = [];
const junkList = $("#junk-list");

function renderJunk() {
  junkList.innerHTML = junk.map((j, i) => `
    <label class="item ${j.size === 0 ? "off" : ""}">
      <input type="checkbox" data-i="${i}" ${j.size > 0 ? "checked" : "disabled"}>
      <span class="name">${esc(j.name)}<small>${esc(j.desc)}</small></span>
      <span class="size">${j.size === 0 ? "Nothing found" : fmt(j.size)}${j.size ? `<small>${j.files.toLocaleString()} files</small>` : ""}</span>
    </label>`).join("");
  updateJunkTotal();
}
junkList.addEventListener("change", updateJunkTotal);
const selectedJunk = () => $$("input:checked", junkList).map((c) => junk[+c.dataset.i]);

function updateJunkTotal() {
  const sel = selectedJunk();
  const all = junk.reduce((a, j) => a + j.size, 0);
  const chosen = sel.reduce((a, j) => a + j.size, 0);
  $("#junk-total").textContent = junk.length ? `${fmt(all)} found · ${fmt(chosen)} selected` : "Total junk found: —";
  $("#junk-clean").disabled = chosen === 0;
}

$("#junk-scan").addEventListener("click", async () => {
  const bar = $("#junk-progress");
  $("#junk-scan").disabled = $("#junk-clean").disabled = true;
  busy(bar, true);
  try {
    junk = await invoke("scan_junk");
    renderJunk(); showJunkSummary();
    status(`Scan complete: ${fmt(junk.reduce((a, j) => a + j.size, 0))} of junk found.`);
  } catch (e) { status("Scan failed: " + e); }
  busy(bar, false);
  $("#junk-scan").disabled = false;
  updateJunkTotal();
});
$("#junk-all").addEventListener("click", () => { $$("input:not(:disabled)", junkList).forEach((c) => (c.checked = true)); updateJunkTotal(); });
$("#junk-none").addEventListener("click", () => { $$("input", junkList).forEach((c) => (c.checked = false)); updateJunkTotal(); });

$("#junk-clean").addEventListener("click", async () => {
  const sel = selectedJunk();
  const size = sel.reduce((a, j) => a + j.size, 0);
  if (!(await ask("Clean junk files?", `${fmt(size)} will be deleted from ${sel.length} location(s).\nFiles that are in use are skipped.`, "Clean", false))) return;
  const bar = $("#junk-progress");
  $("#junk-scan").disabled = $("#junk-clean").disabled = true;
  busy(bar, true);
  try {
    const r = await invoke("clean_junk", { ids: sel.map((j) => j.id) });
    status(`Cleaned ${fmt(r.freed)} (${r.deleted.toLocaleString()} files)` + (r.failed ? ` · ${r.failed.toLocaleString()} in use, skipped` : ""));
    junk = await invoke("scan_junk");
    renderJunk(); showJunkSummary();
  } catch (e) { status("Clean failed: " + e); }
  busy(bar, false);
  $("#junk-scan").disabled = false;
  updateJunkTotal();
});

// ── Memory ──
async function loadMemory() {
  try {
    const m = await invoke("memory_info");
    const pct = m.total ? Math.round((m.used / m.total) * 100) : 0;
    setMeter($("#ram-bar"), pct);
    $("#ram-pct").textContent = pct + "%";
    $("#ram-used").textContent = `Used ${fmt(m.used)}`;
    $("#ram-free").textContent = `Available ${fmt(m.available)}`;
    $("#ram-total").textContent = `Total ${fmt(m.total)}`;
    $("#swap-text").textContent = m.swap_total ? `Page file: ${fmt(m.swap_used)} of ${fmt(m.swap_total)} in use` : "";
    $("#proc-table tbody").innerHTML = m.top.map((p) =>
      `<tr><td>${esc(p.name)}</td><td class="num">${p.pid}</td><td class="num">${fmt(p.memory)}</td></tr>`).join("");
  } catch (e) { status("Could not read memory: " + e); }
}
$("#mem-refresh").addEventListener("click", loadMemory);

async function boost() {
  const btns = [$("#mem-boost"), $("#h-boost")];
  btns.forEach((b) => (b.disabled = true));
  status("Boosting memory…");
  try {
    const r = await invoke("optimize_memory");
    status(`Boost complete: released ${fmt(Math.max(0, r.before - r.after))} · ${r.trimmed} programs trimmed`);
    loadMemory(); loadHome();
  } catch (e) { status("Boost failed: " + e); }
  btns.forEach((b) => (b.disabled = false));
}
$("#mem-boost").addEventListener("click", boost);

// ── Disk ──
async function loadDrives() {
  try {
    const d = await invoke("disk_info");
    $("#drives").innerHTML = d.map((x) => {
      const pct = x.total ? Math.round(((x.total - x.free) / x.total) * 100) : 0;
      return `<div class="drive"><b>${esc(x.mount)}</b>
        <div class="meter"><i class="${level(pct)}" style="width:${pct}%"></i></div>
        <span>${fmt(x.free)} free of ${fmt(x.total)}</span></div>`;
    }).join("") || '<div class="empty">No drives found.</div>';
  } catch (e) { status("Could not read drives: " + e); }
}

let big = [];
const bigList = $("#big-list");
function updateBigTotal() {
  const sel = $$("input:checked", bigList);
  const size = sel.reduce((a, c) => a + big[+c.dataset.i].size, 0);
  $("#big-total").textContent = sel.length ? `${sel.length} selected · ${fmt(size)}. Deleted files cannot be recovered.` : "Deleted files cannot be recovered.";
  $("#big-delete").disabled = sel.length === 0;
}
bigList.addEventListener("change", updateBigTotal);

$("#big-scan").addEventListener("click", async () => {
  const btn = $("#big-scan");
  btn.disabled = true;
  bigList.innerHTML = '<div class="empty">Searching…</div>';
  try {
    big = await invoke("find_large_files", { minMb: +$("#big-min").value });
    bigList.innerHTML = big.length ? big.map((f, i) => {
      const cut = f.path.lastIndexOf("\\");
      return `<label class="item"><input type="checkbox" data-i="${i}">
        <span class="name" title="${esc(f.path)}">${esc(f.path.slice(cut + 1))}<small>${esc(f.path.slice(0, cut))}</small></span>
        <span class="size">${fmt(f.size)}</span></label>`;
    }).join("") : '<div class="empty">No files that large were found.</div>';
    status(`Found ${big.length} large file(s).`);
  } catch (e) { status("Search failed: " + e); }
  btn.disabled = false; updateBigTotal();
});

$("#big-delete").addEventListener("click", async () => {
  const sel = $$("input:checked", bigList).map((c) => big[+c.dataset.i]);
  if (!(await ask("Delete files permanently?", `${sel.length} file(s) will be deleted.\nThis cannot be undone.`, "Delete", true))) return;
  try {
    const r = await invoke("delete_files", { paths: sel.map((f) => f.path) });
    status(`Deleted ${r.deleted} file(s), freed ${fmt(r.freed)}` + (r.failed ? ` · ${r.failed} failed` : ""));
    $("#big-scan").click(); loadDrives();
  } catch (e) { status("Delete failed: " + e); }
});

// ── Startup ──
async function loadStartup() {
  const box = $("#startup-list");
  try {
    const items = await invoke("list_startup");
    box.innerHTML = items.length ? items.map((s, i) => `
      <label class="item ${s.enabled ? "" : "off"}">
        <span class="name">${esc(s.name)}<small title="${esc(s.command)}">${esc(s.command)}</small></span>
        <input type="checkbox" class="switch" data-i="${i}" ${s.enabled ? "checked" : ""}>
      </label>`).join("")
      : '<div class="empty">No startup programs found for your account.</div>';
    $$("input", box).forEach((c) => c.addEventListener("change", async () => {
      const it = items[+c.dataset.i];
      try {
        await invoke("set_startup", { name: it.name, enabled: c.checked });
        c.closest(".item").classList.toggle("off", !c.checked);
        status(`${it.name} ${c.checked ? "will start" : "will no longer start"} with Windows.`);
      } catch (e) { c.checked = !c.checked; status("Could not change: " + e); }
    }));
  } catch (e) { status("Could not read startup list: " + e); }
}
$("#startup-refresh").addEventListener("click", loadStartup);

document.addEventListener("contextmenu", (e) => e.preventDefault());
loadHome();
