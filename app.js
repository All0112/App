// ===== SUPABASE CONFIGURATION =====
// IMPORTANT: Replace these placeholders with your actual Supabase credentials
const SUPABASE_URL = 'https://iballqwxsxkpltyustgj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliYWxscXd4c3hrcGx0eXVzdGdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwNTc2MzAsImV4cCI6MjA3NDYzMzYzMH0.Z4WKcwVS5FFfbtaaiyBI0p348_v00pOYDYTq_6bDgGE';

// Initialize Supabase client
let supabase = null;

// Try to initialize Supabase - will fail with placeholder values
try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (error) {
    console.warn('Supabase não configurado. Use valores reais para SUPABASE_URL e SUPABASE_KEY');
}

// ===== GLOBAL VARIABLES =====
let currentUser = null;
let monthlyIncome = 0;
let percentages = {
    'custos-fixos': 16.67,
    'conforto': 16.67,
    'metas': 16.67,
    'prazeres': 16.67,
    'liberdade-financeira': 16.67,
    'conhecimento': 16.67
};

// Current month/year for expense tracking
let currentMonth = 9; // October (0-based)
let currentYear = 2025;

// Dashboard month/year (can be different from expenses)
let dashboardMonth = 9;
let dashboardYear = 2025;

// Expense storage
let gastosPorMes = {}; // {year: {month: {category: [expenses]}}}

// Category configuration
const categorias = [
    {id: "custos-fixos", nome: "🏠 Custos fixos", emoji: "🏠", cor: "#1FB8CD"},
    {id: "conforto", nome: "🛋️ Conforto", emoji: "🛋️", cor: "#FFC185"},
    {id: "metas", nome: "🎯 Metas", emoji: "🎯", cor: "#B4413C"},
    {id: "prazeres", nome: "🎉 Prazeres", emoji: "🎉", cor: "#ECEBD5"},
    {id: "liberdade-financeira", nome: "💰 Liberdade Financeira", emoji: "💰", cor: "#5D878F"},
    {id: "conhecimento", nome: "📚 Conhecimento", emoji: "📚", cor: "#DB4545"}
];

// Expense type icons
const expenseTypeIcons = {
    'unica': '🛒',
    'fixa': '📅',
    'parcelada': '💳'
};

// Chart instance
let expenseChart = null;

