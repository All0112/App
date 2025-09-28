// ==========================================================
// CONFIGURAÇÃO DO SUPABASE (REAL) E VARIÁVEIS GLOBAIS
// ==========================================================

// IMPORTANTE: Substitua pelas suas credenciais reais do Supabase
const SUPABASE_URL = "https://iballqwxsxkpltyustgj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliYWxscXd4c3hrcGx0eXVzdGdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwNTc2MzAsImV4cCI6MjA3NDYzMzYzMH0.Z4WKcwVS5FFfbtaaiyBI0p348_v00pOYDYTq_6bDgGE";

// A variável `supabase` vem do script carregado no HTML
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null; // Armazenará o objeto do usuário logado
let isSyncing = false;

// Variáveis Globais (com estado inicial limpo)
let monthlyIncome = 0;
// Pega o mês e ano atual no formato 'YYYY-MM'
let currentMonth = new Date().toISOString().slice(0, 7);
let chart = null;
let percentages = {};
let expenses = {};
let savedConfigurations = {};
let nextExpenseId = 1;

// Configurações visuais e de categorias
const categories = {
    'custos-fixos': { name: 'Custos fixos', color: '#1FB8CD' },
    'conforto': { name: 'Conforto', color: '#FFC185' },
    'metas': { name: 'Metas', color: '#B4413C' },
    'prazeres': { name: 'Prazeres', color: '#ECEBD5' },
    'liberdade-financeira': { name: 'Liberdade Financeira', color: '#5D878F' },
    'conhecimento': { name: 'Conhecimento', color: '#DB4545' }
};
const chartColors = Object.values(categories).map(c => c.color);
const expenseTypeIcons = {
    'unica': '🔹',
    'fixa': '🔸',
    'parcelada': '🔺'
};


// ==========================================================
// FUNÇÕES DE AUTENTICAÇÃO E DADOS (SUPABASE REAL)
// ==========================================================

async function loginUser(username) {
    try {
        setSyncStatus('syncing', '🔄 Conectando...');

        // Procura se o usuário já existe
        let { data: userData, error: selectError } = await supabaseClient
            .from('Usuarios')
            .select('*')
            .eq('username', username)
            .single();

        // Se o erro não for "usuário não encontrado", algo deu errado
        if (selectError && selectError.code !== 'PGRST116') {
            throw selectError;
        }

        if (userData) {
            console.log('👤 Usuário existente encontrado');
            showLoginMessage('Login realizado com sucesso!', 'success');
        } else {
            console.log('👤 Criando novo usuário...');
            // Cria um novo usuário com dados padrão (vazios)
            const defaultData = {
                monthlyIncome: 0,
                percentages: {},
                gastosPorMes: {},
                savedConfigurations: {},
                currentMonth: new Date().toISOString().slice(0, 7),
            };

            const { data: newUser, error: insertError } = await supabaseClient
                .from('Usuarios')
                .insert([{
                    username: username,
                    dados_orcamento: defaultData
                }])
                .select()
                .single();

            if (insertError) throw insertError;
            userData = newUser;
            showLoginMessage('Conta criada e login realizado com sucesso!', 'success');
        }

        currentUser = userData; // Armazena o objeto completo do usuário
        await loadUserDataFromCloud(userData);
        showMainApp();
        setSyncStatus('synced', '✅ Sincronizado');
        return true;

    } catch (error) {
        console.error('❌ Erro no login:', error);
        setSyncStatus('error', '❌ Erro de conexão');
        showLoginMessage('Erro ao fazer login: ' + error.message, 'error');
        return false;
    }
}

async function loadUserDataFromCloud(userData) {
    try {
        console.log('📥 Carregando dados do usuário da nuvem...');
        const dadosOrcamento = userData.dados_orcamento || {};

        // Carrega os dados com valores padrão caso não existam
        monthlyIncome = dadosOrcamento.monthlyIncome || 0;
        percentages = dadosOrcamento.percentages || {};
        expenses = dadosOrcamento.gastosPorMes || {};
        savedConfigurations = dadosOrcamento.savedConfigurations || {};
        currentMonth = dadosOrcamento.currentMonth || new Date().toISOString().slice(0, 7);

        // Calcula o próximo ID de despesa para evitar conflitos
        let maxId = 0;
        Object.values(expenses).forEach(monthExpenses => {
            monthExpenses.forEach(expense => {
                if (expense.id > maxId) maxId = expense.id;
            });
        });
        nextExpenseId = maxId + 1;
        console.log('✅ Dados carregados da nuvem.');
    } catch (error) {
        console.error('❌ Erro ao carregar dados:', error);
        console.log('🔄 Usando dados padrão devido ao erro');
    }
}

