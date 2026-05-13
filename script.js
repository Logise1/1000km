// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, increment, collection, query, orderBy, limit, getDocs, onSnapshot, where, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCMXL0WhinT81jamyvogFKwEQn5-VaasQw",
    authDomain: "oasis-efaf2.firebaseapp.com",
    projectId: "oasis-efaf2",
    storageBucket: "oasis-efaf2.firebasestorage.app",
    messagingSenderId: "185652969919",
    appId: "1:185652969919:web:b85bdb2e2135395875a10a"
};

const MAPS_API_KEY = 'AIzaSyDcgWTXsYOLFXuBiVBjnnMzc5fmwdDVKDk'; // Keeping original Maps key

const BOUNDS = {
    mundo: { north: 90, south: -90, west: -180, east: 180 },
    peninsula: { north: 43.8, south: 36.0, west: -9.5, east: 3.4 },
    madrid: { north: 41.16, south: 39.88, west: -4.55, east: -3.06 },
    eeuu: { north: 49.38, south: 24.52, west: -124.73, east: -66.95 },
    canada: { north: 83.1, south: 41.7, west: -141.0, east: -52.6 },
    brasil: { north: 5.2, south: -33.7, west: -73.9, east: -34.8 },
    australia: { north: -10.6, south: -43.6, west: 113.1, east: 153.6 },
    japon: { north: 45.5, south: 24.0, west: 122.9, east: 154.0 },
    reinounido: { north: 60.8, south: 49.9, west: -8.6, east: 1.7 },
    francia: { north: 51.1, south: 42.3, west: -4.8, east: 8.2 },
    italia: { north: 47.1, south: 36.6, west: 6.6, east: 18.5 }
};

const COUNTRY_LIST = [
    "España", "EE.UU.", "Canadá", "Brasil", "Australia", "Japón", "Reino Unido", "Francia", "Italia", "Alemania",
    "México", "Argentina", "Rusia", "China", "India", "Sudáfrica", "Egipto", "Nigeria", "Kenia", "Marruecos",
    "Turquía", "Arabia Saudita", "Irán", "Pakistán", "Indonesia", "Tailandia", "Vietnam", "Filipinas", "Corea del Sur", "Nueva Zelanda",
    "Colombia", "Perú", "Chile", "Venezuela", "Ecuador", "Bolivia", "Paraguay", "Uruguay", "Cuba", "Guatemala",
    "Costa Rica", "Panamá", "Portugal", "Países Bajos", "Bélgica", "Suiza", "Austria", "Grecia", "Polonia", "Suecia",
    "Noruega", "Finlandia", "Dinamarca", "Irlanda", "Islandia", "Rumanía", "Hungría", "República Checa", "Ucrania", "Kazajistán",
    "Etiopía", "Ghana", "Senegal", "Madagascar", "Argelia", "Túnez", "Israel", "Jordania", "Líbano", "EAU"
];

function getDailyCountry() {
    const dayId = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const index = dayId % COUNTRY_LIST.length;
    const name = COUNTRY_LIST[index];
    const map = {
        "España": "peninsula", "EE.UU.": "eeuu", "Canadá": "canada", "Brasil": "brasil",
        "Australia": "australia", "Japón": "japon", "Reino Unido": "reinounido",
        "Francia": "francia", "Italia": "italia"
    };
    return { name, bounds: map[name] || "mundo" };
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- STATE ---
let currentUser = null;
let userData = null;
let map, panorama, streetViewService, guessMarker, actualMarker, polyline;
let totalKilometers = 0;
let gameBounds = null;
let actualLocation = null;
let guessedLocation = null;
let isMapVisible = false;
let gameState = 'loading'; // 'loading', 'playing', 'result'
let roundsSurvived = 0;
let currentMode = 'peninsula';

// --- DOM ELEMENTS ---
const screens = {
    auth: document.getElementById('auth-screen'),
    menu: document.getElementById('menu-screen'),
    game: document.getElementById('game-screen'),
    duelSetup: document.getElementById('duel-setup-screen')
};

// --- ANTI-SCRAPE & BOT DETECTION ---
const security = {
    checkBot() {
        if (navigator.webdriver) return true;
        if (window.outerWidth === 0 && window.outerHeight === 0) return true;
        return false;
    },
    hash(str) {
        // Simple hash to obscure data slightly
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(36);
    }
};

// --- AUTHENTICATION ---
const AuthSystem = {
    async login(username, password) {
        if (security.checkBot()) { console.warn("Bot detected"); return; }
        const email = `${username}@email.com`;
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return userCredential.user;
        } catch (error) {
            console.error("Error de login: " + error.message);
        }
    },

    async register(username, password) {
        const email = `${username}@email.com`;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            // Initialize user doc
            await setDoc(doc(db, "users", userCredential.user.uid), {
                username: username,
                total_rounds: 0,
                gamesPlayed: 0
            });
            return userCredential.user;
        } catch (error) {
            console.error("Error de registro: " + error.message);
        }
    },

    async logout() {
        await signOut(auth);
        showScreen('auth');
    }
};

