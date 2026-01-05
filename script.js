import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAwshPSOTuob9HWccsM792hDNMPBvGmvK0",
    authDomain: "km-283c8.firebaseapp.com",
    projectId: "km-283c8",
    storageBucket: "km-283c8.firebasestorage.app",
    messagingSenderId: "631283005340",
    appId: "1:631283005340:web:29ec48ca8be9b0a4c1fa59",
    measurementId: "G-3RER46ENZW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Game State
let gameState = {
    score: 1000,
    currentLocation: null,
    timePenalty: 0,
    timerInterval: null,
    guessMarker: null,
    roundsSurvived: 0,
    panorama: null,
    guessMap: null,
    resultMap: null,
    svService: null,
    isGuest: false,
    username: null
};

// Config
const SPAIN_BOUNDS = {
    north: 43.79,
    south: 36.0,
    west: -9.3,
    east: 3.3
};

// DOM Elements
const homeScreen = document.getElementById('home-screen');
const startGameBtn = document.getElementById('start-game-btn');
const statusBar = document.getElementById('status-bar');
const gameView = document.getElementById('game-view');

const loginContainer = document.getElementById('login-container');
const gameStartContainer = document.getElementById('game-start-container');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const loginBtn = document.getElementById('login-btn');
const guestBtn = document.getElementById('guest-btn');
const loginError = document.getElementById('login-error');
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');
const rankingBtn = document.getElementById('ranking-btn');

const scoreEl = document.getElementById('score-value');
const penaltyEl = document.getElementById('penalty-value');
const timerContainer = document.getElementById('timer-container');
const streetViewContainer = document.getElementById('street-view');
const guessBtn = document.getElementById('guess-btn');
const mapModal = document.getElementById('map-modal');
const closeMapBtn = document.getElementById('close-map-btn');
const confirmGuessBtn = document.getElementById('confirm-guess-btn');
const modalTimerEl = document.getElementById('modal-timer');
const resultModal = document.getElementById('result-modal');
const distanceResultEl = document.getElementById('distance-result');
const timePenaltyResultEl = document.getElementById('time-penalty-result');
const totalLossEl = document.getElementById('total-loss');
const nextRoundBtn = document.getElementById('next-round-btn');
const gameOverModal = document.getElementById('game-over-modal');
const restartBtn = document.getElementById('restart-btn');
const roundsSurvivedEl = document.getElementById('rounds-survived');

const rankingModal = document.getElementById('ranking-modal');
const rankingList = document.getElementById('ranking-list');
const closeRankingBtn = document.getElementById('close-ranking-btn');


// --- Auth Functions --- //

function handleLogin() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        loginError.textContent = "Introduce usuario y contraseña";
        return;
    }

    loginError.textContent = "Conectando...";
    const email = `${username}@email.com`;

    // Try Login logic first
    signInWithEmailAndPassword(auth, email, password)
        .then(() => {
            // Success
            loginError.textContent = "";
        })
        .catch((error) => {
            const errorCode = error.code;

            // If user not found, try generic Create Account logic (Seamless)
            if (errorCode === 'auth/user-not-found' || errorCode === 'auth/invalid-credential') {
                // Try Creating
                loginError.textContent = "Creando cuenta...";
                createUserWithEmailAndPassword(auth, email, password)
                    .then(() => {
                        loginError.textContent = "";
                    })
                    .catch((createError) => {
                        loginError.textContent = "Error al crear: " + createError.message;
                    });
            } else if (errorCode === 'auth/wrong-password') {
                loginError.textContent = "Contraseña incorrecta";
            } else {
                loginError.textContent = "Error: " + errorCode;
            }
        });
}

function handleGuestLogin() {
    signInAnonymously(auth)
        .then(() => {
            // success, observer handles UI
        })
        .catch((error) => {
            loginError.textContent = "Error invitado: " + error.code;
        });
}

function handleLogout() {
    signOut(auth).catch((error) => console.error(error));
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        if (user.isAnonymous) {
            gameState.isGuest = true;
            gameState.username = "Invitado";
            userDisplay.textContent = "Invitado";
            userDisplay.style.color = "#94a3b8";
        } else {
            gameState.isGuest = false;
            const fakeUsername = user.email ? user.email.split('@')[0] : "Jugador";
            gameState.username = fakeUsername;
            userDisplay.textContent = fakeUsername;
            userDisplay.style.color = "#38bdf8";
        }

        loginContainer.style.display = 'none';
        gameStartContainer.style.display = 'flex';
    } else {
        gameState.isGuest = false;
        gameState.username = null;
        loginContainer.style.display = 'flex';
        gameStartContainer.style.display = 'none';
        resetGame();
    }
});

// --- Ranking Logic --- //

