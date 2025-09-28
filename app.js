// =======================
// CONFIGURAÇÃO DO SUPABASE
// =======================
const SUPABASE_URL = "https://iballqwxsxkpltyustgj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliYWxscXd4c3hrcGx0eXVzdGdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwNTc2MzAsImV4cCI6MjA3NDYzMzYzMH0.Z4WKcwVS5FFfbtaaiyBI0p348_v00pOYDYTq_6bDgGE";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let expensesChart = null;

// =======================
// ELEMENTOS DO DOM
// =======================
const loginScreen = document.getElementById("login-screen");
const mainApp = document.getElementById("main-app");
const loginBtn = document.getElementById("login-btn");
const usernameInput = document.getElementById("username");
const currentUsername = document.getElementById("current-username");
const logoutBtn = document.getElementById("logout-btn");
const tabButtons = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");

const categorySliders = document.querySelectorAll(".category-slider");
const monthlyIncomeInput = document.getElementById("monthly-income");

const dashboardIncome = document.getElementById("dashboard-income");
const summaryBody = document.getElementById("summary-body");
const totalBudgetEl = document.getElementById("total-budget");
const totalSpentEl = document.getElementById("total-spent");
const totalRemainingEl = document.getElementById("total-remaining");
const totalUsedEl = document.getElementById("total-used");
const expensesGrid = document.getElementById("expenses-categories-grid");

// =======================
// LOGIN / LOGOUT
// =======================
loginBtn.addEventListener("click", async () => {
    const username = usernameInput.value.trim();
    if (!username) return alert("Digite um nome de usuário!");

    try {
        const { data: userData, error: userError } = await supabaseClient
            .from("Usuarios")
            .upsert({ username })
            .select()
            .single();

        if (userError) throw userError;

        currentUser = userData;
        showMainApp(username);
        await carregarConfiguracoes();
        await carregarGastos();
    } catch (err) {
        console.error(err);
        alert("Erro ao logar!");
    }
});

logoutBtn.addEventListener("click", () => {
    currentUser = null;
    showLogin();
    usernameInput.value = "";
    expensesGrid.innerHTML = "";
    if (expensesChart) expensesChart.destroy();
});

// =======================
// MOSTRAR TELAS
// =======================
function showMainApp(username) {
    loginScreen.classList.add("hidden");
    mainApp.classList.remove("hidden");
    currentUsername.innerText = username;
}

function showLogin() {
    loginScreen.classList.remove("hidden");
    mainApp.classList.add("hidden");
}

// =======================
// TROCA DE ABAS
// =======================
tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        const target = btn.dataset.tab;
        tabButtons.forEach(b => b.classList.remove("active"));
        tabContents.forEach(c => c.classList.remove("active"));

        btn.classList.add("active");
        document.getElementById(`tab-${target}`).classList.add("active");
    });
});

// =======================
// SLIDERS DE CATEGORIAS
// =======================
categorySliders.forEach(slider => {
    slider.addEventListener("input", atualizarValores);
});
monthlyIncomeInput.addEventListener("input", atualizarValores);

function atualizarValores() {
    const monthlyIncome = parseFloat(monthlyIncomeInput.value) || 0;
    categorySliders.forEach(slider => {
        const percentSpan = document.getElementById(`percent-${slider.id}`);
        const valueSpan = document.getElementById(`value-${slider.id}`);
        if(percentSpan) percentSpan.innerText = `${parseFloat(slider.value).toFixed(1)}%`;
        if(valueSpan) valueSpan.innerText = `R$ ${(monthlyIncome * slider.value / 100).toFixed(2)}`;
    });

    let total = 0;
    categorySliders.forEach(slider => total += parseFloat(slider.value));
    const totalPercent = document.getElementById("total-percentage");
    if(totalPercent) totalPercent.innerText = `${total.toFixed(1)}%`;

    dashboardIncome.innerText = `R$ ${monthlyIncome.toFixed(2)}`;
}

// =======================
// CONFIGURAÇÕES
// =======================
document.getElementById("save-config")?.addEventListener("click", salvarConfiguracao);
document.getElementById("load-config")?.addEventListener("click", carregarConfiguracoesPorNome);

async function salvarConfiguracao() {
    if (!currentUser) return alert("Usuário não logado!");

    const nome = document.getElementById("config-name")?.value.trim();
    if (!nome) return alert("Digite um nome para a configuração!");

    const config = {
        usuario_id: currentUser.id,
        nome,
        renda_mensal: parseFloat(monthlyIncomeInput.value) || 0,
    };

    categorySliders.forEach(slider => {
        config[slider.id] = parseFloat(slider.value);
    });

    try {
        const { error } = await supabaseClient.from("configuracoes").upsert(config);
        if (error) throw error;
        alert("Configuração salva!");
    } catch (err) {
        console.error(err);
        alert("Erro ao salvar configuração!");
    }
}

async function carregarConfiguracoesPorNome() {
    if (!currentUser) return;
    const nome = document.getElementById("load-name")?.value.trim();
    if (!nome) return alert("Digite o nome da configuração para carregar!");

    try {
        const { data, error } = await supabaseClient
            .from("configuracoes")
            .select("*")
            .eq("usuario_id", currentUser.id)
            .eq("nome", nome)
            .single();

        if (error) throw error;
        aplicarConfiguracao(data);
    } catch (err) {
        console.error(err);
        alert("Erro ao carregar configuração!");
    }
}

