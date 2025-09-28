// ==========================================================
// CONFIGURAÇÃO DO SUPABASE (REAL) E VARIÁVEIS GLOBAIS
// ==========================================================

// IMPORTANTE: Substitua pelas suas credenciais reais do Supabase
const SUPABASE_URL = "https://iballqwxsxkpltyustgj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliYWxscXd4c3hrcGx0eXVzdGdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwNTc2MzAsImV4cCI6MjA3NDYzMzYzMH0.Z4WKcwVS5FFfbtaaiyBI0p348_v00pOYDYTq_6bDgGE";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let chart = null;

// CORREÇÃO: A variável 'currentMonth' agora é inicializada globalmente.
let currentMonth = new Date().toISOString().slice(0, 7);

// Estrutura de dados padrão para novos usuários e estado local
let budgetData = {
    monthlyIncome: 0,
    percentages: {},
    expenses: {}
};

// Categorias padrão do aplicativo
const CATEGORIES = {
    'custos-fixos': 'Custos Fixos',
    'conforto': 'Conforto',
    'metas': 'Metas',
    'prazeres': 'Prazeres',
    'liberdade-financeira': 'Liberdade Financeira',
    'conhecimento': 'Conhecimento'
};

// ==========================================================
// FUNÇÕES DE AUTENTICAÇÃO E DADOS (SUPABASE)
// ==========================================================

async function loginUser(username) {
    showSpinner(true);
    try {
        let { data: user, error } = await supabaseClient
            .from('Usuarios')
            .select('*')
            .eq('username', username)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (user) {
            showLoginMessage('Login realizado com sucesso!', 'success');
        } else {
            console.log(`Criando novo usuário: ${username}`);
            // Usa uma estrutura de dados inicial limpa
            const defaultData = {
                monthlyIncome: 0,
                percentages: {},
                expenses: {},
                currentMonth: new Date().toISOString().slice(0, 7)
            };
            const { data: newUser, error: insertError } = await supabaseClient
                .from('Usuarios')
                .insert({ username: username, dados_orcamento: defaultData })
                .select()
                .single();
            if (insertError) throw insertError;
            user = newUser;
            showLoginMessage('Conta criada com sucesso!', 'success');
        }

        currentUser = user;
        loadUserDataFromCloud(user);
        showMainApp();

    } catch (err) {
        console.error("Erro no login:", err);
        showLoginMessage(`Erro: ${err.message}`, 'error');
    } finally {
        showSpinner(false);
    }
}

function loadUserDataFromCloud(user) {
    console.log('📥 Carregando dados do usuário da nuvem...');
    budgetData = user.dados_orcamento || { monthlyIncome: 0, percentages: {}, expenses: {} };
    // CORREÇÃO: Atualiza a variável global 'currentMonth' com os dados do usuário
    currentMonth = budgetData.currentMonth || new Date().toISOString().slice(0, 7);
    console.log('✅ Dados carregados da nuvem.');
}

async function saveUserData() {
    if (!currentUser) return;
    setSyncStatus('Salvando...');
    
    // Garante que o mês atual seja salvo junto com os outros dados
    budgetData.currentMonth = currentMonth;

    const { error } = await supabaseClient
        .from('Usuarios')
        .update({ dados_orcamento: budgetData })
        .eq('id', currentUser.id);

    if (error) {
        console.error("Erro ao salvar:", error);
        setSyncStatus('Erro ao salvar');
    } else {
        console.log("Dados salvos na nuvem!");
        setSyncStatus('Sincronizado');
    }
}


// ==========================================================
// LÓGICA DA INTERFACE (UI) - (sem grandes alterações)
// ==========================================================

function showMainApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('current-username').textContent = currentUser.username;
    renderAll();
}

function logout() {
    currentUser = null;
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('username').value = '';
}

function renderAll() {
    populateMonthSelector();
    renderCategorySliders();
    renderExpenseCategoryDropdown();
    updateDashboard();
    renderExpensesList();
}

function updateDashboard() {
    const monthlyIncome = budgetData.monthlyIncome || 0;
    const expensesForMonth = budgetData.expenses[currentMonth] || [];
    
    document.getElementById('dashboard-income').textContent = formatCurrency(monthlyIncome);
    
    updateSummaryTable(monthlyIncome, expensesForMonth);
    updateChart(expensesForMonth);
}

function updateSummaryTable(income, expenses) {
    const summaryBody = document.getElementById('summary-body');
    const tfoot = document.querySelector('#budget-summary tfoot');
    summaryBody.innerHTML = '';
    
    let totalBudgeted = 0;
    let totalSpent = 0;
    
    for (const id in CATEGORIES) {
        const percentage = budgetData.percentages[id] || 0;
        const budgeted = income * (percentage / 100);
        const spent = expenses
            .filter(e => e.category === id)
            .reduce((sum, e) => sum + e.amount, 0);
        
        totalBudgeted += budgeted;
        totalSpent += spent;
        
        const row = `
            <tr>
                <td>${CATEGORIES[id]}</td>
                <td>${formatCurrency(budgeted)}</td>
                <td>${formatCurrency(spent)}</td>
                <td>${formatCurrency(budgeted - spent)}</td>
                <td>${budgeted > 0 ? ((spent / budgeted) * 100).toFixed(1) : 0}%</td>
            </tr>
        `;
        summaryBody.innerHTML += row;
    }
    
    // Atualiza os totais no rodapé
    tfoot.querySelector('#total-budget').textContent = formatCurrency(totalBudgeted);
    tfoot.querySelector('#total-spent').textContent = formatCurrency(totalSpent);
    tfoot.querySelector('#total-remaining').textContent = formatCurrency(totalBudgeted - totalSpent);
    tfoot.querySelector('#total-used').textContent = totalBudgeted > 0 ? `${((totalSpent / totalBudgeted) * 100).toFixed(1)}%` : '0%';
}


