
const API_BASE = ""; // base path; leave empty if same origin /api prefix set in server
const TOKEN = () => localStorage.getItem("token") || "";

// helpers
function authHeaders() {
  const t = TOKEN();
  return t ? { "Authorization": "Bearer " + t, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function el(id){ return document.getElementById(id); }
function setText(id, text){ const e=el(id); if(e) e.textContent=text; }

// UI state
let users = [];
let entities = []; // flattened tree nodes with {id,name,type,parent}
let permissions = [];
let selectedUser = null;
let selectedEntity = null;

// Init
document.addEventListener("DOMContentLoaded", init);

async function init(){
  // wire buttons
  el("btn-refresh-users").addEventListener("click", loadUsers);
  el("btn-refresh-entities").addEventListener("click", loadEntities);
  el("btn-refresh-perms").addEventListener("click", loadPermissions);
  el("btn-grant").addEventListener("click", grantPermission);
  el("btn-revoke").addEventListener("click", revokePermission);
  el("logout-btn").addEventListener("click", () => {
    localStorage.removeItem("token");
    location.reload();
  });

  // check admin
  try {
    const me = await fetchWithAuth("/me");
    if (!me.ok) {
      showAccessDenied("No autenticado. Acceso denegado.");
      return;
    }
    const meJson = await me.json();
    if (!meJson || meJson.role !== "admin") {
      showAccessDenied("Necesitas ser admin para acceder a este panel.");
      return;
    }
    setText("admin-status", `Conectado como: ${meJson.username} (admin)`);

    // load data
    await Promise.all([ loadUsers(), loadEntities(), loadPermissions() ]);

    // filter inputs
    el("filter-users").addEventListener("input", renderUsers);
    el("filter-entities").addEventListener("input", renderEntities);

  } catch (err) {
    console.error(err);
    showAccessDenied("Error comprobando permisos.");
  }
}

function showLoginForm(container, onSuccess) {

  const oldForm = document.getElementById("login-form");
  if (oldForm) oldForm.remove();

  const form = document.createElement("div");
  form.id = "login-form";

  form.innerHTML = `
    <h4>Iniciar sesión</h4>
    <input id="login-username" placeholder="Usuario" style="display:block;margin-bottom:5px;width:100%;">
    <input id="login-password" type="password" placeholder="Contraseña" style="display:block;margin-bottom:5px;width:100%;">
    <button id="login-submit" style="margin-right:5px;">Entrar</button>
    <button id="login-cancel">Cancelar</button>
  `;

  container.appendChild(form);

  const usernameInput = form.querySelector("#login-username");
  const passwordInput = form.querySelector("#login-password");
  const submitBtn = form.querySelector("#login-submit");
  const cancelBtn = form.querySelector("#login-cancel");

  async function handleLogin() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      alert("Por favor ingresa usuario y contraseña");
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        alert("Credenciales inválidas");
        return;
      }

      const data = await res.json();
      localStorage.setItem("token", data.auth_token);
      form.remove();
      alert("Sesión iniciada correctamente");
      onSuccess();
    } catch (err) {
      console.error("Error al iniciar sesión:", err);
      alert("Error al iniciar sesión");
    }
  }

  submitBtn.addEventListener("click", handleLogin);

  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLogin();
    }
  });

  cancelBtn.addEventListener("click", () => {
    form.remove();
  });
}
function showAccessDenied(msg){
  setText("admin-status", msg);
  // hide controls
  document.querySelectorAll("main, #users-list, #entities-tree, #permissions-list, #btn-grant, #btn-revoke").forEach(n => {
    if (n) n.style.display = "none";
  });
  // optionally show login button (if you have your login form function globally available)
  const loginBtn = document.createElement("button");
  loginBtn.textContent = "Iniciar sesión";
  loginBtn.className = "small btn-primary";
  loginBtn.style.marginTop = "8px";
  loginBtn.addEventListener("click", () => {
    // If you have a global showLoginForm(container, onSuccess) function available, call it:
    if (typeof showLoginForm === "function") {
      showLoginForm(document.getElementById("left-panel"), async () => { location.reload(); });
    }
  });
  el("left-panel").appendChild(loginBtn);
}

async function fetchWithAuth(path, opts = {}) {
  const headers = Object.assign({}, authHeaders(), opts.headers || {});
  return fetch(API_BASE + path, Object.assign({}, opts, { headers }));
}