async function loadRanking() {
    openModal(rankingModal);
    rankingList.innerHTML = '<div style="text-align: center; color: #94a3b8;">Cargando clasificación...</div>';

    try {
        const q = query(collection(db, "leaderboard"), orderBy("rounds", "desc"), limit(50));
        const querySnapshot = await getDocs(q);

        rankingList.innerHTML = "";

        if (querySnapshot.empty) {
            rankingList.innerHTML = '<div style="text-align: center; color: #94a3b8;">Aún no hay puntuaciones.</div>';
            return;
        }

        let rank = 1;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const item = document.createElement('div');
            item.className = 'rank-item';
            item.style.cssText = `
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                background: rgba(255,255,255,0.05); 
                padding: 15px; 
                border-radius: 10px;
                border: 1px solid rgba(255,255,255,0.05);
            `;

            const isMe = !gameState.isGuest && data.username === gameState.username; // simple check
            if (isMe) item.style.background = 'rgba(56, 189, 248, 0.1)';

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="font-size: 1.2rem; font-weight: 800; color: ${rank <= 3 ? '#fbbf24' : '#94a3b8'}; width: 30px;">#${rank}</span>
                    <span style="font-weight: 600; color: white;">${data.username}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="color: #38bdf8; font-weight: 800; font-size: 1.2rem;">${data.rounds}</span>
                    <span style="font-size: 0.8rem; color: #94a3b8;">RONDA${data.rounds === 1 ? '' : 'S'}</span>
                </div>
            `;
            rankingList.appendChild(item);
            rank++;
        });

    } catch (e) {
        console.error("Error loading ranking", e);
        rankingList.innerHTML = '<div style="text-align: center; color: #ef4444;">Error al cargar.</div>';
    }
}

async function saveScore() {
    if (gameState.isGuest) return; // Guests don't save
    // if (gameState.roundsSurvived <= 0) return; // Optional logic

    try {
        await addDoc(collection(db, "leaderboard"), {
            username: gameState.username,
            rounds: gameState.roundsSurvived,
            timestamp: new Date()
        });
    } catch (e) {
        console.error("Error saving score", e);
    }
}

// --- App/Maps Init --- //

function initApp() {
    gameState.svService = new google.maps.StreetViewService();
}
window.initApp = initApp;


// --- Game Functions --- //

function startGame() {
    homeScreen.style.display = 'none';
    statusBar.style.display = 'flex';
    gameView.style.visibility = 'visible';

    gameState.score = 1000;
    gameState.roundsSurvived = 0;
    updateScoreDisplay();

    startRound();
}

async function startRound() {
    stopTimer();

    gameState.timePenalty = 0;
    penaltyEl.textContent = "0";
    modalTimerEl.textContent = "0";

    closeModal(mapModal);
    closeModal(resultModal);
    closeModal(gameOverModal);

    try {
        const location = await findRandomStreetView();
        gameState.currentLocation = location;

        const panoramaOptions = {
            position: location,
            pov: { heading: 0, pitch: 0 },
            zoom: 1,
            disableDefaultUI: true,
            showRoadLabels: false,
            addressControl: false,
            linksControl: true,
            panControl: true,
            enableCloseButton: false
        };

        gameState.panorama = new google.maps.StreetViewPanorama(
            streetViewContainer,
            panoramaOptions
        );

        startTimer();

    } catch (error) {
        console.error("Failed to find location", error);
        startRound();
    }
}

function getRandomCoordinate() {
    const lat = Math.random() * (SPAIN_BOUNDS.north - SPAIN_BOUNDS.south) + SPAIN_BOUNDS.south;
    const lng = Math.random() * (SPAIN_BOUNDS.east - SPAIN_BOUNDS.west) + SPAIN_BOUNDS.west;
    return { lat, lng };
}

function findRandomStreetView(attempts = 0) {
    return new Promise((resolve, reject) => {
        if (attempts > 50) {
            reject("Unable to find valid StreetView in Spain after 50 attempts.");
            return;
        }

        const center = getRandomCoordinate();

        gameState.svService.getPanorama({
            location: center,
            radius: 10000,
            source: google.maps.StreetViewSource.OUTDOOR
        }, (data, status) => {
            if (status === google.maps.StreetViewStatus.OK) {
                resolve(data.location.latLng);
            } else {
                findRandomStreetView(attempts + 1).then(resolve).catch(reject);
            }
        });
    });
}

// Map Logic
function openGuessMap() {
    openModal(mapModal);

    if (!gameState.guessMap) {
        gameState.guessMap = new google.maps.Map(document.getElementById('guess-map'), {
            center: { lat: 40.4168, lng: -3.7038 },
            zoom: 6,
            mapTypeId: 'roadmap',
            disableDefaultUI: true,
            streetViewControl: false,
            clickableIcons: false
        });

        gameState.guessMap.addListener('click', (e) => {
            placeGuessMarker(e.latLng);
        });
    }

    requestAnimationFrame(() => {
        if (gameState.guessMap) {
            google.maps.event.trigger(gameState.guessMap, 'resize');
            gameState.guessMap.setCenter({ lat: 40.4168, lng: -3.7038 });
        }
    });

    // Fallback
    setTimeout(() => {
        if (gameState.guessMap) google.maps.event.trigger(gameState.guessMap, 'resize');
    }, 500);

    confirmGuessBtn.disabled = !gameState.guessMarker;
}

function placeGuessMarker(latLng) {
    if (gameState.guessMarker) {
        gameState.guessMarker.setMap(null);
    }
    gameState.guessMarker = new google.maps.Marker({
        position: latLng,
        map: gameState.guessMap,
        title: "Tu elección"
    });
    confirmGuessBtn.disabled = false;
}

function closeGuessMap() {
    closeModal(mapModal);
}

function confirmGuess() {
    stopTimer();

    const guessLatLng = gameState.guessMarker.getPosition();
    const actualLatLng = gameState.currentLocation;

    const distanceMeters = google.maps.geometry.spherical.computeDistanceBetween(guessLatLng, actualLatLng);
    const distanceKm = Math.round(distanceMeters / 1000);

    const timeLoss = gameState.timePenalty;
    const totalLoss = distanceKm + timeLoss;

    gameState.score -= totalLoss;
    if (gameState.score < 0) gameState.score = 0; // Prevent negative display

    gameState.roundsSurvived++;

    updateScoreDisplay();

    showResults(distanceKm, timeLoss, totalLoss, guessLatLng, actualLatLng);
}

function showResults(distanceKm, timeLoss, totalLoss, guessLatLng, actualLatLng) {
    closeModal(mapModal);
    openModal(resultModal);

    distanceResultEl.textContent = `${distanceKm} km`;
    timePenaltyResultEl.textContent = `-${timeLoss} km`;
    totalLossEl.textContent = `${totalLoss} km`;

    setTimeout(() => {
        const map = new google.maps.Map(document.getElementById('result-map'), {
            center: actualLatLng,
            zoom: 6,
            mapTypeId: 'roadmap',
            disableDefaultUI: true,
            clickableIcons: false
        });

        const bounds = new google.maps.LatLngBounds();
        bounds.extend(guessLatLng);
        bounds.extend(actualLatLng);
        map.fitBounds(bounds, 50);

        new google.maps.Marker({
            position: actualLatLng,
            map: map,
            icon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
            title: "Realidad"
        });

        new google.maps.Marker({
            position: guessLatLng,
            map: map,
            icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
            title: "Tu elección"
        });

        new google.maps.Polyline({
            path: [actualLatLng, guessLatLng],
            geodesic: true,
            strokeColor: '#ef4444',
            strokeOpacity: 1.0,
            strokeWeight: 3,
            map: map
        });

    }, 100);
}

function checkNextRound() {
    if (gameState.score <= 0) {
        handleGameOver();
    } else {
        if (gameState.guessMarker) {
            gameState.guessMarker.setMap(null);
            gameState.guessMarker = null;
        }
        startRound();
    }
}

async function handleGameOver() {
    roundsSurvivedEl.textContent = gameState.roundsSurvived;
    closeModal(resultModal);
    openModal(gameOverModal);

    // Save Score
    await saveScore();
}


function resetGame() {
    closeModal(gameOverModal);
    closeModal(rankingModal);
    homeScreen.style.display = 'flex';
    statusBar.style.display = 'none';
    gameView.style.visibility = 'hidden';
}

// Timer Logic
function startTimer() {
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);
    gameState.timerInterval = setInterval(() => {
        gameState.timePenalty++;
        penaltyEl.textContent = gameState.timePenalty;
        modalTimerEl.textContent = gameState.timePenalty;
    }, 1000);
}

function stopTimer() {
    clearInterval(gameState.timerInterval);
    gameState.timerInterval = null;
}

// UI Helpers
function updateScoreDisplay() {
    scoreEl.textContent = gameState.score;
    // scoreEl.style.color = gameState.score <= 0 ? '#ef4444' : '#38bdf8';
}

function openModal(el) {
    el.classList.add('active');
}

function closeModal(el) {
    el.classList.remove('active');
}

// Event Listeners
loginBtn.addEventListener('click', handleLogin);
guestBtn.addEventListener('click', handleGuestLogin);
logoutBtn.addEventListener('click', handleLogout);
rankingBtn.addEventListener('click', loadRanking);
closeRankingBtn.addEventListener('click', () => closeModal(rankingModal));

startGameBtn.addEventListener('click', startGame);
guessBtn.addEventListener('click', openGuessMap);
closeMapBtn.addEventListener('click', closeGuessMap);
confirmGuessBtn.addEventListener('click', confirmGuess);
nextRoundBtn.addEventListener('click', checkNextRound);
restartBtn.addEventListener('click', resetGame);

passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });

window.initApp = initApp;