async function carregarConfiguracoes() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient
            .from("configuracoes")
            .select("*")
            .eq("usuario_id", currentUser.id)
            .order("id", { ascending: true })
            .limit(1);

        if (error) throw error;
        if (data.length > 0) aplicarConfiguracao(data[0]);
    } catch (err) {
        console.error(err);
    }
}

function aplicarConfiguracao(config) {
    monthlyIncomeInput.value = config.renda_mensal || 0;
    categorySliders.forEach(slider => {
        slider.value = config[slider.id] || 0;
    });
    atualizarValores();
}

// =======================
// GASTOS
// =======================
document.getElementById("add-expense")?.addEventListener("click", async () => {
    if (!currentUser) return;

    const categoria = document.getElementById("expense-category")?.value;
    const descricao = document.getElementById("expense-description")?.value.trim();
    const valor = parseFloat(document.getElementById("expense-amount")?.value) || 0;
    const mes_ano = document.getElementById("month-year")?.value;

    if (!descricao || valor <= 0) return alert("Preencha todos os campos corretamente!");

    const gasto = { usuario_id: currentUser.id, categoria, descricao, valor, mes_ano };

    try {
        const { error } = await supabaseClient.from("gastos").insert([gasto]);
        if (error) throw error;
        adicionarGastoNaTela(gasto);
        atualizarDashboard();
    } catch (err) {
        console.error(err);
        alert("Erro ao salvar gasto!");
    }

    document.getElementById("expense-description").value = "";
    document.getElementById("expense-amount").value = "";
});

async function carregarGastos() {
    if (!currentUser) return;
    const mes_ano = document.getElementById("month-year")?.value;

    try {
        const { data, error } = await supabaseClient
            .from("gastos")
            .select("*")
            .eq("usuario_id", currentUser.id)
            .eq("mes_ano", mes_ano);

        if (error) throw error;
        expensesGrid.innerHTML = "";
        data.forEach(adicionarGastoNaTela);
        atualizarDashboard(data);
    } catch (err) {
        console.error(err);
    }
}

function adicionarGastoNaTela(gasto) {
    const card = document.createElement("div");
    card.classList.add("expense-card", "card");
    card.innerHTML = `<div class="card__body"><strong>${gasto.categoria}</strong><br>${gasto.descricao} - R$ ${gasto.valor.toFixed(2)}</div>`;
    expensesGrid.appendChild(card);
}

document.getElementById("month-year")?.addEventListener("change", carregarGastos);

// =======================
// DASHBOARD - GRÁFICO E RESUMO
// =======================
function atualizarDashboard(gastos = []) {
    const categorias = ["custos-fixos","conforto","metas","prazeres","liberdade-financeira","conhecimento"];
    const categoriaNomes = {
        "custos-fixos":"Custos Fixos","conforto":"Conforto","metas":"Metas",
        "prazeres":"Prazeres","liberdade-financeira":"Liberdade Financeira","conhecimento":"Conhecimento"
    };

    const totalPorCategoria = {};
    categorias.forEach(c => totalPorCategoria[c]=0);
    gastos.forEach(g => { if(totalPorCategoria[g.categoria]!==undefined) totalPorCategoria[g.categoria]+=g.valor; });

    const totalGastos = Object.values(totalPorCategoria).reduce((a,b)=>a+b,0);
    const renda = parseFloat(monthlyIncomeInput.value) || 0;

    summaryBody.innerHTML = "";
    categorias.forEach(c=>{
        const gasto = totalPorCategoria[c];
        const valorCategoria = (renda * parseFloat(document.getElementById(c)?.value || 0)/100) || 0;
        const restante = valorCategoria - gasto;
        const usado = valorCategoria>0 ? (gasto/valorCategoria*100).toFixed(1) : 0;
        const row = document.createElement("tr");
        row.innerHTML = `<td>${categoriaNomes[c]}</td><td>R$ ${valorCategoria.toFixed(2)}</td><td>R$ ${gasto.toFixed(2)}</td><td>R$ ${restante.toFixed(2)}</td><td>${usado}%</td>`;
        summaryBody.appendChild(row);
    });

    totalBudgetEl.innerText = `R$ ${renda.toFixed(2)}`;
    totalSpentEl.innerText = `R$ ${totalGastos.toFixed(2)}`;
    totalRemainingEl.innerText = `R$ ${(renda-totalGastos).toFixed(2)}`;
    totalUsedEl.innerText = `${((totalGastos/renda)*100).toFixed(1)}%`;

    const ctx = document.getElementById("expenses-chart")?.getContext("2d");
    if(ctx){
        const data = {
            labels: categorias.map(c=>categoriaNomes[c]),
            datasets:[{
                label:"Gastos por Categoria",
                data: categorias.map(c=>totalPorCategoria[c]),
                backgroundColor:["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6","#1abc9c"]
            }]
        };
        if(expensesChart) expensesChart.destroy();
        expensesChart = new Chart(ctx,{ type:"pie", data, options:{ plugins:{ legend:{ display:true, position:"bottom" }}}});
    }
}

// =======================
// INICIALIZAÇÃO
// =======================
showLogin();