async function saveUserDataToCloud() {
    if (!supabaseClient || !currentUser || isSyncing) return false;

    try {
        isSyncing = true;
        setSyncStatus('syncing', '🔄 Salvando...');

        const dadosOrcamento = {
            monthlyIncome,
            percentages,
            gastosPorMes: expenses,
            savedConfigurations,
            currentMonth,
        };

        const { error } = await supabaseClient
            .from('Usuarios')
            .update({ dados_orcamento: dadosOrcamento })
            .eq('id', currentUser.id); // Salva usando o ID do usuário, que é mais seguro

        if (error) throw error;

        console.log('💾 Dados salvos na nuvem com sucesso');
        setSyncStatus('synced', '✅ Salvo');

        setTimeout(() => {
            if (!isSyncing) setSyncStatus('synced', '');
        }, 2000);
        return true;

    } catch (error) {
        console.error('❌ Erro ao salvar dados:', error);
        setSyncStatus('error', '❌ Erro ao salvar');
        return false;
    } finally {
        isSyncing = false;
    }
}

// ==========================================================
// O RESTANTE DO CÓDIGO (Lógica da UI) - (permanece quase o mesmo)
// ==========================================================

// AUTO-SAVE FUNCTIONALITY
function scheduleAutoSave() {
    clearTimeout(window.autoSaveTimeout);
    window.autoSaveTimeout = setTimeout(async () => {
        if (currentUser) await saveUserDataToCloud();
    }, 1500);
}

// LOGIN/LOGOUT UI FUNCTIONS
function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    const usernameEl = document.getElementById('current-username');
    if (usernameEl && currentUser) {
        usernameEl.textContent = currentUser.username;
    }
    updateAllDisplays();
}

function showLoginMessage(message, type = 'info') {
    const messageEl = document.getElementById('login-message');
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.className = `login-message ${type}`;
        messageEl.classList.remove('hidden');
    }
}

function hideLoginMessage() {
    const messageEl = document.getElementById('login-message');
    if (messageEl) messageEl.classList.add('hidden');
}

function setSyncStatus(status, text) {
    const syncEl = document.getElementById('sync-indicator');
    if (syncEl) {
        syncEl.textContent = text;
        syncEl.className = `sync-indicator ${status}`;
    }
}

function logout() {
    currentUser = null;
    showLoginScreen();
    hideLoginMessage();
    setSyncStatus('', '');
    console.log('👋 Usuário desconectado');
}

// LOGIN EVENT HANDLERS
function setupLoginHandlers() {
    const loginBtn = document.getElementById('login-btn');
    const usernameInput = document.getElementById('username');
    const logoutBtn = document.getElementById('logout-btn');

    if (loginBtn && usernameInput) {
        loginBtn.addEventListener('click', async () => {
            const username = usernameInput.value.trim();
            if (!username) {
                showLoginMessage('Por favor, digite um nome de usuário', 'error');
                return;
            }
            const btnText = document.getElementById('login-btn-text');
            const spinner = document.getElementById('login-spinner');
            if (btnText) btnText.classList.add('hidden');
            if (spinner) spinner.classList.remove('hidden');
            loginBtn.disabled = true;

            const success = await loginUser(username);

            if (btnText) btnText.classList.remove('hidden');
            if (spinner) spinner.classList.add('hidden');
            loginBtn.disabled = false;
            if (success) usernameInput.value = '';
        });
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loginBtn.click();
        });
        usernameInput.addEventListener('input', hideLoginMessage);
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja sair?')) {
                logout();
            }
        });
    }
}

// Utility functions
function formatCurrency(amount) {
    return (amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatPercentage(percentage) {
    return `${(percentage || 0).toFixed(1).replace('.', ',')}%`;
}

// SISTEMA DE ABAS FUNCIONAL
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            this.classList.add('active');
            const targetContent = document.getElementById(`tab-${targetTab}`);
            if (targetContent) targetContent.classList.add('active');
            updateTabContent(targetTab);
        });
    });
}

