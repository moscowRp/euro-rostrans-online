const API = ""; // same domain (Render all-in-one)

const $ = (id) => document.getElementById(id);

function setToken(t){ localStorage.setItem("token", t); }
function getToken(){ return localStorage.getItem("token"); }
function clearToken(){ localStorage.removeItem("token"); }

function setUser(u){ localStorage.setItem("user", JSON.stringify(u)); }
function getUser(){ try{ return JSON.parse(localStorage.getItem("user")||"null"); }catch{ return null; } }
function clearUser(){ localStorage.removeItem("user"); }

async function api(path, opts = {}){
  const headers = { "Content-Type": "application/json", ...(opts.headers||{}) };
  const token = getToken();
  if(token) headers.Authorization = "Bearer " + token;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok){
    const err = new Error(data.error || "API_ERROR");
    err.code = data.error || "API_ERROR";
    throw err;
  }
  return data;
}

let toastTimer = null;
function toast(msg){
  const t = $("toast");
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
  const r = Number($("road").value || 0);
  const c = Number($("client").value || 0);
  const m = Number($("route").value || 0);
  const arr = [r,c,m].filter(x => x>=1 && x<=5);
  if(!arr.length) return 0;
  return Math.round((arr.reduce((a,b)=>a+b,0)/arr.length)*10)/10;
}