function updateChart(expenses) {
    const ctx = document.getElementById('expenses-chart').getContext('2d');
    const data = {
        labels: Object.values(CATEGORIES),
        datasets: [{
            data: Object.keys(CATEGORIES).map(id => 
                expenses.filter(e => e.category === id).reduce((sum, e) => sum + e.amount, 0)
            ),
            backgroundColor: ['#007bff', '#6c757d', '#28a745', '#dc3545', '#ffc107', '#17a2b8']
        }]
    };

    if (chart) chart.destroy();
    chart = new Chart(ctx, { type: 'doughnut', data: data, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
}


function renderCategorySliders() {
    const container = document.getElementById('category-sliders-container');
    container.innerHTML = '';
    for (const id in CATEGORIES) {
        const value = budgetData.percentages[id] || 0;
        const sliderHTML = `
            <div class="card slider-card">
                <div class="card__body">
                    <label for="slider-${id}">${CATEGORIES[id]}</label>
                    <input type="range" id="slider-${id}" min="0" max="100" value="${value}" data-category="${id}">
                    <div class="percentage">${value}%</div>
                </div>
            </div>
        `;
        container.innerHTML += sliderHTML;
    }
}

function renderExpenseCategoryDropdown() {
    const select = document.getElementById('expense-category');
    select.innerHTML = '';
    for (const id in CATEGORIES) {
        select.innerHTML += `<option value="${id}">${CATEGORIES[id]}</option>`;
    }
}

function renderExpensesList() {
    document.getElementById('current-month-label').textContent = currentMonth;
    const container = document.getElementById('expenses-list-container');
    container.innerHTML = '';

    const expensesForMonth = budgetData.expenses[currentMonth] || [];
    if (expensesForMonth.length === 0) {
        container.innerHTML = '<p>Nenhum gasto neste mês.</p>';
        return;
    }

    expensesForMonth.forEach(expense => {
        const item = `
            <div class="expense-item">
                <div>
                    <span>${expense.description}</span>
                    <span class="category">${CATEGORIES[expense.category]}</span>
                </div>
                <span>${formatCurrency(expense.amount)}</span>
            </div>
        `;
        container.innerHTML += item;
    });
}

// ==========================================================
// HELPERS E EVENT LISTENERS
// ==========================================================

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const showSpinner = (show) => document.getElementById('login-spinner').classList.toggle('hidden', !show);
const showLoginMessage = (msg, type) => {
    const el = document.getElementById('login-message');
    el.textContent = msg;
    el.className = `login-message ${type}`;
    el.classList.remove('hidden');
};
const setSyncStatus = (status) => document.getElementById('sync-indicator').textContent = status;

function populateMonthSelector() {
    const select = document.getElementById('month-year');
    const year = new Date().getFullYear();
    select.innerHTML = '';
    for (let i = 1; i <= 12; i++) {
        const month = i.toString().padStart(2, '0');
        const value = `${year}-${month}`;
        const label = new Date(year, i - 1).toLocaleString('pt-BR', { month: 'long' });
        select.innerHTML += `<option value="${value}">${label.charAt(0).toUpperCase() + label.slice(1)} ${year}</option>`;
    }
    // CORREÇÃO: Usa a variável global 'currentMonth' que agora está sempre definida
    select.value = currentMonth;
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-btn').addEventListener('click', () => {
        const username = document.getElementById('username').value.trim();
        if (username) loginUser(username);
    });
    
    document.getElementById('logout-btn').addEventListener('click', logout);

    document.querySelector('.tabs-navigation').addEventListener('click', (e) => {
        if (e.target.matches('.tab-button')) {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(`tab-${e.target.dataset.tab}`).classList.add('active');
        }
    });

    document.getElementById('monthly-income').addEventListener('change', (e) => {
        budgetData.monthlyIncome = parseFloat(e.target.value) || 0;
        updateDashboard();
        saveUserData();
    });

    document.getElementById('category-sliders-container').addEventListener('input', (e) => {
        if (e.target.matches('input[type="range"]')) {
            const categoryId = e.target.dataset.category;
            const value = parseFloat(e.target.value);
            budgetData.percentages[categoryId] = value;
            e.target.nextElementSibling.textContent = `${value}%`;
            updateDashboard();
            saveUserData();
        }
    });

    document.getElementById('add-expense').addEventListener('click', () => {
        const description = document.getElementById('expense-description').value.trim();
        const amount = parseFloat(document.getElementById('expense-amount').value);
        const category = document.getElementById('expense-category').value;

        if (!description || !amount) return alert('Preencha a descrição e o valor.');

        if (!budgetData.expenses[currentMonth]) {
            budgetData.expenses[currentMonth] = [];
        }
        budgetData.expenses[currentMonth].push({ description, amount, category });
        
        renderExpensesList();
        updateDashboard();
        saveUserData();

        document.getElementById('expense-description').value = '';
        document.getElementById('expense-amount').value = '';
    });

    document.getElementById('month-year').addEventListener('change', (e) => {
        currentMonth = e.target.value; // Atualiza a variável global
        updateDashboard();
        renderExpensesList();
        saveUserData(); // Salva a mudança de mês
    });
});