// --- UI NAVIGATION ---
function showScreen(screenId) {
    Object.keys(screens).forEach(key => {
        if (screens[key]) screens[key].classList.add('hidden');
    });
    if (screens[screenId]) screens[screenId].classList.remove('hidden');
}

// --- USER DATA ---
async function loadUserData(user) {
    currentUser = user;
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        userData = docSnap.data();
        updateUserUI();
    }
}

function updateUserUI() {
    const usernameEls = document.querySelectorAll('.username-display');
    const xpEls = document.querySelectorAll('.xp-display');

    usernameEls.forEach(el => el.textContent = userData.username);
    xpEls.forEach(el => el.textContent = `${userData.total_rounds || 0} Rondas`);
}

// --- GAME LOGIC ---
const Game = {
    async start(mode) {
        currentMode = mode;
        showScreen('game');
        document.getElementById('loading-overlay').classList.remove('hidden');

        if (!map) {
            await Game.initMaps();
        }

        if (typeof mode === 'object') {
            totalKilometers = 1000; // Default for daily/custom
            if (mode.name && (!mode.bounds || mode.bounds === "mundo")) {
                const geocoder = new google.maps.Geocoder();
                try {
                    const result = await new Promise((resolve, reject) => {
                        geocoder.geocode({ 'address': mode.name }, (results, status) => {
                            if (status === 'OK' && results.length > 0) resolve(results[0]);
                            else reject(status);
                        });
                    });
                    const b = result.geometry.bounds || result.geometry.viewport;
                    gameBounds = {
                        north: b.getNorthEast().lat(),
                        south: b.getSouthWest().lat(),
                        east: b.getNorthEast().lng(),
                        west: b.getSouthWest().lng()
                    };
                } catch (e) {
                    console.error("Geocoder failed for", mode.name, e);
                    gameBounds = BOUNDS.mundo;
                }
            } else {
                gameBounds = BOUNDS[mode.bounds] || BOUNDS.mundo;
            }
            currentMode.boundsData = gameBounds;
        } else {
            switch (mode) {
                case 'mundo': 
                    gameBounds = BOUNDS.mundo; 
                    totalKilometers = 10000; 
                    break;
                case 'madrid': 
                    gameBounds = BOUNDS.madrid; 
                    totalKilometers = 100; 
                    break;
                case 'peninsula':
                default: 
                    gameBounds = BOUNDS.peninsula; 
                    totalKilometers = 1000; 
                    break;
            }
        }

        roundsSurvived = 0;
        document.getElementById('score').textContent = totalKilometers;
        Game.loadNewRound();
    },

    initMaps() {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=geometry&callback=initGameMaps`;
            script.async = true;
            document.head.appendChild(script);
            window.initGameMaps = () => {
                map = new google.maps.Map(document.getElementById('map'), {
                    center: { lat: 40.4, lng: -3.7 },
                    zoom: 5,
                    disableDefaultUI: true,
                    zoomControl: true,
                    streetViewControl: false
                });

                panorama = new google.maps.StreetViewPanorama(document.getElementById('pano'), {
                    addressControl: false,
                    linksControl: true,
                    panControl: true,
                    zoomControl: true,
                    scrollwheel: true,
                    enableCloseButton: false
                });
                map.setStreetView(panorama);
                streetViewService = new google.maps.StreetViewService();

                map.addListener('click', (e) => {
                    if (gameState !== 'playing') return;
                    guessedLocation = e.latLng;
                    if (!guessMarker) {
                        guessMarker = new google.maps.Marker({ position: guessedLocation, map: map, icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' });
                    } else {
                        guessMarker.setPosition(guessedLocation);
                    }
                    document.getElementById('guess-button').disabled = false;
                });
                resolve();
            };
        });
    },

    async loadNewRound() {
        gameState = 'loading';
        document.getElementById('loading-overlay').classList.remove('hidden');
        document.getElementById('result-text').textContent = '';
        document.getElementById('guess-button').classList.remove('hidden');
        document.getElementById('next-round-button').classList.add('hidden');
        document.getElementById('guess-button').disabled = true;
        document.getElementById('map-container').classList.remove('full-screen');

        if (guessMarker) guessMarker.setMap(null);
        if (actualMarker) actualMarker.setMap(null);
        if (polyline) polyline.setMap(null);

        guessMarker = null;
        actualMarker = null;
        polyline = null;
        guessedLocation = null;

        actualLocation = await Game.findRandomLocation();
        panorama.setPosition(actualLocation);

        if (currentMode === 'mundo') {
            map.setCenter({ lat: 0, lng: 0 });
            map.setZoom(2);
        } else if (currentMode === 'madrid') {
            map.setCenter({ lat: 40.4168, lng: -3.7038 });
            map.setZoom(11);
        } else if (typeof currentMode === 'object') {
            const b = currentMode.boundsData || BOUNDS.mundo;
            map.setCenter({ lat: (b.north + b.south)/2, lng: (b.east + b.west)/2 });
            map.setZoom(4);
            if (currentMode.boundsData) map.fitBounds(new google.maps.LatLngBounds(
                new google.maps.LatLng(b.south, b.west),
                new google.maps.LatLng(b.north, b.east)
            ));
        } else {
            map.setCenter({ lat: 40.4, lng: -3.7 });
            map.setZoom(5);
        }

        document.getElementById('loading-overlay').classList.add('hidden');
        gameState = 'playing';

        if (isDuel) {
            Game.startTimer();
        }
    },

    findRandomLocation() {
        return new Promise((resolve) => {
            const tryToFind = () => {
                const lat = Math.random() * (gameBounds.north - gameBounds.south) + gameBounds.south;
                const lng = Math.random() * (gameBounds.east - gameBounds.west) + gameBounds.west;
                const randomPoint = new google.maps.LatLng(lat, lng);

                streetViewService.getPanorama({
                    location: randomPoint,
                    radius: 50000,
                    source: google.maps.StreetViewSource.OUTDOOR
                }, (data, status) => {
                    if (status === 'OK') {
                        resolve(data.location.latLng);
                    } else {
                        setTimeout(tryToFind, 50);
                    }
                });
            };
            tryToFind();
        });
    },

    async handleGuess() {
        if (!guessedLocation || gameState !== 'playing') return;

        gameState = 'result';
        const distanceInMeters = google.maps.geometry.spherical.computeDistanceBetween(actualLocation, guessedLocation);
        const distanceInKm = Math.round(distanceInMeters / 1000);

        totalKilometers -= distanceInKm;
        
        if (totalKilometers <= 0) {
            totalKilometers = 0;
            document.getElementById('score').textContent = 0;
            document.getElementById('result-text').textContent = `¡PERDISTE! Fallaste por ${distanceInKm} km.`;
            Game.end();
            return;
        }

        roundsSurvived++;
        document.getElementById('score').textContent = totalKilometers;
        document.getElementById('result-text').textContent = `¡Fallaste por ${distanceInKm} km!`;

        // Make map full screen
        document.getElementById('map-container').classList.add('full-screen');

        // Show results on map
        actualMarker = new google.maps.Marker({
            position: actualLocation,
            map: map,
            icon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
        });

        polyline = new google.maps.Polyline({
            path: [actualLocation, guessedLocation],
            geodesic: true,
            strokeColor: '#FF0000',
            strokeOpacity: 1.0,
            strokeWeight: 2,
            map: map
        });

        const bounds = new google.maps.LatLngBounds();
        bounds.extend(actualLocation);
        bounds.extend(guessedLocation);
        map.fitBounds(bounds);

        document.getElementById('guess-button').classList.add('hidden');
        document.getElementById('next-round-button').classList.remove('hidden');

    },

    async end() {
        gameState = 'result';
        document.getElementById('result-text').textContent = `Juego Terminado - Rondas: ${roundsSurvived}`;
        
        // Guardar récord
        const modeKey = (typeof currentMode === 'object') ? 'daily' : currentMode;
        const recordField = `record_${modeKey}`;
        
        if (!userData[recordField] || roundsSurvived > userData[recordField]) {
            await updateDoc(doc(db, "users", currentUser.uid), {
                [recordField]: roundsSurvived,
                total_rounds: increment(roundsSurvived)
            });
            userData[recordField] = roundsSurvived;
        } else {
            await updateDoc(doc(db, "users", currentUser.uid), {
                total_rounds: increment(roundsSurvived)
            });
        }
        
        setTimeout(() => showScreen('menu'), 3000);
    },

    startTimer() {
        clearInterval(duelTimer);
        timeLeft = 60;
        document.getElementById('timer').textContent = `Tiempo: ${timeLeft}s`;
        duelTimer = setInterval(() => {
            timeLeft--;
            document.getElementById('timer').textContent = `Tiempo: ${timeLeft}s`;
            if (timeLeft <= 0) {
                clearInterval(duelTimer);
                Game.handleGuess(); // Auto guess or lose
            }
        }, 1000);
    }
};

// --- LEADERBOARD ---
const Leaderboard = {
    async refreshAll() {
        this.fetchMode('record_madrid', 'lb-madrid');
        this.fetchMode('record_peninsula', 'lb-peninsula');
        this.fetchMode('record_mundo', 'lb-mundo');
        this.fetchMode('record_daily', 'lb-daily');
    },
    async fetchMode(field, elementId) {
        const q = query(collection(db, "users"), orderBy(field, "desc"), limit(5));
        const querySnapshot = await getDocs(q);
        const list = document.getElementById(elementId);
        if (!list) return;
        list.innerHTML = '';
        let rank = 1;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data[field] !== undefined) {
                const li = document.createElement('li');
                li.innerHTML = `<span>${rank++}. ${data.username}</span> <span>${data[field]} R</span>`;
                list.appendChild(li);
            }
        });
    }
};

async function fetchWikimediaImage(countryName) {
    const url = `https://es.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(countryName)}&piprop=thumbnail&pithumbsize=800&format=json&origin=*`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pageId !== "-1" && pages[pageId].thumbnail) {
            return pages[pageId].thumbnail.source;
        }
    } catch (error) {
        console.error("Error fetching Wikimedia image:", error);
    }
    // Fallback image
    return "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Maligne_Lake_Jasper_National_Park.jpg/800px-Maligne_Lake_Jasper_National_Park.jpg";
}

