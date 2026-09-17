// Utility Functions (Performance Optimization)
function throttle(func, limit) {
    let inThrottle;
    return function () {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

function debounce(func, delay) {
    let debounceTimer;
    return function () {
        const context = this;
        const args = arguments;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(context, args), delay);
    }
}

let mathJaxQueue = Promise.resolve();
function queueTypeset(element) {
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        mathJaxQueue = mathJaxQueue.then(() => {
            MathJax.typesetClear([element]);
            return MathJax.typesetPromise([element]).catch(err => console.log(err));
        });
    }
}

// ==========================================
// RANDOM UTILITY FUNCTIONS (Testable) (ข้อ 10, 13)
// ==========================================

/**
 * Seeded pseudo-random number generator (sfc32/mulberry32 hybrid style)
 */
class SeededRNG {
    constructor(seedStr) {
        let hash = 0;
        for (let i = 0; i < seedStr.length; i++) hash = (hash * 31 + seedStr.charCodeAt(i)) | 0;
        this.seed = hash || 1;
    }
    random() {
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    shuffle(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}

/**
 * Generates a seeded random number in a given range [min, max] with a specific step.
 */
function getSeededRandomBase(questionId, seed, min, max, step = 1) {
    const seedStr = `${questionId}_${seed}`;
    const rng = new SeededRNG(seedStr);
    const steps = Math.floor((max - min) / step);
    return min + Math.floor(rng.random() * (steps + 1)) * step;
}

/**
 * Parses the student number/random seed to extract the offset to be added to variables.
 */
function getOffsetFromR(r) {
    if (!r) return 0;
    if (typeof r === 'string') {
        if (r.includes('_')) {
            const studentNum = parseInt(r.split('_')[0], 10);
            return Number.isFinite(studentNum) ? studentNum : 0;
        }
        const parsed = parseInt(r, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof r === 'number') {
        return (r % 9) + 1; // สุ่มได้เลข 1-9 เพื่อคงความง่ายของโจทย์
    }
    return 0;
}

/**
 * Normalizes student number.
 */
function normalizeStudentNumber(n) {
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

// ==========================================
// SYSTEM STATE & STORAGE UTILITIES (ข้อ 4, 5, 8, 9)
// ==========================================

const HISTORY_KEY = 'thermodynamics_question_history';

/**
 * Safely reads the history of generated question variable sets from localStorage.
 * SSR-safe: returns empty array if window is undefined.
 */
function getHistory() {
    if (typeof window === 'undefined') return [];
    try {
        const data = localStorage.getItem(HISTORY_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Failed to read from localStorage', e);
        return [];
    }
}

/**
 * Safely adds a unique key to the localStorage history, keeping at most 100 items.
 * SSR-safe.
 */
function addToHistory(uniqueKey) {
    if (typeof window === 'undefined') return;
    try {
        let history = getHistory();
        history = history.filter(key => key !== uniqueKey);
        history.push(uniqueKey);
        if (history.length > 100) {
            history = history.slice(history.length - 100);
        }
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        console.error('Failed to write to localStorage', e);
    }
}

/**
 * Generates a list of values of active (displayed) variables from a params object.
 */
function getActiveParamValues(params) {
    const values = [];
    for (const key in params) {
        if (key !== 'r' && key !== 'offset' && !key.endsWith('_base') && typeof params[key] === 'number') {
            values.push(params[key]);
        }
    }
    return values;
}

/**
 * Checks if a params object contains duplicate values among active parameters.
 * (ข้อ 2)
 */
function hasDuplicateVariables(params) {
    const vals = getActiveParamValues(params);
    const set = new Set(vals);
    return set.size !== vals.length;
}

/**
 * Generates a unique key string from templateId and active parameter values.
 * (ข้อ 5)
 */
function generateUniqueKey(templateId, params) {
    const vals = [];
    const keys = Object.keys(params).filter(k => k !== 'r' && k !== 'offset' && !k.endsWith('_base'));
    keys.sort();
    keys.forEach(k => {
        if (typeof params[k] === 'number') {
            vals.push(`${k}:${Number(params[k].toFixed(4))}`);
        } else {
            vals.push(`${k}:${params[k]}`);
        }
    });
    return `${templateId}[${vals.join(',')}]`;
}

// System State Variables
let currentSection = 'home';
let currentPracticeTopic = '16-4-1';
let currentPracticeQuestion = null;
let practiceHistory = {}; // เก็บประวัติ { 'topic_name': [template_id_1, template_id_2] }

// Exam State
let currentExamQuestions = [];
let examTimerInterval = null;
let examTimeRemaining = 900;
let examDurationSeconds = 900;
const EXAM_STATE_KEY = 'heat_16_4_exam_state';
const EXAM_STATE_FALLBACK_KEY = 'thermo_16_4_exam_state';
let examStartTimestamp = null;
let examDeadlineTimestamp = null;
let examIsActive = false;
let examSubmissionInProgress = false;
let examStudentInfo = {};
let examSeed = null;
let examExitGuardEnabled = false;

// Anti-Cheat & Activity Monitoring
let cheatingStats = {
    tabSwitches: 0,
    refreshes: 0
};
let lastCheatEventTime = 0;
let cheatBannerTimer = null;

/**
 * Retrieves the attempt count for a student.
 */
function getStudentAttemptCount(cls, num) {
    if (typeof window === 'undefined') return 0;
    try {
        const val = localStorage.getItem(`exam_attempt_${cls}_${num}`);
        const parsed = parseInt(val, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    } catch (e) {
        return 0;
    }
}

/**
 * Increments and saves the student attempt count.
 */
function incrementStudentAttemptCount(cls, num) {
    const current = getStudentAttemptCount(cls, num) + 1;
    try {
        localStorage.setItem(`exam_attempt_${cls}_${num}`, current.toString());
    } catch (e) {
        console.error('Failed to save attempt count', e);
    }
    return current;
}

/**
 * Retrieves theory choice question history to prevent repetition.
 */
function getTheoryChoiceHistory(cls, num) {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(`exam_choice_history_${cls}_${num}`);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Saves a chosen theory question id to the student's choice history.
 */
function saveTheoryChoiceToHistory(cls, num, templateId) {
    if (typeof window === 'undefined') return;
    try {
        let hist = getTheoryChoiceHistory(cls, num);
        if (!hist.includes(templateId)) {
            hist.push(templateId);
        }
        if (hist.length > 10) {
            hist = hist.slice(hist.length - 10);
        }
        localStorage.setItem(`exam_choice_history_${cls}_${num}`, JSON.stringify(hist));
    } catch (e) {
        console.error('Failed to save theory choice history', e);
    }
}

/**
 * Gentle beep audio alert using Web Audio API.
 */
function playWarningBeep() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
        // Safe to ignore if audio blocked
    }
}

/**
 * Shows the floating anti-cheat warning banner with auto-fadeout.
 */
function showFloatingCheatBanner(count) {
    const banner = document.getElementById('floating-cheat-banner');
    if (!banner) return;
    const msgEl = document.getElementById('floating-cheat-msg');
    if (msgEl) {
        msgEl.innerText = `⚠️ ตรวจพบการสลับหน้าจอ/เปิดแท็บอื่น (ครั้งที่ ${count}) ระบบได้บันทึกไว้แล้ว`;
    }
    banner.classList.remove('hidden');
    requestAnimationFrame(() => {
        banner.style.opacity = '1';
        banner.style.transform = 'translateY(0)';
    });

    if (cheatBannerTimer) clearTimeout(cheatBannerTimer);
    cheatBannerTimer = setTimeout(() => {
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(-8px)';
        setTimeout(() => {
            banner.classList.add('hidden');
        }, 300);
    }, 3500);
}

/**
 * Handles suspicious activity (window blur or document visibility hidden) with 500ms debounce.
 */
function handleSuspiciousActivity(type) {
    if (!examIsActive || examSubmissionInProgress) return;
    const now = Date.now();
    if (now - lastCheatEventTime < 500) return; // Debounce 500ms
    lastCheatEventTime = now;
    cheatingStats.tabSwitches += 1;
    showFloatingCheatBanner(cheatingStats.tabSwitches);
    playWarningBeep();
    debouncedAutoSave();
}

/**
 * Initializes anti-cheat listeners.
 */
function initAntiCheatListeners() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && examIsActive) {
            handleSuspiciousActivity('visibility_hidden');
        }
    });
    window.addEventListener('blur', () => {
        if (examIsActive) {
            handleSuspiciousActivity('window_blur');
        }
    });
}

/**
 * Auto-saves current exam state to localStorage.
 */
function saveExamState() {
    if (!examIsActive || examSubmissionInProgress) return;
    try {
        const payload = {
            examQuestions: currentExamQuestions,
            studentInfo: examStudentInfo,
            examStartTimestamp,
            examDeadlineTimestamp,
            examDurationSeconds,
            remainingSeconds: examTimeRemaining,
            userAnswers: getExamAnswers(),
            cheatingStats: cheatingStats,
            attempt: examStudentInfo.attempt || 1
        };
        localStorage.setItem(EXAM_STATE_KEY, JSON.stringify(payload));
    } catch (e) {
        console.error('Failed to auto-save exam state:', e);
    }
}

const debouncedAutoSave = debounce(saveExamState, 300);


// --- Helper Math / Format Functions ---
function cleanAndParseNumber(str) {
    let clean = str.trim().toLowerCase().replace(/\\times/g, 'e').replace(/x/g, 'e').replace(/\*/g, 'e').replace(/10\^/g, '').replace(/\{/g, '').replace(/\}/g, '').replace(/\s+/g, '');
    if (clean.includes('e')) {
        const parts = clean.split('e');
        return parseFloat(parts[0]) * Math.pow(10, parseFloat(parts[1]));
    }
    return parseFloat(clean);
}

function isNumericAnswerCorrect(userStr, targetNumOrArr) {
    if (!userStr) return false;
    const parsedUser = cleanAndParseNumber(userStr);
    if (isNaN(parsedUser)) return false;
    const targets = Array.isArray(targetNumOrArr) ? targetNumOrArr : [targetNumOrArr];
    return targets.some(targetNum => {
        if (Math.abs(targetNum) < 1e-9) return Math.abs(parsedUser) < 1e-9;
        return Math.abs(parsedUser - targetNum) / Math.abs(targetNum) < 0.05; // 5% error margin
    });
}

function formatExamTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// --- Navigation & Core UI ---
function showSection(sectionId) {
    let norm = sectionId.startsWith('sec-') ? sectionId.slice(4) : sectionId;
    if (examIsActive && !['exam-live', 'exam-result'].includes(norm)) {
        triggerAlert("กำลังสอบ", "กรุณาส่งข้อสอบก่อนออกจากหน้านี้ครับ", "fa-lock", "bg-orange-100 text-orange-600");
        norm = 'exam-live';
    }
    document.getElementById('mobile-menu').classList.add('hidden');

    ['home', 'review', 'practice', 'exam-start', 'exam-live', 'exam-result'].forEach(s => {
        const sec = document.getElementById('sec-' + s);
        if (sec) sec.classList.toggle('hidden', s !== norm);
    });

    if (norm !== 'exam-live' && !examIsActive) clearInterval(examTimerInterval);
    currentSection = norm;
    window.scrollTo(0, 0);
    renderMath();
}

function toggleMobileMenu() {
    document.getElementById('mobile-menu').classList.toggle('hidden');
}

// Helper alert triggers
function triggerAlert(title, message, iconClass = 'fa-info', colorClass = 'bg-slate-100 text-slate-800') {
    const m = document.getElementById('modal-alert'), c = document.getElementById('modal-alert-card'), i = document.getElementById('modal-alert-icon');
    document.getElementById('modal-alert-title').innerText = title;
    document.getElementById('modal-alert-msg').innerText = message;
    i.className = `w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl ${colorClass}`;
    i.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    m.classList.remove('hidden');
    setTimeout(() => { c.classList.remove('scale-95', 'opacity-0'); }, 10);
}

function closeAlertModal() {
    const m = document.getElementById('modal-alert'), c = document.getElementById('modal-alert-card');
    c.classList.add('scale-95', 'opacity-0');
    setTimeout(() => { m.classList.add('hidden'); }, 200);
}

function renderMath() {
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise().catch(err => console.log(err));
    }
}