// ---------- USERS ----------
async function loadUsers(){
  el("users-list").textContent = "Cargando usuarios...";
  try {
    // try common user endpoints
    let res = await fetchWithAuth("/admin/users");
    if (!res.ok) res = await fetchWithAuth("/users");
    if (!res.ok) res = await fetchWithAuth("/api/v1/users");
    if (!res.ok) throw new Error("No se pudo cargar la lista de usuarios (ajusta los endpoints)");

    users = await res.json();
    renderUsers();
  } catch (err) {
    console.error(err);
    el("users-list").textContent = "Error cargando usuarios.";
  }
}

function renderUsers(){
  const q = el("filter-users").value.trim().toLowerCase();
  const container = el("users-list");
  container.innerHTML = "";
  const list = users.filter(u => !q || (u.username && u.username.toLowerCase().includes(q)) || (u.email && u.email.toLowerCase().includes(q)));
  if (list.length === 0) {
    container.textContent = "No hay usuarios.";
    return;
  }
  list.forEach(u => {
    const item = document.createElement("div");
    item.className = "user-item";
    item.innerHTML = `<div><strong>${u.username || u.email || u.id}</strong><div class="muted" style="font-size:12px">${u.email || ""}</div></div>`;
    if (selectedUser && (selectedUser.id === u.id || selectedUser === u.id)) item.classList.add("selected");
    item.addEventListener("click", () => {
      selectedUser = u;
      setText("selected-user", `${u.username || u.email} (${u.id})`);
      // refresh permission list highlight maybe
      renderUsers();
    });
    container.appendChild(item);
  });
}

// ---------- ENTITIES (schools -> sectors -> blocks) ----------
async function loadEntities(){
  el("entities-tree").textContent = "Cargando entidades...";
  try {
    // Try a single tree endpoint first
    let res = await fetchWithAuth("/entities/tree");
    if (!res.ok) res = await fetchWithAuth("/api/v1/entities/tree");
    let data;
    if (res.ok) {
      data = await res.json();
      // flatten tree into nodes with path
      entities = flattenEntityTree(data);
    } else {
      // fallback: try /schools -> /schools/:id/sectors -> /sectors/:id/blocks
      entities = await fallbackLoadEntities();
    }
    renderEntities();
  } catch (err) {
    console.error(err);
    el("entities-tree").textContent = "Error cargando entidades.";
  }
}

function flattenEntityTree(tree) {
  // tree expected as array of schools { id,name, sectors:[{id,name,blocks:[...]}] }
  const out = [];
  (tree || []).forEach(s => {
    out.push({ id: s.id, name: s.name, type: "school", parent: null, path: s.name });
    (s.sectors || []).forEach(se => {
      out.push({ id: se.id, name: se.name, type: "sector", parent: s.id, path: s.name + " / " + se.name });
      (se.blocks || []).forEach(b => {
        out.push({ id: b.id, name: b.name, type: "block", parent: se.id, path: s.name + " / " + se.name + " / " + b.name });
      });
    });
  });
  return out;
}

async function fallbackLoadEntities(){
  const out = [];
  // attempt /schools
  let r = await fetchWithAuth("/schools");
  if (!r.ok) r = await fetchWithAuth("/api/v1/schools");
  if (!r.ok) throw new Error("No endpoints for schools found");
  const schools = await r.json();
  for (const s of schools) {
    out.push({ id: s.id, name: s.name, type: "school", parent: null, path: s.name });
    // sectors
    let rs = await fetchWithAuth(`/schools/${s.id}/sectors`);
    if (!rs.ok) rs = await fetchWithAuth(`/sectors?school_id=${s.id}`);
    if (rs.ok) {
      const sectors = await rs.json();
      for (const se of sectors) {
        out.push({ id: se.id, name: se.name, type: "sector", parent: s.id, path: `${s.name} / ${se.name}` });
        // blocks
        let rb = await fetchWithAuth(`/sectors/${se.id}/blocks`);
        if (!rb.ok) rb = await fetchWithAuth(`/blocks?sector_id=${se.id}`);
        if (rb.ok) {
          const blocks = await rb.json();
          for (const b of blocks) {
            out.push({ id: b.id, name: b.name, type: "block", parent: se.id, path: `${s.name} / ${se.name} / ${b.name}` });
          }
        }
      }
    }
  }
  return out;
}

