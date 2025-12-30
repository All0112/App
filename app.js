// ===== CONFIGURAÇÃO DA API GOOGLE SHEETS =====
// Substitua a URL abaixo pela URL do seu Web App (Apps Script)
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyf-_QLBDakKcyWUTboKf4BlB12i0-VgHq2XVBBRTQ3DAQJr9klkAsGYbFg1pn33iAfQg/exec';

// ===== VARIÁVEIS GLOBAIS =====
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

// Mês/Ano atual para controle de gastos
let currentMonth = 9; // Outubro (0-based: Janeiro é 0)
let currentYear = 2025;

// Mês/Ano do Dashboard (pode ser diferente dos gastos)
let dashboardMonth = 9;
let dashboardYear = 2025;

// Armazenamento de gastos
let gastosPorMes = {}; // {ano: {mes: {categoria: [gastos]}}}

// Configuração das categorias
const categorias = [
    {id: "custos-fixos", nome: "🏠 Custos fixos", emoji: "🏠", cor: "#1FB8CD"},
    {id: "conforto", nome: "🛋️ Conforto", emoji: "🛋️", cor: "#FFC185"},
    {id: "metas", nome: "🎯 Metas", emoji: "🎯", cor: "#B4413C"},
    {id: "prazeres", nome: "🎉 Prazeres", emoji: "🎉", cor: "#ECEBD5"},
    {id: "liberdade-financeira", nome: "💰 Liberdade Financeira", emoji: "💰", cor: "#5D878F"},
    {id: "conhecimento", nome: "📚 Conhecimento", emoji: "📚", cor: "#DB4545"}
];

// Ícones dos tipos de despesa
const expenseTypeIcons = {
    'unica': '🛒',
    'fixa': '📅',
    'parcelada': '💳'
};

// Instância do gráfico
let expenseChart = null;

// ===== FUNÇÕES UTILITÁRIAS =====
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

// ===== GERENCIAMENTO DE TEMA =====
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

// ===== AUTENTICAÇÃO E DADOS (AGORA COM GOOGLE SHEETS) =====

// Função principal para chamar o Google Apps Script
async function callGoogleAPI(action, data = {}) {
    // Verifica se o usuário configurou a URL
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('COLE_SUA_URL')) {
        console.warn('URL da API Google não configurada no app.js');
        return null;
    }

    const payload = JSON.stringify({
        action: action,
        data: data
    });

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: payload
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error("Erro na comunicação com Google Sheets:", error);
        return { status: 'error', message: error.toString() };
    }
}

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
        
        // Salvar no localStorage para lembrar depois
        localStorage.setItem('budget-app-username', currentUser);
        
        // Carregar dados da nuvem (Google Sheets)
        await loadUserData();
        
        // Atualizar UI
        updateUserWelcome();
        hideLoginModal();
        updateAllDisplays();
        
    } catch (error) {
        console.error('Erro no login:', error);
        alert('Erro ao fazer login. Tente novamente.');
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
        
        // Tenta carregar da nuvem, se falhar ou demorar, carrega local
        loadUserData(); 
        
        updateAllDisplays();
    } else {
        showLoginModal();
    }
}

// ===== CARREGAMENTO E SALVAMENTO DE DADOS =====