// --- Review Tabs Logic ---
function switchReviewTab(tabName) {
    ['16-4-1', '16-4-2', '16-4-3'].forEach(t => {
        const btn = document.getElementById(`btn-tab-${t}`), tab = document.getElementById(`review-tab-${t}`);
        if (t === tabName) {
            btn.className = "flex-1 min-w-[140px] text-center py-2 text-xs md:text-sm font-bold rounded-lg transition-all duration-200 bg-white text-orange-700 shadow-sm border border-slate-200/50";
            tab.classList.remove('hidden');
        } else {
            btn.className = "flex-1 min-w-[140px] text-center py-2 text-xs md:text-sm font-bold rounded-lg transition-all duration-200 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50";
            tab.classList.add('hidden');
        }
    });
    stopSimulations();
    if (tabName === '16-4-1') initInternalEnergySim();
    if (tabName === '16-4-2') initWorkSim();
}

function stopSimulations() {
    if (simUAnimFrame) cancelAnimationFrame(simUAnimFrame);
}

// --- SIM 1: Internal Energy (Canvas) ---
let simUAnimFrame = null;
let simUParticles = [];

function initInternalEnergySim() {
    const canvas = document.getElementById('sim-u-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const slider = document.getElementById('sim-u-slider');
    const lblT2 = document.getElementById('lbl-sim-u-t2');
    const lblResult = document.getElementById('lbl-sim-u-result');
    const lblSign = document.getElementById('lbl-sim-u-sign');

    const N = 40;
    simUParticles = [];
    for (let i = 0; i < N; i++) {
        const angle = Math.random() * 2 * Math.PI;
        simUParticles.push({
            x: Math.random() * (canvas.width - 10) + 5,
            y: Math.random() * (canvas.height - 10) + 5,
            vx: Math.cos(angle),
            vy: Math.sin(angle)
        });
    }

    let currentT = parseInt(slider.value);
    const T1 = 300;

    const updateU = () => {
        lblT2.innerText = currentT + ' K';
        const deltaT = currentT - T1;
        // Mock calculation: delta U = (3/2)nR*deltaT, assume (3/2)nR = 1 for simplicity in sim
        const deltaU = deltaT * 10;

        lblResult.innerText = (deltaU > 0 ? '+' : '') + deltaU + ' J';
        if (deltaU > 0) {
            lblResult.className = "text-xl font-mono font-bold text-red-400";
            lblSign.innerHTML = "อุณหภูมิเพิ่ม \\( (\\Delta U \\) เป็นบวก\\( ) \\)";
        } else if (deltaU < 0) {
            lblResult.className = "text-xl font-mono font-bold text-blue-400";
            lblSign.innerHTML = "อุณหภูมิลด \\( (\\Delta U \\) เป็นลบ\\( ) \\)";
        } else {
            lblResult.className = "text-xl font-mono font-bold text-slate-400";
            lblSign.innerHTML = "อุณหภูมิคงที่ \\( (\\Delta U = 0) \\)";
        }
        debouncedMathJaxUpdateU();
    };

    const debouncedMathJaxUpdateU = debounce(() => {
        queueTypeset(document.getElementById('lbl-sim-u-sign'));
    }, 150);

    slider.oninput = throttle((e) => {
        currentT = parseInt(e.target.value);
        updateU();
    }, 30);
    updateU();

    const loop = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const speed = currentT / 150; // visual speed scale

        // Background color based on Temp
        const heat = Math.max(0, Math.min(1, (currentT - 100) / 500));
        ctx.fillStyle = `rgba(${Math.floor(255 * heat)}, ${Math.floor(100 * (1 - heat))}, ${Math.floor(255 * (1 - heat))}, 0.1)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = currentT > 300 ? '#ef4444' : (currentT < 300 ? '#3b82f6' : '#94a3b8');
        ctx.beginPath();
        simUParticles.forEach(p => {
            p.x += p.vx * speed;
            p.y += p.vy * speed;
            if (p.x < 3 || p.x > canvas.width - 3) p.vx *= -1;
            if (p.y < 3 || p.y > canvas.height - 3) p.vy *= -1;
            ctx.moveTo(p.x + 3, p.y);
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        });
        ctx.fill();
        simUAnimFrame = requestAnimationFrame(loop);
    }
    if (simUAnimFrame) cancelAnimationFrame(simUAnimFrame);
    loop();
}

// --- SIM 2: Work Done ---
function initWorkSim() {
    const slider = document.getElementById('sim-w-slider');
    const cont = document.getElementById('sim-w-svg-container');
    const lblV2 = document.getElementById('lbl-sim-w-v2');
    const lblResult = document.getElementById('lbl-sim-w-result');
    const lblSign = document.getElementById('lbl-sim-w-sign');
    const V1 = 20;

    const drawPiston = (V2) => {
        const height = 150 - (V2 * 2.5); // scale V to height. V=20 -> h=100

        cont.innerHTML = `
      <svg viewBox="0 0 200 200" class="w-full max-w-[200px] h-auto drop-shadow-lg">
        <path d="M 50 20 L 50 180 A 10 10 0 0 0 60 190 L 140 190 A 10 10 0 0 0 150 180 L 150 20" stroke="#475569" stroke-width="4" fill="none"/>
        <rect x="52" y="${height}" width="96" height="${188 - height}" fill="#bfdbfe" opacity="0.6"/>
        <rect x="48" y="${height - 10}" width="104" height="10" rx="3" fill="#334155"/>
        <rect x="95" y="${height - 50}" width="10" height="40" fill="#94a3b8"/>
        <text x="100" y="${(height + 188) / 2}" fill="#1e293b" font-size="12" font-weight="bold" text-anchor="middle">Gas</text>
        ${V2 > V1 ? `<path d="M 120 ${height - 15} L 120 ${height - 35} M 115 ${height - 30} L 120 ${height - 35} L 125 ${height - 30}" stroke="#10b981" stroke-width="3" fill="none"/>` : ''}
        ${V2 < V1 ? `<path d="M 120 ${height - 45} L 120 ${height - 25} M 115 ${height - 30} L 120 ${height - 25} L 125 ${height - 30}" stroke="#ef4444" stroke-width="3" fill="none"/>` : ''}
      </svg>
    `;
    };

    const updateW = () => {
        const V2 = parseInt(slider.value);
        lblV2.innerText = V2 + ' L';
        const dV = V2 - V1;
        // Mock calculation: W = P*dV, let's say 1 L.atm = 100 J for simplicity of display
        const W = dV * 100;

        lblResult.innerText = (W > 0 ? '+' : '') + W + ' J';
        if (W > 0) {
            lblResult.className = "text-xl font-mono font-bold text-emerald-500";
            lblSign.innerHTML = "ปริมาตรขยายตัว แก๊สทำงาน \\( (W \\) เป็นบวก\\( ) \\)";
        } else if (W < 0) {
            lblResult.className = "text-xl font-mono font-bold text-red-500";
            lblSign.innerHTML = "ปริมาตรลดลง สิ่งแวดล้อมทำ \\( (W \\) เป็นลบ\\( ) \\)";
        } else {
            lblResult.className = "text-xl font-mono font-bold text-slate-400";
            lblSign.innerHTML = "ปริมาตรคงที่ \\( (W = 0) \\)";
        }
        drawPiston(V2);
        debouncedMathJaxUpdateW();
    };

    const debouncedMathJaxUpdateW = debounce(() => {
        queueTypeset(document.getElementById('lbl-sim-w-sign'));
    }, 150);

    slider.oninput = updateW;
    updateW();
}

// --- SIM 3: First Law Calculator ---
function calculateFirstLaw() {
    const qInput = document.getElementById('calc-law-q');
    const uInput = document.getElementById('calc-law-u');
    const wInput = document.getElementById('calc-law-w');
    const msg = document.getElementById('calc-law-msg');

    let q = parseFloat(qInput.value);
    let u = parseFloat(uInput.value);
    let w = parseFloat(wInput.value);

    let emptyCount = 0;
    if (isNaN(q)) emptyCount++;
    if (isNaN(u)) emptyCount++;
    if (isNaN(w)) emptyCount++;

    if (emptyCount !== 1) {
        msg.innerHTML = "<span class='text-red-500'>กรุณาระบุตัวเลข 2 ช่อง เพื่อคำนวณช่องที่เหลือครับ</span>";
        return;
    }

    if (isNaN(q)) {
        q = u + w;
        qInput.value = q;
        msg.innerHTML = `คำนวณหาความร้อน: \\( Q = (${u}) + (${w}) = ${q} \\text{ J} \\)`;
    } else if (isNaN(u)) {
        u = q - w;
        uInput.value = u;
        msg.innerHTML = `คำนวณหาพลังงานภายใน: \\( \\Delta U = Q - W = (${q}) - (${w}) = ${u} \\text{ J} \\)`;
    } else if (isNaN(w)) {
        w = q - u;
        wInput.value = w;
        msg.innerHTML = `คำนวณหางาน: \\( W = Q - \\Delta U = (${q}) - (${u}) = ${w} \\text{ J} \\)`;
    }

    // Add visual cues
    qInput.style.backgroundColor = q > 0 ? '#ffedd5' : (q < 0 ? '#e0f2fe' : '#f1f5f9');
    uInput.style.backgroundColor = u > 0 ? '#fee2e2' : (u < 0 ? '#e0f2fe' : '#f1f5f9');
    wInput.style.backgroundColor = w > 0 ? '#dcfce7' : (w < 0 ? '#fee2e2' : '#f1f5f9');

    queueTypeset(msg);
}

function clearFirstLawCalc() {
    document.getElementById('calc-law-q').value = '';
    document.getElementById('calc-law-u').value = '';
    document.getElementById('calc-law-w').value = '';
    document.getElementById('calc-law-q').style.backgroundColor = '';
    document.getElementById('calc-law-u').style.backgroundColor = '';
    document.getElementById('calc-law-w').style.backgroundColor = '';
    document.getElementById('calc-law-msg').innerHTML = '';
}


// --- Clean Pairs for Heat Engine (Integer Efficiency & No Repeating Decimals) ---
const CLEAN_ENGINE_PAIRS = [
    { qh: 1000, qc: 600, w: 400, eff: 40 },
    { qh: 1000, qc: 700, w: 300, eff: 30 },
    { qh: 1000, qc: 800, w: 200, eff: 20 },
    { qh: 1200, qc: 720, w: 480, eff: 40 },
    { qh: 1500, qc: 900, w: 600, eff: 40 },
    { qh: 1600, qc: 1200, w: 400, eff: 25 },
    { qh: 2000, qc: 1200, w: 800, eff: 40 },
    { qh: 2000, qc: 1400, w: 600, eff: 30 },
    { qh: 2000, qc: 1500, w: 500, eff: 25 },
    { qh: 2500, qc: 1500, w: 1000, eff: 40 },
    { qh: 800, qc: 400, w: 400, eff: 50 },
    { qh: 500, qc: 300, w: 200, eff: 40 }
];

// --- Dynamic Question Templates (16.4 Thermodynamics - 100% Clean Numbers) ---
const QUESTION_TEMPLATES = [
    // 16.4.1 พลังงานภายในระบบ (Delta U)
    {
        id: '16_4_1_dU_calc', topic: '16.4.1', type: 'numeric_single',
        title: 'หาการเปลี่ยนแปลงพลังงานภายใน (ΔU)',
        inputs: [{ label: '\\( \\Delta U \\) (Joule):' }],
        text: (p) => `แก๊สอุดมคติอะตอมเดี่ยวในกระบอกสูบขยายตัวจากปริมาตร \\(${p.v1}\\) ลิตร เป็น \\(${p.v2}\\) ลิตร ภายใต้ความดันคงตัว \\(${p.p}\\text{ kPa}\\) พลังงานภายในระบบเปลี่ยนไปกี่จูล (กำหนด 1 ลิตร = \\(10^{-3} \\text{ m}^3\\))`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const p_base = r ? getSeededRandomBase('16_4_1_dU_calc_p', r, 100, 250, 50) : 150;
            const p = p_base + (offset % 5) * 10;
            const v1 = r ? getSeededRandomBase('16_4_1_dU_calc_v1', r, 2, 4, 1) : 2;
            const dV_even = r ? getSeededRandomBase('16_4_1_dU_calc_dv', r, 2, 6, 2) : 4;
            const v2 = v1 + dV_even;
            const dU = Math.round(1.5 * p * dV_even);
            return {
                params: { p, v1, v2, dV: dV_even, r: offset },
                answers: [dU.toString()],
                answersRaw: [dU],
                explanation: () => `จาก \\( \\Delta U = \\frac{3}{2}P\\Delta V \\) แทนค่า \\( \\Delta U = 1.5 \\times (${p} \\times 10^3) \\times (${dV_even} \\times 10^{-3}) = ${dU} \\text{ J} \\)`
            };
        }
    },
    {
        id: '16_4_1_num1_argon', topic: '16.4.1', type: 'numeric_single',
        title: 'หา ΔU ในภาชนะปิดปริมาตรคงตัว',
        inputs: [{ label: '\\( \\Delta U \\) (Joule):' }],
        text: (p) => `แก๊สอุดมคติอะตอมเดี่ยวบรรจุในถังปิดมิดชิดปริมาตรคงตัว \\(${p.v}\\) ลิตร ได้รับความร้อนจนความดันเพิ่มขึ้นจาก \\(${p.p1}\\text{ kPa}\\) เป็น \\(${p.p2}\\text{ kPa}\\) พลังงานภายในของระบบแก๊สเปลี่ยนแปลงไปกี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const v = r ? getSeededRandomBase('16_4_1_num1_v', r, 2, 8, 2) : 4;
            const p1 = r ? getSeededRandomBase('16_4_1_num1_p1', r, 100, 180, 20) : 100;
            const dP = r ? getSeededRandomBase('16_4_1_num1_dp', r, 60, 160, 20) : 100;
            const p2 = p1 + dP;
            const dU = Math.round(1.5 * v * dP);
            return {
                params: { v, p1, p2, dP, r: offset },
                answers: [dU.toString()],
                answersRaw: [dU],
                explanation: () => `ปริมาตรคงตัว \\( \\Delta U = \\frac{3}{2}V\\Delta P = 1.5 \\times (${v} \\times 10^{-3}) \\times (${dP} \\times 10^3) = ${dU} \\text{ J} \\)`
            };
        }
    },
    {
        id: '16_4_1_dU_state_change', topic: '16.4.1', type: 'numeric_single',
        title: 'การเปลี่ยนแปลงพลังงานภายในระบบจากสถานะ',
        inputs: [{ label: '\\( \\Delta U \\) (Joule):' }],
        text: (p) => `ระบบแก๊สหนึ่งมีพลังงานภายในเริ่มต้น \\(${p.u1}\\text{ J}\\) ต่อมาได้รับความร้อนจนพลังงานภายในที่สถานะสุดท้ายกลายเป็น \\(${p.u2}\\text{ J}\\) พลังงานภายในระบบเปลี่ยนแปลงไปกี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const u1_base = r ? getSeededRandomBase('16_4_1_sc_u1', r, 600, 1200, 100) : 800;
            const u1 = u1_base + (offset % 5) * 20;
            const du_val = r ? getSeededRandomBase('16_4_1_sc_du', r, 500, 1500, 100) : 1000;
            const u2 = u1 + du_val;
            const dU = u2 - u1;
            return {
                params: { u1, u2, r: offset },
                answers: [dU.toString()],
                answersRaw: [dU],
                explanation: () => `\\( \\Delta U = U_2 - U_1 = ${u2} - ${u1} = ${dU} \\text{ J} \\)`
            };
        }
    },

    // 16.4.2 งานของแก๊ส (Work)
    {
        id: '16_4_2_work_calc', topic: '16.4.2', type: 'numeric_single',
        title: 'หางานที่ทำโดยแก๊ส (W)',
        inputs: [{ label: 'งาน \\( W \\) (Joule):' }],
        text: (p) => `แก๊สในกระบอกสูบขยายตัวจากปริมาตร \\(${p.v1}\\) ลิตร เป็น \\(${p.v2}\\) ลิตร ภายใต้ความดันคงตัว \\(${p.p}\\text{ kPa}\\) แก๊สทำงานได้กี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const p_base = r ? getSeededRandomBase('16_4_2_wc_p', r, 100, 250, 50) : 150;
            const p = p_base + (offset % 5) * 10;
            const v1 = r ? getSeededRandomBase('16_4_2_wc_v1', r, 2, 4, 1) : 2;
            const dV = r ? getSeededRandomBase('16_4_2_wc_dv', r, 3, 7, 1) : 4;
            const v2 = v1 + dV;
            const W = p * dV;
            return {
                params: { p, v1, v2, dV, r: offset },
                answers: [W.toString()],
                answersRaw: [W],
                explanation: () => `\\( W = P\\Delta V = (${p} \\times 10^3)(${dV} \\times 10^{-3}) = ${W} \\text{ J} \\)`
            };
        }
    },
    {
        id: '16_4_2_work_compress', topic: '16.4.2', type: 'numeric_single',
        title: 'หางานกรณีแก๊สถูกบดอัด (W)',
        inputs: [{ label: 'งาน \\( W \\) (Joule):' }],
        text: (p) => `ออกแรงดันลูกสูบให้แก๊สหดตัวจากปริมาตร \\(${p.v1}\\) ลิตร เหลือ \\(${p.v2}\\) ลิตร ภายใต้ความดันคงตัว \\(${p.p}\\text{ kPa}\\) งานที่แก๊สทำมีค่ากี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const p_base = r ? getSeededRandomBase('16_4_2_comp_p', r, 80, 200, 20) : 100;
            const p = p_base + (offset % 5) * 10;
            const v1 = r ? getSeededRandomBase('16_4_2_comp_v1', r, 7, 10, 1) : 8;
            const v2 = r ? getSeededRandomBase('16_4_2_comp_v2', r, 2, 4, 1) : 3;
            const dV = v2 - v1;
            const W = p * dV;
            return {
                params: { p, v1, v2, dV, r: offset },
                answers: [W.toString(), (-W).toString()],
                answersRaw: [[W, -W]],
                explanation: () => `\\( W = P(V_2 - V_1) = (${p} \\times 10^3)(${dV} \\times 10^{-3}) = ${W} \\text{ J} \\) (ตอบได้ทั้งค่าติดลบหรือขนาดบวก)`
            };
        }
    },
    {
        id: '16_4_2_work_pv_graph', topic: '16.4.2', type: 'numeric_single',
        title: 'หางานจากพื้นที่ใต้กราฟ P-V รูปสี่เหลี่ยมคางหมู',
        inputs: [{ label: 'งาน \\( W \\) (Joule):' }],
        text: (p) => `แก๊สเกิดกระบวนการจากสถานะ A ไป B โดยความดันเปลี่ยนจาก \\(${p.p1}\\text{ kPa}\\) เป็น \\(${p.p2}\\text{ kPa}\\) และปริมาตรขยายตัวจาก \\(${p.v1}\\) ลิตร เป็น \\(${p.v2}\\) ลิตร จงหางานที่ทำโดยแก๊สจากพื้นที่ใต้กราฟ \\( P-V \\)`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const p1 = r ? getSeededRandomBase('16_4_2_pv_p1', r, 100, 160, 20) : 100;
            const p2 = r ? getSeededRandomBase('16_4_2_pv_p2', r, 200, 300, 20) : 200;
            const v1 = r ? getSeededRandomBase('16_4_2_pv_v1', r, 2, 4, 1) : 2;
            const dV = r ? getSeededRandomBase('16_4_2_pv_dv', r, 3, 6, 1) : 4;
            const v2 = v1 + dV;
            const avgP = (p1 + p2) / 2;
            const W = avgP * dV;
            return {
                params: { p1, p2, v1, v2, dV, r: offset },
                answers: [W.toString()],
                answersRaw: [W],
                explanation: () => `\\( W = \\frac{1}{2}(P_1 + P_2)\\Delta V = \\frac{1}{2}(${p1} + ${p2}) \\times 10^3 \\times (${dV} \\times 10^{-3}) = ${W} \\text{ J} \\)`
            };
        }
    },
    {
        id: '16_4_2_num2_atm_L', topic: '16.4.2', type: 'numeric_single',
        title: 'หางานจากการขยายตัว (atm, L)',
        inputs: [{ label: 'งาน \\( W \\) (Joule):' }],
        text: (p) => `แก๊สขยายตัวดันลูกสูบจากปริมาตร \\(${p.v1}\\) ลิตร เป็น \\(${p.v2}\\) ลิตร ภายใต้ความดันคงตัว \\(${p.p_atm}\\text{ atm}\\) งานที่ทำโดยแก๊สมีค่ากี่จูล (กำหนด 1 atm = \\(10^5 \\text{ Pa}\\), 1 ลิตร = \\(10^{-3} \\text{ m}^3\\))`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const p_atm = r ? getSeededRandomBase('16_4_2_num2_p', r, 1, 4, 1) : 2;
            const v1 = r ? getSeededRandomBase('16_4_2_num2_v1', r, 2, 4, 1) : 2;
            const dV = r ? getSeededRandomBase('16_4_2_num2_dv', r, 3, 7, 1) : 4;
            const v2 = v1 + dV;
            const W = p_atm * dV * 100;
            return {
                params: { p_atm, v1, v2, dV, r: offset },
                answers: [W.toString()],
                answersRaw: [W],
                explanation: () => `\\( W = P\\Delta V = (${p_atm} \\times 10^5) \\times (${dV} \\times 10^{-3}) = ${W} \\text{ J} \\)`
            };
        }
    },

    // 16.4.3 กฎข้อที่หนึ่ง (First Law Q = dU + W)
    {
        id: '16_4_3_law1_calc_Q', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'หาพลังงานความร้อนที่ให้แก่ระบบ (Q)',
        inputs: [{ label: 'ความร้อน \\( Q \\) (Joule):' }],
        text: (p) => `เมื่อให้ความร้อนแก่แก๊สในกระบอกสูบ พลังงานภายในของแก๊สเพิ่มขึ้น \\(${p.dU}\\text{ J}\\) และแก๊สขยายตัวทำงานได้ \\(${p.w}\\text{ J}\\) ความร้อนที่ระบบได้รับมีค่ากี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const dU_base = r ? getSeededRandomBase('16_4_3_l1_du', r, 120, 240, 20) : 160;
            const dU = dU_base + (offset % 5) * 10;
            const w = r ? getSeededRandomBase('16_4_3_l1_w', r, 60, 140, 20) : 80;
            const Q = dU + w;
            return {
                params: { dU, w, r: offset },
                answers: [Q.toString()],
                answersRaw: [Q],
                explanation: () => `\\( Q = \\Delta U + W = (+${dU}) + (+${w}) = ${Q} \\text{ J} \\)`
            };
        }
    },
    {
        id: '16_4_3_law1_calc_W', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'หางานเมื่อระบบคายความร้อน (W)',
        inputs: [{ label: 'งาน \\( W \\) (Joule):' }],
        text: (p) => `ระบบแก๊สคายความร้อนออกสู่สิ่งแวดล้อม \\(${p.q_mag}\\text{ J}\\) ส่งผลให้พลังงานภายในระบบลดลง \\(${p.du_mag}\\text{ J}\\) งานที่เกี่ยวข้องมีค่ากี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const q_base = r ? getSeededRandomBase('16_4_3_l1w_q', r, 250, 450, 50) : 300;
            const q_mag = q_base + (offset % 5) * 10;
            const du_mag = r ? getSeededRandomBase('16_4_3_l1w_du', r, 100, 200, 20) : 140;
            const Q = -q_mag;
            const dU = -du_mag;
            const W = Q - dU;
            return {
                params: { q_mag, du_mag, r: offset },
                answers: [W.toString(), (-W).toString()],
                answersRaw: [[W, -W]],
                explanation: () => `\\( W = Q - \\Delta U = (-${q_mag}) - (-${du_mag}) = ${W} \\text{ J} \\)`
            };
        }
    },
    {
        id: '16_4_3_num3_simple', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'หา ΔU จากกระบวนการขยายตัว',
        inputs: [{ label: '\\( \\Delta U \\) (Joule):' }],
        text: (p) => `ระบบได้รับความร้อน \\(${p.q}\\text{ J}\\) ส่งผลให้แก๊สขยายตัวและทำงานผลักลูกสูบได้ \\(${p.w}\\text{ J}\\) พลังงานภายในระบบเปลี่ยนแปลงไปกี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const q_base = r ? getSeededRandomBase('16_4_3_n3_q', r, 400, 800, 50) : 600;
            const q = q_base + (offset % 5) * 10;
            const w = r ? getSeededRandomBase('16_4_3_n3_w', r, 120, 260, 20) : 180;
            const dU = q - w;
            return {
                params: { q, w, r: offset },
                answers: [dU.toString()],
                answersRaw: [dU],
                explanation: () => `\\( \\Delta U = Q - W = ${q} - ${w} = ${dU} \\text{ J} \\)`
            };
        }
    },
    {
        id: '16_4_3_num7_all_neg', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'ระบบคายความร้อนและถูกบีบอัด',
        inputs: [{ label: '\\( \\Delta U \\) (Joule):' }],
        text: (p) => `แก๊สในกระบอกสูบคายความร้อนออกสู่สิ่งแวดล้อม \\(${p.q}\\text{ J}\\) และในขณะเดียวกันปริมาตรหดตัวลงโดยมีสิ่งแวดล้อมทำงานให้ \\(${p.w}\\text{ J}\\) พลังงานภายในระบบเปลี่ยนไปกี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const q_base = r ? getSeededRandomBase('16_4_3_n7_q', r, 250, 450, 50) : 350;
            const q = q_base + (offset % 5) * 10;
            const w = r ? getSeededRandomBase('16_4_3_n7_w', r, 100, 200, 25) : 150;
            const dU = -q - (-w);
            return {
                params: { q, w, r: offset },
                answers: [dU.toString(), (-dU).toString()],
                answersRaw: [[dU, -dU]],
                explanation: () => `\\( \\Delta U = Q - W = (-${q}) - (-${w}) = ${dU} \\text{ J} \\)`
            };
        }
    },
    {
        id: '16_4_3_num10_compress_heat', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'หา ΔU เมื่อรับความร้อนและถูกบดอัด',
        inputs: [{ label: '\\( \\Delta U \\) (Joule):' }],
        text: (p) => `ระบบได้รับความร้อน \\(${p.q}\\text{ J}\\) แต่ในขณะเดียวกันปริมาตรของแก๊สหดตัวลงโดยสิ่งแวดล้อมทำงานให้ \\(${p.w}\\text{ J}\\) พลังงานภายในระบบเปลี่ยนแปลงไปกี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const q_base = r ? getSeededRandomBase('16_4_3_n10_q', r, 300, 600, 50) : 450;
            const q = q_base + (offset % 5) * 10;
            const w = r ? getSeededRandomBase('16_4_3_n10_w', r, 100, 220, 20) : 140;
            const dU = q - (-w);
            return {
                params: { q, w, r: offset },
                answers: [dU.toString()],
                answersRaw: [dU],
                explanation: () => `\\( \\Delta U = Q - W = ${q} - (-${w}) = ${dU} \\text{ J} \\)`
            };
        }
    },

    // กระบวนการ 4 แบบ
    {
        id: '16_4_3_proc_isochoric', topic: '16.4.3-calc', type: 'numeric_double',
        title: 'ระบบปริมาตรคงที่ (Isochoric)',
        inputs: [
            { label: '1) งาน \\( W \\) (Joule):' },
            { label: '2) \\( \\Delta U \\) (Joule):' }
        ],
        text: (p) => `กระบอกสูบถูกยึดให้ปริมาตรคงที่ จากนั้นให้ความร้อนแก่ระบบแก๊สภายในจำนวน \\(${p.q}\\text{ J}\\) จงหางานที่แก๊สทำได้ (\\(W\\)) และพลังงานภายในที่เปลี่ยนไป (\\(\\Delta U\\))`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const q_base = r ? getSeededRandomBase('16_4_3_isc_q', r, 250, 550, 50) : 350;
            const q = q_base + (offset % 5) * 10;
            const w = 0;
            const dU = q;
            return {
                params: { q, r: offset },
                answers: [w.toString(), dU.toString()],
                answersRaw: [w, dU],
                explanation: () => `ปริมาตรคงที่ \\( W = 0 \\text{ J} \\), \\( \\Delta U = Q = ${q} \\text{ J} \\)`
            };
        }
    },
    {
        id: '16_4_3_proc_isobaric', topic: '16.4.3-calc', type: 'numeric_double',
        title: 'กระบวนการความดันคงตัวสำหรับแก๊สอะตอมเดี่ยว (Isobaric)',
        inputs: [
            { label: '1) งาน \\( W \\) (Joule):' },
            { label: '2) \\( \\Delta U \\) (Joule):' }
        ],
        text: (p) => `ให้ความร้อน \\(${p.q}\\text{ J}\\) แก่แก๊สอุดมคติอะตอมเดี่ยวในกระบอกสูบที่ความดันคงตัว จงหางานที่แก๊สทำ (\\(W\\)) และพลังงานภายในที่เปลี่ยนไป (\\(\\Delta U\\)) (กำหนดอัตราส่วน \\( \\Delta U : W : Q = 3 : 2 : 5 \\))`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const q_mult = r ? getSeededRandomBase('16_4_3_isob_q', r, 500, 2500, 500) : 1000;
            const q = q_mult;
            const dU = Math.round(0.6 * q);
            const w = Math.round(0.4 * q);
            return {
                params: { q, r: offset },
                answers: [w.toString(), dU.toString()],
                answersRaw: [w, dU],
                explanation: () => `สำหรับแก๊สอะตอมเดี่ยว \\( W = \\frac{2}{5}Q = ${w} \\text{ J} \\) และ \\( \\Delta U = \\frac{3}{5}Q = ${dU} \\text{ J} \\)`
            };
        }
    },
    {
        id: '16_4_3_proc_isothermal', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'ระบบอุณหภูมิคงที่ (Isothermal)',
        inputs: [{ label: 'ความร้อน \\( Q \\) (Joule):' }],
        text: (p) => `แก๊สอุดมคติขยายตัวโดยควบคุมให้อุณหภูมิคงที่ตลอดกระบวนการ ถ้าแก๊สทำงานได้ \\(${p.w}\\text{ J}\\) ระบบนี้รับความร้อนเข้ามากี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const w_base = r ? getSeededRandomBase('16_4_3_isot_w', r, 300, 700, 100) : 500;
            const w = w_base + (offset % 5) * 20;
            const Q = w;
            return {
                params: { w, r: offset },
                answers: [Q.toString()],
                answersRaw: [Q],
                explanation: () => `อุณหภูมิคงที่ \\( \\Delta U = 0 \\implies Q = W = ${w} \\text{ J} \\)`
            };
        }
    },
    {
        id: '16_4_3_proc_adiabatic', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'กระบวนการแอเดียแบติก (Adiabatic)',
        inputs: [{ label: '\\( \\Delta U \\) (Joule):' }],
        text: (p) => `กระบอกสูบหุ้มฉนวนกันความร้อนอย่างสมบูรณ์ ถูกกดลูกสูบบดอัดแก๊สอย่างรวดเร็วโดยสิ่งแวดล้อมทำงานให้แก๊ส \\(${p.w}\\text{ J}\\) พลังงานภายในของแก๊สเปลี่ยนไปกี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const w_base = r ? getSeededRandomBase('16_4_3_ad_w', r, 150, 400, 50) : 250;
            const w = w_base + (offset % 5) * 10;
            const dU = w;
            return {
                params: { w, r: offset },
                answers: [dU.toString(), "+" + dU.toString()],
                answersRaw: [dU],
                explanation: () => `\\( Q = 0 \\implies \\Delta U = -W = -(-${w}) = +${dU} \\text{ J} \\)`
            };
        }
    },

    // เครื่องยนต์ความร้อนและวัฏจักร
    {
        id: '16_4_3_num9_heat_engine', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'หลักการทำงานเครื่องยนต์ความร้อน (ความร้อนทิ้ง)',
        inputs: [{ label: 'คายความร้อนทิ้ง \\( Q_C \\) (Joule):' }],
        text: (p) => `ใน 1 วัฏจักร เครื่องยนต์ความร้อนรับความร้อนจากแหล่งอุณหภูมิสูงมา \\(${p.qh}\\text{ J}\\) และทำงานได้ \\(${p.w}\\text{ J}\\) เครื่องยนต์นี้คายความร้อนทิ้งกี่จูล`,
        generate: (r) => {
            const pairIdx = r ? getSeededRandomBase('16_4_3_eng_p', r, 0, CLEAN_ENGINE_PAIRS.length - 1, 1) : 0;
            const pair = CLEAN_ENGINE_PAIRS[pairIdx];
            const qh = pair.qh;
            const w = pair.w;
            const qc = pair.qc;
            return {
                params: { qh, w, qc },
                answers: [qc.toString()],
                answersRaw: [qc],
                explanation: () => `\\( Q_C = Q_H - W = ${qh} - ${w} = ${qc} \\text{ J} \\)`
            };
        }
    },
    {
        id: '16_4_3_engine_efficiency', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'ประสิทธิภาพเชิงความร้อนของเครื่องยนต์ความร้อน',
        inputs: [{ label: 'ประสิทธิภาพ \\( e \\) (%):' }],
        text: (p) => `เครื่องยนต์ความร้อนรับความร้อน \\(${p.qh}\\text{ J}\\) และคายความร้อนทิ้ง \\(${p.qc}\\text{ J}\\) จงหาประสิทธิภาพเชิงความร้อนของเครื่องยนต์ (ตอบเป็นเปอร์เซ็นต์ เช่น 40)`,
        generate: (r) => {
            const pairIdx = r ? getSeededRandomBase('16_4_3_eff_p', r, 0, CLEAN_ENGINE_PAIRS.length - 1, 1) : 0;
            const pair = CLEAN_ENGINE_PAIRS[pairIdx];
            const qh = pair.qh;
            const qc = pair.qc;
            const eff = pair.eff;
            const decEff = (eff / 100).toFixed(2);
            return {
                params: { qh, qc, eff },
                answers: [eff.toString(), eff + "%", decEff, (eff / 100).toString()],
                answersRaw: [[eff, eff / 100]],
                explanation: () => `\\( e = \\frac{Q_H - Q_C}{Q_H} \\times 100\\% = \\frac{${qh} - ${qc}}{${qh}} \\times 100\\% = ${eff}\\% \\)`
            };
        }
    },
    {
        id: '16_4_3_cyclic_work', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'งานสุทธิในกระบวนการแบบวัฏจักร (Cyclic Process)',
        inputs: [{ label: 'งานสุทธิ \\( W_{\\text{net}} \\) (Joule):' }],
        text: (p) => `แก๊สทำงานครบ 1 วัฏจักร โดยรับความร้อนสุทธิจากภายนอกเข้ามา \\(${p.qin}\\text{ J}\\) และคายความร้อนออก \\(${p.qout}\\text{ J}\\) งานสุทธิที่ระบบทำได้มีค่ากี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const qin_base = r ? getSeededRandomBase('16_4_3_cyc_in', r, 800, 1600, 100) : 1000;
            const qin = qin_base + (offset % 5) * 20;
            const qout = r ? getSeededRandomBase('16_4_3_cyc_out', r, 300, 600, 50) : 400;
            const wnet = qin - qout;
            return {
                params: { qin, qout, r: offset },
                answers: [wnet.toString()],
                answersRaw: [wnet],
                explanation: () => `ครบ 1 วัฏจักร \\( \\Delta U = 0 \\implies W_{\\text{net}} = Q_{\\text{in}} - Q_{\\text{out}} = ${qin} - ${qout} = ${wnet} \\text{ J} \\)`
            };
        }
    },

    // ทฤษฎีและมโนทัศน์ (Choice 4 ตัวเลือก)
    {
        id: '16_4_3_concept_signs', topic: '16.4.3-concept', type: 'choice',
        title: 'ทฤษฎีเครื่องหมายอุณหพลศาสตร์',
        choices: [
            '\\( Q \\) เป็นบวก และ \\( W \\) เป็นลบ',
            '\\( Q \\) เป็นลบ และ \\( W \\) เป็นบวก',
            '\\( Q \\) เป็นบวก และ \\( W \\) เป็นบวก',
            '\\( Q \\) เป็นลบ และ \\( W \\) เป็นลบ'
        ],
        text: () => `ในกระบวนการที่ "ระบบรับความร้อนจากสิ่งแวดล้อม และระบบถูกบีบอัดให้ปริมาตรเล็กลง" ข้อกำหนดเครื่องหมายในกฎข้อที่หนึ่งข้อใดถูกต้อง`,
        generate: () => ({
            params: {},
            answers: ['\\( Q \\) เป็นบวก และ \\( W \\) เป็นลบ'],
            answersRaw: [0],
            explanation: () => `ระบบรับความร้อน: Q > 0 (บวก), ถูกบีบอัดปริมาตรลดลง: W < 0 (ลบ)`
        })
    },
    {
        id: '16_4_3_ch1_isochoric', topic: '16.4.3-concept', type: 'choice',
        title: 'กระบวนการปริมาตรคงตัว (Isochoric)',
        choices: [
            '\\( W = 0 \\) และ \\( Q = \\Delta U \\)',
            '\\( \\Delta U = 0 \\) และ \\( Q = W \\)',
            '\\( Q = 0 \\) และ \\( \\Delta U = -W \\)',
            '\\( W > 0 \\) และ \\( \\Delta U < 0 \\)'
        ],
        text: () => `หากให้ความร้อนแก่แก๊สในภาชนะปิดมิดชิดที่แข็งเกร็ง (ปริมาตรคงตัว) ข้อใดกล่าวถึงการเปลี่ยนแปลงพลังงานตามกฎข้อที่หนึ่งได้ถูกต้องที่สุด`,
        generate: () => ({
            params: {},
            answers: ['\\( W = 0 \\) และ \\( Q = \\Delta U \\)'],
            answersRaw: [0],
            explanation: () => `เมื่อปริมาตรคงตัว \\( \\Delta V = 0 \\implies W = 0 \\) ดังนั้น \\( Q = \\Delta U \\)`
        })
    },
    {
        id: '16_4_3_ch2_isothermal', topic: '16.4.3-concept', type: 'choice',
        title: 'กระบวนการอุณหภูมิคงตัว (Isothermal)',
        choices: [
            '\\( \\Delta U = 0 \\) และ \\( Q = W \\)',
            '\\( W = 0 \\) และ \\( Q = \\Delta U \\)',
            '\\( Q = 0 \\) และ \\( W = -\\Delta U \\)',
            '\\( \\Delta U < 0 \\) และ \\( Q = 0 \\)'
        ],
        text: () => `แก๊สอุดมคติขยายตัวอย่างช้าๆ โดยมีอุปกรณ์ควบคุมให้อุณหภูมิของระบบคงตัวตลอดกระบวนการ ข้อใดสรุปได้ถูกต้อง`,
        generate: () => ({
            params: {},
            answers: ['\\( \\Delta U = 0 \\) และ \\( Q = W \\)'],
            answersRaw: [0],
            explanation: () => `อุณหภูมิคงตัว \\( \\Delta T = 0 \\implies \\Delta U = 0 \\) ทำให้ \\( Q = W \\)`
        })
    },
    {
        id: '16_4_3_ch3_adiabatic', topic: '16.4.3-concept', type: 'choice',
        title: 'กระบวนการแอเดียแบติก (ขยายตัว)',
        choices: [
            'พลังงานภายในลดลง \\( (\\Delta U < 0) \\) และอุณหภูมิลดลง',
            'พลังงานภายในเพิ่มขึ้น \\( (\\Delta U > 0) \\) และอุณหภูมิเพิ่มขึ้น',
            'พลังงานภายในคงที่ \\( (\\Delta U = 0) \\) และอุณหภูมิคงที่',
            'พลังงานภายในลดลง แต่ความดันเพิ่มขึ้น'
        ],
        text: () => `ระบบแก๊สอุดมคติเกิดการขยายตัวอย่างรวดเร็วมากจนไม่มีการถ่ายโอนความร้อนเข้าหรือออกจากระบบ \\( (Q = 0) \\) พลังงานภายในระบบและอุณหภูมิจะเป็นอย่างไร`,
        generate: () => ({
            params: {},
            answers: ['พลังงานภายในลดลง \\( (\\Delta U < 0) \\) และอุณหภูมิลดลง'],
            answersRaw: [0],
            explanation: () => `\\( Q = 0 \\implies \\Delta U = -W \\) แก๊สขยายตัว \\( W > 0 \\implies \\Delta U < 0 \\) อุณหภูมิต้องลดลง`
        })
    },
    {
        id: '16_4_3_ch4_cyclic', topic: '16.4.3-concept', type: 'choice',
        title: 'กระบวนการแบบวัฏจักร (Cyclic Process)',
        choices: [
            'การเปลี่ยนแปลงพลังงานภายในรวม \\( (\\Delta U_{\\text{net}} = 0) \\)',
            'งานรวมที่ทำโดยแก๊สเป็นศูนย์เสมอ \\( (W_{\\text{net}} = 0) \\)',
            'ความร้อนสุทธิที่รับเข้าเป็นศูนย์เสมอ \\( (Q_{\\text{net}} = 0) \\)',
            'ความดันสูงสุดต้องคงที่ตลอดวัฏจักร'
        ],
        text: () => `เมื่อแก๊สเกิดการเปลี่ยนแปลงแบบวัฏจักร (วนกลับมาสู่สถานะเริ่มต้น) ปริมาณในข้อใดจะมีการเปลี่ยนแปลงรวมเป็นศูนย์เสมอ`,
        generate: () => ({
            params: {},
            answers: ['การเปลี่ยนแปลงพลังงานภายในรวม \\( (\\Delta U_{\\text{net}} = 0) \\)'],
            answersRaw: [0],
            explanation: () => `\\( U \\) เป็นฟังก์ชันสถานะ เมื่อกลับมาสถานะเริ่มต้น \\( \\Delta U = 0 \\)`
        })
    },
    {
        id: '16_4_3_ch5_engine', topic: '16.4.3-concept', type: 'choice',
        title: 'ข้อจำกัดของเครื่องยนต์ความร้อน (กฎข้อที่สอง)',
        choices: [
            'ต้องมีการคายความร้อนบางส่วนทิ้งสู่แหล่งอุณหภูมิต่ำเสมอ',
            'ความร้อนทั้งหมดถูกนำไปเปลี่ยนเป็นพลังงานศักย์ของแก๊ส',
            'มวลของแก๊สจะค่อยๆ ระเหยหายไปในแต่ละรอบ',
            'แก๊สทำงานขยายตัวได้เพียงครึ่งรอบเท่านั้น'
        ],
        text: () => `ตามกฎข้อที่สองของอุณหพลศาสตร์ ในเครื่องยนต์ความร้อนไม่สามารถเปลี่ยนความร้อนที่รับมาให้กลายเป็นงานได้ทั้งหมด 100% เพราะเหตุใดเป็นหลักการสำคัญ`,
        generate: () => ({
            params: {},
            answers: ['ต้องมีการคายความร้อนบางส่วนทิ้งสู่แหล่งอุณหภูมิต่ำเสมอ'],
            answersRaw: [0],
            explanation: () => `เครื่องยนต์ความร้อนทำงานเป็นวัฏจักร ต้องคายความร้อนทิ้งสู่แหล่งอุณหภูมิต่ำเสมอ`
        })
    },
    {
        id: '16_4_3_ch6_pv_area', topic: '16.4.3-concept', type: 'choice',
        title: 'ความหมายทางกายภาพของกราฟ P-V',
        choices: [
            'พื้นที่ใต้กราฟระหว่างเส้นทางกระบวนการกับแกนนอน \\( (V) \\) คืองานที่ทำโดยแก๊ส',
            'ความชันของกราฟ \\( P-V \\) แสดงถึงพลังงานภายในของระบบ',
            'พื้นที่ใต้กราฟคือกำลังความร้อนที่สูญเสียไปในสิ่งแวดล้อม',
            'จุดตัดแกนตั้ง \\( (P) \\) คืออุณหภูมิสัมบูรณ์ของแก๊ส'
        ],
        text: () => `ในแผนภาพความดันกับปริมาตร (กราฟ P-V) พื้นที่ใต้เส้นกราฟของกระบวนการหมายถึงปริมาณทางฟิสิกส์ใด`,
        generate: () => ({
            params: {},
            answers: ['พื้นที่ใต้กราฟระหว่างเส้นทางกระบวนการกับแกนนอน \\( (V) \\) คืองานที่ทำโดยแก๊ส'],
            answersRaw: [0],
            explanation: () => `พื้นที่ใต้กราฟ \\( P-V \\) สอดคล้องกับ \\( W = \\int P dV \\) คืองานที่ทำโดยแก๊ส`
        })
    },
    {
        id: '16_4_3_ch7_internal_energy', topic: '16.4.3-concept', type: 'choice',
        title: 'พลังงานภายในของแก๊สอุดมคติ',
        choices: [
            'ขึ้นอยู่กับอุณหภูมิสัมบูรณ์ \\( (T) \\) ของระบบเพียงอย่างเดียว',
            'ขึ้นอยู่กับปริมาตรของภาชนะบรรจุเพียงอย่างเดียว',
            'ขึ้นอยู่กับความหนาแน่นและสีของแก๊ส',
            'มีค่าคงที่เสมอไม่ว่าจะเพิ่มหรือลดอุณหภูมิ'
        ],
        text: () => `สำหรับแก๊สอุดมคติ พลังงานภายในของระบบ \\( (U) \\) ขึ้นอยู่กับตัวแปรใดเป็นหลักการสำคัญ`,
        generate: () => ({
            params: {},
            answers: ['ขึ้นอยู่กับอุณหภูมิสัมบูรณ์ \\( (T) \\) ของระบบเพียงอย่างเดียว'],
            answersRaw: [0],
            explanation: () => `\\( U = \\frac{3}{2}N k_B T = \\frac{3}{2}nRT \\) ขึ้นอยู่กับอุณหภูมิสัมบูรณ์ \\( T \\) เท่านั้น`
        })
    }
];
// --- Practice Engine ---
function startPracticeMode(topic) {
    currentPracticeTopic = topic;
    document.getElementById('practice-arena').classList.remove('hidden');
    ['16-4-1', '16-4-2', '16-4-3-calc', '16-4-3-concept'].forEach(t => {
        const btn = document.getElementById(`btn-prac-${t}`);
        if (btn) btn.className = t === topic
            ? "p-4 bg-slate-100 border-2 border-slate-500 text-slate-900 rounded-xl flex items-center gap-4 transition text-left shadow-sm"
            : "p-4 bg-white hover:bg-slate-50 text-slate-800 rounded-xl border border-slate-200 flex items-center gap-4 transition text-left shadow-sm hover:shadow";
    });
    document.getElementById('prac-feedback').classList.add('hidden');
    document.getElementById('prac-explanation-box').classList.add('hidden');
    regeneratePractice();
}

function regeneratePractice() {
    const mode = document.getElementById('prac-type-select').value;
    const isRandom = mode === 'random';

    // แก้ไขบัค: แปลง format ตัวแปร topic จาก 16-4-1 ให้ตรงกับ 16.4.1 ในฐานข้อมูล
    const formattedTopic = currentPracticeTopic.replace('16-4-', '16.4.');
    const filtered = QUESTION_TEMPLATES.filter(q => q.topic === formattedTopic);

    if (!filtered.length) return;

    if (!practiceHistory[formattedTopic]) {
        practiceHistory[formattedTopic] = [];
    }

    // กรองเอาโจทย์ที่ยังไม่เคยแสดงในรอบนี้
    let available = filtered.filter(q => !practiceHistory[formattedTopic].includes(q.id));

    // ถ้าแสดงครบทุกตัวเลือกแล้ว ให้ล้างประวัติโดยเก็บข้อล่าสุดไว้เพื่อไม่ให้ซ้ำกันทันที
    if (available.length === 0) {
        const lastShown = practiceHistory[formattedTopic][practiceHistory[formattedTopic].length - 1];
        practiceHistory[formattedTopic] = lastShown ? [lastShown] : [];
        available = filtered.filter(q => !practiceHistory[formattedTopic].includes(q.id));
    }

    // กรณีความปลอดภัย หากยังไม่มีค่า ให้ใช้ข้อทั้งหมด
    if (available.length === 0) {
        available = filtered;
    }

    const template = available[Math.floor(Math.random() * available.length)];

    // เพิ่มโจทย์ปัจจุบันลงในประวัติ
    practiceHistory[formattedTopic].push(template.id);

    // จำกัดขนาดประวัติเพื่อไม่ให้ยาวเกินไป
    if (practiceHistory[formattedTopic].length > Math.max(1, filtered.length - 1)) {
        practiceHistory[formattedTopic].shift();
    }

    // ขยายขอบเขต Seed ในโหมดฝึกฝนเป็น 1 - 1,000,000 เพื่อความหลากหลายของตัวเลข (ข้อ 1, 3, 6, 7)
    let instance = null;
    let attempts = 0;
    const history = getHistory();

    while (attempts < 100) {
        attempts++;
        let R;
        if (isRandom) {
            // โหมดสุ่ม: สุ่มทั้งฐานตัวแปรและมีค่าบวกเพิ่ม (offset 1-9)
            R = Math.floor(Math.random() * 1000000) + 1;
        } else {
            // โจทย์ปกติ: สุ่มเฉพาะฐานตัวแปรแต่ไม่มีค่าบวกเพิ่ม (offset เป็น 0)
            R = "standard_" + Math.floor(Math.random() * 1000000);
        }
        
        instance = template.generate(R);
        
        const vals = getActiveParamValues(instance.params);
        if (vals.length > 0) {
            // ตรวจสอบตัวแปรซ้ำภายในข้อเดียวกัน (ข้อ 2)
            if (hasDuplicateVariables(instance.params)) {
                continue;
            }
            
            // ตรวจสอบประวัติการสุ่มไม่ให้ซ้ำกับรอบก่อนหน้า (ข้อ 3, 4, 5)
            const key = generateUniqueKey(template.id, instance.params);
            if (history.includes(key)) {
                continue;
            }
            
            addToHistory(key);
        }
        break; // สุ่มได้ผ่านเกณฑ์แล้ว
    }

    currentPracticeQuestion = { template, instance };
    document.getElementById('prac-badge-mode').innerText = `หมวดหมู่โจทย์: ${template.topic.replace('-calc', '').replace('-concept', '')} • ${isRandom ? 'โหมดสุ่มตัวเลข' : 'โจทย์พื้นฐาน'}`;
    document.getElementById('prac-question-title').innerText = `📋 โจทย์: ${template.title}`;
    document.getElementById('prac-question-text').innerHTML = template.text(instance.params);

    const cz = document.getElementById('prac-choice-zone'), nz = document.getElementById('prac-numeric-zone');
    document.getElementById('prac-input-val1').value = '';
    document.getElementById('prac-input-val2').value = '';
    document.getElementById('prac-input-zone-2').classList.add('hidden');
    document.getElementById('prac-feedback').classList.add('hidden');
    document.getElementById('prac-explanation-box').classList.add('hidden');

    if (template.type === 'choice') {
        cz.classList.remove('hidden'); nz.classList.add('hidden');
        cz.innerHTML = template.choices.map((c, cIdx) => `<button onclick="checkPracticeChoice(${cIdx})" class="w-full text-left px-5 py-3 bg-white hover:bg-orange-50 text-slate-800 font-medium rounded-xl border border-slate-200 hover:border-orange-300 transition">${c}</button>`).join('');
    } else {
        cz.classList.add('hidden'); nz.classList.remove('hidden');
        document.getElementById('lbl-prac-input-1').innerHTML = template.inputs[0].label;
        if (template.type === 'numeric_double') {
            document.getElementById('prac-input-zone-2').classList.remove('hidden');
            document.getElementById('lbl-prac-input-2').innerHTML = template.inputs[1].label;
        }
    }
    queueTypeset(document.getElementById('practice-arena'));
}

function checkPracticeAnswer() {
    if (!currentPracticeQuestion) return;
    const { template, instance } = currentPracticeQuestion;
    if (template.type === 'choice') return;

    const v1 = document.getElementById('prac-input-val1').value.trim();
    const v2 = document.getElementById('prac-input-val2').value.trim();

    if (!v1 || (template.type === 'numeric_double' && !v2)) {
        triggerAlert("กรอกไม่ครบ", "ระบุคำตอบให้ครบก่อนตรวจครับ", "fa-circle-question", "bg-orange-100 text-orange-600");
        return;
    }

    const c1 = isNumericAnswerCorrect(v1, instance.answersRaw[0]);
    const c2 = template.type === 'numeric_double' ? isNumericAnswerCorrect(v2, instance.answersRaw[1]) : true;
    showPracticeFeedback(c1 && c2, instance.explanation());
}

function checkPracticeChoice(choiceIndex) {
    if (!currentPracticeQuestion) return;
    const { template, instance } = currentPracticeQuestion;
    const choice = template.choices[choiceIndex];
    showPracticeFeedback(choice === instance.answers[0], instance.explanation());
}

function showPracticeFeedback(isCorrect, explainText) {
    const fb = document.getElementById('prac-feedback');
    fb.className = `p-5 rounded-2xl border block ${isCorrect ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`;
    fb.innerHTML = isCorrect
        ? `<div class="font-bold flex items-center gap-2"><i class="fa-solid fa-circle-check text-emerald-500 text-lg"></i> ยอดเยี่ยม! ตอบถูกต้องตามหลักฟิสิกส์</div>`
        : `<div class="font-bold flex items-center gap-2"><i class="fa-solid fa-circle-xmark text-red-500 text-lg"></i> คำตอบยังไม่ถูก ลองศึกษาเฉลยด้านล่างดูนะครับ</div>`;
    document.getElementById('prac-explanation-text').innerHTML = explainText;
    document.getElementById('prac-explanation-box').classList.remove('hidden');
    queueTypeset(document.getElementById('practice-arena'));
}

// --- Exam Engine ---

/**
 * Selects a theory question prioritizing questions not yet seen by the student in previous attempts.
 */
function selectTheoryQuestion(cls, num) {
    const theoryPool = QUESTION_TEMPLATES.filter(q => q.topic === '16.4.3-concept');
    const history = getTheoryChoiceHistory(cls, num);
    let available = theoryPool.filter(q => !history.includes(q.id));
    if (available.length === 0) {
        // Reset history if all questions have been used
        available = theoryPool;
        try {
            localStorage.setItem(`exam_choice_history_${cls}_${num}`, JSON.stringify([]));
        } catch (e) {}
    }
    const chosen = available[Math.floor(Math.random() * available.length)];
    saveTheoryChoiceToHistory(cls, num, chosen.id);
    return chosen;
}

function startExamProcess() {
    const name = document.getElementById('exam-student-name').value.trim();
    const cls = document.getElementById('exam-student-class').value;
    const numInput = document.getElementById('exam-student-no').value.trim();
    const R_parsed = parseInt(numInput, 10);
    if (!name || !cls || isNaN(R_parsed) || R_parsed < 1 || R_parsed > 40) {
        triggerAlert("ข้อมูลไม่ครบถ้วน", "กรุณาระบุ ชื่อ ชั้นเรียน และเลขที่ \\( (1-40) \\) ให้ถูกต้องก่อนเริ่มสอบครับ", "fa-user", "bg-orange-100 text-orange-600");
        return;
    }
    const num = String(R_parsed);

    const currentAttempt = incrementStudentAttemptCount(cls, num);
    const timestamp = Date.now();
    examSeed = `${num}_${timestamp}_att${currentAttempt}`;
    examDurationSeconds = 15 * 60; // 15 minutes (900 seconds) locked
    examTimeRemaining = examDurationSeconds;
    examStudentInfo = { name, class: cls, number: num, attempt: currentAttempt, seed: examSeed };

    // Reset cheating stats for new exam session
    cheatingStats = { tabSwitches: 0, refreshes: 0 };
    lastCheatEventTime = 0;

    const pureShuffle = (array) => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    // Select 5 questions mixing all 16.4 topics:
    // - 1 from 16.4.1 (Internal Energy)
    // - 1 from 16.4.2 (Work & P-V graph)
    // - 2 from 16.4.3-calc (First Law, Processes, Heat Engine & Cycle)
    // - 1 from 16.4.3-concept (Rotated Theory Choice)
    const q_dU = QUESTION_TEMPLATES.filter(q => q.topic === '16.4.1');
    const q_W = QUESTION_TEMPLATES.filter(q => q.topic === '16.4.2');
    const q_LawCalc = QUESTION_TEMPLATES.filter(q => q.topic === '16.4.3-calc');

    const shuffled_dU = pureShuffle(q_dU);
    const shuffled_W = pureShuffle(q_W);
    const shuffled_LawCalc = pureShuffle(q_LawCalc);
    const theoryQ = selectTheoryQuestion(cls, num);

    let selectedTemplates = [
        shuffled_dU[0],
        shuffled_W[0],
        shuffled_LawCalc[0],
        shuffled_LawCalc[1] || shuffled_LawCalc[0],
        theoryQ
    ];

    // Shuffle the 5 questions so positions are randomized
    selectedTemplates = pureShuffle(selectedTemplates);

    currentExamQuestions = selectedTemplates.map((template, index) => {
        let instance = null;
        let attempts = 0;
        const history = getHistory();

        while (attempts < 100) {
            attempts++;
            const seed = `${num}_${timestamp}_${template.id}_${attempts}_att${currentAttempt}`;
            instance = template.generate(seed);

            const vals = getActiveParamValues(instance.params);
            if (vals.length > 0) {
                if (hasDuplicateVariables(instance.params)) {
                    continue;
                }
                const key = generateUniqueKey(template.id, instance.params);
                if (history.includes(key)) {
                    continue;
                }
                addToHistory(key);
            }
            break;
        }

        const choices = template.type === 'choice' ? pureShuffle(template.choices) : [];
        return {
            id: template.id,
            topic: template.topic,
            type: template.type,
            title: template.title,
            text: template.text(instance.params),
            inputs: template.inputs || [],
            choices: choices,
            answers: instance.answers,
            answersRaw: instance.answersRaw,
            explanationText: instance.explanation()
        };
    });

    const userInfoEl = document.getElementById('lbl-exam-user-info');
    if (userInfoEl) {
        userInfoEl.innerHTML = `${name} (ม.6/${cls} เลขที่ ${num})`;
    }
    const attemptBadge = document.getElementById('badge-exam-attempt');
    if (attemptBadge) {
        attemptBadge.innerText = `สอบครั้งที่ ${currentAttempt}`;
    }

    renderExamLiveDOM();

    examStartTimestamp = Date.now();
    examDeadlineTimestamp = examStartTimestamp + (examDurationSeconds * 1000);
    examIsActive = true;
    examSubmissionInProgress = false;

    saveExamState();
    setupExamLocks();
    showSection('exam-live');
    startExamTimer();
}

function setupExamLocks() {
    examExitGuardEnabled = true;
    document.body.classList.add('exam-locked');
    window.addEventListener('beforeunload', handleExamBeforeUnload);
}

function releaseExamLocks() {
    examExitGuardEnabled = false;
    document.body.classList.remove('exam-locked');
    window.removeEventListener('beforeunload', handleExamBeforeUnload);
}

function handleExamBeforeUnload(e) {
    if (examIsActive) {
        e.preventDefault();
        e.returnValue = '';
    }
}

function renderExamLiveDOM(savedAnswers = null) {
    const container = document.getElementById('exam-questions-container');
    container.innerHTML = '';

    currentExamQuestions.forEach((q, idx) => {
        let inputHTML = '';
        const savedAns = savedAnswers ? savedAnswers[idx] : null;

        if (q.type === 'choice') {
            inputHTML += `<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">`;
            q.choices.forEach((c, cIdx) => {
                const isChecked = savedAns === c ? 'checked' : '';
                inputHTML += `<label class="flex items-center gap-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 p-4 rounded-xl cursor-pointer transition">
              <input type="radio" name="exam-q${idx}" value="${c}" ${isChecked} onchange="debouncedAutoSave()" class="w-4 h-4 text-orange-600 focus:ring-orange-500">
              <span class="text-sm text-slate-800">${c}</span>
            </label>`;
            });
            inputHTML += `</div>`;
        } else if (q.type === 'numeric_single') {
            const val = (savedAns && savedAns[0]) ? savedAns[0] : '';
            inputHTML += `<div class="mt-4"><label class="block text-xs font-bold text-slate-500 mb-1">${q.inputs[0].label}</label>
            <input type="text" id="exam-q${idx}-val1" value="${val}" oninput="debouncedAutoSave()" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 outline-none font-mono text-sm"></div>`;
        } else if (q.type === 'numeric_double') {
            const val1 = (savedAns && savedAns[0]) ? savedAns[0] : '';
            const val2 = (savedAns && savedAns[1]) ? savedAns[1] : '';
            inputHTML += `<div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">${q.inputs[0].label}</label>
              <input type="text" id="exam-q${idx}-val1" value="${val1}" oninput="debouncedAutoSave()" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 outline-none font-mono text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">${q.inputs[1].label}</label>
              <input type="text" id="exam-q${idx}-val2" value="${val2}" oninput="debouncedAutoSave()" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 outline-none font-mono text-sm">
            </div>
          </div>`;
        }

        container.innerHTML += `<div class="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <span class="font-bold text-slate-800">ข้อที่ ${idx + 1}: ${q.title}</span>
            <span class="bg-orange-100 text-orange-800 px-2.5 py-1 rounded-md text-xs font-bold">2 คะแนน</span>
          </div>
          <p class="text-sm md:text-base text-slate-700 leading-relaxed font-medium math-font">${q.text}</p>
          ${inputHTML}
        </div>`;
    });

    queueTypeset(container);
}