// ===== UTILITY FUNCTIONS =====
function formatCurrency(amount) {
    if (isNaN(amount) || amount === 0) {
        return 'R$ 0,00';
    }
    
    const numericAmount = Number(amount);
    
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(numericAmount);
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

function getMonthName(monthIndex) {
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return months[monthIndex];
}

// ===== THEME MANAGEMENT =====
function initTheme() {
    const savedTheme = localStorage.getItem('budget-app-theme') || 'light';
    applyTheme(savedTheme);
    updateThemeIcon(savedTheme);
}

function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
        root.setAttribute('data-color-scheme', 'dark');
    } else {
        root.setAttribute('data-color-scheme', 'light');
    }
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('budget-app-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    localStorage.setItem('budget-app-theme', newTheme);
    applyTheme(newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const themeIcon = document.querySelector('.theme-icon');
    if (themeIcon) {
        themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

// ===== USER AUTHENTICATION =====
function showLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function handleLogin(username) {
    try {
        currentUser = username.trim();
        
        // Save to localStorage
        localStorage.setItem('budget-app-username', currentUser);
        
        // Create or get user profile in Supabase if available
        if (supabase) {
            await createUserProfile(currentUser);
            await loadUserData();
        } else {
            // Load from localStorage if Supabase not available
            loadLocalData();
        }
        
        // Update UI
        updateUserWelcome();
        hideLoginModal();
        updateAllDisplays();
        
    } catch (error) {
        console.error('Erro no login:', error);
        alert('Erro ao fazer login. Tente novamente.');
    }
}

async function createUserProfile(username) {
    if (!supabase) return;
    
    try {
        // Check if user already exists
        const { data: existingUser } = await supabase
            .from('perfis')
            .select('username')
            .eq('username', username)
            .single();
        
        if (!existingUser) {
            // Create new user
            const { error } = await supabase
                .from('perfis')
                .insert([{ username: username }]);
            
            if (error) throw error;
        }
    } catch (error) {
        console.error('Erro ao criar perfil:', error);
    }
}

function updateUserWelcome() {
    const welcomeElement = document.getElementById('user-welcome');
    if (welcomeElement && currentUser) {
        welcomeElement.textContent = `Olá, ${currentUser}!`;
    }
}

function checkUserLogin() {
    const savedUser = localStorage.getItem('budget-app-username');
    
    if (savedUser) {
        currentUser = savedUser;
        updateUserWelcome();
        
        if (supabase) {
            loadUserData();
        } else {
            loadLocalData();
        }
        
        updateAllDisplays();
    } else {
        showLoginModal();
    }
}

// ===== SUPABASE DATA FUNCTIONS =====
async function loadUserData() {
    if (!supabase || !currentUser) return;
    
    try {
        // Load configurations
        const { data: config } = await supabase
            .from('configuracoes')
            .select('*')
            .eq('username', currentUser)
            .single();
        
        if (config) {
            monthlyIncome = config.renda || 0;
            percentages = config.percentages || percentages;
        }
        
        // Load expenses for current month
        await loadExpensesFromSupabase();
        
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
    }
}

async function saveUserConfig() {
    if (!supabase || !currentUser) {
        saveLocalData();
        return;
    }
    
    try {
        const configData = {
            username: currentUser,
            renda: monthlyIncome,
            percentages: percentages
        };
        
        const { error } = await supabase
            .from('configuracoes')
            .upsert(configData);
        
        if (error) throw error;
        
    } catch (error) {
        console.error('Erro ao salvar configuração:', error);
        saveLocalData(); // Fallback to localStorage
    }
}

async function saveExpenseToSupabase(expense, category, month, year) {
    if (!supabase || !currentUser) return;
    
    try {
        const expenseData = {
            username: currentUser,
            ano: year,
            mes: month,
            categoria: category,
            tipo: expense.type,
            item: expense.name,
            valor: expense.amount,
            parcelaAtual: expense.installments ? expense.installments.current : 1,
            totalParcelas: expense.installments ? expense.installments.total : 1,
            created_at: new Date().toISOString()
        };
        
        const { error } = await supabase
            .from('gastos')
            .insert([expenseData]);
        
        if (error) throw error;
        
    } catch (error) {
        console.error('Erro ao salvar gasto:', error);
    }
}

async function loadExpensesFromSupabase() {
    if (!supabase || !currentUser) return;
    
    try {
        const { data: expenses, error } = await supabase
            .from('gastos')
            .select('*')
            .eq('username', currentUser);
        
        if (error) throw error;
        
        // Organize expenses by year/month/category
        gastosPorMes = {};
        
        expenses.forEach(expense => {
            const year = expense.ano;
            const month = expense.mes;
            const category = expense.categoria;
            
            if (!gastosPorMes[year]) gastosPorMes[year] = {};
            if (!gastosPorMes[year][month]) gastosPorMes[year][month] = {};
            if (!gastosPorMes[year][month][category]) gastosPorMes[year][month][category] = [];
            
            const expenseObj = {
                id: expense.id,
                name: expense.item,
                amount: expense.valor,
                type: expense.tipo,
                installments: expense.totalParcelas > 1 ? {
                    current: expense.parcelaAtual,
                    total: expense.totalParcelas
                } : null,
                createdAt: expense.created_at
            };
            
            gastosPorMes[year][month][category].push(expenseObj);
        });
        
    } catch (error) {
        console.error('Erro ao carregar gastos:', error);
    }
}

async function removeExpenseFromSupabase(expenseId) {
    if (!supabase) return;
    
    try {
        const { error } = await supabase
            .from('gastos')
            .delete()
            .eq('id', expenseId);
        
        if (error) throw error;
        
    } catch (error) {
        console.error('Erro ao remover gasto:', error);
    }
}

// ===== LOCAL STORAGE FALLBACK =====
function saveLocalData() {
    const data = {
        monthlyIncome,
        percentages,
        currentMonth,
        currentYear,
        dashboardMonth,
        dashboardYear,
        gastosPorMes
    };
    
    try {
        localStorage.setItem('budget-app-data', JSON.stringify(data));
    } catch (error) {
        console.error('Erro ao salvar dados locais:', error);
    }
}

function loadLocalData() {
    try {
        const saved = localStorage.getItem('budget-app-data');
        if (saved) {
            const data = JSON.parse(saved);
            
            monthlyIncome = data.monthlyIncome || 0;
            percentages = data.percentages || percentages;
            currentMonth = data.currentMonth || 9;
            currentYear = data.currentYear || 2025;
            dashboardMonth = data.dashboardMonth || currentMonth;
            dashboardYear = data.dashboardYear || currentYear;
            gastosPorMes = data.gastosPorMes || {};
        }
    } catch (error) {
        console.error('Erro ao carregar dados locais:', error);
    }
}

// ===== TAB MANAGEMENT =====
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab content and activate button
    const targetTab = document.getElementById(tabName);
    const targetBtn = document.querySelector(`[data-tab="${tabName}"]`);
    
    if (targetTab) targetTab.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active');
    
    // Update displays based on active tab
    if (tabName === 'dashboard') {
        updateDashboard();
    } else if (tabName === 'gastos') {
        updateExpensesDisplay();
    }
}

// ===== DASHBOARD FUNCTIONS =====
function updateDashboard() {
    updateDashboardMonthDisplay();
    updateSummaryCards();
    updateChart();
    updateSummaryTable();
}

function updateDashboardMonthDisplay() {
    const monthDisplay = document.getElementById('dashboard-month-display');
    if (monthDisplay) {
        monthDisplay.textContent = `${getMonthName(dashboardMonth)} ${dashboardYear}`;
    }
}

function navigateDashboardMonth(direction) {
    if (direction === 'next') {
        dashboardMonth++;
        if (dashboardMonth > 11) {
            dashboardMonth = 0;
            dashboardYear++;
        }
    } else {
        dashboardMonth--;
        if (dashboardMonth < 0) {
            dashboardMonth = 11;
            dashboardYear--;
        }
    }
    
    updateDashboard();
}

function updateSummaryCards() {
    const totalGasto = getTotalGastoMes(dashboardMonth, dashboardYear);
    const disponivel = monthlyIncome - totalGasto;
    
    const rendaDisplay = document.getElementById('renda-display');
    const gastoDisplay = document.getElementById('gasto-display');
    const disponivelDisplay = document.getElementById('disponivel-display');
    
    if (rendaDisplay) rendaDisplay.textContent = formatCurrency(monthlyIncome);
    if (gastoDisplay) gastoDisplay.textContent = formatCurrency(totalGasto);
    if (disponivelDisplay) {
        disponivelDisplay.textContent = formatCurrency(disponivel);
        disponivelDisplay.style.color = disponivel >= 0 ? 'var(--color-success)' : 'var(--color-error)';
    }
}

function updateChart() {
    const canvas = document.getElementById('expense-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart
    if (expenseChart) {
        expenseChart.destroy();
    }
    
    const chartData = getChartData();
    
    expenseChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: chartData.labels,
            datasets: [{
                data: chartData.values,
                backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${context.label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function getChartData() {
    const labels = [];
    const values = [];
    
    categorias.forEach(categoria => {
        const gasto = getCategoryTotal(categoria.id, dashboardMonth, dashboardYear);
        if (gasto > 0) {
            labels.push(categoria.nome);
            values.push(gasto);
        }
    });
    
    // Se não há gastos, mostrar categorias com budget
    if (values.length === 0 && monthlyIncome > 0) {
        categorias.forEach(categoria => {
            const budget = getCategoryBudget(categoria.id);
            if (budget > 0) {
                labels.push(categoria.nome);
                values.push(budget);
            }
        });
    }
    
    return { labels, values };
}

function updateSummaryTable() {
    const tbody = document.getElementById('summary-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    categorias.forEach(categoria => {
        const budget = getCategoryBudget(categoria.id);
        const gasto = getCategoryTotal(categoria.id, dashboardMonth, dashboardYear);
        const deveGastar = Math.max(0, budget - gasto);
        const utilizado = budget > 0 ? (gasto / budget) * 100 : 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 12px; height: 12px; background: ${categoria.cor}; border-radius: 50%;"></div>
                    ${categoria.nome}
                </div>
            </td>
            <td>${formatCurrency(budget)}</td>
            <td>${formatCurrency(gasto)}</td>
            <td>${formatCurrency(deveGastar)}</td>
            <td>${formatPercentage(utilizado)}</td>
            <td>
                <span class="status ${getStatusClass(utilizado)}">
                    ${getStatusText(utilizado)}
                </span>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

function getStatusClass(percentage) {
    if (percentage <= 50) return 'status--success';
    if (percentage <= 80) return 'status--warning';
    return 'status--error';
}

function getStatusText(percentage) {
    if (percentage <= 50) return '✅ Ótimo';
    if (percentage <= 80) return '⚠️ Atenção';
    return '🚨 Limite';
}

// ===== BUDGET CONFIGURATION =====
function updateAmounts() {
    categorias.forEach(categoria => {
        const amount = getCategoryBudget(categoria.id);
        const amountElement = document.getElementById(`amount-${categoria.id}`);
        if (amountElement) {
            amountElement.textContent = formatCurrency(amount);
        }
    });
}

function updatePercentageDisplays() {
    categorias.forEach(categoria => {
        const percentageElement = document.getElementById(`percentage-${categoria.id}`);
        if (percentageElement) {
            percentageElement.textContent = formatPercentage(percentages[categoria.id]);
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

function getCategoryBudget(category) {
    return (monthlyIncome * percentages[category]) / 100;
}

function handleIncomeInput() {
    const incomeInput = document.getElementById('monthly-income');
    if (incomeInput) {
        let inputValue = incomeInput.value;
        const parsedValue = parseFloat(inputValue);
        
        monthlyIncome = isNaN(parsedValue) ? 0 : parsedValue;
        
        updateAmounts();
        updateDashboard();
        saveUserConfig();
    }
}

function handleSliderChange(category, value) {
    percentages[category] = parseFloat(value);
    updatePercentageDisplays();
    updateAmounts();
    updateTotalPercentage();
    updateDashboard();
    saveUserConfig();
}

// ===== EXPENSE MANAGEMENT =====
function navigateMonth(direction) {
    if (direction === 'next') {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
    } else {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
    }
    
    updateMonthDisplay();
    updateExpensesDisplay();
}

function updateMonthDisplay() {
    const monthDisplay = document.getElementById('current-month-display');
    if (monthDisplay) {
        monthDisplay.textContent = `${getMonthName(currentMonth)} ${currentYear}`;
    }
}

async function addExpense(name, amount, category, type, installments = null) {
    const expense = {
        id: Date.now() + Math.random(),
        name: name.trim(),
        amount: parseFloat(amount),
        type,
        installments: installments ? {
            total: parseInt(installments),
            current: 1
        } : null,
        createdAt: new Date().toISOString()
    };
    
    // Add to current month
    addExpenseToMonth(expense, currentMonth, currentYear, category);
    
    // Save to Supabase
    await saveExpenseToSupabase(expense, category, currentMonth, currentYear);
    
    // Handle different expense types
    if (type === 'fixa') {
        // Apply to next 11 months
        for (let i = 1; i <= 11; i++) {
            const futureMonth = (currentMonth + i) % 12;
            const futureYear = currentYear + Math.floor((currentMonth + i) / 12);
            
            const futureExpense = {
                ...expense,
                id: expense.id + i,
                isFixed: true,
                originalId: expense.id
            };
            
            addExpenseToMonth(futureExpense, futureMonth, futureYear, category);
            await saveExpenseToSupabase(futureExpense, category, futureMonth, futureYear);
        }
    } else if (type === 'parcelada' && installments) {
        // Add installments to future months
        for (let i = 1; i < installments; i++) {
            const futureMonth = (currentMonth + i) % 12;
            const futureYear = currentYear + Math.floor((currentMonth + i) / 12);
            
            const installmentExpense = {
                ...expense,
                id: expense.id + i,
                installments: {
                    total: parseInt(installments),
                    current: i + 1
                },
                originalId: expense.id
            };
            
            addExpenseToMonth(installmentExpense, futureMonth, futureYear, category);
            await saveExpenseToSupabase(installmentExpense, category, futureMonth, futureYear);
        }
    }
    
    updateExpensesDisplay();
    updateDashboard();
}

function addExpenseToMonth(expense, month, year, categoryId) {
    if (!gastosPorMes[year]) {
        gastosPorMes[year] = {};
    }
    if (!gastosPorMes[year][month]) {
        gastosPorMes[year][month] = {};
    }
    if (!gastosPorMes[year][month][categoryId]) {
        gastosPorMes[year][month][categoryId] = [];
    }
    
    gastosPorMes[year][month][categoryId].push(expense);
}

async function removeExpense(category, expenseId) {
    const removed = removeExpenseFromMonth(category, expenseId, currentMonth, currentYear);
    
    if (removed) {
        await removeExpenseFromSupabase(expenseId);
        
        const expense = removed;
        
        // Handle different expense types for removal
        if (expense.type === 'fixa' || expense.type === 'parcelada') {
            // Remove from all months
            Object.keys(gastosPorMes).forEach(year => {
                Object.keys(gastosPorMes[year]).forEach(month => {
                    if (gastosPorMes[year][month][category]) {
                        gastosPorMes[year][month][category] = gastosPorMes[year][month][category].filter(exp => 
                            exp.originalId !== expense.id && exp.id !== expense.id
                        );
                    }
                });
            });
        }
        
        updateExpensesDisplay();
        updateDashboard();
    }
}

function removeExpenseFromMonth(category, expenseId, month, year) {
    if (gastosPorMes[year] && gastosPorMes[year][month] && gastosPorMes[year][month][category]) {
        const index = gastosPorMes[year][month][category].findIndex(exp => exp.id === expenseId);
        
        if (index !== -1) {
            return gastosPorMes[year][month][category].splice(index, 1)[0];
        }
    }
    
    return null;
}

function getExpensesForMonth(month, year) {
    return (gastosPorMes[year] && gastosPorMes[year][month]) || {};
}

function getCategoryTotal(category, month, year) {
    const monthExpenses = getExpensesForMonth(month, year);
    const categoryExpenses = monthExpenses[category] || [];
    return categoryExpenses.reduce((total, expense) => total + expense.amount, 0);
}

function getTotalGastoMes(month, year) {
    let total = 0;
    categorias.forEach(categoria => {
        total += getCategoryTotal(categoria.id, month, year);
    });
    return total;
}

// ===== EXPENSES DISPLAY =====
function updateExpensesDisplay() {
    const expensesGrid = document.getElementById('expenses-grid');
    if (!expensesGrid) return;
    
    expensesGrid.innerHTML = '';
    
    categorias.forEach(categoria => {
        const monthExpenses = getExpensesForMonth(currentMonth, currentYear);
        const categoryExpenses = monthExpenses[categoria.id] || [];
        const categoryTotal = getCategoryTotal(categoria.id, currentMonth, currentYear);
        const categoryBudget = getCategoryBudget(categoria.id);
        const balance = categoryBudget - categoryTotal;
        
        const columnDiv = document.createElement('div');
        columnDiv.className = 'category-column';
        columnDiv.style.setProperty('--category-color', categoria.cor);
        
        // Header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'category-column-header';
        
        const headerTitle = document.createElement('h4');
        headerTitle.textContent = categoria.nome;
        headerDiv.appendChild(headerTitle);
        
        const budgetInfo = document.createElement('div');
        budgetInfo.className = 'category-budget-info';
        budgetInfo.textContent = `Orçamento: ${formatCurrency(categoryBudget)}`;
        headerDiv.appendChild(budgetInfo);
        
        columnDiv.appendChild(headerDiv);
        
        // Body
        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'category-column-body';
        
        if (categoryExpenses.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-category';
            emptyDiv.textContent = 'Nenhum gasto nesta categoria';
            bodyDiv.appendChild(emptyDiv);
        } else {
            const expensesList = document.createElement('ul');
            expensesList.className = 'expenses-list';
            
            categoryExpenses.forEach(expense => {
                const listItem = document.createElement('li');
                listItem.className = 'expense-item';
                
                const expenseInfo = document.createElement('div');
                expenseInfo.className = 'expense-info';
                
                const expenseName = document.createElement('div');
                expenseName.className = 'expense-name';
                expenseName.innerHTML = `${expenseTypeIcons[expense.type]} ${expense.name}`;
                expenseInfo.appendChild(expenseName);
                
                // Add details for installments and fixed expenses
                if (expense.installments) {
                    const expenseDetails = document.createElement('div');
                    expenseDetails.className = 'expense-details';
                    expenseDetails.textContent = `Parcela ${expense.installments.current}/${expense.installments.total}`;
                    expenseInfo.appendChild(expenseDetails);
                } else if (expense.type === 'fixa' || expense.isFixed) {
                    const expenseDetails = document.createElement('div');
                    expenseDetails.className = 'expense-details';
                    expenseDetails.textContent = 'Despesa fixa mensal';
                    expenseInfo.appendChild(expenseDetails);
                }
                
                listItem.appendChild(expenseInfo);
                
                const expenseAmount = document.createElement('div');
                expenseAmount.className = 'expense-amount';
                expenseAmount.textContent = formatCurrency(expense.amount);
                listItem.appendChild(expenseAmount);
                
                const removeButton = document.createElement('button');
                removeButton.className = 'expense-remove';
                removeButton.innerHTML = '🗑️';
                removeButton.title = 'Remover gasto';
                removeButton.onclick = () => removeExpense(categoria.id, expense.id);
                listItem.appendChild(removeButton);
                
                expensesList.appendChild(listItem);
            });
            
            bodyDiv.appendChild(expensesList);
        }
        
        columnDiv.appendChild(bodyDiv);
        
        // Footer
        const footerDiv = document.createElement('div');
        footerDiv.className = 'category-column-footer';
        
        const totalsDiv = document.createElement('div');
        totalsDiv.className = 'category-totals';
        
        const totalDiv = document.createElement('div');
        totalDiv.className = 'category-total';
        totalDiv.innerHTML = `<span>Total Gasto:</span><span>${formatCurrency(categoryTotal)}</span>`;
        totalsDiv.appendChild(totalDiv);
        
        const balanceDiv = document.createElement('div');
        balanceDiv.className = `category-balance ${balance >= 0 ? 'positive' : 'negative'}`;
        balanceDiv.innerHTML = `<span>Saldo:</span><span>${formatCurrency(Math.abs(balance))}</span>`;
        totalsDiv.appendChild(balanceDiv);
        
        footerDiv.appendChild(totalsDiv);
        columnDiv.appendChild(footerDiv);
        
        expensesGrid.appendChild(columnDiv);
    });
}

// ===== FORM HANDLING =====
function handleExpenseForm(e) {
    e.preventDefault();
    
    const name = document.getElementById('expense-name').value.trim();
    const amount = document.getElementById('expense-amount').value;
    const category = document.getElementById('expense-category').value;
    const typeRadio = document.querySelector('input[name="expense-type"]:checked');
    const type = typeRadio ? typeRadio.value : null;
    const installments = document.getElementById('expense-installments').value;
    
    if (!name || !amount || !category || !type) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }
    
    if (type === 'parcelada' && (!installments || installments < 2 || installments > 24)) {
        alert('Para despesas parceladas, informe o número de parcelas entre 2 e 24.');
        return;
    }
    
    addExpense(name, amount, category, type, type === 'parcelada' ? installments : null);
    
    // Reset form
    e.target.reset();
    const installmentsGroup = document.getElementById('installments-group');
    if (installmentsGroup) {
        installmentsGroup.style.display = 'none';
    }
}

function handleLoginForm(e) {
    e.preventDefault();
    
    const username = document.getElementById('username-input').value.trim();
    
    if (!username) {
        alert('Por favor, digite um nome de usuário.');
        return;
    }
    
    handleLogin(username);
}

// ===== UPDATE ALL DISPLAYS =====
function updateAllDisplays() {
    // Update income input
    const incomeInput = document.getElementById('monthly-income');
    if (incomeInput) {
        incomeInput.value = monthlyIncome;
    }
    
    // Update sliders
    categorias.forEach(categoria => {
        const slider = document.getElementById(`slider-${categoria.id}`);
        if (slider) {
            slider.value = percentages[categoria.id];
        }
    });
    
    // Update displays
    updatePercentageDisplays();
    updateAmounts();
    updateTotalPercentage();
    updateMonthDisplay();
    updateExpensesDisplay();
    updateDashboard();
}

// ===== SETUP FUNCTIONS =====
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const tabName = this.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function setupThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
}

function setupDashboardNavigation() {
    const prevBtn = document.getElementById('dashboard-prev-month');
    const nextBtn = document.getElementById('dashboard-next-month');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => navigateDashboardMonth('prev'));
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigateDashboardMonth('next'));
    }
}

function setupMonthNavigation() {
    const prevBtn = document.getElementById('prev-month');
    const nextBtn = document.getElementById('next-month');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => navigateMonth('prev'));
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigateMonth('next'));
    }
}

function setupExpenseForm() {
    const form = document.getElementById('expense-form');
    const typeRadios = document.querySelectorAll('input[name="expense-type"]');
    const installmentsGroup = document.getElementById('installments-group');
    
    if (form) {
        form.addEventListener('submit', handleExpenseForm);
    }
    
    typeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (installmentsGroup) {
                installmentsGroup.style.display = this.value === 'parcelada' ? 'block' : 'none';
            }
        });
    });
}

function setupLoginForm() {
    const form = document.getElementById('login-form');
    if (form) {
        form.addEventListener('submit', handleLoginForm);
    }
}

function setupConfigControls() {
    // Income input
    const incomeInput = document.getElementById('monthly-income');
    if (incomeInput) {
        incomeInput.addEventListener('input', handleIncomeInput);
        incomeInput.addEventListener('change', handleIncomeInput);
        incomeInput.addEventListener('blur', handleIncomeInput);
    }
    
    // Sliders
    categorias.forEach(categoria => {
        const slider = document.getElementById(`slider-${categoria.id}`);
        if (slider) {
            ['input', 'change'].forEach(eventType => {
                slider.addEventListener(eventType, function(e) {
                    handleSliderChange(categoria.id, e.target.value);
                });
            });
        }
    });
}

// ===== INITIALIZE APPLICATION =====
function initApp() {
    console.log('Inicializando aplicativo de orçamento...');
    
    // Initialize theme
    initTheme();
    
    // Setup all components
    setupTabs();
    setupThemeToggle();
    setupDashboardNavigation();
    setupMonthNavigation();
    setupExpenseForm();
    setupLoginForm();
    setupConfigControls();
    
    // Check user login and load data
    checkUserLogin();
    
    console.log('Aplicativo inicializado com sucesso');
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Save data periodically
setInterval(() => {
    if (currentUser) {
        saveUserConfig();
    }
}, 30000); // Save every 30 seconds
