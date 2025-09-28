const SUPABASE_URL = 'https://iballqwxsxkpltyustgj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliYWxscXd4c3hrcGx0eXVzdGdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwNTc2MzAsImV4cCI6MjA3NDYzMzYzMH0.Z4WKcwVS5FFfbtaaiyBI0p348_v00pOYDYTq_6bDgGE';

// Cria cliente real
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


let supabaseClient = null;
let currentUser = null;
let isSyncing = false;

// Global variables
let monthlyIncome = 20000;
let currentMonth = '2025-09';
let chart = null;

// Initial percentages based on the example data
let percentages = {
    'custos-fixos': 40,
    'conforto': 20,
    'metas': 5,
    'prazeres': 5,
    'liberdade-financeira': 25,
    'conhecimento': 5
};

// Sample expenses data to demonstrate functionality
let expenses = {
    '2025-09': [
        { category: 'custos-fixos', description: 'Aluguel', amount: 3000, id: 1, type: 'fixa' },
        { category: 'custos-fixos', description: 'Conta de luz', amount: 150, id: 2, type: 'fixa' },
        { category: 'custos-fixos', description: 'Internet', amount: 80, id: 3, type: 'fixa' },
        { category: 'conforto', description: 'Supermercado', amount: 800, id: 4, type: 'unica' },
        { category: 'conforto', description: 'Restaurante', amount: 200, id: 5, type: 'unica' },
        { category: 'metas', description: 'Investimento', amount: 500, id: 6, type: 'fixa' },
        { category: 'prazeres', description: 'Cinema', amount: 50, id: 7, type: 'unica' },
        { category: 'prazeres', description: 'Livros', amount: 80, id: 8, type: 'unica' },
        { category: 'liberdade-financeira', description: 'Reserva de emergência', amount: 1000, id: 9, type: 'fixa' },
        { category: 'conhecimento', description: 'Curso online', amount: 150, id: 10, type: 'parcelada' }
    ]
};

// Configuration management
let savedConfigurations = {};
let nextExpenseId = 11;

// Category colors and names
const categories = {
    'custos-fixos': { name: 'Custos fixos', color: '#1FB8CD' },
    'conforto': { name: 'Conforto', color: '#FFC185' },
    'metas': { name: 'Metas', color: '#B4413C' },
    'prazeres': { name: 'Prazeres', color: '#ECEBD5' },
    'liberdade-financeira': { name: 'Liberdade Financeira', color: '#5D878F' },
    'conhecimento': { name: 'Conhecimento', color: '#DB4545' }
};

// Chart.js colors for consistency
const chartColors = ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545'];

// Expense type icons
const expenseTypeIcons = {
    'unica': '🔹',
    'fixa': '🔸',
    'parcelada': '🔺'
};

// SUPABASE FUNCTIONS (Now using Mock)
async function initializeSupabase() {
    try {
        console.log('🔌 Inicializando Supabase (Mock para demo)...');
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase mock inicializado com sucesso');
        return true;
    } catch (error) {
        console.error('❌ Erro ao inicializar Supabase:', error);
        showLoginMessage('Erro de conexão com o servidor', 'error');
        return false;
    }
}