function startExamTimer() {
    clearInterval(examTimerInterval);
    examTimerInterval = setInterval(() => {
        if (!examIsActive) return;
        examTimeRemaining = Math.max(0, Math.ceil((examDeadlineTimestamp - Date.now()) / 1000));
        const timerDisplay = document.getElementById('exam-timer-display');
        if (timerDisplay) {
            timerDisplay.innerText = formatExamTime(examTimeRemaining);
            if (examTimeRemaining < 60) {
                timerDisplay.classList.add('text-red-400');
            } else {
                timerDisplay.classList.remove('text-red-400');
            }
        }

        if (examTimeRemaining <= 0) {
            clearInterval(examTimerInterval);
            triggerAlert("หมดเวลาสอบ", "ระบบกำลังส่งข้อสอบอัตโนมัติ", "fa-clock", "bg-red-100 text-red-600");
            submitExam(true);
        }
    }, 500);
}

function getExamAnswers() {
    return currentExamQuestions.map((q, idx) => {
        if (q.type === 'choice') {
            const chk = document.querySelector(`input[name="exam-q${idx}"]:checked`);
            return chk ? chk.value : null;
        } else if (q.type === 'numeric_single') {
            const el = document.getElementById(`exam-q${idx}-val1`);
            return el ? [el.value] : null;
        } else if (q.type === 'numeric_double') {
            const el1 = document.getElementById(`exam-q${idx}-val1`);
            const el2 = document.getElementById(`exam-q${idx}-val2`);
            return (el1 && el2) ? [el1.value, el2.value] : null;
        }
        return null;
    });
}