function showApp(){
  $("authScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
}
function showAuth(){
  $("authScreen").classList.remove("hidden");
  $("app").classList.add("hidden");
}

function renderHeader(){
  const u = getUser();
  $("who").textContent = u ? `${u.nickname} • ${u.email} • ${roleText(u.role)}` : "—";
  $("zayavkiTab").classList.toggle("hidden", u?.role !== "LOGIST");
}

function setTab(name){
  document.querySelectorAll(".tab").forEach(b=>{
    b.classList.toggle("active", b.dataset.tab === name);
  });
  ["anketa","zayavki","profile"].forEach(t=>{
    $("tab-"+t).classList.toggle("hidden", t !== name);
  });
}

function renderProfile(){
  const u = getUser();
  const fallback = "data:image/svg+xml;base64," + btoa(`<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'><rect width='100%' height='100%' fill='#111827'/><text x='50%' y='55%' font-size='52' text-anchor='middle' fill='#ff7a00' font-family='Arial'>${(u?.nickname||"U").slice(0,1).toUpperCase()}</text></svg>`);
  $("pAva").src = (u?.avatar_url && u.avatar_url.startsWith("http")) ? u.avatar_url : fallback;
  $("pNick").textContent = u?.nickname || "—";
  $("pEmail").textContent = u?.email || "—";
  $("pRole").textContent = "Роль: " + roleText(u?.role);
}

function itemHtml(r, forLogist){
  const badges = `
    <span class="badge ${statusClass(r.status)}">📋 ${statusText(r.status)}</span>
    <span class="badge">🧾 ${r.type}</span>
    <span class="badge">⭐ ${(Number(r.score||0)).toFixed(1)}</span>
  `;
  const driver = forLogist ? `
    <div class="muted small" style="margin-top:6px;">
      Водитель: <b>${r.driver_nick}</b> • ${r.driver_email}
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

async function loadMine(){
  const q = $("searchMine").value.trim();
  const type = $("filterTypeMine").value;
  const status = $("filterStatusMine").value;
  const res = await api(`/api/reports?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}`);
  const box = $("mineList");
  box.innerHTML = "";
  if(!res.reports?.length){
    box.innerHTML = `<div class="muted small">Нет заявок</div>`;
    return;
  }
  box.innerHTML = res.reports.map(r => itemHtml(r, false)).join("");
}

async function loadAll(){
  const q = $("searchAll").value.trim();
  const type = $("filterTypeAll").value;
  const status = $("filterStatusAll").value;
  const res = await api(`/api/reports?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}`);
  const box = $("allList");
  box.innerHTML = "";
  if(!res.reports?.length){
    box.innerHTML = `<div class="muted small">Нет заявок</div>`;
    return;
  }
  box.innerHTML = res.reports.map(r => itemHtml(r, true)).join("");

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
          await api(`/api/reports/${id}/status`, { method:"PATCH", body: JSON.stringify({ status: st }) });
          toast("Статус обновлён ✅");
        }
        await loadAll();
      }catch(e){
        toast("Ошибка: " + e.code);
      }
    };
  });
}

async function createReport(){
  const truck = $("truck").value;
  const payload = {
    type: $("type").value,
    from_city: $("from").value.trim(),
    to_city: $("to").value.trim(),
    cargo: $("cargo").value.trim(),
    truck,
    trailer: currentTrailer(truck),
    km: Number($("km").value || 0) || 0,
    date_from: $("dateFrom").value || null,
    date_to: $("dateTo").value || null,
    score: calcScore(),
    note: $("note").value.trim()
  };

  try{
    await api("/api/reports", { method:"POST", body: JSON.stringify(payload) });
    toast("Заявка отправлена ✅");
    $("note").value = "";
    await loadMine();
    const u = getUser();
    if(u?.role === "LOGIST") await loadAll();
  }catch(e){
    toast("Ошибка: " + e.code);
  }
}

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
  const login = $("loginLogin").value.trim();
  const password = $("loginPass").value;
  try{
    const r = await api("/api/auth/login", { method:"POST", body: JSON.stringify({ login, password }) });
    setToken(r.token);
    setUser(r.user);
    toast("Вход ✅");
    await afterAuth();
  }catch(e){
    toast("Ошибка: " + e.code);
  }
}

async function doRegister(){
  const nickname = $("regNick").value.trim();
  const email = $("regEmail").value.trim();
  const avatar_url = $("regAva").value.trim();
  const password = $("regPass").value;
  const role = $("regRole").value;
  const logist_code = $("regLogistCode").value.trim();

  try{
    const r = await api("/api/auth/register", {
      method:"POST",
      body: JSON.stringify({ email, nickname, password, avatar_url, role, logist_code })
    });
    setToken(r.token);
    setUser(r.user);
    toast("Аккаунт создан ✅");
    await afterAuth();
  }catch(e){
    toast("Ошибка: " + e.code);
  }
}

async function afterAuth(){
  renderHeader();
  renderProfile();
  showApp();
  setTab("anketa");

  $("trailerHint").textContent = "Прицеп: " + currentTrailer($("truck").value);
  await loadMine();
  const u = getUser();
  if(u?.role === "LOGIST"){ await loadAll(); }
}

function bindUI(){
  $("segLogin").onclick = () => {
    $("segLogin").classList.add("active");
    $("segReg").classList.remove("active");
    $("loginPane").classList.remove("hidden");
    $("regPane").classList.add("hidden");
  };
  $("segReg").onclick = () => {
    $("segReg").classList.add("active");
    $("segLogin").classList.remove("active");
    $("regPane").classList.remove("hidden");
    $("loginPane").classList.add("hidden");
  };

  $("regRole").onchange = () => {
    const isLogist = $("regRole").value === "LOGIST";
    $("logistCodeWrap").classList.toggle("hidden", !isLogist);
  };
  $("regRole").dispatchEvent(new Event("change"));

  $("loginBtn").onclick = doLogin;
  $("regBtn").onclick = doRegister;

  $("logoutBtn").onclick = () => {
    clearToken(); clearUser();
    showAuth();
    toast("Вы вышли");
  };

  document.querySelectorAll(".tab").forEach(b=>{
    b.onclick = async () => {
      const name = b.dataset.tab;
      setTab(name);
      if(name === "profile") renderProfile();
      if(name === "anketa") await loadMine();
      if(name === "zayavki") await loadAll();
    };
  });

  $("truck").onchange = () => $("trailerHint").textContent = "Прицеп: " + currentTrailer($("truck").value);
  $("createBtn").onclick = createReport;

  $("searchMine").oninput = () => loadMine();
  $("filterTypeMine").onchange = () => loadMine();
  $("filterStatusMine").onchange = () => loadMine();

  $("searchAll").oninput = () => loadAll();
  $("filterTypeAll").onchange = () => loadAll();
  $("filterStatusAll").onchange = () => loadAll();
  $("refreshAll").onclick = () => loadAll();
}

async function init(){
  bindUI();
  const ok = await refreshMe();
  if(ok) await afterAuth();
  else showAuth();
}

init();