async function loginUser(username) {
    if (!supabaseClient) {
        console.error('❌ Supabase não inicializado');
        return false;
    }

    try {
        console.log('🔐 Fazendo login do usuário:', username);
        setSyncStatus('syncing', '🔄 Conectando...');

        // Check if user exists
        const { data: existingUser, error: selectError } = await supabaseClient
            .from('usuarios')
            .select('*')
            .eq('username', username)
            .single();

        if (selectError && selectError.code !== 'PGRST116') {
            // PGRST116 = not found, which is OK for new users
            throw selectError;
        }

        let userData;
        
        if (existingUser) {
            console.log('👤 Usuário existente encontrado');
            userData = existingUser;
            showLoginMessage('Login realizado com sucesso!', 'success');
        } else {
            console.log('👤 Criando novo usuário...');
            
            // Create new user with default data
            const defaultData = {
                monthlyIncome: 20000,
                percentages: {
                    'custos-fixos': 40,
                    'conforto': 20,
                    'metas': 5,
                    'prazeres': 5,
                    'liberdade-financeira': 25,
                    'conhecimento': 5
                },
                gastosPorMes: {
                    '2025-09': []
                },
                savedConfigurations: {},
                currentMonth: '2025-09',
                currentYear: 2025
            };

            const { data: newUser, error: insertError } = await supabaseClient
                .from('usuarios')
                .insert([{
                    username: username,
                    dados_orcamento: defaultData
                }])
                .select()
                .single();

            if (insertError) {
                throw insertError;
            }

            userData = newUser;
            showLoginMessage('Conta criada e login realizado com sucesso!', 'success');
        }

        // Load user data
        await loadUserDataFromCloud(userData);
        
        currentUser = username;
        showMainApp();
        setSyncStatus('synced', '✅ Sincronizado');
        
        return true;

    } catch (error) {
        console.error('❌ Erro no login:', error);
        setSyncStatus('error', '❌ Erro de conexão');
        showLoginMessage('Erro ao fazer login: ' + (error.message || 'Erro desconhecido'), 'error');
        return false;
    }
}

async function loadUserDataFromCloud(userData) {
    try {
        console.log('📥 Carregando dados do usuário da nuvem...');
        
        const dadosOrcamento = userData.dados_orcamento || {};
        
        // Load data with fallbacks
        monthlyIncome = dadosOrcamento.monthlyIncome || 20000;
        percentages = dadosOrcamento.percentages || {
            'custos-fixos': 40,
            'conforto': 20,
            'metas': 5,
            'prazeres': 5,
            'liberdade-financeira': 25,
            'conhecimento': 5
        };
        expenses = dadosOrcamento.gastosPorMes || { '2025-09': [] };
        savedConfigurations = dadosOrcamento.savedConfigurations || {};
        currentMonth = dadosOrcamento.currentMonth || '2025-09';
        
        // Find highest expense ID to prevent conflicts
        let maxId = 0;
        Object.values(expenses).forEach(monthExpenses => {
            monthExpenses.forEach(expense => {
                if (expense.id > maxId) {
                    maxId = expense.id;
                }
            });
        });
        nextExpenseId = maxId + 1;
        
        console.log('✅ Dados carregados da nuvem:', {
            monthlyIncome,
            currentMonth,
            expensesCount: Object.keys(expenses).length
        });

    } catch (error) {
        console.error('❌ Erro ao carregar dados:', error);
        // Use default data if loading fails
        console.log('🔄 Usando dados padrão devido ao erro');
    }
}