function confirmSubmitExam() {
    const answers = getExamAnswers();
    const uncomplete = answers.some(a => !a || (Array.isArray(a) && (a.some(val => !val.trim()))));
    const msg = uncomplete ? "คุณยังทำข้อสอบไม่ครบทุกข้อ ยืนยันที่จะส่งข้อสอบเลยหรือไม่?" : "คุณทำข้อสอบครบทั้ง 5 ข้อแล้ว ยืนยันต้องการส่งข้อสอบหรือไม่?";

    const m = document.getElementById('modal-confirm');
    const c = document.getElementById('modal-confirm-card');
    document.getElementById('modal-confirm-msg').innerText = msg;

    m.classList.remove('hidden');
    setTimeout(() => { c.classList.remove('scale-95', 'opacity-0'); }, 10);
}

function closeConfirmModal() {
    const m = document.getElementById('modal-confirm');
    const c = document.getElementById('modal-confirm-card');
    c.classList.add('scale-95', 'opacity-0');
    setTimeout(() => { m.classList.add('hidden'); }, 200);
}

function executeSubmitExam() {
    closeConfirmModal();
    setTimeout(() => submitExam(), 200);
}

function submitExam(timeExpired = false) {
    if (examSubmissionInProgress) return;
    examSubmissionInProgress = true;
    examIsActive = false;
    clearInterval(examTimerInterval);
    releaseExamLocks();

    const answers = getExamAnswers();
    let total_score = 0;
    const gradedResults = [];

    currentExamQuestions.forEach((q, idx) => {
        const userAns = answers[idx];
        let isCorrect = false;

        if (q.type === 'choice') {
            isCorrect = userAns === q.answers[0];
        } else if (q.type === 'numeric_single') {
            isCorrect = userAns && isNumericAnswerCorrect(userAns[0], q.answersRaw[0]);
        } else if (q.type === 'numeric_double') {
            isCorrect = userAns &&
                isNumericAnswerCorrect(userAns[0], q.answersRaw[0]) &&
                isNumericAnswerCorrect(userAns[1], q.answersRaw[1]);
        }

        const score = isCorrect ? 2.0 : 0.0;
        total_score += score;
        gradedResults.push({
            idx,
            isCorrect,
            score,
            userAns,
            expectedAnswers: q.answers,
            explanationText: q.explanationText
        });
    });

    const elapsed = timeExpired ? examDurationSeconds : Math.max(1, examDurationSeconds - examTimeRemaining);
    const timeStr = `${Math.floor(elapsed / 60)} นาที ${elapsed % 60} วินาที`;

    const payload = {
        score: total_score,
        maxScore: 10,
        passed: total_score >= 5,
        timeTaken: timeStr,
        studentInfo: examStudentInfo,
        attempt: examStudentInfo.attempt || 1,
        cheatingStats: { ...cheatingStats },
        gradedResults,
        examQuestions: currentExamQuestions,
        timestamp: Date.now(),
        date: new Date().toLocaleDateString('th-TH')
    };

    // Save to both key formats for backward compatibility and requirement
    try {
        localStorage.setItem('last_exam_results_16_4', JSON.stringify(payload));
        localStorage.setItem('last_exam_results', JSON.stringify(payload));
        localStorage.removeItem(EXAM_STATE_KEY);
        localStorage.removeItem(EXAM_STATE_FALLBACK_KEY);
    } catch (e) {
        console.error('Failed to store results or clear session', e);
    }

    updateLatestScore();
    showSection('exam-result');
    renderExamResults(payload);
}

