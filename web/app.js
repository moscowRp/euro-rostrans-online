const API = (localStorage.getItem("api_base") || "http://localhost:8080").replace(/\/$/, "");

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

function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }

function toast(msg){
  $("toast").textContent = msg;
  show($("toast"));
  setTimeout(()=> hide($("toast")), 1800);
}

function roleName(r){
  return r === "LOGIST" ? "ЛОГИСТ" : "ВОДИТЕЛЬ";
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

function renderHeader(){
  const u = getUser();
  if(u){
    $("who").textContent = `${u.username} • роль: ${roleName(u.role)}`;
    show($("logoutBtn"));
  }else{
    $("who").textContent = "Не авторизован";
    hide($("logoutBtn"));
  }
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

async function doRegister(){
  const username = $("regUser").value.trim();
  const password = $("regPass").value;
  const role = $("regRole").value;

  try{
    const r = await api("/api/auth/register", {
      method:"POST",
      body: JSON.stringify({ username, password, role })
    });
    setToken(r.token);
    setUser(r.user);
    toast("Регистрация OK ✅");
    await afterAuth();
  }catch(e){
    toast("Ошибка: " + e.code);
  }
}

async function doLogin(){
  const username = $("logUser").value.trim();
  const password = $("logPass").value;

  try{
    const r = await api("/api/auth/login", {
      method:"POST",
      body: JSON.stringify({ username, password })
    });
    setToken(r.token);
    setUser(r.user);
    toast("Вход OK ✅");
    await afterAuth();
  }catch(e){
    toast("Ошибка: " + e.code);
  }
}

async function afterAuth(){
  renderHeader();
  hide($("authCard"));
  show($("appCard"));
  await loadReports();
  renderRoleUI();
}

function renderRoleUI(){
  const u = getUser();
  if(!u) return;
  $("roleNote").textContent = (u.role === "LOGIST")
    ? "Вы видите все отчёты и можете удалять."
    : "Вы видите только свои отчёты.";
}

async function createReport(){
  const u = getUser();
  if(!u) return;

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
    toast("Сохранено ✅");
    $("note").value = "";
    await loadReports();
  }catch(e){
    toast("Ошибка: " + e.code);
  }
}

async function loadReports(){
  const q = $("search").value.trim();
  const type = $("filterType").value;
  try{
    const res = await api(`/api/reports?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`);
    renderReports(res.reports || []);
  }catch(e){
    toast("Ошибка: " + e.code);
  }
}

function renderReports(reports){
  const u = getUser();
  const box = $("list");
  box.innerHTML = "";
  if(!reports.length){
    box.innerHTML = `<div class="muted">Нет данных</div>`;
    return;
  }

  for(const r of reports){
    const div = document.createElement("div");
    div.className = "item";
    const driverLine = r.driver_name ? `Водитель: <b>${r.driver_name}</b>` : "";
    div.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div class="row">
          <span class="badge">${r.type}</span>
          <span class="badge">⭐ ${(Number(r.score||0)).toFixed(1)}</span>
          <span class="muted">${driverLine}</span>
        </div>
        <div class="row" id="actions-${r.id}"></div>
      </div>
      <div style="margin-top:8px">
        <div>Маршрут: <b>${r.from_city} → ${r.to_city}</b></div>
        <div class="muted">Авто: ${r.truck || "—"} • Прицеп: ${r.trailer || "—"} • Км: ${r.km || 0}</div>
        <div class="muted">Дата: ${r.date_from || "—"} — ${r.date_to || "—"}</div>
        <div class="muted">Груз: ${r.cargo || "—"}</div>
        <div class="muted">Комм.: ${r.note || "—"}</div>
      </div>
    `;
    box.appendChild(div);

    const actions = div.querySelector(`#actions-${r.id}`);
    if(u?.role === "LOGIST"){
      const del = document.createElement("button");
      del.className = "btn";
      del.textContent = "🗑️ Удалить";
      del.onclick = async () => {
        if(!confirm("Удалить отчёт?")) return;
        try{
          await api(`/api/reports/${r.id}`, { method:"DELETE" });
          toast("Удалено 🗑️");
          await loadReports();
        }catch(e){
          toast("Ошибка: " + e.code);
        }
      };
      actions.appendChild(del);
    }
  }
}

async function init(){
  $("apiBase").value = API;
  $("saveApiBase").onclick = () => {
    localStorage.setItem("api_base", $("apiBase").value.trim());
    location.reload();
  };

  $("regBtn").onclick = doRegister;
  $("logBtn").onclick = doLogin;
  $("logoutBtn").onclick = () => {
    clearToken(); clearUser();
    location.reload();
  };

  $("createBtn").onclick = createReport;
  $("search").oninput = () => loadReports();
  $("filterType").onchange = () => loadReports();
  $("truck").onchange = () => {
    $("trailerHint").textContent = "Прицеп: " + currentTrailer($("truck").value);
  };

  const authed = await refreshMe();
  renderHeader();

  if(authed){
    hide($("authCard"));
    show($("appCard"));
    renderRoleUI();
    await loadReports();
  }else{
    show($("authCard"));
    hide($("appCard"));
  }
}

init();