async function saveUserDataToCloud() {
    if (!supabaseClient || !currentUser || isSyncing) {
        return false;
    }

    try {
        isSyncing = true;
        setSyncStatus('syncing', '🔄 Salvando...');
        
        const dadosOrcamento = {
            monthlyIncome,
            percentages,
            gastosPorMes: expenses,
            savedConfigurations,
            currentMonth,
            currentYear: parseInt(currentMonth.split('-')[0])
        };

        const { error } = await supabaseClient
            .from('usuarios')
            .update({ 
                dados_orcamento: dadosOrcamento,
                updated_at: new Date().toISOString()
            })
            .eq('username', currentUser);

        if (error) {
            throw error;
        }

        console.log('💾 Dados salvos na nuvem com sucesso');
        setSyncStatus('synced', '✅ Salvo');
        
        // Hide sync indicator after a delay
        setTimeout(() => {
            if (!isSyncing) {
                setSyncStatus('synced', '');
            }
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

// AUTO-SAVE FUNCTIONALITY
function scheduleAutoSave() {
    // Debounced auto-save to prevent excessive requests
    clearTimeout(window.autoSaveTimeout);
    window.autoSaveTimeout = setTimeout(async () => {
        if (currentUser) {
            await saveUserDataToCloud();
        }
    }, 1500); // Save 1.5 seconds after last change
}

// LOGIN/LOGOUT UI FUNCTIONS
function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    
    // Update UI with current user
    const usernameEl = document.getElementById('current-username');
    if (usernameEl) {
        usernameEl.textContent = currentUser;
    }
    
    // Update all displays
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
    if (messageEl) {
        messageEl.classList.add('hidden');
    }
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
    
    // Reset to default data
    monthlyIncome = 20000;
    currentMonth = '2025-09';
    percentages = {
        'custos-fixos': 40,
        'conforto': 20,
        'metas': 5,
        'prazeres': 5,
        'liberdade-financeira': 25,
        'conhecimento': 5
    };
    expenses = {};
    savedConfigurations = {};
    nextExpenseId = 1;
    
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
            
            // Show loading state
            const btnText = document.getElementById('login-btn-text');
            const spinner = document.getElementById('login-spinner');
            if (btnText) btnText.classList.add('hidden');
            if (spinner) spinner.classList.remove('hidden');
            loginBtn.disabled = true;
            
            const success = await loginUser(username);
            
            // Reset button state
            if (btnText) btnText.classList.remove('hidden');
            if (spinner) spinner.classList.add('hidden');
            loginBtn.disabled = false;
            
            if (success) {
                usernameInput.value = '';
            }
        });
        
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                loginBtn.click();
            }
        });
        
        usernameInput.addEventListener('input', hideLoginMessage);
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja sair? Dados não salvos serão perdidos.')) {
                logout();
            }
        });
    }
}

// Utility functions
function formatCurrency(amount) {
    if (isNaN(amount) || amount === 0) {
        return 'R$ 0,00';
    }
    return 'R$ ' + amount.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatPercentage(percentage) {
    if (isNaN(percentage)) {
        return '0,0%';
    }
    return percentage.toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }) + '%';
}