function renderExamResults(data) {
    document.getElementById('lbl-res-student-name').innerText = data.studentInfo.name;
    document.getElementById('lbl-res-student-meta').innerHTML = `ม.6/${data.studentInfo.class} เลขที่ ${data.studentInfo.number}`;
    document.getElementById('lbl-res-time-elapsed').innerText = data.timeTaken;
    document.getElementById('lbl-res-finished-at').innerText = data.date;

    const attemptBadge = document.getElementById('lbl-res-attempt-badge');
    if (attemptBadge) {
        attemptBadge.innerText = `สอบครั้งที่ ${data.attempt || 1}`;
    }

    document.getElementById('lbl-res-total-score').innerText = data.score;
    const circle = document.getElementById('res-circle-progress');
    if (circle) {
        circle.style.strokeDashoffset = 439.8 - (data.score / 10) * 439.8;
    }

    // Feedback message
    const fb = document.getElementById('lbl-res-badge-feedback');
    if (data.score >= 5) {
        fb.className = "text-center p-4 rounded-xl mb-6 border border-emerald-200 bg-emerald-50 text-sm";
        fb.innerHTML = `<span class="text-emerald-700 font-bold flex items-center justify-center gap-2">
            <i class="fa-solid fa-circle-check text-emerald-600 text-lg"></i>
            🎉 ยินดีด้วย! คุณสอบผ่านเกณฑ์ (ได้คะแนน ${data.score}/10 หรือ ${(data.score * 10)}%)
        </span>`;
    } else {
        fb.className = "text-center p-4 rounded-xl mb-6 border border-red-200 bg-red-50 text-sm";
        fb.innerHTML = `<span class="text-red-700 font-bold flex items-center justify-center gap-2">
            <i class="fa-solid fa-circle-xmark text-red-600 text-lg"></i>
            ⚠️ คุณยังไม่ผ่านเกณฑ์ (ได้คะแนน ${data.score}/10) เกณฑ์ผ่านคือ 5/10 ขึ้นไป กรุณาทบทวนเนื้อหาและสอบแก้ตัวใหม่
        </span>`;
    }

    // Anti-Cheat / Integrity Summary Card
    const cheatCard = document.getElementById('exam-cheat-summary-card');
    if (cheatCard) {
        const switches = data.cheatingStats ? (data.cheatingStats.tabSwitches || 0) : 0;
        const refreshes = data.cheatingStats ? (data.cheatingStats.refreshes || 0) : 0;

        if (switches > 0 || refreshes > 0) {
            cheatCard.innerHTML = `
            <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 md:p-5 flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl shrink-0">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <div class="space-y-1 text-sm text-amber-900">
                    <h5 class="font-bold flex items-center gap-2">
                        ข้อสังเกตพฤติกรรมระหว่างการสอบ
                    </h5>
                    <p class="text-xs text-amber-800 leading-relaxed">
                        ระบบตรวจพบ: สลับหน้าจอ/เปิดแท็บอื่น <strong>${switches} ครั้ง</strong>, รีเฟรชหน้าจอ <strong>${refreshes} ครั้ง</strong>
                    </p>
                </div>
            </div>`;
        } else {
            cheatCard.innerHTML = `
            <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 md:p-5 flex items-center gap-4">
                <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl shrink-0">
                    <i class="fa-solid fa-shield-check"></i>
                </div>
                <div class="text-sm text-emerald-900 font-bold">
                    ✅ การสอบมีความซื่อสัตย์ ไม่พบการสลับหน้าจอหรือเปิดแท็บอื่น
                </div>
            </div>`;
        }
    }

    const tbody = document.getElementById('exam-result-tbody');
    const sols = document.getElementById('exam-solutions-container');
    tbody.innerHTML = '';
    sols.innerHTML = '';

    data.gradedResults.forEach((grad, i) => {
        const q = data.examQuestions[i];
        const status = grad.isCorrect
            ? `<span class="text-emerald-600 font-bold"><i class="fa-solid fa-check"></i> 2.0</span>`
            : `<span class="text-red-500 font-bold"><i class="fa-solid fa-xmark"></i> 0.0</span>`;

        tbody.innerHTML += `<tr class="bg-white hover:bg-slate-50 transition">
          <td class="px-5 py-3 font-medium text-center">${i + 1}</td>
          <td class="px-5 py-3 text-slate-700">${q.title}</td>
          <td class="px-5 py-3 text-center">2.0</td>
          <td class="px-5 py-3 text-center">${status}</td>
        </tr>`;

        let uAns = 'ไม่ได้ตอบ';
        if (q.type === 'choice') uAns = grad.userAns || uAns;
        else if (grad.userAns && grad.userAns[0]) uAns = grad.userAns.join(' , ');

        sols.innerHTML += `<div class="bg-white p-5 rounded-xl border border-slate-200">
          <h5 class="font-bold text-slate-800 mb-2">ข้อ ${i + 1}: ${q.title}</h5>
          <p class="text-sm text-slate-600 mb-3 math-font">${q.text}</p>
          <div class="text-xs bg-slate-50 p-3 rounded-lg border border-slate-100 mb-3">
            <p>คำตอบของคุณ: <span class="font-bold ${grad.isCorrect ? 'text-emerald-600' : 'text-red-600'}">${uAns}</span></p>
            <p>เฉลยที่ถูกต้อง: <span class="font-bold text-slate-800">${grad.expectedAnswers.join(' หรือ ')}</span></p>
          </div>
          <div class="text-xs text-slate-700 bg-orange-50/50 p-3 rounded-lg math-font border border-orange-100">${grad.explanationText}</div>
        </div>`;
    });

    queueTypeset(document.getElementById('sec-exam-result'));
}

