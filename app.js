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
const EXAM_STATE_KEY = 'exam_session_thermodynamics';
let examStartTimestamp = null;
let examDeadlineTimestamp = null;
let examIsActive = false;
let examSubmissionInProgress = false;
let examStudentInfo = {};
let examSeed = null;
let examExitGuardEnabled = false;

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


// --- Dynamic Question Templates (16.4 Thermodynamics) ---
const QUESTION_TEMPLATES = [
    // 16.4.1 พลังงานภายใน (Delta U)
    {
        id: '16_4_1_dU_calc', topic: '16.4.1', type: 'numeric_single',
        title: 'หาการเปลี่ยนแปลงพลังงานภายใน \\( (\\Delta U) \\)',
        inputs: [{ label: '\\( \\Delta U \\) (Joule):' }],
        text: (p) => `แก๊สอุดมคติอะตอมเดี่ยวจำนวน \\(${p.n}\\) โมล มีอุณหภูมิเพิ่มขึ้นจาก \\(${p.t1}^\\circ\\text{C}\\) เป็น \\(${p.r ? `(${p.t2_base} + \\ ${p.r})` : p.t2}^\\circ\\text{C}\\) พลังงานภายในระบบเปลี่ยนแปลงไปกี่จูล (กำหนดให้ \\( R = 8.31 \\text{ J/mol K}\\))`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const n = r ? getSeededRandomBase('16_4_1_dU_calc_n', r, 1, 3, 1) : 2; // 1, 2, 3 mol
            const t1 = 27;
            const t2_base = r ? getSeededRandomBase('16_4_1_dU_calc_t2', r, 37, 77, 10) : 47; // base = 37, 47, 57, 67, 77
            const t2 = r ? t2_base + offset : 47;
            const dT = t2 - t1;
            const dU = 1.5 * n * 8.31 * dT;
            return {
                params: { n, t1, t2, t2_base, r: offset },
                answers: [Math.round(dU).toString(), dU.toFixed(1)],
                answersRaw: [dU],
                explanation: () => `
      จากสมการการเปลี่ยนพลังงานภายใน: \\( \\Delta U = \\frac{3}{2}nR\\Delta T \\)<br>
      หาอุณหภูมิที่เปลี่ยนไป: \\( \\Delta T = ${r ? `(${t2_base} + \\ ${offset})` : t2} - ${t1} = ${dT} \\text{ K} \\) (ผลต่างอุณหภูมิ \\( ^\\circ\\text{C} \\) และ K มีค่าเท่ากัน)<br>
      แทนค่า: \\( \\Delta U = \\frac{3}{2}(${n})(8.31)(${dT}) \\)<br>
      \\( \\Delta U = ${dU.toFixed(1)} \\text{ J} \\) (มีค่าเป็นบวก เพราะอุณหภูมิเพิ่มขึ้น)
    `
            };
        }
    },

    // 16.4.2 งานของแก๊ส (Work)
    {
        id: '16_4_2_work_calc', topic: '16.4.2', type: 'numeric_single',
        title: 'หางานที่ทำโดยแก๊ส \\( (W) \\)',
        inputs: [{ label: 'งาน \\( W \\) \\( (\\text{Joule}) \\):' }],
        text: (p) => `แก๊สในกระบอกสูบขยายตัวจากปริมาตร \\(${p.v1} \\times 10^{-3} \\text{ m}^3\\) เป็น \\(${p.v2} \\times 10^{-3} \\text{ m}^3\\) ภายใต้ความดันคงตัว \\(${p.r ? `(${p.p_base} + \\ ${p.r})` : p.p} \\times 10^3 \\text{ Pa}\\) แก๊สทำงานกี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const v1 = r ? getSeededRandomBase('16_4_2_work_calc_v1', r, 2, 4, 1) : 2;
            const v2 = r ? getSeededRandomBase('16_4_2_work_calc_v2', r, 5, 8, 1) : 5; // expansion
            const p_base = r ? getSeededRandomBase('16_4_2_work_calc_p', r, 100, 200, 10) : 150;
            const p = r ? p_base + offset : 150; // in kPa, i.e. 10^3 Pa
            const dV = (v2 - v1) * 1e-3;
            const P_val = p * 1e3;
            const W = P_val * dV;
            return {
                params: { v1, v2, p, p_base, r: offset },
                answers: [Math.round(W).toString(), W.toFixed(1)],
                answersRaw: [W],
                explanation: () => `
      จากสมการงานของแก๊สที่ความดันคงตัว: \\( W = P\\Delta V = P(V_2 - V_1) \\)<br>
      \\( \\Delta V = (${v2} \\times 10^{-3}) - (${v1} \\times 10^{-3}) = ${v2 - v1} \\times 10^{-3} \\text{ m}^3 \\)<br>
      แทนค่า: \\( W = (${r ? `(${p_base} + \\ ${offset})` : p} \\times 10^3) \\times (${v2 - v1} \\times 10^{-3}) \\)<br>
      \\( W = ${W.toFixed(1)} \\text{ J} \\) (เครื่องหมายเป็นบวก เพราะแก๊สขยายตัวปริมาตรเพิ่มขึ้น)
    `
            };
        }
    },
    {
        id: '16_4_2_work_compress', topic: '16.4.2', type: 'numeric_single',
        title: 'หางานกรณีถูกบีบอัด \\( (W) \\)',
        inputs: [{ label: 'งาน \\( W \\) \\( (\\text{Joule}) \\):' }],
        text: (p) => `ออกแรงดันก้านกระบอกสูบให้แก๊สหดตัวจากปริมาตร \\(${p.v1}\\) ลิตร เหลือ \\(${p.v2}\\) ลิตร ภายใต้ความดันคงตัว \\(${p.r ? `(${p.p_base} + \\ ${p.r})` : p.p} \\times 10^3 \\text{ N/m}^2\\) งานที่แก๊สทำมีค่ากี่จูล (กำหนด 1 ลิตร = \\(10^{-3} \\text{ m}^3\\))`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const v1 = r ? getSeededRandomBase('16_4_2_work_compress_v1', r, 7, 9, 1) : 8;
            const v2 = r ? getSeededRandomBase('16_4_2_work_compress_v2', r, 2, 4, 1) : 3; // compression
            const p_base = r ? getSeededRandomBase('16_4_2_work_compress_p', r, 80, 150, 10) : 100;
            const p = r ? p_base + offset : 100;
            const dV = (v2 - v1) * 1e-3;
            const W = p * 1e3 * dV; // will be negative
            return {
                params: { v1, v2, p, p_base, r: offset },
                answers: [Math.round(W).toString(), W.toFixed(1), Math.round(-W).toString(), (-W).toFixed(1)],
                answersRaw: [[W, -W]],
                explanation: () => `
      จากสมการ: \\( W = P(V_2 - V_1) \\)<br>
      \\( V_2 - V_1 = (${v2} - ${v1}) \\times 10^{-3} = ${v2 - v1} \\times 10^{-3} \\text{ m}^3 \\) (ปริมาตรลดลง ติดลบ)<br>
      แทนค่า: \\( W = (${r ? `(${p_base} + \\ ${offset})` : p} \\times 10^3) \\times (${v2 - v1} \\times 10^{-3}) \\)<br>
      \\( W = ${W.toFixed(1)} \\text{ J} \\) <br>
      **(สามารถตอบได้ทั้งค่าติดลบ หรือค่าที่เป็นบวกตามขนาดของงาน)**
    `
            };
        }
    },

    // 16.4.3 กฎข้อที่หนึ่ง (First Law Q = dU + W)
    {
        id: '16_4_3_law1_calc_Q', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'หาพลังงานความร้อนที่ให้แก่ระบบ \\( (Q) \\)',
        inputs: [{ label: 'ความร้อน \\( Q \\) \\( (\\text{Joule}) \\):' }],
        text: (p) => `เมื่อให้ความร้อนแก่แก๊สในกระบอกสูบ ปรากฏว่าพลังงานภายในของแก๊สเพิ่มขึ้น \\(${p.r ? `(${p.dU_base} + \\ ${p.r})` : p.dU}\\text{ J}\\) และแก๊สขยายตัวดันลูกสูบทำงานได้ \\(${p.w}\\text{ J}\\) ความร้อนที่ระบบได้รับมีค่ากี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const dU_base = r ? getSeededRandomBase('16_4_3_law1_calc_Q_dU', r, 100, 200, 10) : 150;
            const dU = r ? dU_base + offset : 150;
            const w = r ? getSeededRandomBase('16_4_3_law1_calc_Q_w', r, 50, 100, 10) : 80;
            const Q = dU + w;
            return {
                params: { dU, w, dU_base, r: offset },
                answers: [Q.toString()],
                answersRaw: [Q],
                explanation: () => `
      จากกฎข้อที่หนึ่งของอุณหพลศาสตร์: \\( Q = \\Delta U + W \\)<br>
      - พลังงานภายในเพิ่มขึ้น \\( \\Rightarrow \\Delta U = +${r ? `(${dU_base} + \\ ${offset})` : dU} = +${dU} \\)<br>
      - แก๊สทำงานขยายตัว \\( \\Rightarrow W = +${w} \\)<br>
      แทนค่า: \\( Q = (+${dU}) + (+${w}) = ${Q} \\text{ J} \\)
    `
            };
        }
    },
    {
        id: '16_4_3_law1_calc_W', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'หางานเมื่อความร้อนสูญเสีย \\( (W) \\)',
        inputs: [{ label: 'งาน \\( W \\) \\( (\\text{Joule}) \\):' }],
        text: (p) => `ระบบแก๊สหนึ่งคายความร้อนออกสู่สิ่งแวดล้อม \\(${p.r ? `(${p.q_base} + \\ ${p.r})` : p.q_mag}\\text{ J}\\) ในขณะเดียวกันพบว่าพลังงานภายในระบบลดลง \\(${p.dU_mag}\\text{ J}\\) งานที่เกี่ยวข้องมีค่ากี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const q_base = r ? getSeededRandomBase('16_4_3_law1_calc_W_q', r, 200, 400, 50) : 300;
            const q_mag = r ? q_base + offset : 300;
            const dU_mag = r ? getSeededRandomBase('16_4_3_law1_calc_W_dU', r, 100, 200, 25) : 150;
            // Q = dU + W => W = Q - dU
            const Q = -q_mag; // คาย
            const dU = -dU_mag; // ลดลง
            const W = Q - dU;
            return {
                params: { q_mag, dU_mag, q_base, r: offset },
                answers: [W.toString(), (-W).toString()],
                answersRaw: [[W, -W]],
                explanation: () => `
      ตั้งสมการกฎข้อ 1: \\( Q = \\Delta U + W \\) หรือ \\( W = Q - \\Delta U \\)<br>
      **พิจารณาเครื่องหมายให้รอบคอบ:**<br>
      - คายความร้อน \\( \\Rightarrow Q = -${r ? `(${q_base} + \\ ${offset})` : q_mag} = -${q_mag} \\text{ J} \\)<br>
      - พลังงานภายในลดลง \\( \\Rightarrow \\Delta U = -${dU_mag} \\text{ J} \\)<br>
      แทนค่า: \\( W = (-${q_mag}) - (-${dU_mag}) = ${W} \\text{ J} \\) <br>
      **(สามารถตอบได้ทั้งค่าติดลบ หรือค่าที่เป็นบวกตามขนาดของงาน)**
    `
            };
        }
    },
    {
        id: '16_4_3_concept_signs', topic: '16.4.3-concept', type: 'choice',
        title: 'ทฤษฎีเครื่องหมายอุณหพลศาสตร์',
        choices: [
            '\\( Q \\) เป็นบวก และ \\( W \\) เป็นลบ',
            '\\( Q \\) เป็นลบ และ \\( W \\) เป็นบวก',
            '\\( \\Delta U \\) เป็นบวก และ \\( W \\) เป็นลบ',
            '\\( Q \\) เป็นลบ และ \\( \\Delta U \\) เป็นลบ'
        ],
        text: () => `ในกระบวนการที่ "ระบบรับความร้อนจากสิ่งแวดล้อม และระบบถูกบีบอัดให้ปริมาตรเล็กลง" ข้อกำหนดเครื่องหมายในกฎข้อที่หนึ่งข้อใดถูกต้อง`,
        generate: (r) => ({
            params: {},
            answers: ['\\( Q \\) เป็นบวก และ \\( W \\) เป็นลบ'],
            answersRaw: [0],
            explanation: () => `
      - **ระบบรับความร้อน:** ระบบได้พลังงานเข้ามา ดังนั้น \\( Q \\) จึงมีเครื่องหมายเป็น **บวก \\( (+) \\)**<br>
      - **ถูกบีบอัดปริมาตรเล็กลง:** สิ่งแวดล้อมเป็นฝ่ายทำงานให้ระบบ (ไม่ใช่แก๊สทำงานเอง) ดังนั้นงาน \\( W \\) จึงมีเครื่องหมายเป็น **ลบ \\( (-) \\)**
    `
        })
    },

    // --- แบบฝึกหัดเพิ่มเติม 15 ข้อ (ปรนัย 5 ข้อ, อัตนัย 10 ข้อ) ตาม สสวท. ---

    // ปรนัย 1: ปริมาตรคงตัว (Isochoric)
    {
        id: '16_4_3_ch1_isochoric', topic: '16.4.3-concept', type: 'choice',
        title: 'กระบวนการปริมาตรคงตัว',
        choices: [
            '\\( W = 0 \\) และ \\( Q = \\Delta U \\)',
            '\\( \\Delta U = 0 \\) และ \\( Q = W \\)',
            '\\( Q = 0 \\) และ \\( \\Delta U = -W \\)',
            '\\( W \\) มีค่าเป็นบวก และ \\( \\Delta U \\) เป็นลบ'
        ],
        text: () => `หากให้ความร้อนแก่แก๊สในภาชนะปิดมิดชิดที่แข็งเกร็ง (ปริมาตรคงตัว) ข้อใดกล่าวถึงการเปลี่ยนแปลงพลังงานตามกฎข้อที่หนึ่งของอุณหพลศาสตร์ได้ถูกต้องที่สุด`,
        generate: (r) => ({
            params: {},
            answers: ['\\( W = 0 \\) และ \\( Q = \\Delta U \\)'],
            answersRaw: [0],
            explanation: () => `เมื่อปริมาตรคงตัว จะไม่มีการขยายตัวหรือหดตัวของแก๊ส ทำให้งานที่ทำโดยแก๊ส **\\( W = 0 \\)** <br>จากสมการ \\( Q = \\Delta U + W \\) เมื่อ \\( W = 0 \\) จะได้ **\\( Q = \\Delta U \\)** (ความร้อนทั้งหมดถูกใช้เพื่อเพิ่มพลังงานภายใน)`
        })
    },
    // ปรนัย 2: อุณหภูมิคงตัว (Isothermal)
    {
        id: '16_4_3_ch2_isothermal', topic: '16.4.3-concept', type: 'choice',
        title: 'กระบวนการอุณหภูมิคงตัว',
        choices: [
            '\\( \\Delta U = 0 \\) และ \\( Q = W \\)',
            '\\( W = 0 \\) และ \\( Q = \\Delta U \\)',
            '\\( Q = 0 \\) และ \\( W = -\\Delta U \\)',
            'พลังงานภายในระบบลดลงอย่างต่อเนื่อง'
        ],
        text: () => `แก๊สอุดมคติขยายตัวอย่างช้าๆ โดยมีอุปกรณ์ควบคุมให้อุณหภูมิของระบบคงตัวตลอดกระบวนการ ข้อใดสรุปได้ถูกต้อง`,
        generate: (r) => ({
            params: {},
            answers: ['\\( \\Delta U = 0 \\) และ \\( Q = W \\)'],
            answersRaw: [0],
            explanation: () => `อุณหภูมิของแก๊สอุดมคติคงตัว (\\( \\Delta T = 0 \\)) ส่งผลให้พลังงานภายในระบบไม่เปลี่ยนแปลง **\\( (\\Delta U = 0) \\)** <br>จากกฎข้อที่หนึ่ง \\( Q = \\Delta U + W \\) จะได้ **\\( Q = W \\)** (ความร้อนที่รับเข้ามาถูกเปลี่ยนเป็นงานทั้งหมด)`
        })
    },
    // ปรนัย 3: อะเดียแบติก (Adiabatic)
    {
        id: '16_4_3_ch3_adiabatic', topic: '16.4.3-concept', type: 'choice',
        title: 'กระบวนการอะเดียแบติก (ขยายตัว)',
        choices: [
            'พลังงานภายในลดลง และ อุณหภูมิลดลง',
            'พลังงานภายในเพิ่มขึ้น และ อุณหภูมิเพิ่มขึ้น',
            'พลังงานภายในคงที่ และ อุณหภูมิคงที่',
            'พลังงานภายในลดลง แต่ อุณหภูมิเพิ่มขึ้น'
        ],
        text: () => `ระบบแก๊สอุดมคติเกิดการขยายตัวอย่างรวดเร็วมากจนไม่มีการถ่ายโอนความร้อนเข้าหรือออกจากระบบ \\( (Q = 0) \\) พลังงานภายในระบบและอุณหภูมิจะเป็นอย่างไร`,
        generate: (r) => ({
            params: {},
            answers: ['พลังงานภายในลดลง และ อุณหภูมิลดลง'],
            answersRaw: [0],
        explanation: () => `ไม่มีการถ่ายโอนความร้อน \\( (Q = 0) \\) และแก๊สขยายตัว (W เป็นบวก)<br>จาก \\( Q = \\Delta U + W \\Rightarrow 0 = \\Delta U + W \\Rightarrow \\Delta U = -W \\)<br>จะได้ \\( \\Delta U \\) มีค่าติดลบ (พลังงานภายในลดลง) ซึ่งหมายความว่า **อุณหภูมิต้องลดลง** ด้วย`
        })
    },
    // ปรนัย 4: วัฏจักร (Cyclic Process)
    {
        id: '16_4_3_ch4_cyclic', topic: '16.4.3-concept', type: 'choice',
        title: 'กระบวนการแบบวัฏจักร',
        choices: [
            'การเปลี่ยนแปลงพลังงานภายใน \\( (\\Delta U) \\)',
            'งานรวมที่ทำโดยแก๊ส \\( (W) \\)',
            'ความร้อนรวมที่ระบบได้รับ \\( (Q) \\)',
            'ความดันสูงสุดของแก๊ส'
        ],
        text: () => `เมื่อแก๊สเกิดการเปลี่ยนแปลงแบบวัฏจักร \\( (\\text{Cyclic process}) \\) โดยวนกลับมาสู่สถานะเริ่มต้น ปริมาณในข้อใดจะมีการเปลี่ยนแปลงรวมเป็นศูนย์เสมอ`,
        generate: (r) => ({
            params: {},
            answers: ['การเปลี่ยนแปลงพลังงานภายใน \\( (\\Delta U) \\)'],
            answersRaw: [0],
            explanation: () => `พลังงานภายใน \\( (U) \\) เป็นฟังก์ชันสถานะ (State Function) ที่ขึ้นอยู่กับอุณหภูมิ หากระบบกลับมาที่สถานะเริ่มต้น อุณหภูมิจะกลับมาเท่าเดิม ทำให้ **\\( \\Delta U = 0 \\)** เสมอใน 1 วัฏจักร`
        })
    },
    // ปรนัย 5: เครื่องยนต์ความร้อน
    {
        id: '16_4_3_ch5_engine', topic: '16.4.3-concept', type: 'choice',
        title: 'หลักการเครื่องยนต์ความร้อน',
        choices: [
            'ต้องมีการคายความร้อนบางส่วนทิ้งสู่สิ่งแวดล้อมที่มีอุณหภูมิต่ำกว่า',
            'ความร้อนทั้งหมดถูกนำไปใช้เพิ่มพลังงานภายในระบบแทน',
            'แก๊สที่ใช้ในเครื่องยนต์มีมวลน้อยเกินไป',
            'แรงเสียดทาน of ลูกสูบมีค่ามากเกินไป'
        ],
        text: () => `ตามหลักอุณหพลศาสตร์ ในเครื่องยนต์ความร้อน \\( (\\text{Heat Engine}) \\) ไม่สามารถเปลี่ยนความร้อนที่รับมาให้กลายเป็นงานได้ทั้งหมด 100% เพราะเหตุใดเป็นหลักการสำคัญ`,
        generate: (r) => ({
            params: {},
            answers: ['ต้องมีการคายความร้อนบางส่วนทิ้งสู่สิ่งแวดล้อมที่มีอุณหภูมิต่ำกว่า'],
            answersRaw: [0],
            explanation: () => `ตามกฎข้อที่สองของอุณหพลศาสตร์ เครื่องยนต์ความร้อนทุกชนิดทำงานเป็นวัฏจักร จะต้องรับความร้อนจากแหล่งอุณหภูมิสูง นำไปทำงาน และ **ต้องคายความร้อนที่เหลือทิ้ง** สู่แหล่งอุณหภูมิต่ำเสมอ ไม่มีเครื่องยนต์ใดมีประสิทธิภาพ 100% ได้`
        })
    },

    // อัตนัย 1: หา dU จากมวล
    {
        id: '16_4_1_num1_argon', topic: '16.4.1', type: 'numeric_single',
        title: 'หา \\( \\Delta U \\) ของแก๊สอาร์กอน',
        inputs: [{ label: '\\( \\Delta U \\) (Joule):' }],
        text: (p) => `แก๊สอาร์กอน (Ar) มวล \\(${p.m}\\) กรัม บรรจุในกระบอกสูบ มีอุณหภูมิเพิ่มขึ้น \\(${p.r ? `(${p.dT_base} + \\ ${p.r})` : p.dT}\\text{ K}\\) พลังงานภายในระบบเปลี่ยนแปลงไปกี่จูล (กำหนดมวลโมลาร์ Ar = 40 g/mol, \\( R = 8.31 \\text{ J/(mol K)}\\))`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const m = r ? getSeededRandomBase('16_4_1_num1_argon_m', r, 40, 120, 20) : 80; // 40, 60, 80, 100, 120 g
            const dT_base = r ? getSeededRandomBase('16_4_1_num1_argon_dT', r, 10, 30, 5) : 20;
            const dT = r ? dT_base + offset : 20; // 10, 15, 20, 25 K
            const n = m / 40;
            const dU = 1.5 * n * 8.31 * dT;
            return {
                params: { m, dT, dT_base, r: offset },
                answers: [Math.round(dU).toString(), dU.toFixed(1), dU.toFixed(2)],
                answersRaw: [dU],
                explanation: () => `
      หาจำนวนโมล: \\( n = \\frac{m}{M} = \\frac{${m}}{40} = ${n} \\text{ mol} \\)<br>
      จากสมการ: \\( \\Delta U = \\frac{3}{2}nR\\Delta T \\)<br>
      แทนค่า: \\( \\Delta U = \\frac{3}{2}(${n})(8.31)(${r ? `(${dT_base} + \\ ${offset})` : dT}) \\)<br>
      \\( \\Delta U = ${dU.toFixed(1)} \\text{ J} \\)
    `
            };
        }
    },
    // อัตนัย 2: งานจาก atm และ L
    {
        id: '16_4_2_num2_atm_L', topic: '16.4.2', type: 'numeric_single',
        title: 'หางานจากการขยายตัว (atm, L)',
        inputs: [{ label: 'งาน \\( W \\) (Joule):' }],
        text: (p) => `แก๊สขยายตัวดันลูกสูบจากปริมาตร \\(${p.v1}\\) ลิตร เป็น \\(${p.r ? `(${p.v2_base} + \\ ${p.r})` : p.v2}\\) ลิตร ภายใต้ความดันคงตัว \\(${p.P_atm}\\) บรรยากาศ (atm) งานที่ทำโดยแก๊สมีค่ากี่จูล (กำหนด 1 atm = \\(10^5 \\text{ Pa}\\), 1 ลิตร = \\(10^{-3} \\text{ m}^3\\))`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const v1 = r ? getSeededRandomBase('16_4_2_num2_v1', r, 2, 4, 1) : 2;
            const v2_base = r ? getSeededRandomBase('16_4_2_num2_v2', r, 5, 8, 1) : 5; // expansion
            const v2 = r ? v2_base + offset : 5;
            const P_atm = r ? getSeededRandomBase('16_4_2_num2_p', r, 1, 3, 0.5) : 1.5;
            const dV_L = v2 - v1;
            const W = P_atm * 1e5 * (dV_L * 1e-3); // essentially dV_L * P_atm * 100
            return {
                params: { v1, v2, v2_base, P_atm, r: offset },
                answers: [Math.round(W).toString(), W.toFixed(1)],
                answersRaw: [W],
                explanation: () => `
      ความดัน: \\( P = ${P_atm} \\times 10^5 \\text{ Pa} \\)<br>
      ปริมาตรเปลี่ยน: \\( \\Delta V = (${r ? `(${v2_base} + \\ ${offset})` : v2} - ${v1}) \\times 10^{-3} = ${dV_L} \\times 10^{-3} \\text{ m}^3 \\)<br>
      งานที่ทำ: \\( W = P\\Delta V = (${P_atm} \\times 10^5) \\times (${dV_L} \\times 10^{-3}) \\)<br>
      \\( W = ${W.toFixed(1)} \\text{ J} \\)
    `
            };
        }
    },
    // อัตนัย 3: หา dU แบบท้ายบท
    {
        id: '16_4_3_num3_simple', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'หา \\( \\Delta U \) จากกระบวนการขยายตัว',
        inputs: [{ label: '\\( \\Delta U \\) \\( (\\text{Joule}) \\):' }],
        text: (p) => `ระบบให้ความร้อนแก่แก๊ส \\(${p.r ? `(${p.Q_base} + \\ ${p.r})` : p.Q}\\text{ J}\\) ส่งผลให้แก๊สขยายตัวและทำงานผลักลูกสูบได้ \\(${p.W}\\text{ J}\\) พลังงานภายในระบบเปลี่ยนแปลงไปเท่าใด`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const Q_base = r ? getSeededRandomBase('16_4_3_num3_Q', r, 400, 800, 50) : 600;
            const Q = r ? Q_base + offset : 600;
            const W = r ? getSeededRandomBase('16_4_3_num3_W', r, 100, 200, 20) : 150;
            const dU = Q - W;
            return {
                params: { Q, W, Q_base, r: offset },
                answers: [dU.toString()],
                answersRaw: [dU],
                explanation: () => `
      จากกฎข้อที่หนึ่ง: \\( Q = \\Delta U + W \\) <br>
      จัดรูปหา \\( \\Delta U \\) จะได้: \\( \\Delta U = Q - W \\)<br>
      แทนค่า (รับความร้อนเป็นบวก, แก๊สทำงานเป็นบวก): \\( \\Delta U = ${r ? `(${Q_base} + \\ ${offset})` : Q} - ${W} = ${dU} \\text{ J} \\)
    `
            };
        }
    },
    // อัตนัย 4: ปริมาตรคงที่ (Double)
    {
        id: '16_4_3_num4_isochoric', topic: '16.4.3-calc', type: 'numeric_double',
        title: 'ระบบปริมาตรคงที่',
        inputs: [
            { label: '1) งาน \\( W \\) \\( (\\text{Joule}) \\):' },
            { label: '2) พลังงานภายในเปลี่ยน \\( \\Delta U \\) \\( (\\text{Joule}) \\):' }
        ],
        text: (p) => `กระบอกสูบถูกยึดให้ **ปริมาตรคงที่** จากนั้นให้ความร้อนแก่ระบบแก๊สภายในจำนวน \\(${p.r ? `(${p.Q_base} + \\ ${p.r})` : p.Q}\\text{ J}\\) จงหางานที่แก๊สทำได้ \\( (W) \) และพลังงานภายในที่เปลี่ยนไป `,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const Q_base = r ? getSeededRandomBase('16_4_3_num4_Q', r, 200, 500, 50) : 350;
            const Q = r ? Q_base + offset : 350;
            const W = 0;
            const dU = Q;
            return {
                params: { Q, Q_base, r: offset },
                answers: [W.toString(), dU.toString()],
                answersRaw: [W, dU],
                explanation: () => `
      1. **หางาน (W):** เมื่อปริมาตรคงที่ แก๊สไม่มีการขยายตัวหรือหดตัว ดังนั้น \\( W = 0 \\text{ J} \\)<br>
      2. **หา \\( \\Delta U \\):** จากกฎข้อที่ 1 \\( Q = \\Delta U + W \\) เมื่อ \\( W = 0 \\) จะได้ \\( \\Delta U = Q \\)<br>
      ดังนั้น \\( \\Delta U = +${r ? `(${Q_base} + \\ ${offset})` : Q} = +${dU} \\text{ J} \\)
    `
            };
        }
    },
    // อัตนัย 5: อุณหภูมิคงที่
    {
        id: '16_4_3_num5_isothermal', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'ระบบอุณหภูมิคงที่',
        inputs: [{ label: 'ความร้อน \\( Q \\) \\( (\\text{Joule}) \\):' }],
        text: (p) => `แก๊สอุดมคติเกิดการขยายตัวโดยรักษาระดับให้ **อุณหภูมิคงที่** ตลอดกระบวนการ ถ้าแก๊สทำงานได้ \\(${p.r ? `(${p.W_base} + \\ ${p.r})` : p.W}\\text{ J}\\) ระบบนี้จะรับหรือคายความร้อนเท่าใด`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const W_base = r ? getSeededRandomBase('16_4_3_num5_W', r, 300, 700, 100) : 500;
            const W = r ? W_base + offset : 500;
            const Q = W;
            return {
                params: { W, W_base, r: offset },
                answers: [Q.toString()],
                answersRaw: [Q],
                explanation: () => `
      เมื่ออุณหภูมิคงที่ จะไม่มีการเปลี่ยนแปลงพลังงานภายในระบบ นั่นคือ **\\( \\Delta U = 0 \\)**<br>
      จากกฎข้อที่ 1: \\( Q = \\Delta U + W \\) จะกลายเป็น \\( Q = 0 + W = W \\)<br>
      ดังนั้น ความร้อน \\( Q = +${r ? `(${W_base} + \\ ${offset})` : W} = +${Q} \\text{ J} \\) (ระบบต้องรับความร้อนเข้ามาเพื่อใช้ในการทำงานทั้งหมดโดยอุณหภูมิไม่ตก)
    `
            };
        }
    },
    // อัตนัย 6: อะเดียแบติก
    {
        id: '16_4_3_num6_adiabatic', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'ถูกบีบอัดอย่างรวดเร็ว (Adiabatic)',
        inputs: [{ label: '\\( \\Delta U \\) \\( (\\text{Joule}) \\):' }],
        text: (p) => `กระบอกสูบหุ้มฉนวนความร้อนอย่างดี ถูกออกแรงบีบอัดอย่างรวดเร็วทำให้สิ่งแวดล้อมทำงานให้แก๊ส \\(${p.r ? `(${p.W_base} + \\ ${p.r})` : p.W}\\text{ J}\\) พลังงานภายในระบบแก๊สเปลี่ยนไปเท่าใด `,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const W_base = r ? getSeededRandomBase('16_4_3_num6_W', r, 150, 400, 50) : 250;
            const W_mag = r ? W_base + offset : 250;
            // Q = 0, W = -W_mag (compressed)
            const dU = W_mag; // 0 = dU + (-W_mag) => dU = W_mag
            return {
                params: { W: W_mag, W_base, r: offset },
                answers: [dU.toString(), "+" + dU.toString()],
                answersRaw: [dU],
                explanation: () => `
      หุ้มฉนวนและบีบอย่างรวดเร็ว หมายถึงไม่มีความร้อนเข้าหรือออก **\\( (Q = 0) \\)**<br>
      ถูกบีบอัด หมายถึงสิ่งแวดล้อมทำงานให้ งานติดลบ **\\( W = -${r ? `(${W_base} + \\ ${offset})` : W_mag} = -${W_mag} \\text{ J} \\)**<br>
      จาก \\( Q = \\Delta U + W \\Rightarrow 0 = \\Delta U - ${W_mag} \\)<br>
      ดังนั้น \\( \\Delta U = +${dU} \\text{ J} \\) (อุณหภูมิของแก๊สจะสูงขึ้น)
    `
            };
        }
    },
    // อัตนัย 7: คายความร้อน และ ถูกบีบ
    {
        id: '16_4_3_num7_all_neg', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'ระบบคายความร้อนและหดตัว',
        inputs: [{ label: '\\( \\Delta U \\) \\( (\\text{Joule}) \\):' }],
        text: (p) => `แก๊สในกระบอกสูบคายความร้อนออกสู่สิ่งแวดล้อม \\(${p.r ? `(${p.Q_base} + \\ ${p.r})` : p.Q}\\text{ J}\\) และในขณะเดียวกันปริมาตรของแก๊สหดตัวลงโดยมีสิ่งแวดล้อมทำงานให้ \\(${p.W}\\text{ J}\\) พลังงานภายในระบบมีการเปลี่ยนแปลงเท่าใด `,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const Q_base = r ? getSeededRandomBase('16_4_3_num7_Q', r, 250, 450, 50) : 400;
            const Q_mag = r ? Q_base + offset : 400;
            const W_mag = r ? getSeededRandomBase('16_4_3_num7_W', r, 100, 200, 50) : 150;
            // Q is negative, W is negative
            const dU = -Q_mag - (-W_mag);
            return {
                params: { Q: Q_mag, W: W_mag, Q_base, r: offset },
                answers: [dU.toString(), (-dU).toString()],
                answersRaw: [[dU, -dU]],
                explanation: () => `
      - คายความร้อน: \\( Q = -${r ? `(${Q_base} + \\ ${offset})` : Q_mag} = -${Q_mag} \\text{ J} \\)<br>
      - หดตัว (สิ่งแวดล้อมทำงานให้): \\( W = -${W_mag} \\text{ J} \\)<br>
      จาก \\( Q = \\Delta U + W \\Rightarrow -${Q_mag} = \\Delta U + (-${W_mag}) \\)<br>
      \\( \\Delta U = -${Q_mag} + ${W_mag} = ${dU} \\text{ J} \\) <br>
      **(สามารถตอบได้ทั้งค่าติดลบ หรือค่าที่เป็นบวกตามขนาดของการเปลี่ยนแปลง)**
    `
            };
        }
    },
    // อัตนัย 8: หาอุณหภูมิที่เปลี่ยนไป
    {
        id: '16_4_3_num8_find_T', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'หาอุณหภูมิที่เปลี่ยนไปจาก Q',
        inputs: [{ label: 'อุณหภูมิที่เพิ่มขึ้น \\( \\Delta T \\) (K):' }],
        text: (p) => `ให้ความร้อนระบบ \\(${p.Q}\\text{ J}\\) โดยล็อกลูกสูบไว้ไม่ให้ขยายตัว (ปริมาตรคงที่) แก๊สฮีเลียมจำนวน \\(${p.n}\\) โมล จะมีอุณหภูมิเพิ่มขึ้นกี่เคลวิน (กำหนด \\( R = 8.3 \\text{ J/(mol K)}\\))`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const n = r ? getSeededRandomBase('16_4_3_num8_n', r, 1, 3, 1) : 2;
            const dT_base = r ? getSeededRandomBase('16_4_3_num8_dT', r, 10, 30, 10) : 20;
            const exact_dT = r ? dT_base + offset : 20;
            const Q = Math.round(1.5 * n * 8.3 * exact_dT);
            const actual_dT = Q / (1.5 * n * 8.3);
            return {
                // เพิ่ม dT เพื่อความครบถ้วนของข้อมูลที่ใช้สุ่มตรวจค่าซ้ำ (ข้อ 2, 11)
                params: { Q, n, dT: exact_dT, dT_base, r: offset },
                answers: [actual_dT.toString(), actual_dT.toFixed(1), exact_dT.toString()],
                answersRaw: [[actual_dT, exact_dT]],
                explanation: () => `
      ปริมาตรคงที่ แปลว่า งาน \\( W = 0 \\) และ \\( Q = \\Delta U \\)<br>
      จากสมการ \\( \\Delta U = \\frac{3}{2}nR\\Delta T \\)<br>
      แทนค่า: \\( ${Q} = \\frac{3}{2}(${n})(8.3)\\Delta T \\)<br>
      \\( ${Q} = ${(1.5 * n * 8.3).toFixed(1)} \\Delta T \\)<br>
      \\( \\Delta T = \\frac{${Q}}{${(1.5 * n * 8.3).toFixed(1)}} \\approx ${Number(actual_dT.toFixed(2))} \\text{ K} \\) (มีค่าตรงกับ ${exact_dT} K)
    `
            };
        }
    },
    // อัตนัย 9: เครื่องยนต์ความร้อน
    {
        id: '16_4_3_num9_heat_engine', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'หลักการทำงานเครื่องยนต์ความร้อน',
        inputs: [{ label: 'คายความร้อนทิ้ง \\( (\\text{Joule}) \\):' }],
        text: (p) => `ใน 1 วัฏจักร เครื่องยนต์ความร้อนรับความร้อนจากแหล่งอุณหภูมิสูงมา \\(${p.r ? `(${p.Qin_base} + \\ ${p.r})` : p.Qin}\\text{ J}\\) และสามารถทำงานได้ \\(${p.W}\\text{ J}\\) เครื่องยนต์นี้จะคายความร้อนทิ้งสู่แหล่งอุณหภูมิต่ำกี่จูล`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const Qin_base = r ? getSeededRandomBase('16_4_3_num9_Qin', r, 800, 1500, 100) : 1200;
            const Qin = r ? Qin_base + offset : 1200;
            const eff = r ? getSeededRandomBase('16_4_3_num9_eff', r, 3, 5, 1) / 10 : 0.4;
            const W = Qin * eff;
            const Qout = Qin - W;
            return {
                params: { Qin, W, Qin_base, r: offset },
                answers: [Qout.toString(), Qout.toFixed(1)],
                answersRaw: [Qout],
                explanation: () => `
      ในกระบวนการ 1 วัฏจักร (Cyclic) พลังงานภายในระบบเริ่มต้นและสิ้นสุดเท่าเดิม (\\( \\Delta U = 0 \\))<br>
      พลังงานความร้อนสุทธิในระบบ \\( Q_{net} = W \\)<br>
      \\( Q_{in} - Q_{out} = W \\Rightarrow ${r ? `(${Qin_base} + \\ ${offset})` : Qin} - Q_{out} = ${W} \\)<br>
      ดังนั้น คายความร้อนทิ้ง \\( Q_{out} = ${Qin} - ${W} = ${Qout} \\text{ J} \\)
    `
            };
        }
    },
    // อัตนัย 10: ความร้อน แลกเปลี่ยน งาน
    {
        id: '16_4_3_num10_compress_heat', topic: '16.4.3-calc', type: 'numeric_single',
        title: 'หา \\( \\Delta U \\) แบบประยุกต์',
        inputs: [{ label: '\\( \\Delta U \\) \\( (\\text{Joule}) \\):' }],
        text: (p) => `ระบบได้รับความร้อน \\(${p.r ? `(${p.Q_base} + \\ ${p.r})` : p.Q}\\text{ J}\\) แต่ในขณะเดียวกันปริมาตรของแก๊สหดตัวลงโดยมีสิ่งแวดล้อมทำงานให้ \\(${p.W}\\text{ J}\\) พลังงานภายในระบบเปลี่ยนไปเท่าใด`,
        generate: (r) => {
            const offset = getOffsetFromR(r);
            const Q_base = r ? getSeededRandomBase('16_4_3_num10_Q', r, 300, 600, 50) : 500;
            const Q = r ? Q_base + offset : 500;
            const W_mag = r ? getSeededRandomBase('16_4_3_num10_W', r, 100, 200, 25) : 150;
            // Q = +, W = -
            const dU = Q - (-W_mag);
            return {
                params: { Q, W: W_mag, Q_base, r: offset },
                answers: [dU.toString(), "+" + dU.toString()],
                answersRaw: [dU],
                explanation: () => `
      - ระบบรับความร้อน \\( Q = +${r ? `(${Q_base} + \\ ${offset})` : Q} \\text{ J} \\)<br>
      - สิ่งแวดล้อมทำงานให้ (ปริมาตรหด) \\( W = -${W_mag} \\text{ J} \\)<br>
      จากกฎข้อ 1: \\( Q = \\Delta U + W \\Rightarrow ${Q} = \\Delta U + (-${W_mag}) \\)<br>
      \\( \\Delta U = ${Q} + ${W_mag} = ${dU} \\text{ J} \\)
    `
            };
        }
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
        cz.innerHTML = template.choices.map(c => `<button onclick="checkPracticeChoice('${c}')" class="w-full text-left px-5 py-3 bg-white hover:bg-orange-50 text-slate-800 font-medium rounded-xl border border-slate-200 hover:border-orange-300 transition">${c}</button>`).join('');
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

function checkPracticeChoice(choice) {
    if (!currentPracticeQuestion) return;
    const { instance } = currentPracticeQuestion;
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
function startExamProcess() {
    const name = document.getElementById('exam-student-name').value.trim();
    const cls = document.getElementById('exam-student-class').value;
    const num = document.getElementById('exam-student-no').value.trim();
    const R_parsed = parseInt(num);
    if (!name || !cls || isNaN(R_parsed) || R_parsed < 1 || R_parsed > 40) {
        triggerAlert("ข้อมูลไม่ครบถ้วน", "กรุณาระบุ ชื่อ ชั้นเรียน และเลขที่ \\( (1-40) \\) ให้ถูกต้องก่อนเริ่มสอบครับ", "fa-user", "bg-orange-100 text-orange-600");
        return;
    }

    const timestamp = Date.now();
    examSeed = `${num}_${timestamp}`; // ใช้ เลขที่ + เวลาปัจจุบัน เป็นเมล็ดสุ่มตัวเลขในการสอบรอบนี้
    examDurationSeconds = 15 * 60;
    examStudentInfo = { name, class: cls, number: num, seed: examSeed };

    // ฟังก์ชันสับการ์ดแบบสุ่มแท้ (Non-deterministic Shuffle)
    const pureShuffle = (array) => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    // Select 5 questions mixing topics for Thermodynamics
    const q_dU = QUESTION_TEMPLATES.filter(q => q.topic === '16.4.1');
    const q_W = QUESTION_TEMPLATES.filter(q => q.topic === '16.4.2');
    const q_LawCalc = QUESTION_TEMPLATES.filter(q => q.topic === '16.4.3-calc');
    const q_LawCon = QUESTION_TEMPLATES.filter(q => q.topic === '16.4.3-concept');

    const shuffled_dU = pureShuffle(q_dU);
    const shuffled_W = pureShuffle(q_W);
    const shuffled_LawCalc = pureShuffle(q_LawCalc);
    const shuffled_LawCon = pureShuffle(q_LawCon);

    let selectedTemplates = [
        shuffled_dU[0],
        shuffled_W[0],
        shuffled_W[1], // Have a high chance of testing both expansion and compression
        shuffled_LawCalc[0],
        shuffled_LawCon[0]
    ];

    // สุ่มสลับลำดับข้อสอบทั้ง 5 ข้อ เพื่อให้ตำแหน่งของโจทย์เปลี่ยนไปในแต่ละรอบ
    selectedTemplates = pureShuffle(selectedTemplates);

    currentExamQuestions = selectedTemplates.map((template, index) => {
        let instance = null;
        let attempts = 0;
        const history = getHistory();
        
        while (attempts < 100) {
            attempts++;
            // สร้าง seed ที่มีเอกลักษณ์เฉพาะข้อและรัน เพื่อให้สุ่มได้จริงไม่ซ้ำ (ข้อ 1, 6, 7)
            const seed = `${num}_${timestamp}_${template.id}_${attempts}`;
            instance = template.generate(seed);
            
            const vals = getActiveParamValues(instance.params);
            if (vals.length > 0) {
                // ป้องกันตัวแปรซ้ำภายในข้อเดียวกัน (ข้อ 2)
                if (hasDuplicateVariables(instance.params)) {
                    continue;
                }
                
                // ป้องกันการสุ่มชุดตัวเลขซ้ำกับรอบก่อนหน้า (ข้อ 3, 4, 5)
                const key = generateUniqueKey(template.id, instance.params);
                if (history.includes(key)) {
                    continue;
                }
                
                addToHistory(key);
            }
            break; // สุ่มได้ผ่านเกณฑ์
        }

        const choices = template.type === 'choice' ? pureShuffle(template.choices) : [];
        return {
            id: template.id, topic: template.topic, type: template.type, title: template.title,
            text: template.text(instance.params), inputs: template.inputs || [], choices: choices,
            // บันทึกคำตอบและคำอธิบายเฉลยที่สุ่มได้จริงในชุดเดียวกัน (ข้อ 11, 12)
            answers: instance.answers,
            answersRaw: instance.answersRaw,
            explanationText: instance.explanation()
        };
    });

    document.getElementById('lbl-exam-user-info').innerHTML = `${name} (ม.6/${cls} เลขที่ ${num})`;

    renderExamLiveDOM();

    examStartTimestamp = Date.now();
    examDeadlineTimestamp = examStartTimestamp + (examDurationSeconds * 1000);
    examTimeRemaining = examDurationSeconds;
    examIsActive = true;
    examSubmissionInProgress = false;

    sessionStorage.setItem(EXAM_STATE_KEY, JSON.stringify({
        examQuestions: currentExamQuestions, studentInfo: examStudentInfo, examStartTimestamp, examDeadlineTimestamp, examDurationSeconds
    }));

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
function handleExamBeforeUnload(e) { if (examIsActive) { e.preventDefault(); e.returnValue = ''; } }

function renderExamLiveDOM() {
    const container = document.getElementById('exam-questions-container');
    container.innerHTML = '';
    currentExamQuestions.forEach((q, idx) => {
        let inputHTML = '';
        if (q.type === 'choice') {
            inputHTML += `<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">`;
            q.choices.forEach((c, cIdx) => {
                inputHTML += `<label class="flex items-center gap-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 p-4 rounded-xl cursor-pointer transition">
              <input type="radio" name="exam-q${idx}" value="${c}" class="w-4 h-4 text-orange-600 focus:ring-orange-500">
              <span class="text-sm text-slate-800">${c}</span>
            </label>`;
            });
            inputHTML += `</div>`;
        } else if (q.type === 'numeric_single') {
            inputHTML += `<div class="mt-4"><label class="block text-xs font-bold text-slate-500 mb-1">${q.inputs[0].label}</label>
            <input type="text" id="exam-q${idx}-val1" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 outline-none font-mono text-sm"></div>`;
        } else if (q.type === 'numeric_double') {
            inputHTML += `<div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">${q.inputs[0].label}</label>
              <input type="text" id="exam-q${idx}-val1" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 outline-none font-mono text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">${q.inputs[1].label}</label>
              <input type="text" id="exam-q${idx}-val2" class="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 outline-none font-mono text-sm">
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
        document.getElementById('exam-timer-display').innerText = formatExamTime(examTimeRemaining);
        if (examTimeRemaining < 60) document.getElementById('exam-timer-display').classList.add('text-red-400');

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
            return [document.getElementById(`exam-q${idx}-val1`).value];
        } else if (q.type === 'numeric_double') {
            return [
                document.getElementById(`exam-q${idx}-val1`).value,
                document.getElementById(`exam-q${idx}-val2`).value
            ];
        }
        return null;
    });
}

function confirmSubmitExam() {
    const answers = getExamAnswers();
    const uncomplete = answers.some(a => !a || (Array.isArray(a) && (a.some(val => !val.trim()))));
    const msg = uncomplete ? "คุณยังทำข้อสอบไม่ครบทุกข้อ ยืนยันที่จะส่งข้อสอบเลยหรือไม่?" : "คุณทำข้อสอบครบแล้ว ยืนยันต้องการส่งข้อสอบหรือไม่?";

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
    const R = examStudentInfo.seed || parseInt(examStudentInfo.number) || 1;

    currentExamQuestions.forEach((q, idx) => {
        const userAns = answers[idx];

        // ตรวจคำตอบเทียบกับเฉลยในโครงสร้างข้อสอบที่สุ่มและจัดเก็บไว้โดยตรง (ข้อ 11, 12)
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
            idx, isCorrect, score, userAns,
            expectedAnswers: q.answers,
            explanationText: q.explanationText
        });
    });

    const elapsed = timeExpired ? examDurationSeconds : (examDurationSeconds - examTimeRemaining);
    const timeStr = `${Math.floor(elapsed / 60)} นาที ${elapsed % 60} วินาที`;

    const payload = {
        score: total_score, timeTaken: timeStr, studentInfo: examStudentInfo,
        gradedResults, examQuestions: currentExamQuestions, date: new Date().toLocaleDateString('th-TH')
    };
    localStorage.setItem('last_exam_results_16_4', JSON.stringify(payload));
    sessionStorage.removeItem(EXAM_STATE_KEY);

    updateLatestScore();
    showSection('exam-result');
    renderExamResults(payload);
}

function renderExamResults(data) {
    document.getElementById('lbl-res-student-name').innerText = data.studentInfo.name;
    document.getElementById('lbl-res-student-meta').innerHTML = `(ม.6/${data.studentInfo.class} เลขที่ ${data.studentInfo.number})`;
    document.getElementById('lbl-res-time-elapsed').innerText = data.timeTaken;
    document.getElementById('lbl-res-finished-at').innerText = data.date;

    document.getElementById('lbl-res-total-score').innerText = data.score;
    const circle = document.getElementById('res-circle-progress');
    circle.style.strokeDashoffset = 439.8 - (data.score / 10) * 439.8;

    const fb = document.getElementById('lbl-res-badge-feedback');
    if (data.score >= 8) fb.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fa-solid fa-star"></i> ยอดเยี่ยม! เข้าใจกฎของอุณหพลศาสตร์ได้ดีมาก</span>`;
    else if (data.score >= 5) fb.innerHTML = `<span class="text-orange-600 font-bold"><i class="fa-solid fa-thumbs-up"></i> ดี! ผ่านเกณฑ์ ลองดูเฉลยเพื่อเก็บรายละเอียดเครื่องหมายนะ</span>`;
    else fb.innerHTML = `<span class="text-red-600 font-bold"><i class="fa-solid fa-book"></i> พยายามอีกนิด ทบทวนเรื่องการกำหนดเครื่องหมาย (+ / -) นะครับ</span>`;

    const tbody = document.getElementById('exam-result-tbody');
    const sols = document.getElementById('exam-solutions-container');
    tbody.innerHTML = ''; sols.innerHTML = '';

    data.gradedResults.forEach((grad, i) => {
        const q = data.examQuestions[i];
        const status = grad.isCorrect
            ? `<span class="text-emerald-500 font-bold"><i class="fa-solid fa-check"></i> 2.0</span>`
            : `<span class="text-red-500 font-bold"><i class="fa-solid fa-xmark"></i> 0.0</span>`;

        tbody.innerHTML += `<tr class="bg-white">
          <td class="px-5 py-3 font-medium text-center">${i + 1}</td>
          <td class="px-5 py-3 text-slate-700">${q.title}</td>
          <td class="px-5 py-3 text-center">2.0</td>
          <td class="px-5 py-3 text-center">${status}</td>
        </tr>`;

        let uAns = 'ไม่ได้ตอบ';
        if (q.type === 'choice') uAns = grad.userAns || uAns;
        else if (grad.userAns && grad.userAns[0]) uAns = grad.userAns[0];

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
    // ป้องกันการเข้าถึง localStorage ระหว่าง SSR ใน Next.js (ข้อ 8, 9)
    if (typeof window === 'undefined') return;
    try {
        const saved = localStorage.getItem('last_exam_results_16_4');
        const badge = document.getElementById('latest-score-badge');
        if (saved && badge) {
            const data = JSON.parse(saved);
            const scoreLbl = document.getElementById('lbl-last-score');
            if (scoreLbl) {
                scoreLbl.innerHTML = `${data.score}/10 \\( (\\text{${data.studentInfo.name}}) \\)`;
                badge.classList.remove('hidden');
                queueTypeset(scoreLbl);
            }
        }
    } catch (e) {
        console.error('Failed to update latest score badge', e);
    }
}

function showLatestResultModal() {
    // ป้องกันการเข้าถึง localStorage ระหว่าง SSR ใน Next.js (ข้อ 8, 9)
    if (typeof window === 'undefined') return;
    try {
        const saved = localStorage.getItem('last_exam_results_16_4');
        if (saved) {
            showSection('exam-result');
            renderExamResults(JSON.parse(saved));
        }
    } catch (e) {
        console.error('Failed to show latest result modal', e);
    }
}

// --- On Load Init ---
window.onload = () => {
    updateLatestScore();
    switchReviewTab('16-4-1');
    queueTypeset(document.body);

    const activeSession = sessionStorage.getItem(EXAM_STATE_KEY);
    if (activeSession) {
        try {
            const s = JSON.parse(activeSession);
            if (s.examDeadlineTimestamp > Date.now()) {
                currentExamQuestions = s.examQuestions;
                examStudentInfo = s.studentInfo;
                examSeed = s.studentInfo.seed || null;
                examDeadlineTimestamp = s.examDeadlineTimestamp;
                examDurationSeconds = s.examDurationSeconds;
                examIsActive = true;
                document.getElementById('lbl-exam-user-info').innerHTML = `${s.studentInfo.name} (ม.6/${s.studentInfo.class} เลขที่ ${s.studentInfo.number})`;
                renderExamLiveDOM();
                setupExamLocks();
                showSection('exam-live');
                startExamTimer();
            } else {
                sessionStorage.removeItem(EXAM_STATE_KEY);
            }
        } catch (e) { sessionStorage.removeItem(EXAM_STATE_KEY); }
    }

    // นับจำนวนโจทย์ทั้งหมดใน array QUESTION_TEMPLATES
    const totalQuestions = QUESTION_TEMPLATES.length;
    // อัปเดตตัวเลขไปยัง HTML
    document.getElementById('total-count').innerText = totalQuestions;
};
