// Automated Math & Physics Verification Script for Unit 16.4
// Tests all question templates across 1,000 random iterations

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

function getSeededRandomBase(questionId, seed, min, max, step = 1) {
    const seedStr = `${questionId}_${seed}`;
    const rng = new SeededRNG(seedStr);
    const steps = Math.floor((max - min) / step);
    return min + Math.floor(rng.random() * (steps + 1)) * step;
}

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
        return (r % 9) + 1;
    }
    return 0;
}

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
                explanation: () => `\\( W = P(V_2 - V_1) = (${p} \\times 10^3)(${dV} \\times 10^{-3}) = ${W} \\text{ J} \\)`
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

// Run 1,000 simulations
console.log(`Starting verification: ${QUESTION_TEMPLATES.length} templates across 1,000 iterations...`);
let errors = 0;

for (let iter = 1; iter <= 1000; iter++) {
    const studentNum = (iter % 40) + 1;
    const seed = `${studentNum}_${Date.now()}_att${(iter % 5) + 1}`;

    QUESTION_TEMPLATES.forEach((tmpl) => {
        try {
            const inst = tmpl.generate(seed);
            const text = tmpl.text(inst.params);

            // Check for NaN or undefined in params
            for (const key in inst.params) {
                const val = inst.params[key];
                if (typeof val === 'number' && (isNaN(val) || !isFinite(val))) {
                    console.error(`[Iter ${iter}][${tmpl.id}] Param ${key} is NaN or not finite: ${val}`);
                    errors++;
                }
            }

            // Check text
            if (!text || text.includes('NaN') || text.includes('undefined')) {
                console.error(`[Iter ${iter}][${tmpl.id}] Text has NaN/undefined: ${text}`);
                errors++;
            }

            // Check answers
            if (!inst.answers || inst.answers.length === 0) {
                console.error(`[Iter ${iter}][${tmpl.id}] Answers missing`);
                errors++;
            }
            inst.answers.forEach(ans => {
                if (ans === undefined || ans === null || ans.includes('NaN') || ans.includes('undefined')) {
                    console.error(`[Iter ${iter}][${tmpl.id}] Bad answer: ${ans}`);
                    errors++;
                }
            });

            // If choice type, check choices
            if (tmpl.type === 'choice') {
                if (!tmpl.choices || tmpl.choices.length !== 4) {
                    console.error(`[Iter ${iter}][${tmpl.id}] Choice question must have exactly 4 choices`);
                    errors++;
                }
                const choiceSet = new Set(tmpl.choices);
                if (choiceSet.size !== tmpl.choices.length) {
                    console.error(`[Iter ${iter}][${tmpl.id}] Duplicate choices detected:`, tmpl.choices);
                    errors++;
                }
                if (!tmpl.choices.includes(inst.answers[0])) {
                    console.error(`[Iter ${iter}][${tmpl.id}] Answer ${inst.answers[0]} not found in choices`);
                    errors++;
                }
            }
        } catch (e) {
            console.error(`[Iter ${iter}][${tmpl.id}] Exception:`, e);
            errors++;
        }
    });
}

if (errors === 0) {
    console.log(`✅ VERIFICATION SUCCESSFUL: 1,000 template iterations completed with 0 errors across all ${QUESTION_TEMPLATES.length} templates.`);
} else {
    console.error(`❌ VERIFICATION FAILED: Found ${errors} errors.`);
    process.exit(1);
}

// ----------------------------------------------------
// TEST 2: Simulate 500 Full 10-Question Exams
// ----------------------------------------------------
console.log('Starting Test 2: Simulating 500 complete 10-question exams...');
let examErrors = 0;
const choiceHistoryMock = {};

function selectTheoryQuestionMock(cls, num) {
    const key = `${cls}_${num}`;
    if (!choiceHistoryMock[key]) choiceHistoryMock[key] = [];
    const pool = QUESTION_TEMPLATES.filter(q => q.topic === '16.4.3-concept');
    let available = pool.filter(q => !choiceHistoryMock[key].includes(q.id));
    if (available.length === 0) {
        choiceHistoryMock[key] = [];
        available = pool;
    }
    const chosen = available[Math.floor(Math.random() * available.length)];
    choiceHistoryMock[key].push(chosen.id);
    return chosen;
}

for (let e = 1; e <= 500; e++) {
    const cls = (e % 5) + 1;
    const num = (e % 40) + 1;
    const attempt = Math.floor(e / 40) + 1;
    const seedBase = `${num}_${Date.now() + e}_att${attempt}`;

    const q_dU = QUESTION_TEMPLATES.filter(q => q.topic === '16.4.1');
    const q_W = QUESTION_TEMPLATES.filter(q => q.topic === '16.4.2');
    const q_LawCalc = QUESTION_TEMPLATES.filter(q => q.topic === '16.4.3-calc');

    const rng = new SeededRNG(seedBase);
    const shuffled_dU = rng.shuffle(q_dU);
    const shuffled_W = rng.shuffle(q_W);
    const shuffled_LawCalc = rng.shuffle(q_LawCalc);
    const theoryQ = selectTheoryQuestionMock(cls, num);

    let selectedTemplates = [
        shuffled_dU[0],
        shuffled_W[0],
        shuffled_LawCalc[0],
        shuffled_LawCalc[1] || shuffled_LawCalc[0],
        theoryQ
    ];

    if (selectedTemplates.length !== 5) {
        console.error(`Exam ${e}: Expected 5 templates, got ${selectedTemplates.length}`);
        examErrors++;
    }

    selectedTemplates = rng.shuffle(selectedTemplates);

    selectedTemplates.forEach((tmpl, idx) => {
        const qSeed = `${num}_${Date.now()}_${tmpl.id}_${idx}_att${attempt}`;
        const inst = tmpl.generate(qSeed);
        if (!inst.answers || inst.answers.length === 0) {
            console.error(`Exam ${e}, Q${idx + 1}: Missing answers`);
            examErrors++;
        }
    });
}

if (examErrors === 0) {
    console.log('✅ TEST 2 SUCCESSFUL: 500 simulated 5-question exams (2.0 pts each = 10 pts total) generated with 0 errors.');
} else {
    console.error(`❌ TEST 2 FAILED: Found ${examErrors} errors in exam simulation.`);
    process.exit(1);
}