function toggleExamSolutionBox() {
    const box = document.getElementById('exam-solution-box');
    const icon = document.getElementById('icon-toggle-sol');
    box.classList.toggle('hidden');
    icon.className = box.classList.contains('hidden') ? "fa-solid fa-chevron-down" : "fa-solid fa-chevron-up";
}

function updateLatestScore() {
    if (typeof window === 'undefined') return;
    try {
        const saved = localStorage.getItem('last_exam_results_16_4') || localStorage.getItem('last_exam_results');
        const badge = document.getElementById('latest-score-badge');
        if (saved && badge) {
            const data = JSON.parse(saved);
            const scoreLbl = document.getElementById('lbl-last-score');
            const statusBadge = document.getElementById('lbl-last-status-badge');

            if (scoreLbl) {
                const sName = (data.studentInfo && data.studentInfo.name) ? data.studentInfo.name : 'ผู้สอบ';
                scoreLbl.innerHTML = `${data.score}/10 \\( (\\text{${sName}}) \\)`;
            }

            if (statusBadge) {
                if (data.score >= 5) {
                    statusBadge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-300";
                    statusBadge.innerText = "สอบผ่าน";
                } else {
                    statusBadge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-300";
                    statusBadge.innerText = "ต้องสอบใหม่";
                }
            }

            badge.classList.remove('hidden');
            if (scoreLbl) queueTypeset(scoreLbl);
        }
    } catch (e) {
        console.error('Failed to update latest score badge', e);
    }
}