async function loadUserData() {
    if (!currentUser) return;
    
    // Feedback visual (cursor de espera)
    document.body.style.cursor = 'wait';
    console.log('Buscando dados no Google Sheets...');

    try {
        const result = await callGoogleAPI('read_data', { username: currentUser });
        
        if (result && result.status === 'success') {
            console.log('Dados recebidos com sucesso!');

            // 1. Carregar Configurações (Renda e Porcentagens)
            if (result.config) {
                monthlyIncome = Number(result.config.renda) || 0;
                if (result.config.percentages) {
                    // Mescla com as porcentagens padrão para garantir que todas existam
                    percentages = { ...percentages, ...result.config.percentages };
                }
            }

            // 2. Carregar Gastos e formatar para o App
            gastosPorMes = {}; // Limpa dados locais
            
            if (result.expenses && Array.isArray(result.expenses)) {
                result.expenses.forEach(expense => {
                    const year = expense.ano;
                    const month = expense.mes;
                    const category = expense.categoria;
                    
                    // Cria estrutura de objetos se não existir
                    if (!gastosPorMes[year]) gastosPorMes[year] = {};
                    if (!gastosPorMes[year][month]) gastosPorMes[year][month] = {};
                    if (!gastosPorMes[year][month][category]) gastosPorMes[year][month][category] = [];
                    
                    // Transforma do formato da planilha para o formato do App
                    const expenseObj = {
                        id: expense.id,
                        name: expense.item, // Na planilha é 'item', no app é 'name'
                        amount: Number(expense.valor), // Na planilha é 'valor', no app é 'amount'
                        type: expense.tipo,
                        installments: expense.totalParcelas > 1 ? {
                            current: expense.parcelaAtual,
                            total: expense.totalParcelas
                        } : null,
                        createdAt: expense.created_at
                    };
                    
                    gastosPorMes[year][month][category].push(expenseObj);
                });
            }
            
            updateAllDisplays();
        } else {
            console.warn('Falha ao buscar dados ou usuário novo. Usando dados locais.');
            loadLocalData();
        }
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        loadLocalData(); // Fallback
    } finally {
        document.body.style.cursor = 'default';
    }
}

async function saveUserConfig() {
    // Salva localmente primeiro (para resposta rápida)
    saveLocalData();

    if (!currentUser) return;
    
    // Salva na nuvem em segundo plano
    try {
        const configData = {
            username: currentUser,
            renda: monthlyIncome,
            percentages: percentages
        };
        
        await callGoogleAPI('save_config', configData);
        
    } catch (error) {
        console.error('Erro ao salvar configuração na nuvem:', error);
    }
}

