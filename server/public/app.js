const API = "https://eurotransonline.onrender.com"; // same domain (Render all-in-one
const API = API_BASE.replace(/\/$/, "");

// ====== HELPERS ======
const $ = (id) => document.getElementById(id);

function setToken(t){ localStorage.setItem("token", t); }
function getToken(){ return localStorage.getItem("token"); }
function clearToken(){ localStorage.removeItem("token"); }

function setUser(u){ localStorage.setItem("user", JSON.stringify(u)); }
function getUser(){ try{ return JSON.parse(localStorage.getItem("user")||"null"); } catch { return null; } }
function clearUser(){ localStorage.removeItem("user"); }

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };

  // body -> JSON string
  if (opts.body !== undefined && typeof opts.body !== "string") {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  } else {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;

  const url = API + path;

  let res;
  try {
    res = await fetch(url, { ...opts, headers });
  } catch (e) {
    const err = new Error("NETWORK_ERROR");
    err.code = "NETWORK_ERROR";
    throw err;
  }

  let data = {};
  try { data = await res.json(); } catch {}

  if (!res.ok) {
    const err = new Error(data.error || "API_ERROR");
    err.code = data.error || "API_ERROR";
    throw err;
  }
  return data;
}

let toastTimer = null;
function toast(msg){
  const t = $("toast");
  if(!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.add("hidden"), 2200);
}

function statusText(s){
  return s==="APPROVED"?"Принято":s==="REJECTED"?"Отказано":"На рассмотрении";
}
function statusClass(s){
  return s==="APPROVED"?"ok":s==="REJECTED"?"no":"";
}
function roleText(r){
  return r==="LOGIST" ? "Логист" : "Водитель";
}

// прицеп по грузовику (как раньше)
function currentTrailer(truck){
  const trailers = {
    "Scania G400":"НефАЗ 96895",
    "Scania R 2016":"Krone Profi Liner",
    "Scania R500":"Krone Profi Liner",
    "КАМАЗ 5490 Neo":"Kassbohrer трал",
    "КАМАЗ 5490 Neo (бензовоз)":"НефАЗ 96895",
    "КАМАЗ 54901":"Лесовоз Schwarzmuller",
    "MAN TGX Euro 5":"Schmitz SKO",
    "MAN TGX Euro 6":"НефАЗ 96895",
    "MAN TGX 2020":"Feldbinder TSA",
    "Mercedes Actros MP3":"Schmitz SKO",
    "Mercedes Actros MP4":"Schmitz L 16.5",
    "Mercedes Actros L 2023":"Schmitz S.CS MEGA",
    "Volvo FH16 2012":"Schmitz SKO",
    "Volvo FH 2022":"Krone Cool Liner",
    "Renault T 2019":"Schmitz S.CS Universal",
    "DAF XG+ 2023":"Wielton Curtain Master"
  };
  return trailers[truck] || "—";
}

function calcScore(){
  const r = Number($("road")?.value || 0);
  const c = Number($("client")?.value || 0);
  const m = Number($("route")?.value || 0);
  const arr = [r,c,m].filter(x => x>=1 && x<=5);
  if(!arr.length) return 0;
  return Math.round((arr.reduce((a,b)=>a+b,0)/arr.length)*10)/10;
}

// ====== UI SHOW/HIDE ======
function showApp(){
  $("authScreen")?.classList.add("hidden");
  $("app")?.classList.remove("hidden");
}
function showAuth(){
  $("authScreen")?.classList.remove("hidden");
  $("app")?.classList.add("hidden");
}

function renderHeader(){
  const u = getUser();
  if ($("who")) $("who").textContent = u ? `${u.nickname} • ${u.email} • ${roleText(u.role)}` : "—";
  // вкладка "Заявки" только логисту
  $("zayavkiTab")?.classList.toggle("hidden", u?.role !== "LOGIST");
}

