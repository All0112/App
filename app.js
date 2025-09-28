// ----------------------- SUPABASE -----------------------
const SUPABASE_URL = 'https://iballqwxsxkpltyustgj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliYWxscXd4c3hrcGx0eXVzdGdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwNTc2MzAsImV4cCI6MjA3NDYzMzYzMH0.Z4WKcwVS5FFfbtaaiyBI0p348_v00pOYDYTq_6bDgGE';

// Cliente real Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ----------------------- VARIÁVEIS GLOBAIS -----------------------
let currentUser = null;
let isSyncing = false;

let monthlyIncome = 20000;
let currentMonth = '2025-09';
let chart = null;
let percentages = {
    'custos-fixos': 40,
    'conforto': 20,
    'metas': 5,
    'prazeres': 5,
    'liberdade-financeira': 25,
    'conhecimento': 5
};
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
let savedConfigurations = {};
let nextExpenseId = 11;

const categories = {
    'custos-fixos': { name: 'Custos fixos', color: '#1FB8CD' },
    'conforto': { name: 'Conforto', color: '#FFC185' },
    'metas': { name: 'Metas', color: '#B4413C' },
    'prazeres': { name: 'Prazeres', color: '#ECEBD5' },
    'liberdade-financeira': { name: 'Liberdade Financeira', color: '#5D878F' },
    'conhecimento': { name: 'Conhecimento', color: '#DB4545' }
};
const chartColors = ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545'];
const expenseTypeIcons = { 'unica': '🔹', 'fixa': '🔸', 'parcelada': '🔺' };

// ----------------------- SUPABASE FUNCTIONS -----------------------
async function loginUser(username) {
    if (!supabaseClient) return false;
    try {
        setSyncStatus('syncing', '🔄 Conectando...');
        const { data: existingUser, error: selectError } = await supabaseClient
            .from('usuarios')
            .select('*')
            .eq('username', username)
            .single();

        let userData;

        if (existingUser) {
            userData = existingUser;
            showLoginMessage('Login realizado com sucesso!', 'success');
        } else {
            const defaultData = {
                monthlyIncome: 20000,
                percentages,
                gastosPorMes: { '2025-09': [] },
                savedConfigurations: {},
                currentMonth: '2025-09',
                currentYear: 2025
            };

            const { data: newUser, error: insertError } = await supabaseClient
                .from('usuarios')
                .insert([{ username, dados_orcamento: defaultData }])
                .select()
                .single();

            if (insertError) throw insertError;
            userData = newUser;
            showLoginMessage('Conta criada e login realizado com sucesso!', 'success');
        }

        await loadUserDataFromCloud(userData);
        currentUser = username;
        showMainApp();
        setSyncStatus('synced', '✅ Sincronizado');
        return true;

    } catch (error) {
        console.error('Erro no login:', error);
        setSyncStatus('error', '❌ Erro de conexão');
        showLoginMessage('Erro ao fazer login: ' + (error.message || 'Erro desconhecido'), 'error');
        return false;
    }
}

async function loadUserDataFromCloud(userData) {
    try {
        const dadosOrcamento = userData.dados_orcamento || {};
        monthlyIncome = dadosOrcamento.monthlyIncome || 20000;
        percentages = dadosOrcamento.percentages || percentages;
        expenses = dadosOrcamento.gastosPorMes || expenses;
        savedConfigurations = dadosOrcamento.savedConfigurations || {};
        currentMonth = dadosOrcamento.currentMonth || currentMonth;

        let maxId = 0;
        Object.values(expenses).forEach(monthExpenses => {
            monthExpenses.forEach(expense => {
                if (expense.id > maxId) maxId = expense.id;
            });
        });
        nextExpenseId = maxId + 1;

    } catch (error) {
        console.error('Erro ao carregar dados:', error);
    }
}

async function saveUserDataToCloud() {
    if (!supabaseClient || !currentUser || isSyncing) return false;
    try {
        isSyncing = true;
        setSyncStatus('syncing', '🔄 Salvando...');
        const dadosOrcamento = { monthlyIncome, percentages, gastosPorMes: expenses, savedConfigurations, currentMonth, currentYear: parseInt(currentMonth.split('-')[0]) };
        const { error } = await supabaseClient
            .from('usuarios')
            .update({ dados_orcamento: dadosOrcamento, updated_at: new Date().toISOString() })
            .eq('username', currentUser);

        if (error) throw error;
        setSyncStatus('synced', '✅ Salvo');
        return true;
    } catch (error) {
        console.error('Erro ao salvar dados:', error);
        setSyncStatus('error', '❌ Erro ao salvar');
        return false;
    } finally {
        isSyncing = false;
    }
}

// ----------------------- UI HELPERS -----------------------
function showLoginScreen() { document.getElementById('login-screen').classList.remove('hidden'); document.getElementById('main-app').classList.add('hidden'); }
function showMainApp() { document.getElementById('login-screen').classList.add('hidden'); document.getElementById('main-app').classList.remove('hidden'); document.getElementById('current-username').textContent = currentUser; updateAllDisplays(); }
function showLoginMessage(msg, type = 'info') { const el = document.getElementById('login-message'); if(el){ el.textContent = msg; el.className=`login-message ${type}`; el.classList.remove('hidden'); } }
function hideLoginMessage() { const el = document.getElementById('login-message'); if(el) el.classList.add('hidden'); }
function setSyncStatus(status, text) { const el=document.getElementById('sync-indicator'); if(el){ el.textContent=text; el.className=`sync-indicator ${status}`;} }
function logout() { currentUser=null; monthlyIncome=20000; currentMonth='2025-09'; percentages={ 'custos-fixos':40,'conforto':20,'metas':5,'prazeres':5,'liberdade-financeira':25,'conhecimento':5 }; expenses={}; savedConfigurations={}; nextExpenseId=1; showLoginScreen(); hideLoginMessage(); setSyncStatus('',''); }

// ----------------------- EVENT HANDLERS -----------------------
function setupLoginHandlers() {
    const loginBtn = document.getElementById('login-btn');
    const usernameInput = document.getElementById('username');
    const logoutBtn = document.getElementById('logout-btn');

    if(loginBtn && usernameInput){
        loginBtn.addEventListener('click', async ()=>{
            const username=usernameInput.value.trim();
            if(!username){ showLoginMessage('Por favor, digite um nome de usuário','error'); return; }
            loginBtn.disabled=true;
            const success=await loginUser(username);
            loginBtn.disabled=false;
            if(success) usernameInput.value='';
        });
        usernameInput.addEventListener('keypress', (e)=>{if(e.key==='Enter') loginBtn.click();});
        usernameInput.addEventListener('input', hideLoginMessage);
    }
    if(logoutBtn) logoutBtn.addEventListener('click', ()=>{if(confirm('Tem certeza que deseja sair? Dados não salvos serão perdidos.')) logout();});
}

// ----------------------- UTILITIES -----------------------
function formatCurrency(amount){ return isNaN(amount)?'R$ 0,00':'R$ '+amount.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function formatPercentage(value){ return isNaN(value)?'0,0%':value.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%'; }

// ----------------------- INITIALIZATION -----------------------
document.addEventListener('DOMContentLoaded', async function(){
    console.log('🚀 Inicializando app...');
    setupLoginHandlers();
    initializeTabs();
    setupEventHandlers();
    showLoginScreen();
});