function updateTabContent(targetTab) {
    switch(targetTab) {
        case 'dashboard':
            setTimeout(updateDashboard, 100);
            break;
        case 'configurar':
            updatePercentageDisplays();
            updateAmounts();
            updateTotalPercentage();
            break;
        case 'gastos':
            updateExpensesCategoriesGrid();
            break;
    }
}

// Dashboard Functions
function updateDashboard() {
    updateIncomeDisplay();
    updateChart();
    updateSummaryTable();
    updateGoalsList();
    updateCategoryDetails();
}

function updateIncomeDisplay() {
    const incomeElement = document.getElementById('dashboard-income');
    if (incomeElement) incomeElement.textContent = formatCurrency(monthlyIncome);
}

function getExpensesForMonth(month = currentMonth) {
    return expenses[month] || [];
}

function getTotalSpentByCategory(month = currentMonth) {
    const monthExpenses = getExpensesForMonth(month);
    const totals = {};
    Object.keys(categories).forEach(cat => { totals[cat] = 0; });
    monthExpenses.forEach(expense => {
        if (totals[expense.category] !== undefined) {
            totals[expense.category] += expense.amount;
        }
    });
    return totals;
}

function updateChart() {
    const ctx = document.getElementById('expenses-chart');
    if (!ctx) return;
    const spentByCategory = getTotalSpentByCategory();
    const data = Object.keys(categories).map(cat => spentByCategory[cat] || 0);
    const labels = Object.keys(categories).map(cat => categories[cat].name);

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: chartColors, borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
    updateChartLegend(labels, chartColors, data);
}

function updateChartLegend(labels, colors, data) {
    const legendContainer = document.getElementById('chart-legend');
    if (!legendContainer) return;
    legendContainer.innerHTML = labels.map((label, index) => `
        <div class="legend-item">
            <div class="legend-color" style="background-color: ${colors[index]}"></div>
            <span>${label}: ${formatCurrency(data[index])}</span>
        </div>
    `).join('');
}

function updateSummaryTable() {
    const tbody = document.getElementById('summary-body');
    if (!tbody) return;
    const spentByCategory = getTotalSpentByCategory();
    let totalBudget = 0;
    let totalSpent = 0;

    tbody.innerHTML = Object.keys(categories).map(catId => {
        const budget = (monthlyIncome * (percentages[catId] || 0)) / 100;
        const spent = spentByCategory[catId] || 0;
        const remaining = budget - spent;
        const usedPercent = budget > 0 ? (spent / budget) * 100 : 0;
        totalBudget += budget;
        totalSpent += spent;
        let usageClass = usedPercent > 100 ? 'usage-over' : (usedPercent > 80 ? 'usage-warning' : 'usage-good');
        return `
            <tr>
                <td>${categories[catId].name}</td>
                <td>${formatCurrency(budget)}</td>
                <td>${formatCurrency(spent)}</td>
                <td>${formatCurrency(remaining)}</td>
                <td><span class="usage-indicator ${usageClass}">${formatPercentage(usedPercent)}</span></td>
            </tr>
        `;
    }).join('');

    const totalRemaining = totalBudget - totalSpent;
    const totalUsedPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    document.getElementById('total-budget').textContent = formatCurrency(totalBudget);
    document.getElementById('total-spent').textContent = formatCurrency(totalSpent);
    document.getElementById('total-remaining').textContent = formatCurrency(totalRemaining);
    document.getElementById('total-used').textContent = formatPercentage(totalUsedPercent);
}

function updateGoalsList() {
    const goalsList = document.getElementById('goals-list');
    if (!goalsList) return;
    goalsList.innerHTML = Object.keys(categories).map(catId => `
        <div class="goal-item">
            <span class="goal-category">${categories[catId].name}</span>
            <span class="goal-percentage">${formatPercentage(percentages[catId] || 0)}</span>
        </div>
    `).join('');
}

