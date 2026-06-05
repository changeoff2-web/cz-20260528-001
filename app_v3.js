import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6Yme6FyvAfiucD5ur4TxHqW60_k2HPbI",
  authDomain: "cz-vc-01-1c2f3.firebaseapp.com",
  projectId: "cz-vc-01-1c2f3",
  storageBucket: "cz-vc-01-1c2f3.firebasestorage.app",
  messagingSenderId: "152532065667",
  appId: "1:152532065667:web:d8d91e5bbc35ec88b26ab6",
  measurementId: "G-JX6X2SEZH7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;

const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'];
const TOTAL_GLASSES = 8;
const LOCAL_STORAGE_KEY = 'berra_diet_planner_v2'; // Used for 1-time migration

const mealNames = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner'
};

const getEmptyDay = () => ({
  date: new Date().toDateString(),
  water: 0,
  meals: { breakfast: [], lunch: [], snacks: [], dinner: [] }
});

let appData = { current: getEmptyDay(), history: [] };
let calendarViewDate = new Date();
let activeDateObj = new Date();
let activeRecord = null;

// DOM Elements
let dateDisplay, waterContainer, totalCaloriesDisplay, restartBtn, viewHistoryBtn;
let historyModal, closeModalBtn, summaryMessage;
let calendarContainer, historyDetailContainer, calendarGrid, calendarMonthYear;
let prevMonthBtn, nextMonthBtn, backToCalendarBtn, detailDateDisplay, detailContent;
let authOverlay, mainAppContainer, loginBtn, logoutBtn, authErrorMsg;
let prevDayBtn, nextDayBtn;

document.addEventListener('DOMContentLoaded', boot);

function boot() {
  dateDisplay = document.getElementById('dateDisplay');
  waterContainer = document.getElementById('waterContainer');
  totalCaloriesDisplay = document.getElementById('totalCaloriesDisplay');
  restartBtn = document.getElementById('restartBtn');
  viewHistoryBtn = document.getElementById('viewHistoryBtn');
  historyModal = document.getElementById('historyModal');
  closeModalBtn = document.getElementById('closeModalBtn');
  summaryMessage = document.getElementById('summaryMessage');

  calendarContainer = document.getElementById('calendarContainer');
  historyDetailContainer = document.getElementById('historyDetailContainer');
  calendarGrid = document.getElementById('calendarGrid');
  calendarMonthYear = document.getElementById('calendarMonthYear');
  prevMonthBtn = document.getElementById('prevMonthBtn');
  nextMonthBtn = document.getElementById('nextMonthBtn');
  backToCalendarBtn = document.getElementById('backToCalendarBtn');
  detailDateDisplay = document.getElementById('detailDateDisplay');
  detailContent = document.getElementById('detailContent');

  authOverlay = document.getElementById('authOverlay');
  mainAppContainer = document.getElementById('mainAppContainer');
  loginBtn = document.getElementById('loginBtn');
  logoutBtn = document.getElementById('logoutBtn');
  authErrorMsg = document.getElementById('authErrorMsg');
  prevDayBtn = document.getElementById('prevDayBtn');
  nextDayBtn = document.getElementById('nextDayBtn');

  loginBtn.addEventListener('click', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);

  setupEventListeners();

  // Listen to Firebase Auth state
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      authOverlay.style.display = 'none';
      mainAppContainer.style.display = 'block';
      await loadCloudData();
      initApp();
    } else {
      currentUser = null;
      mainAppContainer.style.display = 'none';
      authOverlay.style.display = 'flex';
    }
  });
}

async function handleLogin() {
  const provider = new GoogleAuthProvider();
  authErrorMsg.style.display = 'none';
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Login Error:", error);
    if(error.code === 'auth/configuration-not-found') {
      authErrorMsg.textContent = "Google Login is not enabled in Firebase Console. Please go to Authentication -> Sign-in method -> Enable Google.";
    } else {
      authErrorMsg.textContent = "Login Failed: " + error.message;
    }
    authErrorMsg.style.display = 'block';
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout Error:", error);
  }
}