async function updateDailyChallengeUI() {
    const daily = getDailyCountry();
    const countryEl = document.getElementById('challenge-country');
    if (countryEl) countryEl.textContent = daily.name;
    
    const imgEl = document.getElementById('challenge-img');
    const menuScreen = document.getElementById('menu-screen');
    
    if (imgEl) imgEl.src = "loading.svg"; // Loading placeholder
    const imgSrc = await fetchWikimediaImage(daily.name);
    if (imgEl) imgEl.src = imgSrc;
}

// --- INIT & EVENT LISTENERS ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        loadUserData(user);
        updateDailyChallengeUI();
        Leaderboard.refreshAll();
        showScreen('menu');
    } else {
        showScreen('auth');
    }
});

// Auth Events
document.getElementById('login-btn').addEventListener('click', async () => {
    const u = document.getElementById('auth-user').value;
    const p = document.getElementById('auth-pass').value;
    await AuthSystem.login(u, p);
});

document.getElementById('register-btn').addEventListener('click', async () => {
    const u = document.getElementById('auth-user').value;
    const p = document.getElementById('auth-pass').value;
    await AuthSystem.register(u, p);
});

document.getElementById('logout-btn').addEventListener('click', () => AuthSystem.logout());

// Menu Events
document.getElementById('mode-madrid').addEventListener('click', () => Game.start('madrid'));
document.getElementById('btn-challenge').addEventListener('click', () => {
    const daily = getDailyCountry();
    Game.start(daily);
});
document.getElementById('mode-peninsula').addEventListener('click', () => Game.start('peninsula'));
document.getElementById('mode-mundo').addEventListener('click', () => Game.start('mundo'));

// Game Events
document.getElementById('guess-button').addEventListener('click', () => Game.handleGuess());
document.getElementById('next-round-button').addEventListener('click', () => Game.loadNewRound());
document.getElementById('end-game-button').addEventListener('click', () => Game.end());
document.getElementById('map-toggle').addEventListener('click', () => {
    const container = document.getElementById('map-container');
    container.classList.toggle('minimized');
});

document.getElementById('google-maps-btn').addEventListener('click', () => {
    if (actualLocation) {
        const url = `https://www.google.com/maps/search/?api=1&query=${actualLocation.lat},${actualLocation.lng}`;
        window.open(url, '_blank');
    }
});



// Leaderboard Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});

// Anti-cheat / F12 Detector
window.addEventListener('keydown', (e) => {
    if (e.key === 'F12') {
        window.location.href = 'uhoh.html';
    }
});

// Expose some functions to global for HTML inline onclicks (though better to avoid)