function showLatestResultModal() {
    if (typeof window === 'undefined') return;
    try {
        const saved = localStorage.getItem('last_exam_results_16_4') || localStorage.getItem('last_exam_results');
        if (saved) {
            showSection('exam-result');
            renderExamResults(JSON.parse(saved));
        }
    } catch (e) {
        console.error('Failed to show latest result modal', e);
    }
}

function updateQuestionPoolCount() {
    const totalQuestions = QUESTION_TEMPLATES.length;
    const totalCountEl = document.getElementById('total-count');
    if (totalCountEl) totalCountEl.innerText = totalQuestions;
    const poolCountEl = document.getElementById('pool-count');
    if (poolCountEl) poolCountEl.innerText = totalQuestions;
}

function checkAndRestorePendingExam() {
    if (typeof window === 'undefined') return false;
    try {
        const saved = localStorage.getItem(EXAM_STATE_KEY) || localStorage.getItem(EXAM_STATE_FALLBACK_KEY);
        if (!saved) return false;

        const s = JSON.parse(saved);
        if (s.examDeadlineTimestamp && s.examDeadlineTimestamp > Date.now() && Array.isArray(s.examQuestions) && s.examQuestions.length > 0) {
            currentExamQuestions = s.examQuestions;
            examStudentInfo = s.studentInfo || {};
            examSeed = examStudentInfo.seed || null;
            examStartTimestamp = s.examStartTimestamp || (Date.now() - 1000);
            examDeadlineTimestamp = s.examDeadlineTimestamp;
            examDurationSeconds = s.examDurationSeconds || 900;
            examTimeRemaining = Math.max(0, Math.ceil((examDeadlineTimestamp - Date.now()) / 1000));

            cheatingStats = s.cheatingStats || { tabSwitches: 0, refreshes: 0 };
            cheatingStats.refreshes = (cheatingStats.refreshes || 0) + 1;

            examIsActive = true;
            examSubmissionInProgress = false;

            const userInfoEl = document.getElementById('lbl-exam-user-info');
            if (userInfoEl) {
                userInfoEl.innerHTML = `${examStudentInfo.name} (ม.6/${examStudentInfo.class} เลขที่ ${examStudentInfo.number})`;
            }
            const attemptBadge = document.getElementById('badge-exam-attempt');
            if (attemptBadge) {
                attemptBadge.innerText = `สอบครั้งที่ ${examStudentInfo.attempt || 1}`;
            }

            renderExamLiveDOM(s.userAnswers || null);
            setupExamLocks();
            showSection('exam-live');
            startExamTimer();
            saveExamState();
            return true;
        } else {
            localStorage.removeItem(EXAM_STATE_KEY);
            localStorage.removeItem(EXAM_STATE_FALLBACK_KEY);
        }
    } catch (e) {
        localStorage.removeItem(EXAM_STATE_KEY);
        localStorage.removeItem(EXAM_STATE_FALLBACK_KEY);
    }
    return false;
}