async function loadCloudData() {
  if (!currentUser) return;
  try {
    const docRef = doc(db, "users", currentUser.uid);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const parsed = docSnap.data();
      appData.current = parsed.current || getEmptyDay();
      appData.history = parsed.history || [];
    } else {
      // Migrate local data on first cloud login
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (parsed && parsed.current) appData.current = parsed.current;
          if (parsed && parsed.history) appData.history = parsed.history;
        } catch(e) {}
      }
      await saveCloudData();
    }
  } catch (e) {
    console.error("Firestore Load Error:", e);
    if(e.code === 'permission-denied') {
      alert("Firestore Error: Permission Denied. Please ensure Firestore is created and rules allow reads/writes.");
    }
  }
}

async function saveCloudData() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "users", currentUser.uid), appData);
  } catch(e) {
    console.error("Firestore Save Error:", e);
  }
  updateTotalCalories();
}

function initApp() {
  checkNewDay();
  activeDateObj = new Date();
  setActiveDate();
}

function changeDay(offset) {
  activeDateObj.setDate(activeDateObj.getDate() + offset);
  setActiveDate();
}

function setActiveDate() {
  const targetDateStr = activeDateObj.toDateString();
  const todayStr = new Date().toDateString();
  
  if (targetDateStr === todayStr) {
    if (appData.current.date !== todayStr) checkNewDay();
    activeRecord = appData.current;
  } else {
    let hist = appData.history.find(h => h.date === targetDateStr);
    if (!hist) {
      hist = { date: targetDateStr, water: 0, meals: { breakfast: [], lunch: [], snacks: [], dinner: [] }, totalCal: 0 };
      appData.history.push(hist);
      appData.history.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    activeRecord = hist;
  }
  
  renderDate();
  renderWaterTracker();
  MEALS.forEach(meal => renderMealItems(meal));
  updateTotalCalories();
}

function checkNewDay() {
  const today = new Date().toDateString();
  if (appData.current.date !== today) {
    const hasData = appData.current.water > 0 || MEALS.some(m => appData.current.meals[m] && appData.current.meals[m].length > 0);
    if (hasData) saveCurrentToHistory();
    appData.current = getEmptyDay();
    saveCloudData();
  }
}

function saveCurrentToHistory() {
  const totalCal = MEALS.reduce((sum, meal) => {
    return sum + (appData.current.meals[meal] ? appData.current.meals[meal].reduce((mSum, item) => mSum + item.cal, 0) : 0);
  }, 0);

  const historyEntry = {
    ...JSON.parse(JSON.stringify(appData.current)),
    totalCal
  };

  const existingIndex = appData.history.findIndex(h => h.date === historyEntry.date);
  if (existingIndex > -1) {
    appData.history[existingIndex] = historyEntry;
  } else {
    appData.history.push(historyEntry);
  }
  
  appData.history.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderDate() {
  if(!dateDisplay) return;
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  dateDisplay.textContent = activeDateObj.toLocaleDateString('en-US', options);
}

function renderWaterTracker() {
  if(!waterContainer) return;
  waterContainer.innerHTML = '';
  for (let i = 0; i < TOTAL_GLASSES; i++) {
    const glass = document.createElement('div');
    glass.classList.add('glass');
    if (i < activeRecord.water) {
      glass.classList.add('filled');
    }
    glass.addEventListener('click', () => toggleWater(i));
    waterContainer.appendChild(glass);
  }
}

function toggleWater(index) {
  if (index === activeRecord.water - 1) {
    activeRecord.water--; 
  } else {
    activeRecord.water = index + 1;
  }
  saveCloudData();
  renderWaterTracker();
}

function updateTotalCalories() {
  const total = MEALS.reduce((sum, meal) => {
    return sum + (activeRecord.meals[meal] ? activeRecord.meals[meal].reduce((mSum, item) => mSum + item.cal, 0) : 0);
  }, 0);
  if (activeRecord !== appData.current) {
    activeRecord.totalCal = total;
  }
  if(totalCaloriesDisplay) {
    totalCaloriesDisplay.innerHTML = `${total} <span class="unit">kcal</span>`;
  }
  updateSummary(total);
}

function updateSummary(totalCal) {
  if (!summaryMessage) return;
  
  let message = "";
  if (totalCal === 0 && activeRecord.water === 0) {
    message = "Ready for a productive day, Berra! ✨";
  } else {
    let waterMsg = "";
    if (activeRecord.water === 0) waterMsg = "Don't forget to drink water! 💧";
    else if (activeRecord.water < 4) waterMsg = "Keep hydrating! 💧";
    else if (activeRecord.water < 8) waterMsg = "You're doing great with water! 💧";
    else waterMsg = "Hydration goal reached! 🌊";
    
    let calMsg = "";
    if (totalCal === 0) calMsg = "Time for something delicious.";
    else if (totalCal < 500) calMsg = "A light and fresh start. 🥗";
    else if (totalCal < 1200) calMsg = "Keeping up the energy! 🥑";
    else calMsg = "Great fueling for high-intensity work! 🔥";

    let foodsListHtml = '<div style="margin-top: 16px; text-align: left; font-size: 0.95rem; background: var(--bg-primary); border: 1px solid var(--border-color); padding: 16px; border-radius: var(--radius-md); box-shadow: 0 2px 10px rgba(0,0,0,0.02);">';
    let hasFood = false;
    MEALS.forEach(meal => {
      if (activeRecord.meals[meal] && activeRecord.meals[meal].length > 0) {
        hasFood = true;
        const items = activeRecord.meals[meal].map(i => `${i.name} (${i.cal} kcal)`).join('，');
        foodsListHtml += `<p style="margin-bottom: 8px; border-bottom: 1px dashed var(--border-color); padding-bottom: 4px;"><strong>${mealNames[meal]}:</strong> ${items}</p>`;
      }
    });
    foodsListHtml += '</div>';

    message = `<p style="margin-bottom: 8px;">So far: <strong>${totalCal} kcal</strong>. ${calMsg}</p><p>${waterMsg}</p>`;
    if (hasFood) {
      message += foodsListHtml;
    }
  }
  summaryMessage.innerHTML = message;
}

function renderMealItems(meal) {
  const ul = document.getElementById(`${meal}-items`);
  if(!ul) return;
  ul.innerHTML = '';
  
  if(!activeRecord.meals[meal]) return;

  activeRecord.meals[meal].forEach((item, index) => {
    const li = document.createElement('li');
    li.classList.add('meal-item');
    
    const infoDiv = document.createElement('div');
    infoDiv.classList.add('item-info');
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = item.name;
    
    const calSpan = document.createElement('span');
    calSpan.classList.add('item-cal');
    calSpan.textContent = `${item.cal} kcal`;
    
    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(calSpan);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerHTML = '&times;';
    deleteBtn.addEventListener('click', () => removeMealItem(meal, index));
    
    li.appendChild(infoDiv);
    li.appendChild(deleteBtn);
    ul.appendChild(li);
  });
}

function addMealItem(meal, name, cal) {
  if(!name || name.trim() === '') return;
  if(!activeRecord.meals[meal]) activeRecord.meals[meal] = [];
  activeRecord.meals[meal].push({ name: name.trim(), cal: parseInt(cal) || 0 });
  saveCloudData();
  renderMealItems(meal);
}

function removeMealItem(meal, index) {
  if(activeRecord.meals[meal]) {
    activeRecord.meals[meal].splice(index, 1);
    saveCloudData();
    renderMealItems(meal);
  }
}

// ----- CALENDAR LOGIC ----- //
function renderCalendar() {
  if (!calendarGrid || !calendarMonthYear) return;
  calendarGrid.innerHTML = '';
  
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  calendarMonthYear.textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.classList.add('calendar-cell', 'empty');
    calendarGrid.appendChild(emptyCell);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const cell = document.createElement('div');
    cell.classList.add('calendar-cell');
    
    const dateNum = document.createElement('span');
    dateNum.classList.add('cal-date');
    dateNum.textContent = i;
    cell.appendChild(dateNum);

    const currentCellDateStr = new Date(year, month, i).toDateString();
    const historyEntry = appData.history.find(h => h.date === currentCellDateStr);

    if (historyEntry) {
      cell.classList.add('has-data');
      const stats = document.createElement('span');
      stats.classList.add('cal-stats');
      stats.textContent = `🔥 ${historyEntry.totalCal}`;
      cell.appendChild(stats);
      cell.addEventListener('click', () => showDetailView(historyEntry));
    }
    calendarGrid.appendChild(cell);
  }
}

function showDetailView(historyEntry) {
  if(calendarContainer) calendarContainer.classList.add('hidden');
  if(historyDetailContainer) historyDetailContainer.classList.remove('hidden');
  if(detailDateDisplay) detailDateDisplay.textContent = historyEntry.date;
  if(detailContent) {
    detailContent.innerHTML = '';

    const summaryCard = document.createElement('div');
    summaryCard.classList.add('detail-summary-card');
    summaryCard.innerHTML = `
      <span>💧 ${historyEntry.water}/8 Glasses</span>
      <span style="color:var(--accent-color);">🔥 ${historyEntry.totalCal} kcal</span>
    `;
    detailContent.appendChild(summaryCard);

    let hasFood = false;
    MEALS.forEach(meal => {
      if (historyEntry.meals && historyEntry.meals[meal] && historyEntry.meals[meal].length > 0) {
        hasFood = true;
        const items = historyEntry.meals[meal].map(i => `${i.name} (${i.cal}kcal)`).join(', ');
        
        const mealSection = document.createElement('div');
        mealSection.style.borderTop = '1px solid var(--border-color)';
        mealSection.style.paddingTop = '12px';
        
        mealSection.innerHTML = `
          <p style="font-weight: 600; margin-bottom: 4px; color: var(--text-primary);">${mealNames[meal]}</p>
          <p style="font-size: 0.9rem; color: var(--text-secondary);">${items}</p>
        `;
        detailContent.appendChild(mealSection);
      }
    });

    if (!hasFood) {
      detailContent.innerHTML += `<p style="text-align:center; color:var(--text-secondary); margin-top:20px;">No foods recorded for this day.</p>`;
    }
  }
}

function hideDetailView() {
  if(historyDetailContainer) historyDetailContainer.classList.add('hidden');
  if(calendarContainer) calendarContainer.classList.remove('hidden');
}

function setupEventListeners() {
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const item = btn.getAttribute('data-item');
      const cal = btn.getAttribute('data-cal');
      const mealCard = btn.closest('.meal-card');
      if (mealCard) {
        addMealItem(mealCard.getAttribute('data-meal'), item, cal);
      }
    });
  });

  document.querySelectorAll('.custom-add-form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const meal = form.getAttribute('data-meal');
      const nameInput = form.querySelector('.input-name');
      const calInput = form.querySelector('.input-cal');
      if (nameInput && nameInput.value.trim() !== '') {
        addMealItem(meal, nameInput.value, calInput ? calInput.value : 0);
        nameInput.value = '';
        if(calInput) calInput.value = '';
      }
    });
  });

  if(restartBtn) {
    restartBtn.addEventListener('click', async () => {
      if (confirm('Finish today and save to history?')) {
        saveCurrentToHistory();
        appData.current = getEmptyDay();
        await saveCloudData();
        window.location.reload();
      }
    });
  }

  if(viewHistoryBtn && historyModal) {
    viewHistoryBtn.addEventListener('click', () => {
      calendarViewDate = new Date();
      renderCalendar();
      hideDetailView();
      historyModal.classList.remove('hidden');
    });
  }

  if(closeModalBtn && historyModal) {
    closeModalBtn.addEventListener('click', () => {
      historyModal.classList.add('hidden');
    });
  }

  if(prevDayBtn) prevDayBtn.addEventListener('click', () => changeDay(-1));
  if(nextDayBtn) nextDayBtn.addEventListener('click', () => changeDay(1));

  if(prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
      calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
      renderCalendar();
    });
  }
  
  if(nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
      calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
      renderCalendar();
    });
  }

  if(backToCalendarBtn) {
    backToCalendarBtn.addEventListener('click', hideDetailView);
  }
}