function renderProfile(){
  const u = getUser();
  if(!u) return;

  const fallback =
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'>
         <rect width='100%' height='100%' fill='#111827'/>
         <text x='50%' y='55%' font-size='52' text-anchor='middle' fill='#ff7a00' font-family='Arial'>
           ${(u.nickname||"U").slice(0,1).toUpperCase()}
         </text>
       </svg>`
    );

  if ($("pAva")) $("pAva").src = (u.avatar_url && String(u.avatar_url).startsWith("http")) ? u.avatar_url : fallback;
  if ($("pNick")) $("pNick").textContent = u.nickname || "—";
  if ($("pEmail")) $("pEmail").textContent = u.email || "—";
  if ($("pRole")) $("pRole").textContent = "Роль: " + roleText(u.role);
}

function setTab(name){
  document.querySelectorAll(".tab").forEach(b=>{
    b.classList.toggle("active", b.dataset.tab === name);
  });
  ["anketa","zayavki","profile"].forEach(t=>{
    const el = $("tab-"+t);
    if (el) el.classList.toggle("hidden", t !== name);
  });

  // ✅ запуск/остановка моментальных заявок
  if (name === "zayavki") startAllAutoRefresh();
  else stopAllAutoRefresh();
}

// ====== RENDER ITEMS ======
function itemHtml(r, forLogist){
  const badges = `
    <span class="badge ${statusClass(r.status)}">📋 ${statusText(r.status)}</span>
    <span class="badge">🧾 ${r.type}</span>
    <span class="badge">⭐ ${(Number(r.score||0)).toFixed(1)}</span>
  `;
  const driver = forLogist ? `
    <div class="muted small" style="margin-top:6px;">
      Водитель: <b>${r.driver_nick || "—"}</b> • ${r.driver_email || "—"}
    </div>` : "";

  const actions = forLogist ? `
    <div class="row" style="margin-top:10px;">
      <button class="btn" data-act="approve" data-id="${r.id}">✅ Принять</button>
      <button class="btn" data-act="reject" data-id="${r.id}">❌ Отказать</button>
      <button class="btn" data-act="pending" data-id="${r.id}">⏳ На рассм.</button>
      <button class="btn" data-act="delete" data-id="${r.id}">🗑️ Удалить</button>
    </div>` : "";

  return `
    <div class="item">
      <div class="badges">${badges}</div>
      ${driver}
      <div style="margin-top:10px;">
        <div>Маршрут: <b>${r.from_city} → ${r.to_city}</b></div>
        <div class="muted small">Авто: ${r.truck||"—"} • Прицеп: ${r.trailer||"—"} • Км: ${r.km||0}</div>
        <div class="muted small">Дата: ${r.date_from||"—"} — ${r.date_to||"—"}</div>
        <div class="muted small">Груз: ${r.cargo||"—"}</div>
        <div class="muted small">Комм.: ${r.note||"—"}</div>
      </div>
      ${actions}
    </div>
  `;
}

// ====== LOAD LISTS ======
async function loadMine(){
  const q = $("searchMine")?.value?.trim() || "";
  const type = $("filterTypeMine")?.value || "ALL";
  const status = $("filterStatusMine")?.value || "ALL";

  try{
    const res = await api(`/api/reports?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}`);
    const box = $("mineList");
    if(!box) return;

    box.innerHTML = "";
    if(!res.reports?.length){
      box.innerHTML = `<div class="muted small">Нет заявок</div>`;
      return;
    }
    box.innerHTML = res.reports.map(r => itemHtml(r, false)).join("");
  }catch(e){
    toast("Ошибка: " + (e.code || "LOAD_MINE"));
  }
}

async function loadAll(){
  const u = getUser();
  if(u?.role !== "LOGIST") return;

  const q = $("searchAll")?.value?.trim() || "";
  const type = $("filterTypeAll")?.value || "ALL";
  const status = $("filterStatusAll")?.value || "ALL";

  try{
    const res = await api(`/api/reports?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}`);
    const box = $("allList");
    if(!box) return;

    box.innerHTML = "";
    if(!res.reports?.length){
      box.innerHTML = `<div class="muted small">Нет заявок</div>`;
      return;
    }

    box.innerHTML = res.reports.map(r => itemHtml(r, true)).join("");

    // кнопки логиста
    box.querySelectorAll("button[data-act]").forEach(btn=>{
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        try{
          if(act === "delete"){
            if(!confirm("Удалить заявку?")) return;
            await api(`/api/reports/${id}`, { method:"DELETE" });
            toast("Удалено 🗑️");
          } else {
            const st = act === "approve" ? "APPROVED" : act === "reject" ? "REJECTED" : "PENDING";
            await api(`/api/reports/${id}/status`, { method:"PATCH", body: { status: st } });
            toast("Статус обновлён ✅");
          }
          await loadAll();
        }catch(e){
          toast("Ошибка: " + (e.code || "UPDATE"));
        }
      };
    });

  }catch(e){
    toast("Ошибка: " + (e.code || "LOAD_ALL"));
  }
}

// ====== AUTO REFRESH (ВАРИАНТ 1) ======
let allTimer = null;

function startAllAutoRefresh(){
  const u = getUser();
  if(u?.role !== "LOGIST") return;

  // если уже запущено — не запускаем снова
  if(allTimer) return;

  // сразу грузим
  loadAll();

  // каждые 3 секунды
  allTimer = setInterval(() => {
    // автообновление только если вкладка "Заявки" реально открыта
    const tab = document.querySelector(".tab.active")?.dataset?.tab;
    if(tab === "zayavki") loadAll();
  }, 3000);

  toast("Автообновление заявок: ВКЛ ✅");
}

function stopAllAutoRefresh(){
  if(allTimer){
    clearInterval(allTimer);
    allTimer = null;
    // не спамим тостами при каждом переключении, но можно оставить:
    // toast("Автообновление заявок: ВЫК");
  }
}

// ====== CREATE REPORT ======
async function createReport(){
  const truck = $("truck")?.value || "";
  const payload = {
    type: $("type")?.value || "ЗАГРУЗКА",
    from_city: $("from")?.value?.trim() || "",
    to_city: $("to")?.value?.trim() || "",
    cargo: $("cargo")?.value?.trim() || "",
    truck,
    trailer: currentTrailer(truck),
    km: Number($("km")?.value || 0) || 0,
    date_from: $("dateFrom")?.value || null,
    date_to: $("dateTo")?.value || null,
    score: calcScore(),
    note: $("note")?.value?.trim() || ""
  };

  try{
    await api("/api/reports", { method:"POST", body: payload });
    toast("Заявка отправлена ✅");
    if ($("note")) $("note").value = "";
    await loadMine();
    // если логист сидит в заявках — обновим сразу
    if(getUser()?.role === "LOGIST") await loadAll();
  }catch(e){
    toast("Ошибка: " + (e.code || "CREATE_REPORT"));
  }
}

// ====== AUTH ======
async function refreshMe(){
  const token = getToken();
  if(!token) return false;
  try{
    const me = await api("/api/me");
    setUser(me.user);
    return true;
  }catch{
    clearToken(); clearUser();
    return false;
  }
}

async function doLogin(){
  const login = $("loginLogin")?.value?.trim() || "";
  const password = $("loginPass")?.value || "";
  try{
    const r = await api("/api/auth/login", { method:"POST", body: { login, password } });
    setToken(r.token);
    setUser(r.user);
    toast("Вход ✅");
    await afterAuth();
  }catch(e){
    toast("Ошибка: " + (e.code || "LOGIN"));
  }
}

async function doRegister(){
  const nickname = $("regNick")?.value?.trim() || "";
  const email = $("regEmail")?.value?.trim() || "";
  const avatar_url = $("regAva")?.value?.trim() || "";
  const password = $("regPass")?.value || "";
  const role = $("regRole")?.value || "DRIVER";
  const logist_code = $("regLogistCode")?.value?.trim() || "";

  try{
    const r = await api("/api/auth/register", {
      method:"POST",
      body: { email, nickname, password, avatar_url, role, logist_code }
    });
    setToken(r.token);
    setUser(r.user);
    toast("Аккаунт создан ✅");
    await afterAuth();
  }catch(e){
    toast("Ошибка: " + (e.code || "REGISTER"));
  }
}

async function afterAuth(){
  renderHeader();
  renderProfile();
  showApp();
  setTab("anketa");

  if ($("trailerHint")) $("trailerHint").textContent = "Прицеп: " + currentTrailer($("truck")?.value || "");
  await loadMine();
  if(getUser()?.role === "LOGIST"){
    await loadAll();
  }
}

// ====== BIND UI ======
function bindUI(){
  // auth switch
  $("segLogin")?.addEventListener("click", () => {
    $("segLogin").classList.add("active");
    $("segReg").classList.remove("active");
    $("loginPane").classList.remove("hidden");
    $("regPane").classList.add("hidden");
  });
  $("segReg")?.addEventListener("click", () => {
    $("segReg").classList.add("active");
    $("segLogin").classList.remove("active");
    $("regPane").classList.remove("hidden");
    $("loginPane").classList.add("hidden");
  });

  // role -> logist code
  $("regRole")?.addEventListener("change", () => {
    const isLogist = $("regRole").value === "LOGIST";
    $("logistCodeWrap")?.classList.toggle("hidden", !isLogist);
  });
  $("regRole")?.dispatchEvent(new Event("change"));

  $("loginBtn")?.addEventListener("click", doLogin);
  $("regBtn")?.addEventListener("click", doRegister);

  $("logoutBtn")?.addEventListener("click", () => {
    clearToken(); clearUser();
    stopAllAutoRefresh();
    showAuth();
    toast("Вы вышли");
  });

  // tabs
  document.querySelectorAll(".tab").forEach(b=>{
    b.addEventListener("click", async () => {
      const name = b.dataset.tab;
      setTab(name);
      if(name === "profile") renderProfile();
      if(name === "anketa") await loadMine();
      if(name === "zayavki") await loadAll();
    });
  });

  // truck hint
  $("truck")?.addEventListener("change", () => {
    if ($("trailerHint")) $("trailerHint").textContent = "Прицеп: " + currentTrailer($("truck").value);
  });

  $("createBtn")?.addEventListener("click", createReport);

  // filters
  $("searchMine")?.addEventListener("input", loadMine);
  $("filterTypeMine")?.addEventListener("change", loadMine);
  $("filterStatusMine")?.addEventListener("change", loadMine);

  $("searchAll")?.addEventListener("input", loadAll);
  $("filterTypeAll")?.addEventListener("change", loadAll);
  $("filterStatusAll")?.addEventListener("change", loadAll);
  $("refreshAll")?.addEventListener("click", loadAll);
}

// ====== INIT ======
async function init(){
  bindUI();

  // быстрый тест: сервер жив?
  // (если хочешь — можно убрать)
  try { await api("/api/health"); } catch {}

  const ok = await refreshMe();
  if(ok){
    await afterAuth();
  }else{
    showAuth();
  }
}

init();