async function saveExpenseToCloud(expense, category, month, year) {
    if (!currentUser) return;
    
    try {
        // Prepara objeto igual aos cabeçalhos da planilha
        const expenseData = {
            id: expense.id,
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
        
        await callGoogleAPI('add_expense', expenseData);
        
    } catch (error) {
        console.error('Erro ao salvar gasto na nuvem:', error);
    }
}

async function removeExpenseFromCloud(expenseId) {
    if (!currentUser) return;
    
    try {
        await callGoogleAPI('delete_expense', { id: expenseId });
    } catch (error) {
        console.error('Erro ao remover gasto da nuvem:', error);
    }
}

// ===== LOCAL STORAGE (BACKUP) =====
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

// ===== GERENCIAMENTO DE ABAS =====
function switchTab(tabName) {
    // Esconde todas as abas
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove classe ativa dos botões
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Mostra aba selecionada
    const targetTab = document.getElementById(tabName);
    const targetBtn = document.querySelector(`[data-tab="${tabName}"]`);
    
    if (targetTab) targetTab.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active');
    
    // Atualiza displays baseados na aba
    if (tabName === 'dashboard') {
        updateDashboard();
    } else if (tabName === 'gastos') {
        updateExpensesDisplay();
    }
}

// ===== FUNÇÕES DO DASHBOARD =====
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
    
    // Destrói gráfico existente
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
    
    // Se não há gastos, mostrar categorias com budget para o gráfico não ficar vazio
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

// ===== CONFIGURAÇÃO DE ORÇAMENTO =====
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

// ===== GERENCIAMENTO DE GASTOS =====
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
        id: Date.now() + Math.random(), // ID único
        name: name.trim(),
        amount: parseFloat(amount),
        type,
        installments: installments ? {
            total: parseInt(installments),
            current: 1
        } : null,
        createdAt: new Date().toISOString()
    };
    
    // Adiciona ao mês atual localmente (para visualização imediata)
    addExpenseToMonth(expense, currentMonth, currentYear, category);
    
    // Salva na nuvem (Planilha Google)
    await saveExpenseToCloud(expense, category, currentMonth, currentYear);
    
    // Salva backup local
    saveLocalData();
    
    // Lógica para despesas fixas e parceladas
    if (type === 'fixa') {
        // Replica para os próximos 11 meses
        for (let i = 1; i <= 11; i++) {
            const futureMonth = (currentMonth + i) % 12;
            const futureYear = currentYear + Math.floor((currentMonth + i) / 12);
            
            const futureExpense = {
                ...expense,
                id: expense.id + i, // Novo ID
                isFixed: true,
                originalId: expense.id
            };
            
            addExpenseToMonth(futureExpense, futureMonth, futureYear, category);
            // Salva futuro na nuvem (background, sem await para não travar UI)
            saveExpenseToCloud(futureExpense, category, futureMonth, futureYear);
        }
    } else if (type === 'parcelada' && installments) {
        // Adiciona parcelas futuras
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
            saveExpenseToCloud(installmentExpense, category, futureMonth, futureYear);
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
        // Remove da nuvem
        await removeExpenseFromCloud(expenseId);
        
        // Remove backup local
        saveLocalData();
        
        const expense = removed;
        
        // Lógica para remover despesas relacionadas (fixas ou parcelas)
        if (expense.type === 'fixa' || expense.type === 'parcelada') {
            // Remove de todos os meses (localmente)
            Object.keys(gastosPorMes).forEach(year => {
                Object.keys(gastosPorMes[year]).forEach(month => {
                    if (gastosPorMes[year][month][category]) {
                        // Filtra removendo os relacionados
                        gastosPorMes[year][month][category] = gastosPorMes[year][month][category].filter(exp => 
                            exp.originalId !== expense.id && exp.id !== expense.id
                        );
                        
                        // NOTA: Para limpar completamente do Google Sheets as parcelas futuras, 
                        // o ideal seria ter uma lógica de backend mais complexa. 
                        // Por enquanto, deletamos apenas a selecionada no servidor e todas localmente.
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

// ===== EXIBIÇÃO DE GASTOS =====
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
                expenseName.innerHTML = `${expenseTypeIcons[expense.type] || '🛒'} ${expense.name}`;
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

// ===== MANIPULAÇÃO DE FORMULÁRIOS =====
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

// ===== ATUALIZAÇÃO DE TODA A UI =====
function updateAllDisplays() {
    // Atualiza input de renda
    const incomeInput = document.getElementById('monthly-income');
    if (incomeInput) {
        incomeInput.value = monthlyIncome;
    }
    
    // Atualiza sliders
    categorias.forEach(categoria => {
        const slider = document.getElementById(`slider-${categoria.id}`);
        if (slider) {
            slider.value = percentages[categoria.id];
        }
    });
    
    // Atualiza todos os displays
    updatePercentageDisplays();
    updateAmounts();
    updateTotalPercentage();
    updateMonthDisplay();
    updateExpensesDisplay();
    updateDashboard();
}

// ===== FUNÇÕES DE SETUP (INICIALIZAÇÃO) =====
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
    // Input de renda
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

// ===== INICIALIZAÇÃO DO APLICATIVO =====
function initApp() {
    console.log('Inicializando aplicativo de orçamento com Google Sheets...');
    
    // Inicializa tema
    initTheme();
    
    // Setup de todos os componentes
    setupTabs();
    setupThemeToggle();
    setupDashboardNavigation();
    setupMonthNavigation();
    setupExpenseForm();
    setupLoginForm();
    setupConfigControls();
    
    // Verifica login e carrega dados
    checkUserLogin();
    
    console.log('Aplicativo inicializado com sucesso');
}

// Espera o DOM estar pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Salva dados periodicamente (backup local)
setInterval(() => {
    saveLocalData();
}, 30000); // Salva a cada 30 segundos
