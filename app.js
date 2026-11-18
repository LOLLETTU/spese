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
  const dopFmt = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
  const moneyDop = (cents) => dopFmt.format(cents / 100) + " DOP";
  const parseRate = (raw) => Number(String(raw).trim().replace(",", "."));
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
    toastEl.hidden = true;
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

  function payBtn(p) {
    return `<button type="button" class="btn ghost small-btn" data-settle="${esc(p.from)}|${esc(p.to)}|${p.amount}">Segna pagato</button>`;
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
              ? `<li class="row"><div class="grow"><p class="title">${esc(p.from_name)} ti deve</p><p class="amt pos">${money(p.amount)}</p></div>${payBtn(p)}</li>`
              : `<li class="row"><div class="grow"><p class="title">Tu devi a ${esc(p.to_name)}</p><p class="amt neg">${money(p.amount)}</p></div>${payBtn(p)}</li>`)
            .join("");
          return `<section class="panel">
              <h3>Il tuo saldo</h3>
              <div style="margin:6px 0 10px">${summary}</div>
              ${rows ? `<ul class="list">${rows}</ul><p class="hint" style="margin-top:8px">Quando vi ridate i soldi, tocca “Segna pagato”.</p>` : '<p class="muted small">Nessun debito con gli altri.</p>'}
            </section>`;
        })()
      : `<section class="panel"><h3>Chi sei?</h3>
           <p class="hint" style="margin:4px 0 10px">Scegli il tuo nome per vedere quanto ti devono e quanto devi.</p>
           <div class="chips">${group.people.map((p) => `<button type="button" class="chip" data-me="${esc(p.id)}" aria-pressed="false">${esc(p.name)}</button>`).join("")}</div>
         </section>`;

    const others = me ? balances.pairs.filter((p) => p.from !== me && p.to !== me) : balances.pairs;
    const all = others.length
      ? `<ul class="list">${others.map((p) => `<li class="row"><div class="grow"><p class="title">${esc(p.from_name)} → ${esc(p.to_name)}</p><p class="amt">${money(p.amount)}</p></div>${payBtn(p)}</li>`).join("")}</ul>`
      : `<p class="muted small">${me && balances.pairs.length ? "Nessun altro debito tra gli altri." : "Nessun debito aperto: siete in pari."}</p>`;

    const othersSection = me && !others.length ? "" : `
      <section class="panel">
        <h3>${me ? "Debiti tra gli altri" : "Tutti i debiti"}</h3>
        <p class="hint" style="margin:4px 0 6px">Ogni riga è il debito netto tra due persone.${me ? "" : " Quando vi ridate i soldi, tocca “Segna pagato”."}</p>
        ${all}
      </section>`;
    return `${meBlock}${othersSection}
      <button type="button" class="btn ghost block" id="add-person">+ Aggiungi persona</button>`;
  }

  function speseHtml(group) {
    const items = [
      ...group.expenses.map((e) => ({ kind: "exp", date: e.date, created: e.created, e })),
      ...(group.settlements || []).map((s) => ({ kind: "pay", date: s.date, created: s.created, s })),
    ];
    if (!items.length) {
      return '<div class="empty"><p>Nessuna spesa ancora.</p><p class="small">Tocca “+ Spesa” in basso per aggiungere la prima.</p></div>';
    }
    const byId = Object.fromEntries(group.people.map((p) => [p.id, p.name]));
    const days = {};
    items.forEach((it) => { (days[it.date] = days[it.date] || []).push(it); });
    Object.values(days).forEach((list) => list.sort((a, b) => b.created.localeCompare(a.created)));
    const rowHtml = (it) => {
      if (it.kind === "pay") {
        const s = it.s;
        return `
              <li class="row">
                <div style="min-width:0">
                  <p class="title">${esc(byId[s.from])} → ${esc(byId[s.to])}</p>
                  <p class="meta">Pagamento: ${esc(byId[s.from])} ha restituito i soldi a ${esc(byId[s.to])}</p>
                </div>
                <div class="row" style="padding:0;gap:4px">
                  <span class="amt pos">${money(s.amount_cents)}</span>
                  <button type="button" class="icon-btn del" data-del-pay="${esc(s.id)}" aria-label="Annulla pagamento di ${esc(byId[s.from])} a ${esc(byId[s.to])}">${ICON_TRASH}</button>
                </div>
              </li>`;
      }
      const e = it.e;
      return `
              <li class="row">
                <div style="min-width:0">
                  <p class="title">${esc(e.description)}</p>
                  <p class="meta">Pagato da ${esc(byId[e.paid_by])} · diviso tra ${e.split_among.length}${e.currency === "DOP" ? ` · ${esc(moneyDop(e.orig_cents))}` : ""}</p>
                </div>
                <div class="row" style="padding:0;gap:4px">
                  <span class="amt">${money(e.amount_cents)}</span>
                  <button type="button" class="icon-btn del" data-del="${esc(e.id)}" aria-label="Elimina spesa ${esc(e.description)}">${ICON_TRASH}</button>
                </div>
              </li>`;
    };
    return Object.keys(days).sort().reverse().map((date) => `
      <section class="day">
        <h3>${esc(shortDate(date))}</h3>
        <div class="panel" style="padding:4px 14px">
          <ul class="list">${days[date].map(rowHtml).join("")}</ul>
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
        <div class="field">
          <span class="label">Valuta</span>
          <div class="chips" id="currency-chips">
            <button type="button" class="chip" data-currency="EUR" aria-pressed="true">Euro (€)</button>
            <button type="button" class="chip" data-currency="DOP" aria-pressed="false">Pesos (DOP)</button>
          </div>
        </div>
        <label class="field">
          <span id="amount-label">Importo (€)</span>
          <input name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" required>
        </label>
        <label class="field" id="rate-field" hidden>
          <span>Cambio: 1 € = … DOP</span>
          <input name="rate" inputmode="decimal" autocomplete="off" value="${esc((1 / Number(group.dop_rate)).toFixed(2).replace(".", ","))}">
          <span class="hint" id="rate-preview"></span>
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
      form.rate.addEventListener("focus", () => form.rate.select());
      form.rate.addEventListener("input", updateSplitPreview);
      updateSplitPreview();
      form.description.focus();
    });
  }

  function selectedCurrency() {
    const b = sheetBody.querySelector('[data-currency][aria-pressed="true"]');
    return b ? b.dataset.currency : "EUR";
  }

  function applyCurrency() {
    const dop = selectedCurrency() === "DOP";
    document.getElementById("rate-field").hidden = !dop;
    document.getElementById("amount-label").textContent = dop ? "Importo (DOP)" : "Importo (€)";
    updateSplitPreview();
  }

  function selectedIds(attr) {
    return [...sheetBody.querySelectorAll(`[${attr}][aria-pressed="true"]`)].map((b) => b.getAttribute(attr));
  }

  function updateSplitPreview() {
    const form = document.getElementById("expense-form");
    if (!form) return;
    const n = selectedIds("data-split").length;
    let raw = form.amount.value.trim().replace(/\s/g, "");
    if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "");
    let value = Number(raw);
    const el = document.getElementById("split-preview");
    if (selectedCurrency() === "DOP") {
      const dopPerEur = parseRate(form.rate.value);
      const rp = document.getElementById("rate-preview");
      if (value > 0 && dopPerEur > 0) {
        value = value / dopPerEur;
        rp.textContent = `Totale convertito: ≈ ${money(Math.round(value * 100))}`;
      } else {
        rp.textContent = "";
      }
    }
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
      const currency = selectedCurrency();
      const payload = { description, amount, paid_by, split_among, date: form.date.value || todayISO(), currency };
      if (currency === "DOP") {
        const dopPerEur = parseRate(form.rate.value);
        if (!(dopPerEur > 0)) return fail("Inserisci il cambio, es. 67,10");
        payload.rate = (1 / dopPerEur).toFixed(6);
      }
      const data = await api("POST", `/api/groups/${currentSlug}/expenses`, payload);
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

  function openSettleSheet(fromId, toId, cents) {
    const byId = Object.fromEntries(current.group.people.map((p) => [p.id, p.name]));
    const full = (cents / 100).toFixed(2).replace(".", ",");
    openSheet("Segna pagamento", `
      <form id="settle-form" class="stack-lg" novalidate data-from="${esc(fromId)}" data-to="${esc(toId)}">
        <p><strong>${esc(byId[fromId])}</strong> restituisce a <strong>${esc(byId[toId])}</strong>.<br>
          <span class="muted">Debito attuale: ${money(cents)}.</span></p>
        <label class="field">
          <span>Importo restituito (€)</span>
          <input name="amount" inputmode="decimal" autocomplete="off" value="${esc(full)}" required>
          <span class="hint">Se restituisce tutto, il saldo tra voi due va a zero. Puoi anche mettere una cifra più bassa.</span>
        </label>
        <p class="error" id="settle-error" hidden></p>
        <button class="btn primary block" type="submit">Conferma pagamento</button>
      </form>`, () => { const i = document.querySelector("#settle-form input"); i.focus(); i.select(); });
  }

  async function submitSettle(form) {
    const err = document.getElementById("settle-error");
    err.hidden = true;
    const amount = form.amount.value.trim();
    if (!amount) { err.textContent = "Inserisci l'importo"; err.hidden = false; return; }
    try {
      current = await api("POST", `/api/groups/${currentSlug}/settlements`, {
        from_id: form.dataset.from, to_id: form.dataset.to, amount, date: todayISO(),
      });
      closeSheet();
      drawGroup();
      toast("Pagamento registrato");
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    }
  }

  function openDeletePaySheet(sid) {
    const s = (current.group.settlements || []).find((x) => x.id === sid);
    if (!s) return;
    const byId = Object.fromEntries(current.group.people.map((p) => [p.id, p.name]));
    openSheet("Annullare il pagamento?", `
      <div class="stack-lg">
        <p>Il pagamento di ${money(s.amount_cents)} da ${esc(byId[s.from])} a ${esc(byId[s.to])} verrà tolto e il debito tornerà com'era.</p>
        <div class="stack">
          <button type="button" class="btn danger block" id="confirm-delete-pay" data-sid="${esc(sid)}">Annulla pagamento</button>
          <button type="button" class="btn ghost block" id="cancel-sheet">Indietro</button>
        </div>
      </div>`);
  }

  async function confirmDeletePay(sid) {
    try {
      current = await api("DELETE", `/api/groups/${currentSlug}/settlements/${sid}`);
      closeSheet();
      drawGroup();
      toast("Pagamento annullato");
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
    if (t.dataset.delPay) { openDeletePaySheet(t.dataset.delPay); return; }
    if (t.dataset.settle) {
      const [f, to, amt] = t.dataset.settle.split("|");
      openSettleSheet(f, to, Number(amt));
      return;
    }
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
    if (t.dataset.currency) {
      sheetBody.querySelectorAll("[data-currency]").forEach((b) => b.setAttribute("aria-pressed", String(b === t)));
      applyCurrency();
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
    if (t.id === "confirm-delete-pay") { confirmDeletePay(t.dataset.sid); return; }
  });

  sheet.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (ev.target.id === "expense-form") submitExpense(ev.target);
    if (ev.target.id === "person-form") submitPerson(ev.target);
    if (ev.target.id === "settle-form") submitSettle(ev.target);
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
