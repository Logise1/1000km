import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCMXL0WhinT81jamyvogFKwEQn5-VaasQw",
    authDomain: "oasis-efaf2.firebaseapp.com",
    projectId: "oasis-efaf2",
    storageBucket: "oasis-efaf2.firebasestorage.app",
    messagingSenderId: "185652969919",
    appId: "1:185652969919:web:b85bdb2e2135395875a10a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const BOUNDS = {
    mundo: { north: 90, south: -90, west: -180, east: 180 },
    peninsula: { north: 43.8, south: 36.0, west: -9.5, east: 3.4 },
    madrid: { north: 41.16, south: 39.88, west: -4.55, east: -3.06 }
};

let currentUser = null;
let currentDuel = null;
let map, panorama, guessMarker, actualMarker, polyline;
let actualLocation = null;
let guessedLocation = null;
let timeLeft = 60;
let duelTimer = null;

// --- UTILS ---
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function generateCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// --- MAPS ---
async function initMaps() {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyDcgWTXsYOLFXuBiVBjnnMzc5fmwdDVKDk&callback=initDuelMaps`;
        script.async = true;
        window.initDuelMaps = () => {
            map = new google.maps.Map(document.getElementById('map'), {
                center: { lat: 0, lng: 0 },
                zoom: 2,
                disableDefaultUI: true,
                mapId: '9ca92e293883b48a'
            });

            panorama = new google.maps.StreetViewPanorama(document.getElementById('pano'), {
                addressControl: false,
                showRoadLabels: false,
                zoomControl: false
            });

            map.addListener('click', (e) => {
                if (guessedLocation) return;
                guessedLocation = e.latLng;
                if (guessMarker) guessMarker.setMap(null);
                guessMarker = new google.maps.Marker({ position: guessedLocation, map: map });
                document.getElementById('guess-button').disabled = false;
            });
            resolve();
        };
        document.head.appendChild(script);
    });
}

async function findRandomLocation(bounds) {
    const sv = new google.maps.StreetViewService();
    return new Promise((resolve) => {
        const attempt = () => {
            const lat = Math.random() * (bounds.north - bounds.south) + bounds.south;
            const lng = Math.random() * (bounds.east - bounds.west) + bounds.west;
            const loc = { lat, lng };
            sv.getPanorama({ location: loc, radius: 50000, source: 'outdoor' }, (data, status) => {
                if (status === 'OK') resolve(data.location.latLng);
                else attempt();
            });
        };
        attempt();
    });
}

// --- DUEL LOGIC ---
const Duels = {
    async create() {
        const world = document.getElementById('duel-world').value;
        const code = generateCode();
        const duelRef = doc(db, "duels", code);
        
        // Verificar si existe (simplemente intentamos escribir)
        await setDoc(duelRef, {
            creator: currentUser.uid,
            world: world,
            status: 'waiting',
            players: [currentUser.uid],
            usernames: { [currentUser.uid]: currentUser.username || "Jugador 1" },
            createdAt: new Date()
        });

        currentDuel = { id: code, world };
        document.getElementById('display-code').textContent = code;
        document.getElementById('setup-controls').classList.add('hidden');
        document.getElementById('waiting-controls').classList.remove('hidden');
        this.listen(code);
    },

    async join() {
        const code = document.getElementById('duel-id-input').value;
        if (!code || code.length !== 4) return alert("Ingresa un código de 4 dígitos");

        const duelRef = doc(db, "duels", code);
        const snap = await getDoc(duelRef);
        if (snap.exists() && snap.data().status === 'waiting') {
            await updateDoc(duelRef, {
                players: arrayUnion(currentUser.uid),
                [`usernames.${currentUser.uid}`]: currentUser.username || "Jugador 2",
                status: 'playing'
            });
            this.start(snap.data());
        } else {
            alert("Duelo no encontrado o ya empezó");
        }
    },

    listen(code) {
        onSnapshot(doc(db, "duels", code), (snap) => {
            const data = snap.data();
            if (!data) return;
            if (data.status === 'playing' && !actualLocation) {
                this.start(data);
            }
            if (data.opponentTimer && timeLeft > data.opponentTimer) {
                timeLeft = data.opponentTimer;
            }
            if (data.status === 'finished') {
                this.showResults(data);
            }
        });
    },

    async start(data) {
        showScreen('game-screen');
        if (!map) await initMaps();
        
        document.getElementById('loading-overlay').classList.remove('hidden');
        actualLocation = await findRandomLocation(BOUNDS[data.world] || BOUNDS.mundo);
        panorama.setPosition(actualLocation);
        document.getElementById('loading-overlay').classList.add('hidden');
        
        this.startTimer();
    },

    startTimer() {
        timeLeft = 60;
        duelTimer = setInterval(() => {
            timeLeft--;
            document.getElementById('timer').textContent = timeLeft + "s";
            if (timeLeft <= 0) this.handleGuess();
        }, 1000);
    },

    async handleGuess() {
        clearInterval(duelTimer);
        const lat = guessedLocation ? guessedLocation.lat() : 0;
        const lng = guessedLocation ? guessedLocation.lng() : 0;
        const distance = guessedLocation ? google.maps.geometry.spherical.computeDistanceBetween(actualLocation, guessedLocation) / 1000 : 99999;

        const duelRef = doc(db, "duels", currentDuel.id);
        await updateDoc(duelRef, {
            [`guesses.${currentUser.uid}`]: { lat, lng, distance },
            opponentTimer: 20
        });

        // Verificar si ambos han adivinado
        const snap = await getDoc(duelRef);
        const data = snap.data();
        if (Object.keys(data.guesses || {}).length >= data.players.length) {
            await updateDoc(duelRef, { status: 'finished' });
        }
    },

    showResults(data) {
        showScreen('result-screen');
        const list = document.getElementById('results-list');
        list.innerHTML = '';
        let winner = null;
        let minDist = Infinity;

        Object.entries(data.guesses).forEach(([uid, guess]) => {
            const name = data.usernames[uid] || "Jugador";
            const p = document.createElement('p');
            p.innerHTML = `<strong>${name}:</strong> ${guess.distance.toFixed(2)} km`;
            list.appendChild(p);
            
            if (guess.distance < minDist) {
                minDist = guess.distance;
                winner = name;
            }
        });

        document.getElementById('winner-text').textContent = `¡Gana ${winner}!`;
    }
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) currentUser.username = snap.data().username;
    } else {
        window.location.href = 'index.html';
    }
});

document.getElementById('btn-create-duel').addEventListener('click', () => Duels.create());
document.getElementById('btn-join-duel').addEventListener('click', () => Duels.join());
document.getElementById('guess-button').addEventListener('click', () => Duels.handleGuess());
document.getElementById('google-maps-btn').addEventListener('click', () => {
    if (actualLocation) {
        const url = `https://www.google.com/maps/search/?api=1&query=${actualLocation.lat()},${actualLocation.lng()}`;
        window.open(url, '_blank');
    }
});
document.getElementById('map-toggle').addEventListener('click', () => {
    document.getElementById('map-container').classList.toggle('minimized');
});