// SISTEMA DE ABAS FUNCIONAL
function initializeTabs() {
    console.log('Inicializando sistema de abas...');
    
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            console.log('=== Aba clicada:', targetTab);
            
            // Remove active from all buttons
            tabButtons.forEach(btn => btn.classList.remove('active'));
            
            // Remove active from all contents
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active to clicked button
            this.classList.add('active');
            
            // Add active to corresponding content
            const targetContent = document.getElementById(`tab-${targetTab}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
            
            // Update content when tab changes
            updateTabContent(targetTab);
        });
    });
    
    console.log('✅ Sistema de abas inicializado com sucesso');
}

function updateTabContent(targetTab) {
    console.log('🔄 Atualizando conteúdo da aba:', targetTab);
    
    switch(targetTab) {
        case 'dashboard':
            setTimeout(() => {
                updateDashboard();
            }, 100);
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
    console.log('📊 Atualizando dashboard completo...');
    updateIncomeDisplay();
    updateChart();
    updateSummaryTable();
    updateGoalsList();
    updateCategoryDetails();
}

function updateIncomeDisplay() {
    const incomeElement = document.getElementById('dashboard-income');
    if (incomeElement) {
        incomeElement.textContent = formatCurrency(monthlyIncome);
    }
}

function getExpensesForMonth(month = currentMonth) {
    return expenses[month] || [];
}

function getTotalSpentByCategory(month = currentMonth) {
    const monthExpenses = getExpensesForMonth(month);
    const totals = {};
    
    Object.keys(categories).forEach(cat => {
        totals[cat] = 0;
    });
    
    monthExpenses.forEach(expense => {
        totals[expense.category] = (totals[expense.category] || 0) + expense.amount;
    });
    
    return totals;
}

function updateChart() {
    const ctx = document.getElementById('expenses-chart');
    if (!ctx) return;
    
    const spentByCategory = getTotalSpentByCategory();
    const data = Object.keys(categories).map(cat => spentByCategory[cat] || 0);
    const labels = Object.keys(categories).map(cat => categories[cat].name);
    const colors = Object.keys(categories).map((cat, index) => chartColors[index % chartColors.length]);
    
    if (chart) {
        chart.destroy();
    }
    
    chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    
    updateChartLegend(labels, colors, data);
}

function updateChartLegend(labels, colors, data) {
    const legendContainer = document.getElementById('chart-legend');
    if (!legendContainer) return;
    
    legendContainer.innerHTML = labels.map((label, index) => {
        const amount = formatCurrency(data[index]);
        return `
            <div class="legend-item">
                <div class="legend-color" style="background-color: ${colors[index]}"></div>
                <span>${label}: ${amount}</span>
            </div>
        `;
    }).join('');
}

function updateSummaryTable() {
    const tbody = document.getElementById('summary-body');
    if (!tbody) return;
    
    const spentByCategory = getTotalSpentByCategory();
    let totalBudget = 0;
    let totalSpent = 0;
    
    const rows = Object.keys(categories).map(catId => {
        const category = categories[catId];
        const budget = (monthlyIncome * percentages[catId]) / 100;
        const spent = spentByCategory[catId] || 0;
        const remaining = budget - spent;
        const usedPercent = budget > 0 ? (spent / budget) * 100 : 0;
        
        totalBudget += budget;
        totalSpent += spent;
        
        let usageClass = 'usage-good';
        if (usedPercent > 100) usageClass = 'usage-over';
        else if (usedPercent > 80) usageClass = 'usage-warning';
        
        return `
            <tr>
                <td>${category.name}</td>
                <td>${formatCurrency(budget)}</td>
                <td>${formatCurrency(spent)}</td>
                <td>${formatCurrency(remaining)}</td>
                <td><span class="usage-indicator ${usageClass}">${formatPercentage(usedPercent)}</span></td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = rows;
    
    // Update totals
    const totalRemaining = totalBudget - totalSpent;
    const totalUsedPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    
    const totalBudgetEl = document.getElementById('total-budget');
    const totalSpentEl = document.getElementById('total-spent');
    const totalRemainingEl = document.getElementById('total-remaining');
    const totalUsedEl = document.getElementById('total-used');
    
    if (totalBudgetEl) totalBudgetEl.textContent = formatCurrency(totalBudget);
    if (totalSpentEl) totalSpentEl.textContent = formatCurrency(totalSpent);
    if (totalRemainingEl) totalRemainingEl.textContent = formatCurrency(totalRemaining);
    if (totalUsedEl) totalUsedEl.textContent = formatPercentage(totalUsedPercent);
}

function updateGoalsList() {
    const goalsList = document.getElementById('goals-list');
    if (!goalsList) return;
    
    goalsList.innerHTML = Object.keys(categories).map(catId => {
        const category = categories[catId];
        return `
            <div class="goal-item">
                <span class="goal-category">${category.name}</span>
                <span class="goal-percentage">${formatPercentage(percentages[catId])}</span>
            </div>
        `;
    }).join('');
}

function updateCategoryDetails() {
    const grid = document.getElementById('category-details-grid');
    if (!grid) return;
    
    const monthExpenses = getExpensesForMonth();
    
    grid.innerHTML = Object.keys(categories).map(catId => {
        const category = categories[catId];
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
            `).join('') : 
            '<div class="no-expenses">Nenhum gasto registrado</div>';
        
        return `
            <div class="card category-detail-card">
                <div class="card__body">
                    <div class="category-detail-header">
                        <div class="category-detail-color" style="background-color: ${category.color}"></div>
                        <h4 class="category-detail-title">${category.name}</h4>
                    </div>
                    <div class="expense-list">
                        ${expensesList}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Expenses Management
function addExpense() {
    const categorySelect = document.getElementById('expense-category');
    const descriptionInput = document.getElementById('expense-description');
    const typeSelect = document.getElementById('expense-type');
    const amountInput = document.getElementById('expense-amount');
    
    if (!categorySelect || !descriptionInput || !typeSelect || !amountInput) {
        return;
    }
    
    const category = categorySelect.value;
    const description = descriptionInput.value.trim();
    const type = typeSelect.value;
    const amount = parseFloat(amountInput.value);
    
    if (!description || !amount || amount <= 0) {
        alert('Por favor, preencha todos os campos corretamente.');
        return;
    }
    
    // Add expense to current month
    if (!expenses[currentMonth]) {
        expenses[currentMonth] = [];
    }
    
    expenses[currentMonth].push({
        id: nextExpenseId++,
        category: category,
        description: description,
        type: type,
        amount: amount
    });
    
    // Clear form
    descriptionInput.value = '';
    amountInput.value = '';
    
    // Update displays
    updateExpensesCategoriesGrid();
    updateDashboard();
    
    // Auto-save to cloud
    scheduleAutoSave();
    
    alert('Gasto adicionado com sucesso!');
}

function removeExpense(expenseId) {
    if (!expenses[currentMonth]) return;
    
    const expenseToRemove = expenses[currentMonth].find(expense => expense.id === expenseId);
    if (!expenseToRemove) return;
    
    expenses[currentMonth] = expenses[currentMonth].filter(expense => expense.id !== expenseId);
    updateExpensesCategoriesGrid();
    updateDashboard();
    
    // Auto-save to cloud
    scheduleAutoSave();
    
    alert('Gasto removido com sucesso!');
}

function updateExpensesCategoriesGrid() {
    const gridContainer = document.getElementById('expenses-categories-grid');
    if (!gridContainer) return;
    
    const monthExpenses = getExpensesForMonth();
    
    gridContainer.innerHTML = Object.keys(categories).map(catId => {
        const category = categories[catId];
        const categoryExpenses = monthExpenses.filter(expense => expense.category === catId);
        
        const expensesList = categoryExpenses.length > 0 ? 
            categoryExpenses.map(expense => `
                <div class="category-expense-item">
                    <div class="category-expense-info">
                        <div class="category-expense-description">${expense.description}</div>
                        <div class="category-expense-type">${expenseTypeIcons[expense.type]} ${expense.type}</div>
                    </div>
                    <div>
                        <div class="category-expense-amount">${formatCurrency(expense.amount)}</div>
                        <button class="delete-expense" onclick="removeExpense(${expense.id})">
                            Remover
                        </button>
                    </div>
                </div>
            `).join('') : 
            '<div class="no-expenses">Nenhum gasto registrado</div>';
        
        return `
            <div class="category-expenses-column">
                <div class="category-expenses-header">
                    <div class="category-expenses-color" style="background-color: ${category.color}"></div>
                    <div class="category-expenses-name">${category.name}</div>
                </div>
                <div class="category-expenses-list">
                    ${expensesList}
                </div>
            </div>
        `;
    }).join('');
}

// Configuration Management
function showFeedbackMessage(message, type = 'success') {
    const feedbackElement = document.getElementById('feedback-message');
    if (feedbackElement) {
        feedbackElement.textContent = message;
        feedbackElement.className = `feedback-message ${type}`;
        feedbackElement.classList.remove('hidden');
        
        setTimeout(() => {
            feedbackElement.classList.add('hidden');
        }, 5000);
    }
}

function hideFeedbackMessage() {
    const feedbackElement = document.getElementById('feedback-message');
    if (feedbackElement) {
        feedbackElement.classList.add('hidden');
    }
}

function saveConfiguration(name) {
    if (!name || name.trim() === '') {
        showFeedbackMessage('Digite um nome para a configuração', 'warning');
        return false;
    }
    
    const configName = name.trim();
    savedConfigurations[configName] = {
        monthlyIncome: monthlyIncome,
        percentages: { ...percentages }
    };
    
    updateSavedConfigsList();
    showFeedbackMessage(`Configuração '${configName}' salva com sucesso!`, 'success');
    
    const configNameInput = document.getElementById('config-name');
    if (configNameInput) {
        configNameInput.value = '';
    }
    
    // Auto-save to cloud
    scheduleAutoSave();
    
    return true;
}

function loadConfiguration(name) {
    if (!name || name.trim() === '') {
        showFeedbackMessage('Digite um nome para a configuração', 'warning');
        return false;
    }
    
    const configName = name.trim();
    const config = savedConfigurations[configName];
    
    if (!config) {
        showFeedbackMessage(`Configuração '${configName}' não encontrada`, 'error');
        return false;
    }
    
    monthlyIncome = config.monthlyIncome || 0;
    percentages = { ...config.percentages };
    
    const incomeInput = document.getElementById('monthly-income');
    if (incomeInput) {
        incomeInput.value = monthlyIncome;
    }
    
    Object.keys(percentages).forEach(category => {
        const slider = document.getElementById(category);
        if (slider) {
            slider.value = percentages[category];
        }
    });
    
    updatePercentageDisplays();
    updateAmounts();
    updateTotalPercentage();
    updateDashboard();
    
    showFeedbackMessage(`Configuração '${configName}' carregada!`, 'success');
    
    const loadNameInput = document.getElementById('load-name');
    if (loadNameInput) {
        loadNameInput.value = '';
    }
    
    // Auto-save to cloud
    scheduleAutoSave();
    
    return true;
}

function updateSavedConfigsList() {
    const listElement = document.getElementById('saved-configs-list');
    if (!listElement) return;
    
    const configNames = Object.keys(savedConfigurations);
    
    if (configNames.length === 0) {
        listElement.innerHTML = '<span class="empty-configs">Nenhuma configuração salva</span>';
        return;
    }
    
    listElement.innerHTML = configNames.map(name => 
        `<span class="config-tag" onclick="quickLoadConfig('${name}')">${name}</span>`
    ).join('');
}

function quickLoadConfig(name) {
    loadConfiguration(name);
}

function updateAmounts() {
    Object.keys(percentages).forEach(category => {
        const amount = (monthlyIncome * percentages[category]) / 100;
        const amountElement = document.getElementById(`value-${category}`);
        if (amountElement) {
            amountElement.textContent = formatCurrency(amount);
        }
    });
}

function updatePercentageDisplays() {
    Object.keys(percentages).forEach(category => {
        const percentageElement = document.getElementById(`percent-${category}`);
        if (percentageElement) {
            percentageElement.textContent = formatPercentage(percentages[category]);
        }
    });
}

function updateTotalPercentage() {
    const total = Object.values(percentages).reduce((sum, val) => sum + val, 0);
    const totalElement = document.getElementById('total-percentage');
    
    if (totalElement) {
        totalElement.textContent = formatPercentage(total);
        
        totalElement.classList.remove('over-100', 'under-100');
        
        if (Math.abs(total - 100) > 0.1) {
            if (total > 100) {
                totalElement.classList.add('over-100');
            } else {
                totalElement.classList.add('under-100');
            }
        }
    }
}

function handleIncomeInput() {
    const incomeInput = document.getElementById('monthly-income');
    if (incomeInput) {
        let value = incomeInput.value.replace(/[^\d.,]/g, '');
        value = value.replace(',', '.');
        monthlyIncome = parseFloat(value) || 0;
        updateAmounts();
        updateDashboard();
        
        // Auto-save to cloud
        scheduleAutoSave();
    }
}

function handleSliderChange(category, value) {
    percentages[category] = parseFloat(value);
    updatePercentageDisplays();
    updateAmounts();
    updateTotalPercentage();
    updateDashboard();
    
    // Auto-save to cloud
    scheduleAutoSave();
}

function setupConfigurationHandlers() {
    const saveButton = document.getElementById('save-config');
    if (saveButton) {
        saveButton.addEventListener('click', () => {
            const configNameInput = document.getElementById('config-name');
            if (configNameInput) {
                saveConfiguration(configNameInput.value);
            }
        });
    }
    
    const loadButton = document.getElementById('load-config');
    if (loadButton) {
        loadButton.addEventListener('click', () => {
            const loadNameInput = document.getElementById('load-name');
            if (loadNameInput) {
                loadConfiguration(loadNameInput.value);
            }
        });
    }
    
    const configNameInput = document.getElementById('config-name');
    if (configNameInput) {
        configNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveConfiguration(configNameInput.value);
            }
        });
    }
    
    const loadNameInput = document.getElementById('load-name');
    if (loadNameInput) {
        loadNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                loadConfiguration(loadNameInput.value);
            }
        });
    }
    
    [configNameInput, loadNameInput].forEach(input => {
        if (input) {
            input.addEventListener('input', hideFeedbackMessage);
        }
    });
}