/**
 * Initialize guards for student roll number input
 */
function initStudentInputGuards() {
    const studentNoEl = document.getElementById('exam-student-no');
    if (!studentNoEl) return;

    // Prevent typing negative sign '-', plus '+', decimal '.', or exponential 'e'/'E'
    studentNoEl.addEventListener('keydown', (e) => {
        if (['-', '+', 'e', 'E', '.'].includes(e.key)) {
            e.preventDefault();
        }
    });

    // Sanitize input when pasting or typing to disallow negative numbers
    studentNoEl.addEventListener('input', () => {
        let val = studentNoEl.value;
        if (/[^0-9]/.test(val)) {
            val = val.replace(/[^0-9]/g, '');
            studentNoEl.value = val;
        }
        if (val !== '') {
            const num = parseInt(val, 10);
            if (num > 40) {
                studentNoEl.value = 40;
            }
        }
    });

    // Enforce 1-40 range when field loses focus or changes
    studentNoEl.addEventListener('change', () => {
        const val = studentNoEl.value.trim();
        if (val !== '') {
            const num = parseInt(val, 10);
            if (isNaN(num) || num < 1) {
                studentNoEl.value = 1;
            } else if (num > 40) {
                studentNoEl.value = 40;
            } else {
                studentNoEl.value = num;
            }
        }
    });
}

/**
 * Consolidated Application Lifecycle Entry Point
 */
function initApp() {
    initAntiCheatListeners();
    initStudentInputGuards();
    updateLatestScore();
    switchReviewTab('16-4-1');
    updateQuestionPoolCount();

    const restored = checkAndRestorePendingExam();
    if (!restored) {
        queueTypeset(document.body);
    }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