function renderEntities(){
  const q = el("filter-entities").value.trim().toLowerCase();
  const container = el("entities-tree");
  container.innerHTML = "";
  const list = entities.filter(n => !q || (n.path && n.path.toLowerCase().includes(q)) || (n.name && n.name.toLowerCase().includes(q)));
  if (list.length === 0) {
    container.textContent = "No hay entidades.";
    return;
  }
  list.forEach(n => {
    const item = document.createElement("div");
    item.className = "entity-item";
    item.innerHTML = `<div><strong>[${n.type}]</strong> ${n.path || n.name}</div><div class="muted">${n.id}</div>`;
    if (selectedEntity && (selectedEntity.id === n.id || selectedEntity === n.id)) item.classList.add("selected");
    item.addEventListener("click", () => {
      selectedEntity = n;
      setText("selected-entity", `${n.type.toUpperCase()} — ${n.path || n.name} (${n.id})`);
      renderEntities();
    });
    container.appendChild(item);
  });
}

// ---------- PERMISSIONS ----------
async function loadPermissions(){
  el("permissions-list").textContent = "Cargando permisos...";
  try {
    const res = await fetchWithAuth("/permissions");
    if (!res.ok) throw new Error("No se pudo cargar permisos");
    const data = await res.json();
    // data may be array of { id, user_id, school_id, sector_id, block_id, can_edit }
    permissions = data;
    renderPermissions();
  } catch (err) {
    console.error(err);
    el("permissions-list").textContent = "Error cargando permisos.";
  }
}

function renderPermissions(){
  const container = el("permissions-list");
  container.innerHTML = "";
  if (!permissions || permissions.length === 0) {
    container.textContent = "No hay permisos asignados.";
    return;
  }
  permissions.forEach(p => {
    const item = document.createElement("div");
    item.className = "perm-item";
    const left = document.createElement("div");
    left.innerHTML = `<strong>${p.user_id}</strong><div class="muted" style="font-size:12px">${p.school_id ? "S:" + p.school_id : ""} ${p.sector_id ? " / SE:" + p.sector_id : ""} ${p.block_id ? " / B:" + p.block_id : ""}</div>`;
    const right = document.createElement("div");
    const btn = document.createElement("button");
    btn.className = "small btn-danger";
    btn.textContent = "Quitar";
    btn.addEventListener("click", async () => {
      if (!confirm("¿Quitar este permiso?")) return;
      try {
        const d = await fetchWithAuth(`/permissions/${p.id}`, { method: "DELETE" });
        if (!d.ok) {
          alert("Error al quitar permiso");
          return;
        }
        await loadPermissions();
      } catch (err) {
        console.error(err);
        alert("Error al quitar permiso");
      }
    });
    right.appendChild(btn);
    item.appendChild(left);
    item.appendChild(right);
    container.appendChild(item);
  });
}

// ---------- GRANT / REVOKE ----------
async function grantPermission(){
  if (!selectedUser) { alert("Selecciona un usuario"); return; }
  if (!selectedEntity) { alert("Selecciona una entidad"); return; }
  const payload = {
    user_id: selectedUser.id || selectedUser._id || selectedUser.id,
    school_id: selectedEntity.type === "school" ? selectedEntity.id : null,
    sector_id: selectedEntity.type === "sector" ? selectedEntity.id : null,
    block_id: selectedEntity.type === "block" ? selectedEntity.id : null,
    can_edit: true
  };
  try {
    const res = await fetchWithAuth("/permissions", { method: "POST", body: JSON.stringify(payload) });
    if (!res.ok) {
      const txt = await res.text();
      alert("Error asignando permiso: " + txt);
      return;
    }
    alert("Permiso asignado");
    await loadPermissions();
  } catch (err) {
    console.error(err);
    alert("Error asignando permiso");
  }
}

async function revokePermission(){
  if (!selectedUser) { alert("Selecciona un usuario"); return; }
  if (!selectedEntity) { alert("Selecciona una entidad"); return; }

  // try to find permission matching triples
  const match = permissions.find(p => p.user_id === (selectedUser.id || selectedUser._id) &&
    ((selectedEntity.type === "school" && p.school_id === selectedEntity.id) ||
     (selectedEntity.type === "sector" && p.sector_id === selectedEntity.id) ||
     (selectedEntity.type === "block" && p.block_id === selectedEntity.id))
  );
  if (!match) { alert("No hay permiso asignado para ese usuario y entidad."); return; }

  if (!confirm("¿Revoke permiso seleccionado?")) return;

  try {
    const d = await fetchWithAuth(`/permissions/${match.id}`, { method: "DELETE" });
    if (!d.ok) {
      alert("Error al quitar permiso");
      return;
    }
    await loadPermissions();
    alert("Permiso revocado");
  } catch (err) {
    console.error(err);
    alert("Error al revocar permiso");
  }
}