function setupEventHandlers() {
    console.log('🔧 Configurando event handlers...');
    
    // Setup month selector
    const monthSelect = document.getElementById('month-year');
    if (monthSelect) {
        monthSelect.value = currentMonth;
        monthSelect.addEventListener('change', (e) => {
            currentMonth = e.target.value;
            updateDashboard();
            updateExpensesCategoriesGrid();
            
            // Auto-save to cloud
            scheduleAutoSave();
        });
    }
    
    // Setup income input
    const incomeInput = document.getElementById('monthly-income');
    if (incomeInput) {
        incomeInput.value = monthlyIncome;
        incomeInput.addEventListener('input', handleIncomeInput);
        incomeInput.addEventListener('change', handleIncomeInput);
        incomeInput.addEventListener('keyup', handleIncomeInput);
        incomeInput.addEventListener('blur', handleIncomeInput);
    }
    
    // Setup sliders
    Object.keys(percentages).forEach(category => {
        const slider = document.getElementById(category);
        if (slider) {
            slider.addEventListener('input', function(e) {
                handleSliderChange(category, e.target.value);
            });
            
            slider.addEventListener('change', function(e) {
                handleSliderChange(category, e.target.value);
            });
            
            slider.value = percentages[category];
        }
    });
    
    // Setup expense form
    const addExpenseBtn = document.getElementById('add-expense');
    if (addExpenseBtn) {
        addExpenseBtn.addEventListener('click', addExpense);
    }
    
    // Setup configuration management
    setupConfigurationHandlers();
    
    console.log('✅ Event handlers configurados com sucesso');
}

function updateAllDisplays() {
    console.log('🔄 Atualizando todos os displays...');
    updatePercentageDisplays();
    updateAmounts();
    updateTotalPercentage();
    updateExpensesCategoriesGrid();
    updateDashboard();
    updateSavedConfigsList();
    console.log('✅ Todos os displays atualizados');
}

// Make functions available globally
window.quickLoadConfig = quickLoadConfig;
window.removeExpense = removeExpense;

// MAIN INITIALIZATION
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 DOM loaded, initializing app...');
    
    // Initialize Supabase (Mock)
    const supabaseInitialized = await initializeSupabase();
    
    if (supabaseInitialized) {
        // Setup login handlers
        setupLoginHandlers();
        
        // Setup tabs and other handlers for when user logs in
        initializeTabs();
        setupEventHandlers();
        
        // Show login screen initially
        showLoginScreen();
        
        console.log('🎉 App initialized successfully - waiting for login');
    } else {
        // If Supabase fails, show error message
        showLoginMessage('Erro de conexão com o servidor. Tente novamente mais tarde.', 'error');
    }
});
