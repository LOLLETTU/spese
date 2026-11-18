(() => {
  "use strict";

  // Il sito statico è su GitHub Pages; le API girano sul Mac Mini.
  const API_BASE = location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8795"
    : "https://api-spese.lollettu.com";

  const app = document.getElementById("app");
  const sheet = document.getElementById("sheet");
  const sheetTitle = document.getElementById("sheet-title");
  const sheetBody = document.getElementById("sheet-body");
  const toastEl = document.getElementById("toast");

  const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
  const money = (cents) => eur.format(cents / 100);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  const todayISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const shortDate = (iso) => {
    const [y, m, d] = iso.split("-");
    const wd = new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("it-IT", { weekday: "short" });
    return `${wd} ${d}/${m}`;
  };

  const LS_GROUPS = "spese.groups";
  const getSaved = () => {
    try { return JSON.parse(localStorage.getItem(LS_GROUPS)) || []; } catch (e) { return []; }
  };
  const rememberGroup = (slug, name) => {
    const list = getSaved().filter((g) => g.slug !== slug);
    list.unshift({ slug, name });
    localStorage.setItem(LS_GROUPS, JSON.stringify(list.slice(0, 20)));
  };
  const getMe = (slug) => localStorage.getItem("spese.me." + slug);
  const setMe = (slug, id) => localStorage.setItem("spese.me." + slug, id);

  const ICON_TRASH = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_MINUS = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  async function api(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(API_BASE + url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const detail = data && data.detail;
      throw new Error(typeof detail === "string" ? detail : "Controlla i campi e riprova");
    }
    return data;
  }

  function openSheet(title, html, onReady) {
    sheetTitle.textContent = title;
    sheetBody.innerHTML = html;
    sheet.hidden = false;
    document.body.classList.add("lock");
    requestAnimationFrame(() => sheet.classList.add("open"));
    if (onReady) onReady();
  }
  function closeSheet() {
    sheet.classList.remove("open");
    document.body.classList.remove("lock");
    setTimeout(() => { sheet.hidden = true; sheetBody.innerHTML = ""; }, 200);
  }

  /* ---------- Home: crea gruppo ---------- */

  // innerHTML qui riceve solo stringhe passate da esc() (value incluso): nessun dato grezzo nel markup.
  function personRowHtml(value, i) {
    return `<div class="row-between person-row" style="gap:8px">
      <input class="person-input" name="person" maxlength="40" autocomplete="off" placeholder="Persona ${i + 1}" value="${esc(value)}" aria-label="Partecipante ${i + 1}">
      <button type="button" class="icon-btn remove-person" aria-label="Rimuovi partecipante">${ICON_MINUS}</button>
    </div>`;
  }

  function renderHome() {
    const saved = getSaved();
    app.innerHTML = `
      <header class="top">
        <h1>Spese di viaggio</h1>
        <p class="muted">Crea il gruppo, aggiungi le spese, vedi chi deve a chi.</p>
      </header>
      <form id="new-group" class="panel stack-lg" novalidate>
        <label class="field">
          <span>Nome del viaggio</span>
          <input name="name" maxlength="60" autocomplete="off" placeholder="Es. Santo Domingo" required>
        </label>
        <fieldset class="field">
          <legend>Partecipanti</legend>
          <div class="stack" id="people-inputs">
            ${personRowHtml("", 0)}${personRowHtml("", 1)}${personRowHtml("", 2)}
          </div>
          <button type="button" class="link-btn" id="add-person-input">+ Aggiungi persona</button>
        </fieldset>
        <p class="error" id="new-error" hidden></p>
        <button class="btn primary block" type="submit">Crea gruppo</button>
      </form>
      ${saved.length ? `
      <section class="panel">
        <h2 style="margin-bottom:8px">I tuoi gruppi</h2>
        <ul class="list">
          ${saved.map((g) => `<li><a class="row" href="#/g/${esc(g.slug)}" style="color:var(--fg);text-decoration:none"><span class="title">${esc(g.name)}</span><span class="muted" aria-hidden="true">›</span></a></li>`).join("")}
        </ul>
      </section>` : ""}`;
  }

  function showNewError(msg) {
    const el = document.getElementById("new-error");
    el.textContent = msg;
    el.hidden = false;
  }

  async function submitNewGroup(form) {
    const name = form.name.value.trim();
    const people = [...form.querySelectorAll(".person-input")].map((i) => i.value.trim()).filter(Boolean);
    if (!name) return showNewError("Inserisci il nome del viaggio");
    if (people.length < 2) return showNewError("Servono almeno 2 partecipanti");
    try {
      const data = await api("POST", "/api/groups", { name, people });
      rememberGroup(data.group.slug, data.group.name);
      location.hash = "#/g/" + data.group.slug;
    } catch (e) {
      showNewError(e.message);
    }
  }

  /* ---------- Gruppo ---------- */

  let currentSlug = null;
  let current = null;
  let tab = "saldi";

  async function loadGroup(slug) {
    current = await api("GET", `/api/groups/${slug}`);
    rememberGroup(slug, current.group.name);
  }

  async function renderGroup(slug) {
    currentSlug = slug;
    app.innerHTML = '<p class="muted center" style="padding:40px 0">Caricamento…</p>';
    try {
      await loadGroup(slug);
    } catch (e) {
      app.innerHTML = `<header class="top"><a class="back" href="#/">← Gruppi</a></header>
        <p class="error">Gruppo non trovato. Controlla il link.</p>`;
      return;
    }
    drawGroup();
  }

  async function reloadGroup() {
    try {
      await loadGroup(currentSlug);
      drawGroup();
    } catch (e) {
      toast(e.message);
    }
  }

  function saldiHtml(group, balances, me) {
    const byId = Object.fromEntries(group.people.map((p) => [p.id, p.name]));
    const meBlock = me
      ? (() => {
          const net = balances.totals[me];
          const summary = net > 0
            ? `<p class="big-balance pos">+${money(net)}</p><p class="muted">ti devono in totale</p>`
            : net < 0
              ? `<p class="big-balance neg">${money(-net)}</p><p class="muted">devi in totale</p>`
              : `<p class="big-balance">${money(0)}</p><p class="muted">sei in pari con tutti</p>`;
          const rows = balances.pairs
            .filter((p) => p.from === me || p.to === me)
            .map((p) => p.to === me
              ? `<li class="row"><span class="title">${esc(p.from_name)} ti deve</span><span class="amt pos">${money(p.amount)}</span></li>`
              : `<li class="row"><span class="title">Tu devi a ${esc(p.to_name)}</span><span class="amt neg">${money(p.amount)}</span></li>`)
            .join("");
          return `<section class="panel">
              <h3>Il tuo saldo</h3>
              <div style="margin:6px 0 10px">${summary}</div>
              ${rows ? `<ul class="list">${rows}</ul>` : '<p class="muted small">Nessun debito con gli altri.</p>'}
            </section>`;
        })()
      : `<section class="panel"><h3>Chi sei?</h3>
           <p class="hint" style="margin:4px 0 10px">Scegli il tuo nome per vedere quanto ti devono e quanto devi.</p>
           <div class="chips">${group.people.map((p) => `<button type="button" class="chip" data-me="${esc(p.id)}" aria-pressed="false">${esc(p.name)}</button>`).join("")}</div>
         </section>`;

    const all = balances.pairs.length
      ? `<ul class="list">${balances.pairs.map((p) => `<li class="row"><span class="title">${esc(p.from_name)} → ${esc(p.to_name)}</span><span class="amt">${money(p.amount)}</span></li>`).join("")}</ul>`
      : '<p class="muted small">Nessun debito aperto: siete in pari.</p>';

    return `${meBlock}
      <section class="panel">
        <h3>Tutti i debiti</h3>
        <p class="hint" style="margin:4px 0 6px">Ogni riga è il debito netto tra due persone.</p>
        ${all}
      </section>
      <button type="button" class="btn ghost block" id="add-person">+ Aggiungi persona</button>`;
  }

  function speseHtml(group) {
    if (!group.expenses.length) {
      return '<div class="empty"><p>Nessuna spesa ancora.</p><p class="small">Tocca “+ Spesa” in basso per aggiungere la prima.</p></div>';
    }
    const byId = Object.fromEntries(group.people.map((p) => [p.id, p.name]));
    const days = {};
    group.expenses.forEach((e) => { (days[e.date] = days[e.date] || []).push(e); });
    return Object.keys(days).sort().reverse().map((date) => `
      <section class="day">
        <h3>${esc(shortDate(date))}</h3>
        <div class="panel" style="padding:4px 14px">
          <ul class="list">
            ${days[date].map((e) => `
              <li class="row">
                <div style="min-width:0">
                  <p class="title">${esc(e.description)}</p>
                  <p class="meta">Pagato da ${esc(byId[e.paid_by])} · diviso tra ${e.split_among.length}</p>
                </div>
                <div class="row" style="padding:0;gap:4px">
                  <span class="amt">${money(e.amount_cents)}</span>
                  <button type="button" class="icon-btn del" data-del="${esc(e.id)}" aria-label="Elimina spesa ${esc(e.description)}">${ICON_TRASH}</button>
                </div>
              </li>`).join("")}
          </ul>
        </div>
      </section>`).join("");
  }

  function drawGroup() {
    const { group, balances } = current;
    const me = getMe(group.slug) && group.people.some((p) => p.id === getMe(group.slug)) ? getMe(group.slug) : null;
    const people = group.people.length;
    app.innerHTML = `
      <header class="top">
        <a class="back" href="#/">← Gruppi</a>
        <h1>${esc(group.name)}</h1>
        <p class="muted small">${people} persone · ${group.expenses.length} ${group.expenses.length === 1 ? "spesa" : "spese"} · totale ${money(group.total_cents)}</p>
      </header>
      <nav class="tabs" role="tablist" aria-label="Sezioni">
        <button type="button" role="tab" data-tab="saldi" aria-selected="${tab === "saldi"}">Saldi</button>
        <button type="button" role="tab" data-tab="spese" aria-selected="${tab === "spese"}">Spese</button>
      </nav>
      ${tab === "saldi" ? saldiHtml(group, balances, me) : speseHtml(group)}
      <div class="fab-bar"><button type="button" class="btn primary" id="add-expense">+ Spesa</button></div>`;
  }

  /* ---------- Sheet: nuova spesa ---------- */

  function openExpenseSheet() {
    const { group } = current;
    const me = getMe(group.slug);
    const defaultPayer = group.people.some((p) => p.id === me) ? me : group.people[0].id;
    const html = `
      <form id="expense-form" class="stack-lg" novalidate>
        <label class="field">
          <span>Cosa hai pagato?</span>
          <input name="description" maxlength="80" autocomplete="off" placeholder="Es. Cena al ristorante" required>
        </label>
        <label class="field">
          <span>Importo (€)</span>
          <input name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" required>
        </label>
        <div class="field">
          <span class="label">Chi ha pagato</span>
          <div class="chips" id="payer-chips">
            ${group.people.map((p) => `<button type="button" class="chip" data-payer="${esc(p.id)}" aria-pressed="${p.id === defaultPayer}">${esc(p.name)}</button>`).join("")}
          </div>
        </div>
        <div class="field">
          <div class="row-between">
            <span class="label">Diviso tra</span>
            <button type="button" class="link-btn" id="split-all">Tutti</button>
          </div>
          <div class="chips" id="split-chips">
            ${group.people.map((p) => `<button type="button" class="chip" data-split="${esc(p.id)}" aria-pressed="true">${esc(p.name)}</button>`).join("")}
          </div>
          <p class="hint" id="split-preview"></p>
        </div>
        <label class="field">
          <span>Data</span>
          <input name="date" type="date" value="${todayISO()}" required>
        </label>
        <p class="error" id="expense-error" hidden></p>
        <button class="btn primary block" type="submit">Salva spesa</button>
      </form>`;
    openSheet("Nuova spesa", html, () => {
      const form = document.getElementById("expense-form");
      form.amount.addEventListener("focus", () => form.amount.select());
      form.amount.addEventListener("input", updateSplitPreview);
      updateSplitPreview();
      form.description.focus();
    });
  }

  function selectedIds(attr) {
    return [...sheetBody.querySelectorAll(`[${attr}][aria-pressed="true"]`)].map((b) => b.getAttribute(attr));
  }

  function updateSplitPreview() {
    const form = document.getElementById("expense-form");
    if (!form) return;
    const n = selectedIds("data-split").length;
    const raw = form.amount.value.trim().replace(/\./g, "").replace(",", ".");
    const value = Number(raw);
    const el = document.getElementById("split-preview");
    if (!n) { el.textContent = "Scegli almeno una persona."; return; }
    if (!value || value <= 0) { el.textContent = `Diviso tra ${n} ${n > 1 ? "persone" : "persona"}: inserisci l'importo.`; return; }
    el.textContent = `Quota a testa: ${money(Math.round((value * 100) / n))} (${n} ${n > 1 ? "persone" : "persona"})`;
  }

  async function submitExpense(form) {
    const err = document.getElementById("expense-error");
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    err.hidden = true;
    const description = form.description.value.trim();
    const amount = form.amount.value.trim();
    const paid_by = selectedIds("data-payer")[0];
    const split_among = selectedIds("data-split");
    if (!description) return fail("Inserisci una descrizione");
    if (!amount) return fail("Inserisci l'importo");
    if (!paid_by) return fail("Scegli chi ha pagato");
    if (!split_among.length) return fail("Scegli almeno una persona tra cui dividere");
    try {
      const data = await api("POST", `/api/groups/${currentSlug}/expenses`, {
        description, amount, paid_by, split_among, date: form.date.value || todayISO(),
      });
      current = data;
      closeSheet();
      drawGroup();
      toast("Spesa salvata");
    } catch (e) {
      fail(e.message);
    }
  }

  /* ---------- Sheet: elimina spesa / aggiungi persona ---------- */

  function openDeleteSheet(eid) {
    const e = current.group.expenses.find((x) => x.id === eid);
    if (!e) return;
    openSheet("Eliminare la spesa?", `
      <div class="stack-lg">
        <p>«${esc(e.description)}» da ${money(e.amount_cents)} verrà rimossa e i saldi ricalcolati.</p>
        <div class="stack">
          <button type="button" class="btn danger block" id="confirm-delete" data-eid="${esc(eid)}">Elimina</button>
          <button type="button" class="btn ghost block" id="cancel-sheet">Annulla</button>
        </div>
      </div>`);
  }

  async function confirmDelete(eid) {
    try {
      current = await api("DELETE", `/api/groups/${currentSlug}/expenses/${eid}`);
      closeSheet();
      drawGroup();
      toast("Spesa eliminata");
    } catch (e) {
      toast(e.message);
    }
  }

  function openPersonSheet() {
    openSheet("Aggiungi persona", `
      <form id="person-form" class="stack-lg" novalidate>
        <label class="field">
          <span>Nome</span>
          <input name="name" maxlength="40" autocomplete="off" placeholder="Es. Marta" required>
        </label>
        <p class="error" id="person-error" hidden></p>
        <button class="btn primary block" type="submit">Aggiungi</button>
      </form>`, () => document.querySelector("#person-form input").focus());
  }

  async function submitPerson(form) {
    const err = document.getElementById("person-error");
    const name = form.name.value.trim();
    if (!name) { err.textContent = "Inserisci un nome"; err.hidden = false; return; }
    try {
      current = await api("POST", `/api/groups/${currentSlug}/people`, { name });
      closeSheet();
      drawGroup();
      toast(`${name} aggiunto`);
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    }
  }

  /* ---------- Eventi ---------- */

  app.addEventListener("click", (ev) => {
    const t = ev.target.closest("button, a");
    if (!t) return;
    if (t.id === "add-person-input") {
      const box = document.getElementById("people-inputs");
      const n = box.querySelectorAll(".person-input").length;
      box.insertAdjacentHTML("beforeend", personRowHtml("", n));
      box.lastElementChild.querySelector("input").focus();
      return;
    }
    if (t.classList.contains("remove-person")) {
      const rows = document.querySelectorAll(".person-row");
      if (rows.length > 2) t.closest(".person-row").remove();
      return;
    }
    if (t.dataset.tab) { tab = t.dataset.tab; drawGroup(); return; }
    if (t.dataset.me) { setMe(currentSlug, t.dataset.me); drawGroup(); return; }
    if (t.id === "add-expense") { openExpenseSheet(); return; }
    if (t.id === "add-person") { openPersonSheet(); return; }
    if (t.dataset.del) { openDeleteSheet(t.dataset.del); return; }
  });

  app.addEventListener("submit", (ev) => {
    if (ev.target.id === "new-group") { ev.preventDefault(); submitNewGroup(ev.target); }
  });

  sheet.addEventListener("click", (ev) => {
    if (ev.target === sheet) { closeSheet(); return; }
    const t = ev.target.closest("button");
    if (!t) return;
    if (t.id === "sheet-close" || t.id === "cancel-sheet") { closeSheet(); return; }
    if (t.dataset.payer) {
      sheetBody.querySelectorAll("[data-payer]").forEach((b) => b.setAttribute("aria-pressed", String(b === t)));
      return;
    }
    if (t.dataset.split) {
      const pressed = t.getAttribute("aria-pressed") === "true";
      const on = selectedIds("data-split").length;
      if (pressed && on === 1) { toast("Serve almeno una persona"); return; }
      t.setAttribute("aria-pressed", String(!pressed));
      updateSplitPreview();
      return;
    }
    if (t.id === "split-all") {
      sheetBody.querySelectorAll("[data-split]").forEach((b) => b.setAttribute("aria-pressed", "true"));
      updateSplitPreview();
      return;
    }
    if (t.id === "confirm-delete") { confirmDelete(t.dataset.eid); return; }
  });

  sheet.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (ev.target.id === "expense-form") submitExpense(ev.target);
    if (ev.target.id === "person-form") submitPerson(ev.target);
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !sheet.hidden) closeSheet();
  });

  function route() {
    const m = location.hash.match(/^#\/g\/([a-f0-9]{10})$/);
    if (m) {
      renderGroup(m[1]);
    } else {
      renderHome();
    }
  }
  window.addEventListener("hashchange", route);
  route();
})();