function updateCategoryDetails() {
    const grid = document.getElementById('category-details-grid');
    if (!grid) return;
    const monthExpenses = getExpensesForMonth();
    grid.innerHTML = Object.keys(categories).map(catId => {
        const categoryExpenses = monthExpenses.filter(expense => expense.category === catId);
        const expensesList = categoryExpenses.length > 0 ?
            categoryExpenses.map(expense => `
                <div class="expense-item">
                    <div class="expense-description">
                        <span class="expense-type-icon">${expenseTypeIcons[expense.type] || '🔹'}</span>
                        <span>${expense.description}</span>
                    </div>
                    <span class="expense-amount">${formatCurrency(expense.amount)}</span>
                </div>
            `).join('') : '<div class="no-expenses">Nenhum gasto registrado</div>';
        return `
            <div class="card category-detail-card">
                <div class="card__body">
                    <div class="category-detail-header">
                        <div class="category-detail-color" style="background-color: ${categories[catId].color}"></div>
                        <h4 class="category-detail-title">${categories[catId].name}</h4>
                    </div>
                    <div class="expense-list">${expensesList}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Expenses Management
function addExpense() {
    const category = document.getElementById('expense-category').value;
    const description = document.getElementById('expense-description').value.trim();
    const type = document.getElementById('expense-type').value;
    const amount = parseFloat(document.getElementById('expense-amount').value);

    if (!description || !amount || amount <= 0) {
        alert('Por favor, preencha todos os campos corretamente.');
        return;
    }
    if (!expenses[currentMonth]) expenses[currentMonth] = [];
    expenses[currentMonth].push({ id: nextExpenseId++, category, description, type, amount });

    document.getElementById('expense-description').value = '';
    document.getElementById('expense-amount').value = '';
    
    updateExpensesCategoriesGrid();
    updateDashboard();
    scheduleAutoSave();
    alert('Gasto adicionado com sucesso!');
}

function removeExpense(expenseId) {
    if (!expenses[currentMonth]) return;
    const expense = expenses[currentMonth].find(e => e.id === expenseId);
    if (!expense) return;
    if (confirm(`Deseja remover o gasto "${expense.description}"?`)) {
        expenses[currentMonth] = expenses[currentMonth].filter(e => e.id !== expenseId);
        updateExpensesCategoriesGrid();
        updateDashboard();
        scheduleAutoSave();
        alert('Gasto removido com sucesso!');
    }
}

function updateExpensesCategoriesGrid() {
    const grid = document.getElementById('expenses-categories-grid');
    if (!grid) return;
    const monthExpenses = getExpensesForMonth();
    grid.innerHTML = Object.keys(categories).map(catId => {
        const categoryExpenses = monthExpenses.filter(e => e.category === catId);
        const expensesList = categoryExpenses.length > 0 ?
            categoryExpenses.map(expense => `
                <div class="category-expense-item">
                    <div class="category-expense-info">
                        <div class="category-expense-description">${expense.description}</div>
                        <div class="category-expense-type">${expenseTypeIcons[expense.type]} ${expense.type}</div>
                    </div>
                    <div>
                        <div class="category-expense-amount">${formatCurrency(expense.amount)}</div>
                        <button class="delete-expense" onclick="removeExpense(${expense.id})">Remover</button>
                    </div>
                </div>
            `).join('') : '<div class="no-expenses">Nenhum gasto registrado</div>';
        return `
            <div class="category-expenses-column">
                <div class="category-expenses-header">
                    <div class="category-expenses-color" style="background-color: ${categories[catId].color}"></div>
                    <div class="category-expenses-name">${categories[catId].name}</div>
                </div>
                <div class="category-expenses-list">${expensesList}</div>
            </div>
        `;
    }).join('');
}

// Configuration Management
function showFeedbackMessage(message, type = 'success') {
    const el = document.getElementById('feedback-message');
    if (el) {
        el.textContent = message;
        el.className = `feedback-message ${type}`;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 5000);
    }
}
function hideFeedbackMessage() {
    const el = document.getElementById('feedback-message');
    if (el) el.classList.add('hidden');
}

function saveConfiguration(name) {
    if (!name || name.trim() === '') {
        showFeedbackMessage('Digite um nome para a configuração', 'warning');
        return;
    }
    const configName = name.trim();
    savedConfigurations[configName] = { monthlyIncome, percentages: { ...percentages } };
    updateSavedConfigsList();
    showFeedbackMessage(`Configuração '${configName}' salva!`, 'success');
    document.getElementById('config-name').value = '';
    scheduleAutoSave();
}

function loadConfiguration(name) {
    const config = savedConfigurations[name];
    if (!config) {
        showFeedbackMessage(`Configuração '${name}' não encontrada`, 'error');
        return;
    }
    monthlyIncome = config.monthlyIncome || 0;
    percentages = { ...config.percentages };
    document.getElementById('monthly-income').value = monthlyIncome;
    Object.keys(percentages).forEach(c => {
        const slider = document.getElementById(c);
        if (slider) slider.value = percentages[c];
    });
    updateAllDisplays();
    showFeedbackMessage(`Configuração '${name}' carregada!`, 'success');
    scheduleAutoSave();
}

function updateSavedConfigsList() {
    const list = document.getElementById('saved-configs-list');
    if (!list) return;
    const names = Object.keys(savedConfigurations);
    list.innerHTML = names.length === 0 ? '<span class="empty-configs">Nenhuma configuração salva</span>'
        : names.map(n => `<span class="config-tag" onclick="quickLoadConfig('${n}')">${n}</span>`).join('');
}

function quickLoadConfig(name) {
    loadConfiguration(name);
}

function updateAmounts() {
    Object.keys(categories).forEach(c => {
        const amount = (monthlyIncome * (percentages[c] || 0)) / 100;
        const el = document.getElementById(`value-${c}`);
        if (el) el.textContent = formatCurrency(amount);
    });
}
function updatePercentageDisplays() {
    Object.keys(categories).forEach(c => {
        const el = document.getElementById(`percent-${c}`);
        if (el) el.textContent = formatPercentage(percentages[c] || 0);
    });
}
function updateTotalPercentage() {
    const total = Object.values(percentages).reduce((s, v) => s + (v || 0), 0);
    const el = document.getElementById('total-percentage');
    if (el) {
        el.textContent = formatPercentage(total);
        el.classList.toggle('over-100', total > 100.1);
        el.classList.toggle('under-100', total < 99.9);
    }
}

function handleIncomeInput() {
    const input = document.getElementById('monthly-income');
    if (input) {
        monthlyIncome = parseFloat(input.value) || 0;
        updateAmounts();
        updateDashboard();
        scheduleAutoSave();
    }
}

function handleSliderChange(category, value) {
    percentages[category] = parseFloat(value);
    updatePercentageDisplays();
    updateAmounts();
    updateTotalPercentage();
    updateDashboard();
    scheduleAutoSave();
}

function setupConfigurationHandlers() {
    document.getElementById('save-config')?.addEventListener('click', () => saveConfiguration(document.getElementById('config-name').value));
    document.getElementById('load-config')?.addEventListener('click', () => loadConfiguration(document.getElementById('load-name').value));
    ['config-name', 'load-name'].forEach(id => {
        document.getElementById(id)?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') e.target.nextElementSibling.click();
        });
        document.getElementById(id)?.addEventListener('input', hideFeedbackMessage);
    });
}

function setupEventHandlers() {
    const monthSelect = document.getElementById('month-year');
    if (monthSelect) {
        monthSelect.value = currentMonth;
        monthSelect.addEventListener('change', (e) => {
            currentMonth = e.target.value;
            updateDashboard();
            updateExpensesCategoriesGrid();
            scheduleAutoSave();
        });
    }
    const incomeInput = document.getElementById('monthly-income');
    if (incomeInput) {
        incomeInput.value = monthlyIncome;
        incomeInput.addEventListener('input', handleIncomeInput);
    }
    Object.keys(categories).forEach(c => {
        const slider = document.getElementById(c);
        if (slider) slider.addEventListener('input', (e) => handleSliderChange(c, e.target.value));
    });
    document.getElementById('add-expense')?.addEventListener('click', addExpense);
    setupConfigurationHandlers();
}

function updateAllDisplays() {
    updatePercentageDisplays();
    updateAmounts();
    updateTotalPercentage();
    updateExpensesCategoriesGrid();
    updateDashboard();
    updateSavedConfigsList();
}

// Make functions available globally for inline onclick handlers
window.quickLoadConfig = quickLoadConfig;
window.removeExpense = removeExpense;

// ==========================================================
// INICIALIZAÇÃO PRINCIPAL DO APLICATIVO
// ==========================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM loaded, initializing app...');
    // O cliente Supabase já foi inicializado no topo
    if (supabaseClient) {
        setupLoginHandlers();
        initializeTabs();
        setupEventHandlers();
        showLoginScreen();
        console.log('🎉 App initialized successfully - waiting for login');
    } else {
        showLoginMessage('Erro fatal: Cliente Supabase não pôde ser inicializado.', 'error');
    }
});
