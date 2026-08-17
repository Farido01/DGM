import { useState, useEffect, useMemo, useRef } from "react";

// ── Field geometry ──────────────────────────────────────────────────────────
const COLS = 56, ROWS = 36, STEP = 24;
const DOT_R = 1, LABEL_PAD = 30, FONT_SIZE = 12;
const FIELD_W = COLS * STEP, FIELD_H = ROWS * STEP;
const SVG_W = 1920, SVG_H = 1080;
const TOTAL_W = LABEL_PAD + FIELD_W + LABEL_PAD;
const TOTAL_H = LABEL_PAD + FIELD_H + LABEL_PAD;
const BX = (SVG_W - TOTAL_W) / 2;
const BY = (SVG_H - TOTAL_H) / 2;
const FX = BX + LABEL_PAD;
const FY = BY + LABEL_PAD;

const R_D = 3;    // diamond circle radius (diameter 6px)
const R_S = 3;    // circle dots radius (diameter 6px)
const R_LINE = 3; // diagonal line circle radius (diameter 6px)

const RED = "#EF4444", YELLOW = "#F59E0B";
const GREEN = "#22C55E", PINK_GRAY = "#C4A0B5";
const BLACK_SQ = "#1E293B", PURPLE = "#9333EA";
const FONT = "'Inter', system-ui, sans-serif";
const TEXT_COLOR = "#FFFFFF", DOT_COLOR = "#C6C6C6";

const textBase = {
  fontSize: FONT_SIZE, fill: TEXT_COLOR, fontFamily: FONT,
  dominantBaseline: "middle" as const, textAnchor: "middle" as const,
};

type PP = { x: number; y: number };

const gx = (c: number) => FX + c * STEP;
const gy = (r: number) => FY + r * STEP;
const colR = (l: number) => 28 + l;   // right-side col label → col_idx
const colL = (l: number) => 28 - l;   // left-side col label  → col_idx
const rowJ = (l: number) => ROWS - l; // row label (36=top)   → row_idx

// ── Diamond corners ─────────────────────────────────────────────────────────
const INSET = 10 * Math.sqrt(2);

// Right outer: 14:10 (top), 18:6 (right), 14:2 (bottom), 10:6 (left)
const RT: PP = { x: gx(colR(14)), y: gy(rowJ(10)) };
const RR: PP = { x: gx(colR(18)), y: gy(rowJ(6)) };
const RB: PP = { x: gx(colR(14)), y: gy(rowJ(2)) };
const RL: PP = { x: gx(colR(10)), y: gy(rowJ(6)) };
// Right inner
const RIT: PP = { x: RT.x, y: RT.y + INSET };
const RIR: PP = { x: RR.x - INSET, y: RR.y };
const RIB: PP = { x: RB.x, y: RB.y - INSET };
const RIL: PP = { x: RL.x + INSET, y: RL.y };

// Left outer
const LT: PP = { x: gx(colL(14)), y: gy(rowJ(10)) };
const LR: PP = { x: gx(colL(10)), y: gy(rowJ(6)) };
const LB: PP = { x: gx(colL(14)), y: gy(rowJ(2)) };
const LL: PP = { x: gx(colL(18)), y: gy(rowJ(6)) };
// Left inner
const LIT: PP = { x: LT.x, y: LT.y + INSET };
const LIR: PP = { x: LR.x - INSET, y: LR.y };
const LIB: PP = { x: LB.x, y: LB.y - INSET };
const LIL: PP = { x: LL.x + INSET, y: LL.y };

// ── Helpers ─────────────────────────────────────────────────────────────────
function sidePts(a: PP, b: PP, n = 10): PP[] {
  return Array.from({ length: n }, (_, i) => ({
    x: a.x + (b.x - a.x) * (i + 1) / (n + 1),
    y: a.y + (b.y - a.y) * (i + 1) / (n + 1),
  }));
}

function linePts(a: PP, b: PP, n: number): PP[] {
  return Array.from({ length: n }, (_, i) => ({
    x: a.x + (b.x - a.x) * i / (n - 1),
    y: a.y + (b.y - a.y) * i / (n - 1),
  }));
}

function circPts(cx: number, cy: number, r: number, n: number): PP[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

const polyStr = (...ps: PP[]) => ps.map(p => `${p.x},${p.y}`).join(" ");

// ── Diamond side arrays ──────────────────────────────────────────────────────
type Side = { a: PP; b: PP; color: string };

const rightOuter: Side[] = [
  { a: RT, b: RR, color: YELLOW },
  { a: RR, b: RB, color: RED },
  { a: RB, b: RL, color: PINK_GRAY },
  { a: RL, b: RT, color: GREEN },
];
const rightInner: Side[] = [
  { a: RIT, b: RIR, color: YELLOW },
  { a: RIR, b: RIB, color: RED },
  { a: RIB, b: RIL, color: PINK_GRAY },
  { a: RIL, b: RIT, color: GREEN },
];
const leftOuter: Side[] = [
  { a: LT, b: LL, color: YELLOW },
  { a: LL, b: LB, color: RED },
  { a: LB, b: LR, color: PINK_GRAY },
  { a: LR, b: LT, color: GREEN },
];
const leftInner: Side[] = [
  { a: LIT, b: LIL, color: YELLOW },
  { a: LIL, b: LIB, color: RED },
  { a: LIB, b: LIR, color: PINK_GRAY },
  { a: LIR, b: LIT, color: GREEN },
];

type DiamondDot = {
  pBox: PP;
  pInit: PP;
  p0: PP;
  p1: PP;
  s0: number;
  s1: number;
  trackPts: PP[];
  trackDists: number[];
  color: string;
  order: number;
  idx: number;
  isRight: boolean;
  isInnerRing: boolean;
  trainIdx?: number;
  pBox3?: PP;
  trainIdx3?: number;
  pBox4?: PP;
  trainIdx4?: number;
  circleNum?: number;
  da?: number;
};

// ── Circle: centre 0:16, radius 10 steps (140 dots open at bottom from 2L to 2R) ──
const CIRC_CX = gx(28);
const CIRC_CY = gy(rowJ(15)); // Center shifted 1 row down to 0:15
const CIRC_R = 10 * STEP;
const CIRC_N = 140;

function openCircPts(cx: number, cy: number, r: number, n = 140, openCols = 2) {
  if (openCols <= 0.001) {
    return Array.from({ length: n }, (_, i) => {
      const a = (Math.PI / 2) + (2 * Math.PI * i) / n;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
  }
  const openAngle = Math.asin(openCols / (r / STEP));
  const startAngle = Math.PI / 2 + openAngle; // Opens at the bottom between 2L and 2R
  const totalArc = 2 * Math.PI - 2 * openAngle;
  return Array.from({ length: n }, (_, i) => {
    const a = startAngle + (totalArc * i) / (n - 1);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

// ── 2nd Circle & 3rd Circle: Progressive Gap from Big Circle starting at Row 16 ──
// 2-й круг: открыт сверху (2..2) и снизу (2.2..2.2)
// 3-й круг: СВЕРХУ ПОЛНОСТЬЮ ЗАКРЫТ, открыт только снизу (2.2..2.2). Зазор строго 10px.
const R_IN1_BASE = 8.5 * STEP; // 204px (зазор 36px сбоку на 16 ряду)

function buildMasterTrack(isRight: boolean, isInnerRing: boolean, sides: Side[]) {
  const isGoingToInner = (sides === rightInner || sides === leftInner);

  const exitCol = isGoingToInner ? 1.4 : 0.9;
  const exitRow = isGoingToInner ? 4.5 : 4.1; // Shifted 1 row down with circle
  const exitX = isRight ? gx(colR(exitCol)) : gx(colL(exitCol));
  const exitY = gy(rowJ(exitRow));

  const midAngle = isRight ? 0 : Math.PI;

  function getCirclePt(a: number): PP {
    const da = Math.abs(a - midAngle);
    const fr = Math.min(1, da / (Math.PI / 2));
    const off = 1.15 * STEP * Math.pow(fr, 1.25);
    const r = (R_IN1_BASE - off) - (isInnerRing ? 10 : 0);
    return {
      x: CIRC_CX + r * Math.cos(a),
      y: CIRC_CY + r * Math.sin(a),
    };
  }

  // Угол нижнего выхода a0 точно соответствует колонке выхода (1.4 для 2-го круга, 0.9 для 3-го)
  const rAtExit = (R_IN1_BASE - 1.15 * STEP) - (isInnerRing ? 10 : 0);
  const botAngle = Math.asin(Math.min(1, (exitCol * STEP) / rAtExit));
  const topAngle = Math.asin(Math.min(1, (2.0 * STEP) / (R_IN1_BASE - 1.15 * STEP)));

  const a0 = isRight ? (Math.PI / 2 - botAngle) : (Math.PI / 2 + botAngle);
  const a3 = isRight ? (-Math.PI / 2 + 0.70) : (3 * Math.PI / 2 - 0.70);
  const stepA = (a3 - a0) / 3;
  const a1 = a0 + stepA;
  const a2 = a0 + 2 * stepA;

  let aTop: number;
  if (!isInnerRing) {
    aTop = isRight ? (-Math.PI / 2 + topAngle) : (3 * Math.PI / 2 - topAngle);
  } else {
    aTop = isRight ? (-Math.PI / 2) : (3 * Math.PI / 2);
  }

  const trackPts: PP[] = [];

  // 1. Движение по кругу вниз к выходу a0 (верхние точки немного закрываются/смещаются по дуге вниз)
  const ARC_STEPS = 60;
  for (let s = 0; s <= ARC_STEPS; s++) {
    const a = aTop + (a0 - aTop) * (s / ARC_STEPS);
    trackPts.push(getCirclePt(a));
  }

  // 2. Движение по ПРЯМОЙ ВЕРТИКАЛЬНОЙ ЛИНИИ ВНИЗ к ряду 5.5 / 5.1
  const ptAtA0 = trackPts[trackPts.length - 1];
  const DOWN_STEPS = 15;
  for (let s = 1; s <= DOWN_STEPS; s++) {
    const u = s / DOWN_STEPS;
    trackPts.push({
      x: ptAtA0.x + (exitX - ptAtA0.x) * u, // строго вертикально
      y: ptAtA0.y + (exitY - ptAtA0.y) * u, // прямо вниз
    });
  }

  // 3. Коридор к ромбу (в точке 10:6 делаем увеличенный свободный зазор 15px, чтобы зазор был хорошо виден)
  const diamondEntry = sides[3].a; // RL for outer, RIL for inner
  const CORR_STEPS = 35;
  const GAP_AT_10_6 = 15; // px увеличенный зазор в точке 10:6

  for (let s = 1; s <= CORR_STEPS; s++) {
    const u = s / CORR_STEPS;
    const targetX = exitX + (diamondEntry.x - exitX) * u;
    const targetY = isGoingToInner
      ? (u < 0.85
          ? exitY + (diamondEntry.y - GAP_AT_10_6 - exitY) * (u / 0.85)
          : (diamondEntry.y - GAP_AT_10_6) + GAP_AT_10_6 * ((u - 0.85) / 0.15))
      : exitY + (diamondEntry.y - exitY) * u;
    trackPts.push({ x: targetX, y: targetY });
  }

  // 4. Diamond perimeter loop: sides[3].a (entry) -> sides[1].b -> sides[1].a -> sides[0].a -> sides[3].a
  const v_entry = sides[3].a; // RL / RIL
  const v_bot   = sides[1].b; // RB / RIB
  const v_right = sides[1].a; // RR / RIR
  const v_top   = sides[0].a; // RT / RIT

  function addLinearSeg(pA: PP, pB: PP, count = 20) {
    for (let s = 1; s <= count; s++) {
      const u = s / count;
      trackPts.push({
        x: pA.x + (pB.x - pA.x) * u,
        y: pA.y + (pB.y - pA.y) * u,
      });
    }
  }

  addLinearSeg(v_entry, v_bot, 20);   // Side 1: 10:6 -> 14:2 (Pink-Gray)
  addLinearSeg(v_bot, v_right, 20);  // Side 2: 14:2 -> 18:6 (Red)
  addLinearSeg(v_right, v_top, 20);  // Side 3: 18:6 -> 14:10 (Yellow)
  addLinearSeg(v_top, v_entry, 20);  // Side 4: 14:10 -> 10:6 (Green)

  // Compute cumulative distances
  const trackDists = [0];
  let totalD = 0;
  for (let i = 0; i < trackPts.length - 1; i++) {
    totalD += Math.hypot(trackPts[i+1].x - trackPts[i].x, trackPts[i+1].y - trackPts[i].y);
    trackDists.push(totalD);
  }

  return {
    trackPts,
    trackDists,
    totalD,
    a0, a1, a2, a3, aTop,
    getCirclePt,
    v_entry, v_bot, v_right, v_top,
  };
}

function findTrackDist(trackPts: PP[], trackDists: number[], targetPt: PP, hintStartIdx = 0, hintEndIdx = trackPts.length - 1): number {
  let bestDist = 0;
  let minDistSq = Infinity;
  for (let i = hintStartIdx; i < hintEndIdx; i++) {
    const pA = trackPts[i];
    const pB = trackPts[i + 1];
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const lenSq = dx * dx + dy * dy;
    let u = 0;
    if (lenSq > 0) {
      u = ((targetPt.x - pA.x) * dx + (targetPt.y - pA.y) * dy) / lenSq;
      u = Math.max(0, Math.min(1, u));
    }
    const projX = pA.x + u * dx;
    const projY = pA.y + u * dy;
    const distSq = (targetPt.x - projX) ** 2 + (targetPt.y - projY) ** 2;
    if (distSq < minDistSq) {
      minDistSq = distSq;
      bestDist = trackDists[i] + u * Math.hypot(dx, dy);
    }
  }
  return bestDist;
}

function getPointAtDist(trackPts: PP[], trackDists: number[], d: number): PP {
  if (d <= 0) return trackPts[0];
  const maxD = trackDists[trackDists.length - 1];
  if (d >= maxD) return trackPts[trackPts.length - 1];

  let low = 0, high = trackDists.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (trackDists[mid] <= d) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const idx = Math.max(0, high);
  const d0 = trackDists[idx];
  const d1 = trackDists[idx + 1];
  const frac = (d1 > d0) ? (d - d0) / (d1 - d0) : 0;
  const p0 = trackPts[idx];
  const p1 = trackPts[idx + 1];
  return {
    x: p0.x + (p1.x - p0.x) * frac,
    y: p0.y + (p1.y - p0.y) * frac,
  };
}

function buildDiamondGroup(isRight: boolean, isInnerRing: boolean, sides: Side[]): DiamondDot[] {
  const track = buildMasterTrack(isRight, isInnerRing, sides);
  const { trackPts, trackDists, a0, a1, a2, a3, aTop, getCirclePt, v_entry, v_bot, v_right, v_top } = track;

  const diamondStartIndex = 60 + 15 + 25;
  const res: DiamondDot[] = [];

  const colorConfigs = [
    {
      color: GREEN,
      order: 0,
      fromA: a0,
      toA: a1,
      sidePtsArr: sidePts(v_top, v_entry, 10), // Side 4: 14:10 -> 10:6
    },
    {
      color: YELLOW,
      order: 1,
      fromA: a1,
      toA: a2,
      sidePtsArr: sidePts(v_right, v_top, 10), // Side 3: 18:6 -> 14:10
    },
    {
      color: RED,
      order: 2,
      fromA: a2,
      toA: a3,
      sidePtsArr: sidePts(v_bot, v_right, 10), // Side 2: 14:2 -> 18:6
    },
    {
      color: PINK_GRAY,
      order: 3,
      fromA: a3,
      toA: aTop,
      sidePtsArr: sidePts(v_entry, v_bot, 10), // Side 1: 10:6 -> 14:2
    },
  ];

  colorConfigs.forEach(({ color, order, fromA, toA, sidePtsArr }) => {
    for (let idx = 0; idx < 10; idx++) {
      const angle = fromA + (toA - fromA) * (idx / 9);
      const p0 = getCirclePt(angle);
      const p1 = sidePtsArr[9 - idx];

      const s0 = findTrackDist(trackPts, trackDists, p0, 0, 60);
      const s1 = findTrackDist(trackPts, trackDists, p1, diamondStartIndex, trackPts.length - 1);

      res.push({
        p0,
        p1,
        s0,
        s1,
        trackPts,
        trackDists,
        color,
        order,
        idx,
        isRight,
        isInnerRing,
      });
    }
  });
  return res;
}

// ── Позиции в Исходном состоянии (Рисунок 0, t = 0: 4 концентрических круга) ──
// 1-й круг: R = 10 (140 точек, полностью закрытый снизу)
// 2-й круг: R = 7 (100 точек: 50 слева, 50 справа) — ЗАКРЫТ СВЕРХУ 20 розово-серыми точками!
// 3-й круг: R = 4 (50 точек: 25 слева, 25 справа) — закрыт снизу
// 4-й круг: R = 1 (10 красных точек: 5 слева, 5 справа) — самый внутренний круг
function getCircleHalfPt(r: number, index: number, count: number, isRight: boolean): PP {
  // index = 0 (снизу) ... count - 1 (сверху)
  const a = isRight
    ? (Math.PI / 2 - Math.PI * (index + 0.5) / count)
    : (Math.PI / 2 + Math.PI * (index + 0.5) / count);
  return {
    x: CIRC_CX + r * Math.cos(a),
    y: CIRC_CY + r * Math.sin(a),
  };
}

// Внешний 2-й круг переходит во ВНУТРЕННИЙ ромб
// Внутренний 3-й круг переходит во ВНЕШНИЙ ромб
const rawDiamondDots = [
  ...buildDiamondGroup(true, false, rightInner), // 2nd Circle (Outer in circle) -> Inner Diamond
  ...buildDiamondGroup(true, true, rightOuter),  // 3rd Circle (Inner in circle) -> Outer Diamond
  ...buildDiamondGroup(false, false, leftInner), // 2nd Circle (Outer in circle) -> Inner Diamond
  ...buildDiamondGroup(false, true, leftOuter),  // 3rd Circle (Inner in circle) -> Outer Diamond
];

// ── Позиции в Коробке для 1-го Круга (4x35: колонки 18, 18.5, 19, 19.5, ряд 28) ──
const R1 = 10 * STEP; // R = 10 (240px)
const deltaS1 = (2 * Math.PI * R1) / 140; // Точная дистанция 1-го круга = 10.7714px
const yRow28 = gy(rowJ(28)); // Ряд 28 (296.0px)
const colOffsets1 = [18.0, 18.5, 19.0, 19.5];

// Точка захода 1-го круга: точно заданные SVG-координаты X: 1200.0px, Y: 607.3px
const trackX1 = 1200.0;
const entryY1 = 607.3;
const a_entry1 = Math.atan2(entryY1 - CIRC_CY, trackX1 - CIRC_CX);

// ── Позиции в Коробке для 2-го Круга (4x25 справа: 3.0, 2.5, 2.0, 1.5) ──
const R2 = 7 * STEP;
const deltaS = (2 * Math.PI * R2) / 100; // Точная дистанция между всеми участниками = 10.556px
const yRow27 = gy(rowJ(27)); // Ряд 27 сбоку

// Точка входа 2-го круга: точно заданные SVG-координаты X: 1127.9px, Y: 606.7px
const trackX = 1127.9;
const entryY = 606.7;
const a_entry = Math.atan2(entryY - CIRC_CY, trackX - CIRC_CX);

const colOffsets2 = [3.0, 2.5, 2.0, 1.5];

function getBoxPt(colRightOffset: number, k: number): PP {
  return {
    x: gx(colR(colRightOffset)),
    y: yRow27 - k * deltaS,
  };
}

// ── Позиции в Коробке для 3-го Круга (2x25 справа: 1.0 и 0.5) ──────────────
const R3 = 4 * STEP; // R = 4 (96px)
const deltaS3 = (2 * Math.PI * R3) / 50; // Точная дистанция 3-го круга = 12.064px

// Точка входа 3-го круга: строго координата 4:15 (колонка 4R, ряд 15)
const trackX3 = gx(colR(4.0));
const entryY3 = gy(rowJ(15.0));
const a_entry3 = 0; // Строго 3 часа на правом краю круга R=4

const colOffsets3 = [1.0, 0.5];

function getBoxPt3(colRightOffset: number, k: number): PP {
  return {
    x: gx(colR(colRightOffset)),
    y: yRow27 - k * deltaS3,
  };
}

// ── Позиции в Коробке для 4-го Круга (1x10 в колонке 0: 10 красных) ────────
const R4 = 1 * STEP; // R = 1 (24px)
const deltaS4 = (2 * Math.PI * R4) / 10; // Точная дистанция 4-го круга = 15.080px
const trackX4 = gx(colR(1.0)); // Правый край 4-го круга (976.0px)
const entryY4 = gy(rowJ(15.0)); // Ряд 15 (608.0px)
const a_entry4 = 0; // 3 часа (согласовано со 2-м и 3-м кругами)

function getBoxPt4(k: number): PP {
  return {
    x: CIRC_CX,
    y: yRow27 - k * deltaS4,
  };
}

const diamondDotsList: DiamondDot[] = rawDiamondDots.map(d => {
  let pInit: PP;
  if (!d.isInnerRing) {
    // 2-й круг (rightInner / leftInner) — 40 точек на 2-м круге R=7:
    if (d.color === GREEN) {
      pInit = getCircleHalfPt(7 * STEP, d.idx, 50, d.isRight);
    } else if (d.color === YELLOW) {
      pInit = getCircleHalfPt(7 * STEP, 10 + d.idx, 50, d.isRight);
    } else if (d.color === RED) {
      pInit = getCircleHalfPt(7 * STEP, 20 + d.idx, 50, d.isRight);
    } else if (d.color === PINK_GRAY) {
      pInit = getCircleHalfPt(7 * STEP, 30 + d.idx, 50, d.isRight);
    }
  } else {
    // 3-й круг (rightOuter / leftOuter):
    if (d.color === PINK_GRAY) {
      pInit = getCircleHalfPt(7 * STEP, 40 + d.idx, 50, d.isRight);
    } else if (d.color === GREEN) {
      pInit = getCircleHalfPt(4 * STEP, d.idx, 25, d.isRight);
    } else if (d.color === YELLOW) {
      pInit = getCircleHalfPt(4 * STEP, 10 + d.idx, 25, d.isRight);
    } else if (d.color === RED) {
      if (d.idx < 5) {
        pInit = getCircleHalfPt(4 * STEP, 20 + d.idx, 25, d.isRight);
      } else {
        pInit = getCircleHalfPt(1 * STEP, d.idx - 5, 5, d.isRight);
      }
    }
  }

const diamondDotsList: DiamondDot[] = rawDiamondDots.map(d => {
  let pInit: PP | undefined;
  if (!d.isInnerRing) {
    if (d.color === GREEN) {
      pInit = getCircleHalfPt(7 * STEP, d.idx, 50, d.isRight);
    } else if (d.color === YELLOW) {
      pInit = getCircleHalfPt(7 * STEP, 10 + d.idx, 50, d.isRight);
    } else if (d.color === RED) {
      pInit = getCircleHalfPt(7 * STEP, 20 + d.idx, 50, d.isRight);
    } else if (d.color === PINK_GRAY) {
      pInit = getCircleHalfPt(7 * STEP, 30 + d.idx, 50, d.isRight);
    }
  } else {
    if (d.color === PINK_GRAY) {
      pInit = getCircleHalfPt(7 * STEP, 40 + d.idx, 50, d.isRight);
    } else if (d.color === GREEN) {
      pInit = getCircleHalfPt(4 * STEP, d.idx, 25, d.isRight);
    } else if (d.color === YELLOW) {
      pInit = getCircleHalfPt(4 * STEP, 10 + d.idx, 25, d.isRight);
    } else if (d.color === RED) {
      if (d.idx < 5) {
        pInit = getCircleHalfPt(4 * STEP, 20 + d.idx, 25, d.isRight);
      } else {
        pInit = getCircleHalfPt(1 * STEP, d.idx - 5, 5, d.isRight);
      }
    }
  }
  return {
    ...d,
    pInit: pInit || d.p0,
  };
});

// ── Геометрическое распределение участников по кругам и коробкам ────────────
// Сохраняет подлинные координаты d.pInit (Рисунок 0) и обеспечивает 100% плавный переход в 2 круга (Рисунок 1)

// 2-й Круг (100 точек):
const circle2Dots = diamondDotsList.filter(d => !d.isInnerRing || (d.isInnerRing && d.color === PINK_GRAY));
circle2Dots.forEach(d => {
  d.circleNum = 2;
  const a = Math.atan2(d.pInit.y - CIRC_CY, d.pInit.x - CIRC_CX);
  let da = a - a_entry;
  while (da <= 0.0001) da += 2 * Math.PI;
  while (da > 2 * Math.PI) da -= 2 * Math.PI;
  d.da = da;
});
circle2Dots.sort((a, b) => (b.da || 0) - (a.da || 0));
circle2Dots.forEach((d, m) => {
  d.trainIdx = m;
  const c = Math.floor(m / 25); // 0..3 (колонки 3.0, 2.5, 2.0, 1.5)
  const k = m % 25; // 0..24
  d.pBox = getBoxPt(colOffsets2[c], k);
});

// 3-й Круг (50 точек):
const circle3Dots = diamondDotsList.filter(d => d.isInnerRing && (d.color === GREEN || d.color === YELLOW || (d.color === RED && d.idx < 5)));
circle3Dots.forEach(d => {
  d.circleNum = 3;
  const a = Math.atan2(d.pInit.y - CIRC_CY, d.pInit.x - CIRC_CX);
  let da = a - a_entry3;
  while (da <= 0.0001) da += 2 * Math.PI;
  while (da > 2 * Math.PI) da -= 2 * Math.PI;
  d.da = da;
});
circle3Dots.sort((a, b) => (b.da || 0) - (a.da || 0));
circle3Dots.forEach((d, m) => {
  d.trainIdx3 = m;
  const c = Math.floor(m / 25); // 0..1 (колонки 1.0, 0.5)
  const k = m % 25; // 0..24
  d.pBox3 = getBoxPt3(colOffsets3[c], k);
});

// 4-й Круг (10 точек):
const circle4Dots = diamondDotsList.filter(d => d.isInnerRing && d.color === RED && d.idx >= 5);
circle4Dots.forEach(d => {
  d.circleNum = 4;
  const a = Math.atan2(d.pInit.y - CIRC_CY, d.pInit.x - CIRC_CX);
  let da = a - a_entry4;
  while (da <= 0.0001) da += 2 * Math.PI;
  while (da > 2 * Math.PI) da -= 2 * Math.PI;
  d.da = da;
});
circle4Dots.sort((a, b) => (b.da || 0) - (a.da || 0));
circle4Dots.forEach((d, m) => {
  d.trainIdx4 = m;
  d.pBox4 = getBoxPt4(m);
});

// ── Позиции в Фигуре «Наушники» (переход 2:50..3:05, 80 точек слева, 80 точек справа) ──
// ЕДИНЫЕ НЕПРЕРЫВНЫЕ МАСТЕР-ДУГИ С ИДЕАЛЬНО РАВНОМЕРНЫМ ШАГОМ И ПОСТОЯННЫМ ЗАЗОРОМ 0.70
function buildHeadphoneGeometryApp() {
  const N = 1000;
  
  // 1. Внешний непрерывный контур (35 точек: 10 зеленых + 15 желтых + 10 красных)
  const outerPoly: { c: number; r: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let c: number, r: number;
    if (t <= 0.38) {
      const u = t / 0.38;
      const p0 = {c: 11.0, r: 7.0}, p1 = {c: 13.5, r: 7.7}, p2 = {c: 16.2, r: 7.3}, p3 = {c: 17.0, r: 5.8};
      const v = 1 - u;
      c = v*v*v*p0.c + 3*v*v*u*p1.c + 3*v*u*u*p2.c + u*u*u*p3.c;
      r = v*v*v*p0.r + 3*v*v*u*p1.r + 3*v*u*u*p2.r + u*u*u*p3.r;
    } else if (t <= 0.62) {
      const u = (t - 0.38) / 0.24;
      c = 17.0;
      r = 5.8 - (5.8 - 3.2) * u;
    } else {
      const u = (t - 0.62) / 0.38;
      const p0 = {c: 17.0, r: 3.2}, p1 = {c: 16.2, r: 1.7}, p2 = {c: 13.5, r: 1.3}, p3 = {c: 11.0, r: 2.0};
      const v = 1 - u;
      c = v*v*v*p0.c + 3*v*v*u*p1.c + 3*v*u*u*p2.c + u*u*u*p3.c;
      r = v*v*v*p0.r + 3*v*v*u*p1.r + 3*v*u*u*p2.r + u*u*u*p3.r;
    }
    outerPoly.push({ c, r });
  }

  const outerDists = [0];
  for (let i = 1; i < outerPoly.length; i++) {
    const dc = outerPoly[i].c - outerPoly[i-1].c;
    const dr = outerPoly[i].r - outerPoly[i-1].r;
    outerDists.push(outerDists[i-1] + Math.hypot(dc, dr));
  }
  const outerLen = outerDists[outerDists.length - 1];

  const outer35: { c: number; r: number }[] = [];
  for (let i = 0; i < 35; i++) {
    const targetDist = (i / 34) * outerLen;
    let low = 0, high = outerDists.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (outerDists[mid] <= targetDist) low = mid + 1;
      else high = mid - 1;
    }
    const idx = Math.max(0, high);
    const d0 = outerDists[idx];
    const d1 = outerDists[idx + 1] || d0;
    const frac = d1 > d0 ? (targetDist - d0) / (d1 - d0) : 0;
    const p0 = outerPoly[idx];
    const p1 = outerPoly[idx + 1] || p0;
    outer35.push({
      c: p0.c + (p1.c - p0.c) * frac,
      r: p0.r + (p1.r - p0.r) * frac
    });
  }

  // 2. Внутренний непрерывный контур (25 точек: 10 зеленых + 5 желтых + 10 красных)
  const innerPoly: { c: number; r: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let c: number, r: number;
    if (t <= 0.38) {
      const u = t / 0.38;
      const p0 = {c: 11.0, r: 6.3}, p1 = {c: 13.5, r: 7.0}, p2 = {c: 15.6, r: 6.7}, p3 = {c: 16.3, r: 6.0};
      const v = 1 - u;
      c = v*v*v*p0.c + 3*v*v*u*p1.c + 3*v*u*u*p2.c + u*u*u*p3.c;
      r = v*v*v*p0.r + 3*v*v*u*p1.r + 3*v*u*u*p2.r + u*u*u*p3.r;
    } else if (t <= 0.62) {
      const u = (t - 0.38) / 0.24;
      c = 16.3;
      r = 6.0 - (6.0 - 3.0) * u;
    } else {
      const u = (t - 0.62) / 0.38;
      const p0 = {c: 16.3, r: 3.0}, p1 = {c: 15.6, r: 2.3}, p2 = {c: 13.5, r: 2.0}, p3 = {c: 11.0, r: 2.7};
      const v = 1 - u;
      c = v*v*v*p0.c + 3*v*v*u*p1.c + 3*v*u*u*p2.c + u*u*u*p3.c;
      r = v*v*v*p0.r + 3*v*v*u*p1.r + 3*v*u*u*p2.r + u*u*u*p3.r;
    }
    innerPoly.push({ c, r });
  }

  const innerDists = [0];
  for (let i = 1; i < innerPoly.length; i++) {
    const dc = innerPoly[i].c - innerPoly[i-1].c;
    const dr = innerPoly[i].r - innerPoly[i-1].r;
    innerDists.push(innerDists[i-1] + Math.hypot(dc, dr));
  }
  const innerLen = innerDists[innerDists.length - 1];

  const inner25: { c: number; r: number }[] = [];
  for (let i = 0; i < 25; i++) {
    const targetDist = (i / 24) * innerLen;
    let low = 0, high = innerDists.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (innerDists[mid] <= targetDist) low = mid + 1;
      else high = mid - 1;
    }
    const idx = Math.max(0, high);
    const d0 = innerDists[idx];
    const d1 = innerDists[idx + 1] || d0;
    const frac = d1 > d0 ? (targetDist - d0) / (d1 - d0) : 0;
    const p0 = innerPoly[idx];
    const p1 = innerPoly[idx + 1] || p0;
    inner25.push({
      c: p0.c + (p1.c - p0.c) * frac,
      r: p0.r + (p1.r - p0.r) * frac
    });
  }

  return { outer35, inner25 };
}

const headphoneGeoApp = buildHeadphoneGeometryApp();

function getHeadphonePos(d: any) {
  const isRight = d.isRight;
  const isOuter = d.isInnerRing; // true = outer diamond, false = inner diamond
  const colFn = isRight ? colR : colL;
  const i = d.idx; // 0..9

  let c = 11.0, r = 5.0;
  if (d.color === GREEN) {
    if (isOuter) {
      // Внешняя зеленая дуга (10 точек, индексы 0..9 по внешнему контуру)
      const pt = headphoneGeoApp.outer35[i];
      c = pt.c;
      r = pt.r;
    } else {
      // Внутренняя зеленая дуга (10 точек, индексы 0..9 по внутреннему контуру)
      const pt = headphoneGeoApp.inner25[i];
      c = pt.c;
      r = pt.r;
    }
  } else if (d.color === YELLOW) {
    if (!isOuter) {
      if (i < 5) {
        // Внутренняя подушечка наушника (5 точек, индексы 10..14 по внутреннему контуру)
        const pt = headphoneGeoApp.inner25[10 + i];
        c = pt.c;
        r = pt.r;
      } else {
        // Нижняя часть внешней дуги (5 точек, индексы 20..24 по внешнему контуру)
        const pt = headphoneGeoApp.outer35[20 + (i - 5)];
        c = pt.c;
        r = pt.r;
      }
    } else {
      // Верхняя и средняя часть внешнего купола (10 точек, индексы 10..19 по внешнему контуру)
      const pt = headphoneGeoApp.outer35[10 + i];
      c = pt.c;
      r = pt.r;
    }
  } else if (d.color === RED) {
    if (isOuter) {
      // Внешняя красная дуга (10 точек, индексы 25..34 по внешнему контуру)
      const pt = headphoneGeoApp.outer35[25 + i];
      c = pt.c;
      r = pt.r;
    } else {
      // Внутренняя красная дуга (10 точек, индексы 15..24 по внутреннему контуру)
      const pt = headphoneGeoApp.inner25[15 + i];
      c = pt.c;
      r = pt.r;
    }
  } else if (d.color === PINK_GRAY) {
    // Двойная вертикальная стойка (колонки 12.8 и 13.5, постоянный зазор 0.70)
    if (isOuter) {
      c = 12.8;
      r = 2.8 + (6.2 - 2.8) * (i / 9);
    } else {
      c = 13.5;
      r = 2.8 + (6.2 - 2.8) * (i / 9);
    }
  }

  return {
    x: gx(colFn(c)),
    y: gy(rowJ(r)),
    defaultX: gx(colFn(c)),
    defaultY: gy(rowJ(r)),
  };
}

function makeHeadphoneTrackApp(pStart: PP, pEnd: PP, color: string, isInnerRing: boolean, isRight: boolean, idx: number) {
  const dx = pEnd.x - pStart.x;
  const dy = pEnd.y - pStart.y;
  
  let cp1 = { x: pStart.x + dx * 0.33, y: pStart.y + dy * 0.33 };
  let cp2 = { x: pEnd.x - dx * 0.33, y: pEnd.y - dy * 0.33 };

  if (color === RED) {
    // Красные: сразу делают шаг ВНИЗ И ВЛЕВО (в сторону центра поля), затем переходят в нижнюю дугу
    const stepDownY = isInnerRing ? 18 : 12;
    const stepLeftX = isRight ? -18 : 18;
    cp1 = {
      x: pStart.x + stepLeftX,
      y: pStart.y + stepDownY
    };
    cp2 = {
      x: pEnd.x + (isRight ? -8 : 8),
      y: pEnd.y + stepDownY * 0.35
    };
  } else if (color === GREEN) {
    // Зеленые: мягкая, плавная и красивая верхняя дуга
    const arcY = isInnerRing ? 16 : 10;
    cp1 = { x: pStart.x + dx * 0.35, y: pStart.y - arcY };
    cp2 = { x: pEnd.x - dx * 0.35, y: pEnd.y - arcY * 0.5 };
  } else if (color === YELLOW) {
    if (!isInnerRing && idx >= 5) {
      // 5 точек желтого внутреннего ромба: сразу делают шаг ВПРАВО И ВНИЗ, затем переходят во внешний купол
      const stepRightX = isRight ? 22 : -22;
      const stepDownY = 16;
      cp1 = {
        x: pStart.x + stepRightX,
        y: pStart.y + stepDownY
      };
      cp2 = {
        x: pEnd.x + (isRight ? 10 : -10),
        y: pEnd.y - 6
      };
    } else {
      // Остальные желтые точки купола и внутренней подушечки
      cp1 = { x: pStart.x + dx * 0.33, y: pStart.y + dy * 0.33 };
      cp2 = { x: pEnd.x - dx * 0.33, y: pEnd.y - dy * 0.33 };
    }
  } else if (color === PINK_GRAY) {
    // Розово-серые: мягкий прямой вход в вертикальные стойки
    cp1 = { x: pStart.x + dx * 0.35, y: pStart.y + dy * 0.25 };
    cp2 = { x: pEnd.x - dx * 0.25, y: pEnd.y - dy * 0.25 };
  }

  const pts: PP[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const v = 1 - t;
    const x = v*v*v*pStart.x + 3*v*v*t*cp1.x + 3*v*t*t*cp2.x + t*t*t*pEnd.x;
    const y = v*v*v*pStart.y + 3*v*v*t*cp1.y + 3*v*t*t*cp2.y + t*t*t*pEnd.y;
    pts.push({ x, y });
  }

  const dists: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    dists.push(dists[i-1] + Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y));
  }

  return { pts, dists, totalLen: dists[dists.length - 1] };
}

function updateDotHpTrackApp(d: any) {
  if (!d || !d.p1 || !d.pHeadphone) return;
  const tr = makeHeadphoneTrackApp(d.p1, d.pHeadphone, d.color, d.isInnerRing, d.isRight, d.idx);
  d.hpTrackPts = tr.pts;
  d.hpTrackDists = tr.dists;
  d.hpTotalLen = tr.totalLen;
}

diamondDotsList.forEach(d => {
  d.pHeadphone = getHeadphonePos(d);
  updateDotHpTrackApp(d);
});

function createCatmullRomSpline(controlPoints: PP[], numSamples = 300) {
  const pts: PP[] = [];
  const dists: number[] = [0];
  let totalD = 0;

  function catmullRom(p0: PP, p1: PP, p2: PP, p3: PP, t: number): PP {
    const t2 = t * t;
    const t3 = t2 * t;
    const x = 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    );
    const y = 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );
    return { x, y };
  }

  const numSegments = controlPoints.length - 3;
  const samplesPerSeg = Math.floor(numSamples / numSegments);

  for (let s = 0; s < numSegments; s++) {
    const p0 = controlPoints[s];
    const p1 = controlPoints[s + 1];
    const p2 = controlPoints[s + 2];
    const p3 = controlPoints[s + 3];

    const isLastSeg = (s === numSegments - 1);
    const count = isLastSeg ? (numSamples - s * samplesPerSeg) : samplesPerSeg;

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const pt = catmullRom(p0, p1, p2, p3, t);
      pts.push(pt);
      if (pts.length > 1) {
        const prev = pts[pts.length - 2];
        totalD += Math.hypot(pt.x - prev.x, pt.y - prev.y);
        dists.push(totalD);
      }
    }
  }
  const lastPt = controlPoints[controlPoints.length - 2];
  pts.push(lastPt);
  if (pts.length > 1) {
    const prev = pts[pts.length - 2];
    totalD += Math.hypot(lastPt.x - prev.x, lastPt.y - prev.y);
    dists.push(totalD);
  }

  return { trackPts: pts, trackDists: dists, totalLength: totalD };
}

interface Circle1Dot {
  idx: number;
  trainIdx: number;
  c: number;
  k: number;
  pBox: PP;
  pInit: PP;
  color: string;
  da?: number;
}

// ── Построение Единых Эталонных Траекторий (Single Master Tracks) ──────────
// 0. Внешняя дорожка — 1-й круг (Плавная мастер-дуга без волн от 18.0R до точки X: 1200.0px, Y: 607.3px)
const masterTrack1 = (() => {
  const x0 = gx(colR(18.0));
  const cp: PP[] = [
    { x: x0, y: yRow28 - 100 },
    { x: x0, y: yRow28 },
    { x: gx(colR(15.0)), y: gy(rowJ(23.0)) }, // Точка 15:23
    { x: gx(colR(12.2)), y: gy(rowJ(19.0)) }, // Точка 12.2:19
    { x: trackX1, y: entryY1 },               // Точка входа (1200.0, 607.3)
    { x: trackX1 - 20, y: entryY1 + 60 },
  ];
  return createCatmullRomSpline(cp);
})();

const baseCirc1Pts = openCircPts(CIRC_CX, CIRC_CY, CIRC_R, 140, 0);
const circle1DotsList: Circle1Dot[] = baseCirc1Pts.map((p, i) => {
  const a = Math.atan2(p.y - CIRC_CY, p.x - CIRC_CX);
  let da = a - a_entry1;
  while (da <= 0.0001) da += 2 * Math.PI;
  while (da > 2 * Math.PI) da -= 2 * Math.PI;
  return {
    idx: i,
    trainIdx: 0,
    c: 0,
    k: 0,
    pBox: { x: 0, y: 0 },
    pInit: p,
    da,
    color: BLACK_SQ,
  };
});
const sortedCirc1 = [...circle1DotsList].sort((a, b) => (b.da || 0) - (a.da || 0));
sortedCirc1.forEach((d, m) => {
  d.trainIdx = m;
  const c = Math.floor(m / 35);
  const k = m % 35;
  d.c = c;
  d.k = k;
  d.pBox = {
    x: gx(colR(colOffsets1[c])),
    y: yRow28 - k * deltaS1,
  };
});

const L_train_total1 = masterTrack1.totalLength + 140 * deltaS1;

// ── Последовательный марш 1-го круга (единой сплошной цепочкой из 140 человек) ──
function getCircle1EntrancePos(d: Circle1Dot, u: number): PP {
  const m = d.trainIdx; // 0..139
  const c = d.c; // 0..3 (колонка ожидания)
  const k = d.k; // 0..34 (позиция в колонке)

  const s_train = L_train_total1 * (u / (23.5 / 26.0));
  const s_col_start = c * 35 * deltaS1;

  if (s_train < s_col_start) return d.pBox;

  const d_col = s_train - s_col_start;
  const d_in_box = k * deltaS1;

  if (d_col < d_in_box) {
    const y = (yRow28 - d_in_box) + d_col;
    const xBox = gx(colR(colOffsets1[c]));
    const xMaster = gx(colR(18.0));
    // Плавный шаг в створ ведущей колонки 18R перед 28-м рядом:
    const distTo28 = yRow28 - y;
    const stepFrac = Math.min(1.0, Math.max(0, 1.0 - distTo28 / (1.5 * STEP)));
    const smooth = (1 - Math.cos(Math.PI * stepFrac)) / 2;
    const x = xBox + (xMaster - xBox) * smooth;
    return { x, y };
  }

  // Все 140 человек идут строго по единой мастер-дуге
  const s_on_arc = d_col - d_in_box;
  if (s_on_arc <= masterTrack1.totalLength) {
    return getPointAtDist(masterTrack1.trackPts, masterTrack1.trackDists, s_on_arc);
  }

  // Движение по 1-му кругу от точки 1200.0, 607.3 по часовой стрелке снизу
  const d_circ = s_on_arc - masterTrack1.totalLength;
  const d_circ_target = d.da !== undefined ? (d.da * R1) : ((140 - m) * deltaS1);

  if (d_circ >= d_circ_target) return d.pInit;

  const a = a_entry1 + d_circ / R1;
  return {
    x: CIRC_CX + R1 * Math.cos(a),
    y: CIRC_CY + R1 * Math.sin(a),
  };
}

// 1. Внешняя дорожка — 2-й круг (Мастер-дуга от колонки 3.0R)
const masterTrack2 = (() => {
  const x0 = gx(colR(3.0));
  const cp: PP[] = [
    { x: x0, y: yRow27 - 100 },
    { x: x0, y: yRow27 },
    { x: gx(colR(8.0)), y: gy(rowJ(23.0)) }, // Точка 8:23
    { x: gx(colR(9.0)), y: gy(rowJ(19.0)) }, // Точка 9:19
    { x: trackX, y: entryY },                // Точка входа (1127.9, 606.7)
    { x: trackX - 25, y: entryY + 60 },
  ];
  return createCatmullRomSpline(cp);
})();

// 2. Средняя дорожка — 3-й круг (Мастер-дуга от колонки 1.0R, ближе ко 2-му кругу)
const masterTrack3 = (() => {
  const x0 = gx(colR(1.0));
  const cp: PP[] = [
    { x: x0, y: yRow27 - 100 },
    { x: x0, y: yRow27 },
    { x: gx(colR(6.2)), y: gy(rowJ(23.0)) }, // Точка 6.2:23
    { x: gx(colR(7.2)), y: gy(rowJ(19.0)) }, // Точка 7.2:19
    { x: trackX3, y: entryY3 },              // Точка входа 4:15 (1048.0, 608.0)
    { x: trackX3 - 25, y: entryY3 + 60 },
  ];
  return createCatmullRomSpline(cp);
})();

// 3. Внутренняя дорожка — 4-й круг (Мастер-дуга от колонки 0, плотно прилегает к 3-му кругу)
const masterTrack4 = (() => {
  const x0 = CIRC_CX;
  const cp: PP[] = [
    { x: x0, y: yRow27 - 100 },
    { x: x0, y: yRow27 },
    { x: gx(colR(4.5)), y: gy(rowJ(23.0)) }, // Точка 4.5:23 (плотно и близко к 3-му кругу!)
    { x: gx(colR(5.5)), y: gy(rowJ(19.0)) }, // Точка 5.5:19
    { x: trackX4, y: entryY4 },              // Точка входа 1:15 (976.0, 608.0)
    { x: trackX4 - 20, y: entryY4 + 40 },
  ];
  return createCatmullRomSpline(cp);
})();

const L_train_total = masterTrack2.totalLength + 100 * deltaS;

// ── Последовательный марш 2-го круга (со смещением в строй первой колонки) ──
function getPerformerEntrancePos(d: DiamondDot, u: number): PP {
  if (d.trainIdx === undefined) return d.pInit;
  const m = d.trainIdx; // 0..99
  const c = Math.floor(m / 25); // 0..3 (колонка ожидания)
  const k = m % 25; // 0..24 (позиция в колонке)

  const s_train = L_train_total * (u / (23.5 / 26.0));
  const s_col_start = c * 25 * deltaS;

  if (s_train < s_col_start) return d.pBox;

  const d_col = s_train - s_col_start;
  const d_in_box = k * deltaS;

  if (d_col < d_in_box) {
    const y = (yRow27 - d_in_box) + d_col;
    const xBox = gx(colR(colOffsets2[c]));
    const xMaster = gx(colR(3.0));
    // Плавный шаг в сторону ведущей линии (3.0R) перед 27 рядом:
    const distTo27 = yRow27 - y;
    const stepFrac = Math.min(1.0, Math.max(0, 1.0 - distTo27 / (1.5 * STEP)));
    const smooth = (1 - Math.cos(Math.PI * stepFrac)) / 2;
    const x = xBox + (xMaster - xBox) * smooth;
    return { x, y };
  }

  // Все 100 человек идут строго по одной мастер-дуге с идеальным шагом deltaS
  const s_on_arc = d_col - d_in_box;
  if (s_on_arc <= masterTrack2.totalLength) {
    return getPointAtDist(masterTrack2.trackPts, masterTrack2.trackDists, s_on_arc);
  }

  // Движение по 2-му кругу
  const d_circ = s_on_arc - masterTrack2.totalLength;
  const d_circ_target = d.da !== undefined ? (d.da * R2) : ((100 - m) * deltaS);

  if (d_circ >= d_circ_target) {
    return d.pInit;
  }

  const a = a_entry + d_circ / R2;
  return {
    x: CIRC_CX + R2 * Math.cos(a),
    y: CIRC_CY + R2 * Math.sin(a),
  };
}

// ── Последовательный марш 3-го круга (со смещением в строй первой колонки) ──
function getPerformerEntrancePosCircle3(d: DiamondDot, u: number): PP {
  if (d.trainIdx3 === undefined) return d.pInit;
  const m = d.trainIdx3; // 0..49
  const c = Math.floor(m / 25); // 0..1
  const k = m % 25;

  const s_train = L_train_total * (u / (23.5 / 26.0));
  const s_col_start = c * 25 * deltaS3;

  if (s_train < s_col_start) return d.pBox3;

  const d_col = s_train - s_col_start;
  const d_in_box = k * deltaS3;

  if (d_col < d_in_box) {
    const y = (yRow27 - d_in_box) + d_col;
    const xBox = gx(colR(colOffsets3[c]));
    const xMaster = gx(colR(1.0));
    // Плавный шаг в сторону ведущей линии (1.0R) перед 27 рядом:
    const distTo27 = yRow27 - y;
    const stepFrac = Math.min(1.0, Math.max(0, 1.0 - distTo27 / (1.5 * STEP)));
    const smooth = (1 - Math.cos(Math.PI * stepFrac)) / 2;
    const x = xBox + (xMaster - xBox) * smooth;
    return { x, y };
  }

  const s_on_arc = d_col - d_in_box;
  if (s_on_arc <= masterTrack3.totalLength) {
    return getPointAtDist(masterTrack3.trackPts, masterTrack3.trackDists, s_on_arc);
  }

  // Движение по 3-му кругу
  const d_circ = s_on_arc - masterTrack3.totalLength;
  const d_circ_target = d.da !== undefined ? (d.da * R3) : ((50 - m) * deltaS3);

  if (d_circ >= d_circ_target) return d.pInit;

  const a = a_entry3 + d_circ / R3;
  return {
    x: CIRC_CX + R3 * Math.cos(a),
    y: CIRC_CY + R3 * Math.sin(a),
  };
}

// ── Последовательный марш 4-го круга ──
function getPerformerEntrancePosCircle4(d: DiamondDot, u: number): PP {
  if (d.trainIdx4 === undefined) return d.pInit;
  const m = d.trainIdx4; // 0..9

  const s_train = L_train_total * (u / (23.5 / 26.0));
  const d_in_box = m * deltaS4;

  if (s_train < d_in_box) {
    return { x: d.pBox4.x, y: (yRow27 - d_in_box) + s_train };
  }

  const s_on_arc = s_train - d_in_box;
  if (s_on_arc <= masterTrack4.totalLength) {
    return getPointAtDist(masterTrack4.trackPts, masterTrack4.trackDists, s_on_arc);
  }

  // Движение по 4-му кругу
  const d_circ = s_on_arc - masterTrack4.totalLength;
  const d_circ_target = d.da !== undefined ? (d.da * R4) : ((10 - m) * deltaS4);

  if (d_circ >= d_circ_target) return d.pInit;

  const a = a_entry4 + d_circ / R4;
  return {
    x: CIRC_CX + R4 * Math.cos(a),
    y: CIRC_CY + R4 * Math.sin(a),
  };
}

// Точный момент времени t, когда САМЫЙ ПОСЛЕДНИЙ участник полностью покидает ворота круга:
const T_ALL_EXIT = Math.max(...diamondDotsList.map(d => (d.trackDists[60 + 20] - d.s0) / (d.s1 - d.s0)));

// ── Diagonal Lines Geometry (State 1: 3 Lines vs State 2: 2 Lines) ──────────
const L1_S: PP = { x: gx(colL(25)), y: gy(rowJ(3)) }, L1_E: PP = { x: gx(colL(11)), y: gy(rowJ(18)) };
const L2_S: PP = { x: gx(colL(26)), y: gy(rowJ(3.5)) }, L2_E: PP = { x: gx(colL(12)), y: gy(rowJ(18.5)) };
const L3_S: PP = { x: gx(colL(27)), y: gy(rowJ(4)) }, L3_E: PP = { x: gx(colL(14)), y: gy(rowJ(18)) };

const R1_S: PP = { x: gx(colR(25)), y: gy(rowJ(3)) }, R1_E: PP = { x: gx(colR(11)), y: gy(rowJ(18)) };
const R2_S: PP = { x: gx(colR(26)), y: gy(rowJ(3.5)) }, R2_E: PP = { x: gx(colR(12)), y: gy(rowJ(18.5)) };
const R3_S: PP = { x: gx(colR(27)), y: gy(rowJ(4)) }, R3_E: PP = { x: gx(colR(14)), y: gy(rowJ(18)) };

// State 1 Points
const L1_pts_35 = linePts(L1_S, L1_E, 35);
const L2_pts_35 = linePts(L2_S, L2_E, 35);
const L3_pts_30 = linePts(L3_S, L3_E, 30);
const R1_pts_35 = linePts(R1_S, R1_E, 35);
const R2_pts_35 = linePts(R2_S, R2_E, 35);
const R3_pts_30 = linePts(R3_S, R3_E, 30);

// State 2 Points
const L1_pts_50 = linePts(L1_S, L1_E, 50);
const L2_pts_50 = linePts(L2_S, L2_E, 50);
const R1_pts_50 = linePts(R1_S, R1_E, 50);
const R2_pts_50 = linePts(R2_S, R2_E, 50);

// ── State 0 (3 Arcs / Semi-circles in Drawing 0):
// 1-й полукруг: 4:3.8 -> 11:16 (35 dots)
// 2-я линия/полукруг: 8:4 -> 13:16 (35 dots)
// 3-я линия/полукруг: 11:4.2 -> 15:15 (30 dots)
function createArcPoints(colStart: number, rowStart: number, colEnd: number, rowEnd: number, n: number, isRight: boolean): PP[] {
  const pStart = {
    x: isRight ? gx(colR(colStart)) : gx(colL(colStart)),
    y: gy(rowJ(rowStart)),
  };
  const pEnd = {
    x: isRight ? gx(colR(colEnd)) : gx(colL(colEnd)),
    y: gy(rowJ(rowEnd)),
  };

  const dxS = pStart.x - CIRC_CX;
  const dyS = pStart.y - CIRC_CY;
  const dxE = pEnd.x - CIRC_CX;
  const dyE = pEnd.y - CIRC_CY;

  let aS = Math.atan2(dyS, dxS);
  let aE = Math.atan2(dyE, dxE);

  if (!isRight) {
    // Для левой стороны дуга идет через левую часть (pi):
    if (aE < 0) aE += 2 * Math.PI;
  } else {
    // Для правой стороны дуга идет через правую часть (0):
    if (aS < 0) aS += 2 * Math.PI;
  }

  const rS = Math.hypot(dxS, dyS);
  const rE = Math.hypot(dxE, dyE);

  return Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1);
    const a = aS + (aE - aS) * u;
    const r = rS + (rE - rS) * u;
    return {
      x: CIRC_CX + r * Math.cos(a),
      y: CIRC_CY + r * Math.sin(a),
    };
  });
}

const Arc1_L_35 = createArcPoints(4, 3.8, 12, 16, 35, false);
const Arc2_L_35 = createArcPoints(8, 4.0, 14, 16, 35, false);
const Arc3_L_30 = createArcPoints(11, 4.2, 16, 15, 30, false);

const Arc1_R_35 = createArcPoints(4, 3.8, 12, 16, 35, true);
const Arc2_R_35 = createArcPoints(8, 4.0, 14, 16, 35, true);
const Arc3_R_30 = createArcPoints(11, 4.2, 16, 15, 30, true);

// ── Исходные входные линии в верхних углах поля ──────────────────────────────
// 1-я линия (35 точек): 18:27 -> 27:36, марширует прямо до 12:16, затем полукруг
// 2-я линия (35 точек): 19:27 -> 28:36, марширует прямо до 14:16, затем полукруг
// 3-я линия (30 точек): 20:27 -> 28:35, марширует прямо до 16:15, затем полукруг
function getEntranceLinePoint(lineNum: number, dotIdx: number, N: number, isRight: boolean, u: number): PP {
  let startCol: number, startRow: number, midCol: number, midRow: number, arcPts: PP[];
  if (lineNum === 1) {
    startCol = 27; startRow = 36;
    midCol = 18;   midRow = 27;
    arcPts = isRight ? Arc1_R_35 : Arc1_L_35;
  } else if (lineNum === 2) {
    startCol = 28; startRow = 36;
    midCol = 19;   midRow = 27;
    arcPts = isRight ? Arc2_R_35 : Arc2_L_35;
  } else {
    startCol = 28; startRow = 35;
    midCol = 20;   midRow = 27;
    arcPts = isRight ? Arc3_R_30 : Arc3_L_30;
  }

  const B = { x: gx(isRight ? colR(startCol) : colL(startCol)), y: gy(rowJ(startRow)) };
  const A = { x: gx(isRight ? colR(midCol) : colL(midCol)), y: gy(rowJ(midRow)) };
  const E = arcPts[arcPts.length - 1]; // Верхний анкер дуги

  const L_straight = Math.hypot(E.x - B.x, E.y - B.y);
  const L_BA = Math.hypot(A.x - B.x, A.y - B.y);

  const N_pts = arcPts.length;
  let L_arc = 0;
  const distFromTopArr = new Array(N_pts);
  distFromTopArr[N_pts - 1] = 0;
  for (let k = N_pts - 2; k >= 0; k--) {
    const d = Math.hypot(arcPts[k].x - arcPts[k+1].x, arcPts[k].y - arcPts[k+1].y);
    L_arc += d;
    distFromTopArr[k] = L_arc;
  }

  const fracInit = dotIdx / (N - 1);
  const s0 = L_BA * (1 - fracInit);
  const s1 = L_straight + distFromTopArr[dotIdx];

  // Линейный ход u: постоянная строевая скорость без разгона и замедления
  const sProgress = Math.max(0, Math.min(1, u));
  const curS = s0 + (s1 - s0) * sProgress;

  if (curS <= L_straight) {
    const ratio = L_straight === 0 ? 0 : curS / L_straight;
    return {
      x: B.x + (E.x - B.x) * ratio,
      y: B.y + (E.y - B.y) * ratio,
    };
  } else {
    const dArc = curS - L_straight;
    const targetD = Math.max(0, Math.min(L_arc, dArc));
    for (let k = N_pts - 2; k >= 0; k--) {
      if (targetD <= distFromTopArr[k]) {
        const dStart = distFromTopArr[k+1];
        const dEnd = distFromTopArr[k];
        const segLen = dEnd - dStart;
        const frac = segLen === 0 ? 0 : (targetD - dStart) / segLen;
        return {
          x: arcPts[k+1].x + (arcPts[k].x - arcPts[k+1].x) * frac,
          y: arcPts[k+1].y + (arcPts[k].y - arcPts[k+1].y) * frac,
        };
      }
    }
    return arcPts[0];
  }
}

type AnimatedDot = {
  lineNum: number;
  lineDotIdx: number;
  lineTotal: number;
  p0: PP;
  p1: PP;
  p2: PP;
  color: string;
  type: 'L1_top' | 'L2_cross' | 'L1_bot' | 'L3_march' | 'L2_bot';
  idx: number;
  total: number;
};

const dotsLeft: AnimatedDot[] = [
  // 1. Top 15 dots from Line 1
  ...L1_pts_35.slice(0, 15).map((p, i) => ({
    lineNum: 1, lineDotIdx: i, lineTotal: 35,
    p0: Arc1_L_35[i],
    p1: p,
    p2: L1_pts_50[2 * i],
    color: BLACK_SQ,
    type: 'L1_top' as const,
    idx: i,
    total: 15,
  })),
  // 2. Top 15 dots from Line 2
  ...L2_pts_35.slice(0, 15).map((p, i) => ({
    lineNum: 2, lineDotIdx: i, lineTotal: 35,
    p0: Arc2_L_35[i],
    p1: p,
    p2: L1_pts_50[2 * i + 1],
    color: BLACK_SQ,
    type: 'L2_cross' as const,
    idx: i,
    total: 15,
  })),
  // 3. Bottom 20 dots from Line 1
  ...L1_pts_35.slice(15).map((p, i) => ({
    lineNum: 1, lineDotIdx: 15 + i, lineTotal: 35,
    p0: Arc1_L_35[15 + i],
    p1: p,
    p2: L1_pts_50[30 + i],
    color: BLACK_SQ,
    type: 'L1_bot' as const,
    idx: i,
    total: 20,
  })),
  // 4. 30 purple dots from Line 3
  ...L3_pts_30.map((p, i) => ({
    lineNum: 3, lineDotIdx: i, lineTotal: 30,
    p0: Arc3_L_30[i],
    p1: p,
    p2: L2_pts_50[i],
    color: PURPLE,
    type: 'L3_march' as const,
    idx: i,
    total: 30,
  })),
  // 5. Bottom 20 black dots from Line 2
  ...L2_pts_35.slice(15).map((p, i) => ({
    lineNum: 2, lineDotIdx: 15 + i, lineTotal: 35,
    p0: Arc2_L_35[15 + i],
    p1: p,
    p2: L2_pts_50[30 + i],
    color: BLACK_SQ,
    type: 'L2_bot' as const,
    idx: i,
    total: 20,
  })),
];

const dotsRight: AnimatedDot[] = [
  // 1. Top 15 dots from Line 1
  ...R1_pts_35.slice(0, 15).map((p, i) => ({
    lineNum: 1, lineDotIdx: i, lineTotal: 35,
    p0: Arc1_R_35[i],
    p1: p,
    p2: R1_pts_50[2 * i],
    color: BLACK_SQ,
    type: 'L1_top' as const,
    idx: i,
    total: 15,
  })),
  // 2. Top 15 dots from Line 2
  ...R2_pts_35.slice(0, 15).map((p, i) => ({
    lineNum: 2, lineDotIdx: i, lineTotal: 35,
    p0: Arc2_R_35[i],
    p1: p,
    p2: R1_pts_50[2 * i + 1],
    color: BLACK_SQ,
    type: 'L2_cross' as const,
    idx: i,
    total: 15,
  })),
  // 3. Bottom 20 dots from Line 1
  ...R1_pts_35.slice(15).map((p, i) => ({
    lineNum: 1, lineDotIdx: 15 + i, lineTotal: 35,
    p0: Arc1_R_35[15 + i],
    p1: p,
    p2: R1_pts_50[30 + i],
    color: BLACK_SQ,
    type: 'L1_bot' as const,
    idx: i,
    total: 20,
  })),
  // 4. 30 purple dots from Line 3
  ...R3_pts_30.map((p, i) => ({
    lineNum: 3, lineDotIdx: i, lineTotal: 30,
    p0: Arc3_R_30[i],
    p1: p,
    p2: R2_pts_50[i],
    color: PURPLE,
    type: 'L3_march' as const,
    idx: i,
    total: 30,
  })),
  // 5. Bottom 20 black dots from Line 2
  ...R2_pts_35.slice(15).map((p, i) => ({
    lineNum: 2, lineDotIdx: 15 + i, lineTotal: 35,
    p0: Arc2_R_35[15 + i],
    p1: p,
    p2: R2_pts_50[30 + i],
    color: BLACK_SQ,
    type: 'L2_bot' as const,
    idx: i,
    total: 20,
  })),
];

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getRealisticCircleTransition(pInit: PP, pTarget: PP, t: number): PP {
  const dx0 = pInit.x - CIRC_CX;
  const dy0 = pInit.y - CIRC_CY;
  const dx1 = pTarget.x - CIRC_CX;
  const dy1 = pTarget.y - CIRC_CY;

  const r0 = Math.hypot(dx0, dy0);
  const r1 = Math.hypot(dx1, dy1);

  let a0 = Math.atan2(dy0, dx0);
  let a1 = Math.atan2(dy1, dx1);

  let da = a1 - a0;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;

  // 1) Сначала (t: 0..0.45): идут в сторону большого круга (радиальное расширение, освобождение дорожки)
  // 2) Затем (t: 0.25..1.0): маршируют навстречу друг другу по дуге окружности на свои точные места
  const sRadial = easeInOutCubic(Math.min(1, t / 0.50));
  const sAngular = easeInOutCubic(Math.max(0, (t - 0.25) / 0.75));

  const r = r0 + (r1 - r0) * sRadial;
  const a = a0 + da * sAngular;

  return {
    x: CIRC_CX + r * Math.cos(a),
    y: CIRC_CY + r * Math.sin(a),
  };
}

// ── Path Geometry for Purple Marching Column (Line 3 -> Turn -> Line 2) ─────
function getPathPos(P0: PP, P1: PP, P2: PP, P3: PP, d: number): PP {
  const L_3 = Math.hypot(P1.x - P0.x, P1.y - P0.y);
  const L_turn = Math.hypot(P2.x - P1.x, P2.y - P1.y);
  const L_2 = Math.hypot(P3.x - P2.x, P3.y - P2.y);

  if (d <= L_3) {
    const ratio = L_3 === 0 ? 0 : d / L_3;
    return {
      x: P0.x + (P1.x - P0.x) * ratio,
      y: P0.y + (P1.y - P0.y) * ratio,
    };
  } else if (d <= L_3 + L_turn) {
    const ratio = L_turn === 0 ? 0 : (d - L_3) / L_turn;
    return {
      x: P1.x + (P2.x - P1.x) * ratio,
      y: P1.y + (P2.y - P1.y) * ratio,
    };
  } else {
    const ratio = L_2 === 0 ? 0 : (d - L_3 - L_turn) / L_2;
    return {
      x: P2.x + (P3.x - P2.x) * ratio,
      y: P2.y + (P3.y - P2.y) * ratio,
    };
  }
}

const len_L3 = Math.hypot(L3_S.x - L3_E.x, L3_S.y - L3_E.y);
const len_L_turn = Math.hypot(L2_S.x - L3_S.x, L2_S.y - L3_S.y);
const len_L2 = Math.hypot(L2_E.x - L2_S.x, L2_E.y - L2_S.y);

const len_R3 = Math.hypot(R3_S.x - R3_E.x, R3_S.y - R3_E.y);
const len_R_turn = Math.hypot(R2_S.x - R3_S.x, R2_S.y - R3_S.y);
const len_R2 = Math.hypot(R2_E.x - R2_S.x, R2_E.y - R2_S.y);

// ── Realistic Human Footstep Cadence & Marching Dynamics Model ──────────────
function calcPersonPosition(d: AnimatedDot, t: number, isRight = false): PP {
  if (t <= 0) return { x: d.p1.x, y: d.p1.y };
  if (t >= 1) return { x: d.p2.x, y: d.p2.y };

  // 1. Organic micro-stagger along the marching column (natural human reaction time)
  const idx = d.idx || 0;
  const total = d.total || 30;
  const delay = (idx / total) * 0.04;
  const moveT = Math.max(0, Math.min(1, (t - delay) / (1 - 0.04)));

  // 2. Smooth ease-in-out base progression
  const s = easeInOutCubic(moveT);

  const dx = d.p2.x - d.p1.x;
  const dy = d.p2.y - d.p1.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 1.0) {
    return {
      x: d.p1.x + dx * s,
      y: d.p1.y + dy * s,
    };
  }

  // 3. Human marching footsteps (approx 12px per step)
  const numSteps = Math.max(3, Math.round(dist / 13));

  // Step-and-plant cadence (natural stride swing and foot strike rhythm)
  const stepModulation = (Math.sin(2 * Math.PI * numSteps * s) / (2 * Math.PI * numSteps)) * 0.36;
  const s_step = Math.max(0, Math.min(1, s - stepModulation));

  // Position along step progression
  let curX = d.p1.x + dx * s_step;
  let curY = d.p1.y + dy * s_step;

  // 4. Subtle human weight transfer (alternating left/right foot cadence)
  const nx = -dy / dist;
  const ny = dx / dist;
  const stepSway = Math.sin(Math.PI * numSteps * s) * 0.65 * Math.sin(Math.PI * s);

  curX += nx * stepSway;
  curY += ny * stepSway;

  return { x: curX, y: curY };
}

// ── Stage Component (Backdrop, Portal, Wings, and Green Runway) ────────────
const RED_ROCKS = [
  { pts: [[colL(19), rowJ(30)], [colL(17.5), rowJ(32.5)], [colL(16), rowJ(29)], [colL(18), rowJ(26)]], color: "#7F1D1D" },
  { pts: [[colL(19), rowJ(30)], [colL(17.5), rowJ(32.5)], [colL(16), rowJ(29)]], color: "#B91C1C" },
  { pts: [[colL(17.5), rowJ(32.5)], [colL(15), rowJ(33)], [colL(16), rowJ(29)]], color: "#DC2626" },
  { pts: [[colL(15), rowJ(33)], [colL(13.5), rowJ(30.5)], [colL(16), rowJ(29)]], color: "#EF4444" },
  { pts: [[colL(16), rowJ(29)], [colL(13.5), rowJ(30.5)], [colL(14.5), rowJ(26)]], color: "#B91C1C" },
  { pts: [[colL(18), rowJ(26)], [colL(16), rowJ(29)], [colL(14.5), rowJ(26)]], color: "#991B1B" },
  { pts: [[colL(15), rowJ(33)], [colL(12), rowJ(33.5)], [colL(13.5), rowJ(30.5)]], color: "#DC2626" },
  { pts: [[colL(13.5), rowJ(30.5)], [colL(12), rowJ(33.5)], [colL(10.5), rowJ(31)]], color: "#F87171" },
  { pts: [[colL(13.5), rowJ(30.5)], [colL(10.5), rowJ(31)], [colL(12), rowJ(27)]], color: "#991B1B" },
  { pts: [[colL(14.5), rowJ(26)], [colL(13.5), rowJ(30.5)], [colL(12), rowJ(27)]], color: "#7F1D1D" },
  { pts: [[colL(14.5), rowJ(26)], [colL(12), rowJ(27)], [colL(9.5), rowJ(27.5)]], color: "#881337" },
  { pts: [[colL(12), rowJ(33.5)], [colL(9), rowJ(34)], [colL(10.5), rowJ(31)]], color: "#DC2626" },
  { pts: [[colL(10.5), rowJ(31)], [colL(9), rowJ(34)], [colL(7.5), rowJ(31.5)]], color: "#EF4444" },
  { pts: [[colL(10.5), rowJ(31)], [colL(7.5), rowJ(31.5)], [colL(9.5), rowJ(27.5)]], color: "#B91C1C" },
  { pts: [[colL(12), rowJ(27)], [colL(10.5), rowJ(31)], [colL(9.5), rowJ(27.5)]], color: "#991B1B" },
  { pts: [[colL(9), rowJ(34)], [colL(6.5), rowJ(34)], [colL(7.5), rowJ(31.5)]], color: "#DC2626" },
  { pts: [[colL(7.5), rowJ(31.5)], [colL(6.5), rowJ(34)], [colL(6.5), rowJ(30)]], color: "#B91C1C" },
  { pts: [[colL(7.5), rowJ(31.5)], [colL(6.5), rowJ(30)], [colL(9.5), rowJ(27.5)]], color: "#991B1B" },
  { pts: [[colL(9.5), rowJ(27.5)], [colL(6.5), rowJ(30)], [colL(6.5), rowJ(28.5)]], color: "#7F1D1D" },
  { pts: [[colL(9.5), rowJ(27.5)], [colL(6.5), rowJ(28.5)], [colL(6.5), rowJ(25.5)]], color: "#991B1B" },
  { pts: [[colL(14.5), rowJ(26)], [colL(9.5), rowJ(27.5)], [colL(11), rowJ(24.5)]], color: "#7F1D1D" },
];

const CENTER_ROCKS = [
  { pts: [[colL(6.5), rowJ(34)], [colL(4.5), rowJ(34)], [colL(5.5), rowJ(32)]], color: "#DC2626", stroke: "#450A0A" },
  { pts: [[colL(6.5), rowJ(34)], [colL(5.5), rowJ(32)], [colL(6.5), rowJ(30)]], color: "#B91C1C", stroke: "#450A0A" },
  { pts: [[colL(5.5), rowJ(32)], [colL(4.5), rowJ(34)], [colL(3.5), rowJ(32.5)]], color: "#EF4444", stroke: "#450A0A" },
  { pts: [[colL(5.5), rowJ(32)], [colL(3.5), rowJ(32.5)], [colL(4.5), rowJ(30.5)]], color: "#991B1B", stroke: "#450A0A" },
  { pts: [[colL(5.5), rowJ(32)], [colL(6.5), rowJ(30)], [colL(4.5), rowJ(30.5)]], color: "#DC2626", stroke: "#450A0A" },
  { pts: [[colL(4.5), rowJ(34)], [colL(2), rowJ(34)], [colL(3.5), rowJ(32.5)]], color: "#B91C1C", stroke: "#450A0A" },
  { pts: [[colL(3.5), rowJ(32.5)], [colL(2), rowJ(34)], [colL(1.5), rowJ(32)]], color: "#EF4444", stroke: "#450A0A" },
  { pts: [[colL(3.5), rowJ(32.5)], [colL(1.5), rowJ(32)], [colL(4.5), rowJ(30.5)]], color: "#DC2626", stroke: "#450A0A" },
  { pts: [[colL(6.5), rowJ(30)], [colL(4.5), rowJ(30.5)], [colL(6.5), rowJ(28.5)]], color: "#991B1B", stroke: "#450A0A" },
  { pts: [[colL(4.5), rowJ(30.5)], [colL(6.5), rowJ(28.5)], [colL(4), rowJ(28.5)]], color: "#7F1D1D", stroke: "#450A0A" },
  { pts: [[colL(6.5), rowJ(28.5)], [colL(6.5), rowJ(25.5)], [colL(4), rowJ(27)]], color: "#991B1B", stroke: "#450A0A" },
  { pts: [[colL(6.5), rowJ(28.5)], [colL(4), rowJ(28.5)], [colL(4), rowJ(27)]], color: "#7F1D1D", stroke: "#450A0A" },
  { pts: [[colL(6.5), rowJ(25.5)], [colL(4), rowJ(27)], [colL(3.5), rowJ(25.8)]], color: "#B91C1C", stroke: "#450A0A" },
  { pts: [[colL(4), rowJ(28.5)], [colL(2), rowJ(29.5)], [colL(4), rowJ(27)]], color: "#991B1B", stroke: "#450A0A" },

  { pts: [[colR(2), rowJ(34)], [colR(4.5), rowJ(34)], [colR(3.5), rowJ(32.5)]], color: "#EA580C", stroke: "#7C2D12" },
  { pts: [[colR(3.5), rowJ(32.5)], [colR(4.5), rowJ(34)], [colR(4.5), rowJ(32)]], color: "#F97316", stroke: "#7C2D12" },
  { pts: [[colR(3.5), rowJ(32.5)], [colR(4.5), rowJ(32)], [colR(5.5), rowJ(32)]], color: "#FB923C", stroke: "#7C2D12" },
  { pts: [[colR(3.5), rowJ(32.5)], [colR(5.5), rowJ(32)], [colR(2.5), rowJ(30.5)]], color: "#D97706", stroke: "#7C2D12" },
  { pts: [[colR(5.5), rowJ(32)], [colR(6.5), rowJ(29)], [colR(2.5), rowJ(30.5)]], color: "#F59E0B", stroke: "#7C2D12" },
  { pts: [[colR(2.5), rowJ(30.5)], [colR(6.5), rowJ(29)], [colR(4.5), rowJ(28.5)]], color: "#EA580C", stroke: "#7C2D12" },
  { pts: [[colR(6.5), rowJ(29)], [colR(7.5), rowJ(26.5)], [colR(4.5), rowJ(28.5)]], color: "#C2410C", stroke: "#7C2D12" },

  { pts: [[colL(2), rowJ(34)], [colL(0), rowJ(34)], [colL(1.5), rowJ(32)]], color: "#15803D", stroke: "#15803D" },
  { pts: [[colL(1.5), rowJ(32)], [colL(0), rowJ(34)], [colL(0), rowJ(31.5)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colL(1.5), rowJ(32)], [colL(0), rowJ(31.5)], [colL(4.5), rowJ(30.5)]], color: "#16A34A", stroke: "#15803D" },
  { pts: [[colR(0), rowJ(34)], [colR(2), rowJ(34)], [colR(1.5), rowJ(32)]], color: "#15803D", stroke: "#15803D" },
  { pts: [[colR(0), rowJ(34)], [colR(1.5), rowJ(32)], [colR(0), rowJ(31.5)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colR(1.5), rowJ(32)], [colR(2), rowJ(34)], [colR(3.5), rowJ(32.5)]], color: "#16A34A", stroke: "#15803D" },
  { pts: [[colR(1.5), rowJ(32)], [colR(3.5), rowJ(32.5)], [colR(2.5), rowJ(30.5)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colR(0), rowJ(31.5)], [colR(1.5), rowJ(32)], [colR(2.5), rowJ(30.5)]], color: "#15803D", stroke: "#15803D" },

  { pts: [[colR(7.5), rowJ(26.5)], [colR(4.5), rowJ(28.5)], [colR(4), rowJ(27)]], color: "#22C55E", stroke: "#15803D" },

  { pts: [[colL(4.5), rowJ(30.5)], [colL(0), rowJ(31.5)], [colL(2), rowJ(29.5)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colL(4.5), rowJ(30.5)], [colL(2), rowJ(29.5)], [colL(4), rowJ(28.5)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colL(0), rowJ(31.5)], [colR(2.5), rowJ(30.5)], [colL(0), rowJ(29)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colL(0), rowJ(31.5)], [colL(0), rowJ(29)], [colL(2), rowJ(29.5)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colR(2.5), rowJ(30.5)], [colR(4.5), rowJ(28.5)], [colR(2), rowJ(29)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colR(2.5), rowJ(30.5)], [colR(2), rowJ(29)], [colL(0), rowJ(29)]], color: "#22C55E", stroke: "#15803D" },

  { pts: [[colL(2), rowJ(29.5)], [colL(0), rowJ(29)], [colL(2), rowJ(27)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colL(2), rowJ(29.5)], [colL(4), rowJ(27)], [colL(2), rowJ(27)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colL(4), rowJ(27)], [colL(2), rowJ(27)], [colL(3.5), rowJ(25.8)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colL(2), rowJ(27)], [colL(1.8), rowJ(25.8)], [colL(3.5), rowJ(25.8)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colL(0), rowJ(29)], [colL(2), rowJ(27)], [colL(1.8), rowJ(25.8)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colL(0), rowJ(29)], [colL(1.8), rowJ(25.8)], [colR(1.8), rowJ(25.8)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colL(0), rowJ(29)], [colR(1.8), rowJ(25.8)], [colR(2), rowJ(27)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colL(0), rowJ(29)], [colR(2), rowJ(27)], [colR(2), rowJ(29)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colR(2), rowJ(29)], [colR(4.5), rowJ(28.5)], [colR(4), rowJ(27)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colR(2), rowJ(29)], [colR(4), rowJ(27)], [colR(2), rowJ(27)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colR(2), rowJ(27)], [colR(4), rowJ(27)], [colR(3.5), rowJ(25.8)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colR(2), rowJ(27)], [colR(3.5), rowJ(25.8)], [colR(1.8), rowJ(25.8)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colR(7.5), rowJ(26.5)], [colR(4), rowJ(27)], [colR(5.5), rowJ(25.8)]], color: "#22C55E", stroke: "#15803D" },
  { pts: [[colR(4), rowJ(27)], [colR(3.5), rowJ(25.8)], [colR(5.5), rowJ(25.8)]], color: "#22C55E", stroke: "#15803D" },
];

const ORANGE_ROCKS = [
  { pts: [[colR(4.5), rowJ(34)], [colR(7), rowJ(34)], [colR(5.5), rowJ(32)]], color: "#EA580C" },
  { pts: [[colR(5.5), rowJ(32)], [colR(7), rowJ(34)], [colR(7.5), rowJ(31.5)]], color: "#F97316" },
  { pts: [[colR(4.5), rowJ(34)], [colR(5.5), rowJ(32)], [colR(4.5), rowJ(32)]], color: "#C2410C" },
  { pts: [[colR(7), rowJ(34)], [colR(9.5), rowJ(33.5)], [colR(7.5), rowJ(31.5)]], color: "#FB923C" },
  { pts: [[colR(7.5), rowJ(31.5)], [colR(9.5), rowJ(33.5)], [colR(10), rowJ(31)]], color: "#F59E0B" },
  { pts: [[colR(5.5), rowJ(32)], [colR(7.5), rowJ(31.5)], [colR(6.5), rowJ(29)]], color: "#D97706" },
  { pts: [[colR(7.5), rowJ(31.5)], [colR(10), rowJ(31)], [colR(9), rowJ(28.5)]], color: "#F59E0B" },
  { pts: [[colR(6.5), rowJ(29)], [colR(7.5), rowJ(31.5)], [colR(9), rowJ(28.5)]], color: "#B45309" },
  { pts: [[colR(6.5), rowJ(29)], [colR(9), rowJ(28.5)], [colR(7.5), rowJ(26.5)]], color: "#C2410C" },
  { pts: [[colR(9.5), rowJ(33.5)], [colR(12.5), rowJ(33)], [colR(10), rowJ(31)]], color: "#EA580C" },
  { pts: [[colR(10), rowJ(31)], [colR(12.5), rowJ(33)], [colR(12), rowJ(30)]], color: "#F97316" },
  { pts: [[colR(10), rowJ(31)], [colR(12), rowJ(30)], [colR(9), rowJ(28.5)]], color: "#D97706" },
  { pts: [[colR(9), rowJ(28.5)], [colR(12), rowJ(30)], [colR(11.5), rowJ(27)]], color: "#B45309" },
  { pts: [[colR(12.5), rowJ(33)], [colR(15), rowJ(32)], [colR(12), rowJ(30)]], color: "#DC2626" },
  { pts: [[colR(12), rowJ(30)], [colR(15), rowJ(32)], [colR(14.5), rowJ(29)]], color: "#EA580C" },
  { pts: [[colR(12), rowJ(30)], [colR(14.5), rowJ(29)], [colR(11.5), rowJ(27)]], color: "#C2410C" },
  { pts: [[colR(15), rowJ(32)], [colR(17), rowJ(30)], [colR(14.5), rowJ(29)]], color: "#B91C1C" },
  { pts: [[colR(14.5), rowJ(29)], [colR(17), rowJ(30)], [colR(16), rowJ(27)]], color: "#991B1B" },
  { pts: [[colR(11.5), rowJ(27)], [colR(14.5), rowJ(29)], [colR(16), rowJ(27)]], color: "#7F1D1D" },
];

function Stage() {
  return (
    <g id="stage-backdrop">
      <g id="rock-facets">
        {RED_ROCKS.map((f, i) => (
          <polygon
            key={`red-f-${i}`}
            points={f.pts.map(([c, r]) => `${gx(c)},${gy(r)}`).join(" ")}
            fill={f.color}
            stroke="#450A0A"
            strokeWidth={0.7}
          />
        ))}

        {CENTER_ROCKS.map((f, i) => (
          <polygon
            key={`center-f-${i}`}
            points={f.pts.map(([c, r]) => `${gx(c)},${gy(r)}`).join(" ")}
            fill={f.color}
            stroke={f.stroke}
            strokeWidth={0.8}
          />
        ))}

        {ORANGE_ROCKS.map((f, i) => (
          <polygon
            key={`orange-f-${i}`}
            points={f.pts.map(([c, r]) => `${gx(c)},${gy(r)}`).join(" ")}
            fill={f.color}
            stroke="#7C2D12"
            strokeWidth={0.7}
          />
        ))}
      </g>

      {/* Stage Backdrop Portal & Wings */}
      <rect x={gx(colL(6.5))} y={gy(rowJ(37))} width={13 * STEP} height={0.7 * STEP} fill="#8D5B4C" stroke="#5C3326" strokeWidth={1.5} />
      <rect x={gx(colL(6.5))} y={gy(rowJ(37))} width={1.2 * STEP} height={3.5 * STEP} fill="#8D5B4C" stroke="#5C3326" strokeWidth={1.5} />
      <rect x={gx(colR(5.3))} y={gy(rowJ(37))} width={1.2 * STEP} height={3.5 * STEP} fill="#8D5B4C" stroke="#5C3326" strokeWidth={1.5} />
      <polygon
        points={`${gx(colL(4.5))},${gy(rowJ(37))} ${gx(colL(3.5))},${gy(rowJ(38.2))} ${gx(colR(3.5))},${gy(rowJ(38.2))} ${gx(colR(4.5))},${gy(rowJ(37))}`}
        fill="#744436" stroke="#5C3326" strokeWidth={1.5}
      />

      <polygon
        points={`${gx(colL(6.5))},${gy(rowJ(33))} ${gx(colL(6.5))},${gy(rowJ(36))} ${gx(colL(17))},${gy(rowJ(37.5))} ${gx(colL(17))},${gy(rowJ(34.5))}`}
        fill="#1E3A8A" stroke="#172554" strokeWidth={1.5}
      />
      <polygon
        points={`${gx(colL(17))},${gy(rowJ(34.5))} ${gx(colL(17))},${gy(rowJ(37.5))} ${gx(colL(17.6))},${gy(rowJ(38.5))} ${gx(colL(17.6))},${gy(rowJ(35.5))}`}
        fill="#172554" stroke="#0F172A" strokeWidth={1}
      />
      {[34.8, 35.5, 36.2, 36.9].map((lvl, idx) => (
        <line
          key={`lw-line-${idx}`}
          x1={gx(colL(6.5))} y1={gy(rowJ(lvl - 1.2))}
          x2={gx(colL(17))} y2={gy(rowJ(lvl))}
          stroke="#3B82F6" strokeWidth={0.8} opacity={0.6}
        />
      ))}

      <polygon
        points={`${gx(colR(6.5))},${gy(rowJ(33))} ${gx(colR(6.5))},${gy(rowJ(36))} ${gx(colR(17))},${gy(rowJ(37.5))} ${gx(colR(17))},${gy(rowJ(34.5))}`}
        fill="#1E3A8A" stroke="#172554" strokeWidth={1.5}
      />
      <polygon
        points={`${gx(colR(17))},${gy(rowJ(34.5))} ${gx(colR(17))},${gy(rowJ(37.5))} ${gx(colR(17.6))},${gy(rowJ(38.5))} ${gx(colR(17.6))},${gy(rowJ(35.5))}`}
        fill="#172554" stroke="#0F172A" strokeWidth={1}
      />
      {[34.8, 35.5, 36.2, 36.9].map((lvl, idx) => (
        <line
          key={`rw-line-${idx}`}
          x1={gx(colR(6.5))} y1={gy(rowJ(lvl - 1.2))}
          x2={gx(colR(17))} y2={gy(rowJ(lvl))}
          stroke="#3B82F6" strokeWidth={0.8} opacity={0.6}
        />
      ))}

      <rect x={gx(colL(6.5))} y={gy(rowJ(35.5))} width={13 * STEP} height={2.5 * STEP} fill="#9333EA" stroke="#581C87" strokeWidth={2} />
      {[35.0, 34.5, 34.0, 33.5].map((lvl, idx) => (
        <line
          key={`pp-line-${idx}`}
          x1={gx(colL(6.5))} y1={gy(rowJ(lvl))}
          x2={gx(colR(6.5))} y2={gy(rowJ(lvl))}
          stroke="#A855F7" strokeWidth={1} opacity={0.5}
        />
      ))}
    </g>
  );
}



function getColorName(hex?: string) {
  if (!hex) return "Черный";
  const h = hex.toLowerCase();
  if (h === '#dc2626' || h === '#ef4444' || h === '#b91c1c' || h === '#991b1b' || h === '#7f1d1d') return 'Красный';
  if (h === '#ea580c' || h === '#f97316' || h === '#fb923c' || h === '#d97706') return 'Оранжевый';
  if (h === '#16a34a' || h === '#22c55e' || h === '#15803d') return 'Зеленый';
  if (h === '#f472b6' || h === '#e2e8f0') return 'Розово-серый';
  if (h === '#eab308' || h === '#f59e0b') return 'Желтый / Оранжевый';
  if (h === '#9333ea' || h === '#a855f7' || h === '#c084fc') return 'Фиолетовый';
  if (h === '#3b82f6' || h === '#60a5fa' || h === '#1d4ed8') return 'Синий';
  return 'Черный';
}

function getFieldGridCoords(x: number, y: number) {
  const colFloat = (x - FX) / STEP - (COLS / 2);
  let colStr = "";
  if (Math.abs(colFloat) < 0.05) {
    colStr = "0 (Центр)";
  } else if (colFloat > 0) {
    colStr = colFloat.toFixed(1).replace(/\.0$/, '') + "R (справа)";
  } else {
    colStr = Math.abs(colFloat).toFixed(1).replace(/\.0$/, '') + "L (слева)";
  }

  const rowFloat = (FY + ROWS * STEP - y) / STEP;
  const rowStr = rowFloat.toFixed(1).replace(/\.0$/, '');

  return {
    colStr,
    rowStr,
    svgX: x.toFixed(1),
    svgY: y.toFixed(1),
  };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function App() {
  const [t, setT] = useState(0.0); // Default to Drawing 0 (Все стоят в коробках ожидания, остановлено)
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedDot, setSelectedDot] = useState<{ group: string; idx: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animReqRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());

  const colLabels = useMemo(() =>
    Array.from({ length: COLS + 1 }, (_, i) => ({
      x: FX + i * STEP,
      text: String(Math.abs(i - COLS / 2)),
    })), []
  );

  const rowLabels = useMemo(() =>
    Array.from({ length: ROWS }, (_, j) => ({
      y: FY + j * STEP,
      text: String(ROWS - j),
    })), []
  );

  const dots = useMemo(() => {
    const pts: PP[] = [];
    for (let j = 0; j <= ROWS; j++)
      for (let i = 0; i <= COLS; i++)
        pts.push({ x: FX + i * STEP, y: FY + j * STEP });
    return pts;
  }, []);

  const circleDots = useMemo(() => {
    const tSec = t * 185.0;
    if (tSec < 34.5) {
      return circle1DotsList.map(d => d.pBox);
    }
    if (tSec <= 60.0) {
      const u = (tSec - 34.5) / 25.5;
      return circle1DotsList.map(d => getCircle1EntrancePos(d, u));
    }
    if (tSec <= 120.0) {
      return circle1DotsList.map(d => d.pInit);
    }
    let openCols: number;
    if (tSec < 134.0) {
      const u = (tSec - 120.0) / 14.0;
      openCols = 2 * easeInOutCubic(u);
    } else if (tSec < 165.0) {
      const diamondT = (tSec - 134.0) / 31.0;
      const closeT = Math.max(0, Math.min(1, (diamondT - T_ALL_EXIT) / 0.04));
      openCols = 2 * (1 - closeT);
    } else {
      openCols = 0; // Закрыт
    }
    return openCircPts(CIRC_CX, CIRC_CY, CIRC_R, 140, openCols);
  }, [t]);

  // Complete 185-Second Choreography Animation Loop (3:05 total) with Audio Sync
  useEffect(() => {
    if (!isPlaying) {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      return;
    }

    if (audioRef.current) {
      audioRef.current.currentTime = t * 185.0;
      audioRef.current.play().catch(e => console.log('Audio playback notification:', e));
    }

    lastTimeRef.current = performance.now();
    const TOTAL_DURATION = 185000; // 185 секунд (3:05)

    const step = (now: number) => {
      const audio = audioRef.current;
      if (audio && !audio.paused && !audio.ended && audio.duration > 0) {
        setT(Math.min(1.0, audio.currentTime / 185.0));
      } else {
        const dt = now - lastTimeRef.current;
        setT((prevT) => {
          let nextT = prevT + (dt / TOTAL_DURATION);
          if (nextT >= 1.0) {
            nextT = 1.0;
            setIsPlaying(false);
          }
          return nextT;
        });
      }
      lastTimeRef.current = now;

      animReqRef.current = requestAnimationFrame(step);
    };

    animReqRef.current = requestAnimationFrame(step);
    return () => {
      if (animReqRef.current) cancelAnimationFrame(animReqRef.current);
    };
  }, [isPlaying]);

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSetMode = (targetT: number) => {
    setIsPlaying(false);
    setT(targetT);
    if (audioRef.current) {
      audioRef.current.currentTime = targetT * 185.0;
    }
  };

  const handleSliderChange = (val: number) => {
    setIsPlaying(false);
    const targetT = val / 1850;
    setT(targetT);
    if (audioRef.current) {
      audioRef.current.currentTime = targetT * 185.0;
    }
  };

  const tSec = t * 185.0;
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  };

  const handleDotClick = (group: string, idx: number) => {
    setSelectedDot({ group, idx });
  };

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<{
    isDown: boolean;
    isDragging: boolean;
    dragDotIdx: number | null;
    startPt: { x: number; y: number };
    offset: { x: number; y: number };
  }>({
    isDown: false,
    isDragging: false,
    dragDotIdx: null,
    startPt: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
  });

  const getSvgPointFromEvent = (e: React.PointerEvent | PointerEvent, svgElem: SVGSVGElement | null) => {
    if (!svgElem) return { x: 0, y: 0 };
    const rect = svgElem.getBoundingClientRect();
    const scaleX = SVG_W / rect.width;
    const scaleY = SVG_H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const onNudgeDot = (dxSteps: number, dySteps: number) => {
    if (!selectedDot || selectedDot.group !== "diamond") return;
    const d = diamondDotsList[selectedDot.idx];
    if (d && d.pHeadphone) {
      d.pHeadphone.x += dxSteps * 6;
      d.pHeadphone.y += dySteps * 6;
      updateDotHpTrackApp(d);
      setT(prev => prev); // force rerender
    }
  };

  // Keyboard Arrow Keys Support (▲ ▼ ◀ ▶)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedDot || selectedDot.group !== "diamond") return;
      if (tSec < 184.0) return;
      if (e.key === "ArrowUp") { onNudgeDot(0, -1); e.preventDefault(); }
      else if (e.key === "ArrowDown") { onNudgeDot(0, 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { onNudgeDot(-1, 0); e.preventDefault(); }
      else if (e.key === "ArrowRight") { onNudgeDot(1, 0); e.preventDefault(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedDot, tSec]);

  const onResetSelectedDot = () => {
    if (!selectedDot || selectedDot.group !== "diamond") return;
    const d = diamondDotsList[selectedDot.idx];
    if (d && d.pHeadphone) {
      d.pHeadphone.x = d.pHeadphone.defaultX;
      d.pHeadphone.y = d.pHeadphone.defaultY;
      updateDotHpTrackApp(d);
      setT(prev => prev);
      showToast("↩️ Позиция точки сброшена!");
    }
  };

  const onResetAllHeadphones = () => {
    diamondDotsList.forEach(d => {
      if (d && d.pHeadphone) {
        d.pHeadphone.x = d.pHeadphone.defaultX;
        d.pHeadphone.y = d.pHeadphone.defaultY;
        updateDotHpTrackApp(d);
      }
    });
    setT(prev => prev);
    showToast("♻️ Все точки наушников сброшены!");
  };

  return (
    <div style={{
      width: "100vw", height: "100vh", background: "#090a0f",
      display: "flex", flexDirection: "column", overflow: "hidden",
      position: "relative",
    }}>
      <audio ref={audioRef} src="DUSHANBE-3.wav" preload="auto" />

      {/* 1. Stadium Container (Completely clear of buttons) */}
      <div style={{ flex: 1, minHeight: 0, width: "100%", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 12px 0 12px" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ width: "100%", height: "100%", display: "block" }}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).tagName !== "circle") {
              setSelectedDot(null);
            }
          }}
          onPointerMove={(e) => {
            const state = dragStateRef.current;
            if (!state.isDown || state.dragDotIdx === null) return;
            const pt = getSvgPointFromEvent(e, svgRef.current);
            const dist = Math.hypot(pt.x - state.startPt.x, pt.y - state.startPt.y);
            if (!state.isDragging && dist > 3) {
              state.isDragging = true;
            }
            if (state.isDragging) {
              const d = diamondDotsList[state.dragDotIdx];
              if (d && d.pHeadphone) {
                let newX = pt.x - state.offset.x;
                let newY = pt.y - state.offset.y;
                const rowMatch = diamondDotsList.find((other, oi) => oi !== state.dragDotIdx && other.pHeadphone && Math.abs(other.pHeadphone.y - newY) < 3.0);
                if (rowMatch && rowMatch.pHeadphone) newY = rowMatch.pHeadphone.y;
                const colMatch = diamondDotsList.find((other, oi) => oi !== state.dragDotIdx && other.pHeadphone && Math.abs(other.pHeadphone.x - newX) < 3.0);
                if (colMatch && colMatch.pHeadphone) newX = colMatch.pHeadphone.x;

                d.pHeadphone.x = newX;
                d.pHeadphone.y = newY;
                updateDotHpTrackApp(d);
                setT(prev => prev);
              }
            }
          }}
          onPointerUp={() => {
            dragStateRef.current.isDown = false;
            dragStateRef.current.isDragging = false;
            dragStateRef.current.dragDotIdx = null;
          }}
        >
        <rect width={SVG_W} height={SVG_H} fill="#000000" />

        {/* Stadium field */}
        <rect x={FX} y={FY} width={FIELD_W} height={FIELD_H} fill="#f3f0f7" stroke="black" strokeWidth={1} />

        {/* Stage & Backdrop */}
        <Stage />

        {/* Inner Circle */}
        <circle cx={CIRC_CX} cy={CIRC_CY} r={4 * STEP} fill="#DDD8C0" stroke="black" strokeWidth={1.5} />

        {/* Center Small Circle */}
        <circle cx={CIRC_CX} cy={CIRC_CY} r={0.5 * STEP} fill="white" stroke="black" strokeWidth={1} />

        {/* Grid dots */}
        {dots.map(({ x, y }, i) => (
          <circle key={i} cx={x} cy={y} r={DOT_R} fill={DOT_COLOR} />
        ))}

        {/* Diamond guide outlines */}
        <polygon points={polyStr(RT, RR, RB, RL)} fill="none" stroke="#aaa" strokeWidth={0.5} strokeDasharray="3 2" opacity={0.2} />
        <polygon points={polyStr(LT, LR, LB, LL)} fill="none" stroke="#aaa" strokeWidth={0.5} strokeDasharray="3 2" opacity={0.2} />

        {/* Dynamic Diamonds Layer */}
        <g id="dynamic-diamonds">
          {diamondDotsList.map((d, i) => {
            let x: number, y: number;
            if (tSec < 34.5) {
              // 0..34.5s: Ожидание в коробке
              const p = d.circleNum === 2 ? d.pBox : (d.circleNum === 3 ? d.pBox3 : (d.circleNum === 4 ? d.pBox4 : d.pInit));
              x = p ? p.x : d.pInit.x;
              y = p ? p.y : d.pInit.y;
            } else if (tSec <= 60.0) {
              // 34.5..60s (1:00, 25.5s): Синхронный марш 4-х кругов
              const u = (tSec - 34.5) / 25.5;
              if (d.circleNum === 2) {
                const p = getPerformerEntrancePos(d, u);
                x = p.x;
                y = p.y;
              } else if (d.circleNum === 3) {
                const p = getPerformerEntrancePosCircle3(d, u);
                x = p.x;
                y = p.y;
              } else if (d.circleNum === 4) {
                const p = getPerformerEntrancePosCircle4(d, u);
                x = p.x;
                y = p.y;
              } else {
                x = d.pInit.x;
                y = d.pInit.y;
              }
            } else if (tSec <= 120.0) {
              // 60..120s (1:00..2:00, 60s): Все стоят в 4-х кругах
              x = d.pInit.x;
              y = d.pInit.y;
            } else if (tSec < 134.0) {
              // 2:00..2:14 (14s): Внутренний сбор / переход из 4-х кругов в 2 круга / 3 дуги
              const u = (tSec - 120.0) / 14.0;
              if (d.isInnerRing && d.color === PINK_GRAY) {
                const sFast = easeInOutCubic(Math.min(1, u / 0.40));
                const dx0 = d.pInit.x - CIRC_CX;
                const dy0 = d.pInit.y - CIRC_CY;
                const dx1 = d.p0.x - CIRC_CX;
                const dy1 = d.p0.y - CIRC_CY;

                const r0 = Math.hypot(dx0, dy0);
                const r1 = Math.hypot(dx1, dy1);
                let a0 = Math.atan2(dy0, dx0);
                let a1 = Math.atan2(dy1, dx1);

                let da = a1 - a0;
                while (da > Math.PI) da -= 2 * Math.PI;
                while (da < -Math.PI) da += 2 * Math.PI;

                const r = r0 + (r1 - r0) * sFast;
                const a = a0 + da * sFast;

                x = CIRC_CX + r * Math.cos(a);
                y = CIRC_CY + r * Math.sin(a);
              } else if (!d.isInnerRing) {
                const p = getRealisticCircleTransition(d.pInit, d.p0, u);
                x = p.x;
                y = p.y;
              } else {
                const s = easeInOutCubic(u);
                x = d.pInit.x + (d.p0.x - d.pInit.x) * s;
                y = d.pInit.y + (d.p0.y - d.pInit.y) * s;
              }
            } else if (tSec < 165.0) {
              // 2:14..2:45 (31s): Выход в ромбы
              const diamondT = (tSec - 134.0) / 31.0;
              const curDist = d.s0 + (d.s1 - d.s0) * diamondT;
              const p = getPointAtDist(d.trackPts, d.trackDists, curDist);
              x = p.x;
              y = p.y;
            } else if (tSec <= 170.0) {
              // 2:45..2:50 (5s): Фиксация в ромбах
              x = d.p1.x;
              y = d.p1.y;
            } else if (tSec < 185.0) {
              // 2:50..3:05 (15s): Марширование по индивидуальным направляющим трекам без пересечений и с сохранением дистанции
              const u = (tSec - 170.0) / 15.0;
              const s = easeInOutCubic(u);
              if (d.hpTrackPts && d.hpTrackDists && d.hpTotalLen > 0) {
                const curDist = d.hpTotalLen * s;
                const p = getPointAtDist(d.hpTrackPts, d.hpTrackDists, curDist);
                x = p.x;
                y = p.y;
              } else {
                x = d.p1.x + (d.pHeadphone.x - d.p1.x) * s;
                y = d.p1.y + (d.pHeadphone.y - d.p1.y) * s;
              }
            } else {
              // 3:05+ : Фигура «Наушники»
              x = d.pHeadphone.x;
              y = d.pHeadphone.y;
            }
            return (
              <circle
                key={`dm-${i}`}
                cx={x}
                cy={y}
                r={R_D}
                fill={d.color}
                stroke="transparent"
                strokeWidth={10}
                style={{ cursor: "pointer" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSelectedDot({ group: "diamond", idx: i });
                  if (tSec >= 184.0) {
                    const pt = getSvgPointFromEvent(e, svgRef.current);
                    dragStateRef.current = {
                      isDown: true,
                      isDragging: false,
                      dragDotIdx: i,
                      startPt: pt,
                      offset: {
                        x: pt.x - (d.pHeadphone ? d.pHeadphone.x : d.p1.x),
                        y: pt.y - (d.pHeadphone ? d.pHeadphone.y : d.p1.y),
                      },
                    };
                  }
                }}
              />
            );
          })}
        </g>

        {/* Center Large Circle (140 dots) */}
        {circleDots.map((p, i) => (
          <circle
            key={`c${i}`}
            cx={p.x}
            cy={p.y}
            r={R_S}
            fill={BLACK_SQ}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedDot({ group: "circle", idx: i });
            }}
          />
        ))}

        {/* Diagonal lines (0..1:08 Box -> 1:08..1:24 3 Arcs -> 1:24..2:00 Static -> 2:00..2:14 3 Lines -> 2:14..2:45 2 Lines) */}
        <g id="diagonal-lines">
          {dotsLeft.map((d, i) => {
            let p: PP;
            if (tSec < 68.0) {
              p = getEntranceLinePoint(d.lineNum, d.lineDotIdx, d.lineTotal, false, 0);
            } else if (tSec <= 84.0) {
              const u = (tSec - 68.0) / 16.0;
              p = getEntranceLinePoint(d.lineNum, d.lineDotIdx, d.lineTotal, false, u);
            } else if (tSec <= 120.0) {
              p = d.p0;
            } else if (tSec < 134.0) {
              // Начинают движение от 2:00 синхронно с переходом кругов
              const u = (tSec - 120.0) / 14.0;
              const s = easeInOutCubic(u);
              p = {
                x: d.p0.x + (d.p1.x - d.p0.x) * s,
                y: d.p0.y + (d.p1.y - d.p0.y) * s,
              };
            } else if (tSec < 165.0) {
              const u = (tSec - 134.0) / 31.0;
              p = calcPersonPosition(d, u, false);
            } else {
              p = d.p2;
            }
            return (
              <circle
                key={`dl-${i}`}
                cx={p.x}
                cy={p.y}
                r={R_LINE}
                fill={d.color}
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDot({ group: "diagLeft", idx: i });
                }}
              />
            );
          })}
          {dotsRight.map((d, i) => {
            let p: PP;
            if (tSec < 68.0) {
              p = getEntranceLinePoint(d.lineNum, d.lineDotIdx, d.lineTotal, true, 0);
            } else if (tSec <= 84.0) {
              const u = (tSec - 68.0) / 16.0;
              p = getEntranceLinePoint(d.lineNum, d.lineDotIdx, d.lineTotal, true, u);
            } else if (tSec <= 120.0) {
              p = d.p0;
            } else if (tSec < 134.0) {
              const u = (tSec - 120.0) / 14.0;
              const s = easeInOutCubic(u);
              p = {
                x: d.p0.x + (d.p1.x - d.p0.x) * s,
                y: d.p0.y + (d.p1.y - d.p0.y) * s,
              };
            } else if (tSec < 165.0) {
              const u = (tSec - 134.0) / 31.0;
              p = calcPersonPosition(d, u, true);
            } else {
              p = d.p2;
            }
            return (
              <circle
                key={`dr-${i}`}
                cx={p.x}
                cy={p.y}
                r={R_LINE}
                fill={d.color}
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDot({ group: "diagRight", idx: i });
                }}
              />
            );
          })}
        </g>

        {/* Selection Halo Indicator */}
        {(() => {
          if (!selectedDot) return null;
          let curX = 0, curY = 0;
          if (selectedDot.group === "diamond") {
            const d = diamondDotsList[selectedDot.idx];
            if (!d) return null;
            if (tSec < 34.5) {
              const p = d.circleNum === 2 ? d.pBox : (d.circleNum === 3 ? d.pBox3 : (d.circleNum === 4 ? d.pBox4 : d.pInit));
              curX = p ? p.x : d.pInit.x; curY = p ? p.y : d.pInit.y;
            } else if (tSec <= 60.0) {
              const u = (tSec - 34.5) / 25.5;
              if (d.circleNum === 2) {
                const p = getPerformerEntrancePos(d, u); curX = p.x; curY = p.y;
              } else if (d.circleNum === 3) {
                const p = getPerformerEntrancePosCircle3(d, u); curX = p.x; curY = p.y;
              } else if (d.circleNum === 4) {
                const p = getPerformerEntrancePosCircle4(d, u); curX = p.x; curY = p.y;
              } else {
                curX = d.pInit.x; curY = d.pInit.y;
              }
            } else if (tSec <= 120.0) {
              curX = d.pInit.x; curY = d.pInit.y;
            } else if (tSec < 134.0) {
              const u = (tSec - 120.0) / 14.0;
              if (d.isInnerRing && d.color === PINK_GRAY) {
                const sFast = easeInOutCubic(Math.min(1, u / 0.40));
                const dx0 = d.pInit.x - CIRC_CX; const dy0 = d.pInit.y - CIRC_CY;
                const dx1 = d.p0.x - CIRC_CX; const dy1 = d.p0.y - CIRC_CY;
                const r0 = Math.hypot(dx0, dy0); const r1 = Math.hypot(dx1, dy1);
                let a0 = Math.atan2(dy0, dx0); let a1 = Math.atan2(dy1, dx1);
                let da = a1 - a0;
                while (da > Math.PI) da -= 2 * Math.PI;
                while (da < -Math.PI) da += 2 * Math.PI;
                const r = r0 + (r1 - r0) * sFast;
                const a = a0 + da * sFast;
                curX = CIRC_CX + r * Math.cos(a); curY = CIRC_CY + r * Math.sin(a);
              } else if (!d.isInnerRing) {
                const p = getRealisticCircleTransition(d.pInit, d.p0, u); curX = p.x; curY = p.y;
              } else {
                const s = easeInOutCubic(u); curX = d.pInit.x + (d.p0.x - d.pInit.x) * s; curY = d.pInit.y + (d.p0.y - d.pInit.y) * s;
              }
            } else if (tSec < 165.0) {
              const diamondT = (tSec - 134.0) / 31.0;
              const curDist = d.s0 + (d.s1 - d.s0) * diamondT;
              const p = getPointAtDist(d.trackPts, d.trackDists, curDist); curX = p.x; curY = p.y;
            } else {
              curX = d.p1.x; curY = d.p1.y;
            }
          } else if (selectedDot.group === "circle") {
            const p = circleDots[selectedDot.idx];
            if (p) { curX = p.x; curY = p.y; }
          } else if (selectedDot.group === "diagLeft") {
            const d = dotsLeft[selectedDot.idx];
            if (!d) return null;
            if (tSec < 68.0) {
              const p = getEntranceLinePoint(d.lineNum, d.lineDotIdx, d.lineTotal, false, 0); curX = p.x; curY = p.y;
            } else if (tSec <= 84.0) {
              const p = getEntranceLinePoint(d.lineNum, d.lineDotIdx, d.lineTotal, false, (tSec - 68.0) / 16.0); curX = p.x; curY = p.y;
            } else if (tSec <= 120.0) {
              curX = d.p0.x; curY = d.p0.y;
            } else if (tSec < 134.0) {
              const s = easeInOutCubic((tSec - 120.0) / 14.0); curX = d.p0.x + (d.p1.x - d.p0.x) * s; curY = d.p0.y + (d.p1.y - d.p0.y) * s;
            } else if (tSec < 165.0) {
              const p = calcPersonPosition(d, (tSec - 134.0) / 31.0, false); curX = p.x; curY = p.y;
            } else {
              curX = d.p2.x; curY = d.p2.y;
            }
          } else if (selectedDot.group === "diagRight") {
            const d = dotsRight[selectedDot.idx];
            if (!d) return null;
            if (tSec < 68.0) {
              const p = getEntranceLinePoint(d.lineNum, d.lineDotIdx, d.lineTotal, true, 0); curX = p.x; curY = p.y;
            } else if (tSec <= 84.0) {
              const p = getEntranceLinePoint(d.lineNum, d.lineDotIdx, d.lineTotal, true, (tSec - 68.0) / 16.0); curX = p.x; curY = p.y;
            } else if (tSec <= 120.0) {
              curX = d.p0.x; curY = d.p0.y;
            } else if (tSec < 134.0) {
              const s = easeInOutCubic((tSec - 120.0) / 14.0); curX = d.p0.x + (d.p1.x - d.p0.x) * s; curY = d.p0.y + (d.p1.y - d.p0.y) * s;
            } else if (tSec < 165.0) {
              const p = calcPersonPosition(d, (tSec - 134.0) / 31.0, true); curX = p.x; curY = p.y;
            } else {
              curX = d.p2.x; curY = d.p2.y;
            }
          }

          // Alignment guide lines
          const rowMatches = selectedDot.group === "diamond" && tSec >= 184.0
            ? diamondDotsList.filter(d => d.pHeadphone && Math.abs(d.pHeadphone.y - curY) <= 2.5)
            : [];
          const colMatches = selectedDot.group === "diamond" && tSec >= 184.0
            ? diamondDotsList.filter(d => d.pHeadphone && Math.abs(d.pHeadphone.x - curX) <= 2.5)
            : [];

          return (
            <g>
              {/* Dynamic Laser Alignment Lines */}
              {selectedDot.group === "diamond" && tSec >= 184.0 && (
                <>
                  {rowMatches.length >= 2 ? (
                    <g>
                      <line x1={FX} y1={curY} x2={FX + FIELD_W} y2={curY} stroke="#38bdf8" strokeWidth={2} strokeDasharray="8 4" opacity={0.9} />
                      <rect x={FX + 10} y={curY - 12} width={140} height={22} rx={5} fill="rgba(15, 23, 42, 0.88)" stroke="#38bdf8" strokeWidth={1} />
                      <text x={FX + 16} y={curY + 3} fill="#38bdf8" fontSize={11} fontWeight="700">📏 Ряд ({rowMatches.length} точек в линию)</text>
                    </g>
                  ) : (
                    <line x1={FX} y1={curY} x2={FX + FIELD_W} y2={curY} stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 4" opacity={0.4} />
                  )}

                  {colMatches.length >= 2 ? (
                    <g>
                      <line x1={curX} y1={FY} x2={curX} y2={FY + FIELD_H} stroke="#38bdf8" strokeWidth={2} strokeDasharray="8 4" opacity={0.9} />
                      <rect x={curX - 65} y={FY + 10} width={130} height={22} rx={5} fill="rgba(15, 23, 42, 0.88)" stroke="#38bdf8" strokeWidth={1} />
                      <text x={curX - 58} y={FY + 25} fill="#38bdf8" fontSize={11} fontWeight="700">📏 Кол ({colMatches.length} точек в линию)</text>
                    </g>
                  ) : (
                    <line x1={curX} y1={FY} x2={curX} y2={FY + FIELD_H} stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 4" opacity={0.4} />
                  )}
                </>
              )}

              <circle cx={curX} cy={curY} r={10} fill="none" stroke="#38bdf8" strokeWidth={2.5} strokeDasharray="4 2">
                <animateTransform attributeName="transform" type="rotate" from={`0 ${curX} ${curY}`} to={`360 ${curX} ${curY}`} dur="3s" repeatCount="indefinite"/>
              </circle>
              <circle cx={curX} cy={curY} r={14} fill="none" stroke="#38bdf8" strokeWidth={1} opacity={0.5}>
                <animate attributeName="r" values="10;17;10" dur="1.8s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.7;0.1;0.7" dur="1.8s" repeatCount="indefinite"/>
              </circle>
            </g>
          );
        })()}

        {/* Top column labels */}
        {colLabels.map(({ x, text }, i) => (
          <text key={`t${i}`} x={x} y={BY + LABEL_PAD / 2} {...textBase}>{text}</text>
        ))}
        {/* Bottom column labels */}
        {colLabels.map(({ x, text }, i) => (
          <text key={`b${i}`} x={x} y={FY + FIELD_H + LABEL_PAD / 2} {...textBase}>{text}</text>
        ))}
        {/* Left row labels */}
        {rowLabels.map(({ y, text }, j) => (
          <text key={`rl${j}`} x={BX + LABEL_PAD / 2} y={y} {...textBase}>{text}</text>
        ))}
        {/* Right row labels */}
        {rowLabels.map(({ y, text }, j) => (
          <text key={`rr${j}`} x={FX + FIELD_W + LABEL_PAD / 2} y={y} {...textBase}>{text}</text>
        ))}
        </svg>

        {/* Toast Notification */}
        {toastMsg && (
          <div style={{
            position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)",
            background: "rgba(15, 23, 42, 0.94)", border: "1px solid #38bdf8",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5), 0 0 15px rgba(56, 189, 248, 0.4)",
            color: "#f8fafc", padding: "8px 18px", borderRadius: 20, fontSize: 13,
            fontWeight: 600, zIndex: 2000, pointerEvents: "none",
          }}>
            {toastMsg}
          </div>
        )}

        {/* Compact Floating Dot Info Card */}
        {(() => {
          if (!selectedDot) return null;
          let title = "Участник";
          let groupName = "";
          let colorHex = "#000";
          let icon = "👤";
          let curX = 0, curY = 0;

          if (selectedDot.group === "diamond") {
            const d = diamondDotsList[selectedDot.idx];
            if (!d) return null;
            colorHex = d.color;
            curX = d.pHeadphone ? d.pHeadphone.x : d.p1.x;
            curY = d.pHeadphone ? d.pHeadphone.y : d.p1.y;
            title = `Наушник / Ромб (№${selectedDot.idx + 1})`;
            groupName = "Группа Наушников";
          } else if (selectedDot.group === "circle") {
            const p = circleDots[selectedDot.idx];
            if (p) { curX = p.x; curY = p.y; }
            title = `1-й внешний круг (№${selectedDot.idx + 1})`;
            groupName = "1-й Круг (R=10)";
            colorHex = BLACK_SQ;
          } else {
            title = `Диагональ (№${selectedDot.idx + 1})`;
            groupName = "Диагональная группа";
          }

          const grid = getFieldGridCoords(curX, curY);

          return (
            <div style={{
              position: "absolute", top: 14, right: 14, width: 290,
              background: "rgba(15, 23, 42, 0.88)", backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(56, 189, 248, 0.4)",
              borderRadius: 12, boxShadow: "0 14px 35px rgba(0, 0, 0, 0.6)", color: "#f8fafc",
              padding: "10px 14px", zIndex: 1000, userSelect: "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255, 255, 255, 0.12)", paddingBottom: 8, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{icon}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#38bdf8" }}>{title}</span>
                </div>
                <button onClick={() => setSelectedDot(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>Группа:</span>
                  <span>{groupName}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>Координаты:</span>
                  <span style={{ background: "rgba(56, 189, 248, 0.18)", border: "1px solid rgba(56, 189, 248, 0.4)", color: "#7dd3fc", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace" }}>
                    Кол: {grid.colStr} | Ряд: {grid.rowStr}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 2. Bottom Control Station (Placed fully BELOW the stadium) */}
      <div style={{
        width: "100%", background: "#111422", borderTop: "1px solid rgba(255, 255, 255, 0.12)",
        padding: "8px 18px", display: "flex", flexDirection: "column", gap: 6, zIndex: 100,
        userSelect: "none", boxShadow: "0 -8px 28px rgba(0, 0, 0, 0.6)",
      }}>
        {/* Row 1: Mode buttons & Player */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 3, gap: 3 }}>
            <button onClick={() => handleSetMode(0.0000)} style={{ background: tSec < 17.0 ? "#7c3aed" : "transparent", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>Старт (0с)</button>
            <button onClick={() => handleSetMode(34.5 / 185.0)} style={{ background: tSec >= 17.0 && tSec < 47.0 ? "#7c3aed" : "transparent", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>Вход кругов (34.5с)</button>
            <button onClick={() => handleSetMode(60.0 / 185.0)} style={{ background: tSec >= 47.0 && tSec < 64.0 ? "#7c3aed" : "transparent", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>4 круга (1:00)</button>
            <button onClick={() => handleSetMode(68.0 / 185.0)} style={{ background: tSec >= 64.0 && tSec < 76.0 ? "#7c3aed" : "transparent", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>Вход дуг (1:08)</button>
            <button onClick={() => handleSetMode(84.0 / 185.0)} style={{ background: tSec >= 76.0 && tSec < 102.0 ? "#7c3aed" : "transparent", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>3 дуги (1:24)</button>
            <button onClick={() => handleSetMode(120.0 / 185.0)} style={{ background: tSec >= 102.0 && tSec < 127.0 ? "#7c3aed" : "transparent", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>Переход (2:00)</button>
            <button onClick={() => handleSetMode(134.0 / 185.0)} style={{ background: tSec >= 127.0 && tSec < 150.0 ? "#7c3aed" : "transparent", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>В ромбы (2:14)</button>
            <button onClick={() => handleSetMode(165.0 / 185.0)} style={{ background: tSec >= 150.0 && tSec < 177.5 ? "#7c3aed" : "transparent", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>Ромбы (2:45)</button>
            <button onClick={() => handleSetMode(1.0000)} style={{ background: tSec >= 177.5 ? "#7c3aed" : "transparent", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>Наушники (3:05)</button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => {
                if (t >= 1.0) setT(0.0);
                setIsPlaying(!isPlaying);
              }}
              style={{
                background: isPlaying ? "#ef4444" : "rgba(99, 102, 241, 0.18)",
                border: isPlaying ? "1px solid #f87171" : "1px solid rgba(99, 102, 241, 0.4)",
                color: isPlaying ? "#ffffff" : "#a5b4fc",
                padding: "6px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span>{isPlaying ? "⏸" : "▶"}</span>
              <span>{isPlaying ? "Пауза" : "Запустить с музыкой (3:05)"}</span>
            </button>

            <button onClick={toggleMute} title="Звук" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", padding: "6px 9px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
              {isMuted ? "🔇" : "🔊"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#94a3b8" }}>
              <span style={{ minWidth: 50, fontVariantNumeric: "tabular-nums" }}>
                {Math.floor(tSec / 60) > 0 ? `${Math.floor(tSec / 60)}:${(tSec % 60).toFixed(1).padStart(4, '0')}` : `${tSec.toFixed(1)}с`}
              </span>
              <input type="range" min="0" max="1850" value={Math.round(t * 1850)} onChange={(e) => handleSliderChange(Number(e.target.value))} style={{ width: 120, accentColor: "#8b5cf6", cursor: "pointer" }} />
              <span>3:05.0</span>
            </div>
          </div>
        </div>

        {/* Row 2: Headphone Editor Sub-Bar */}
        {tSec >= 184.0 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.25)",
            borderRadius: 8, padding: "5px 12px", fontSize: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#7dd3fc", fontWeight: 600 }}>
              <span>🎧 Редактор Наушников:</span>
              <span style={{ color: selectedDot && selectedDot.group === "diamond" ? "#fde047" : "#94a3b8", fontWeight: "normal" }}>
                {selectedDot && selectedDot.group === "diamond"
                  ? "Выбран кружочек. Кликните другой для мгновенного обмена местами!"
                  : "Кликните кружочек для перемещения или обмена"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", gap: 3 }}>
                <button onClick={() => onNudgeDot(0, -1)} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: 5, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>▲ Вверх</button>
                <button onClick={() => onNudgeDot(0, 1)} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: 5, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>▼ Вниз</button>
                <button onClick={() => onNudgeDot(-1, 0)} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: 5, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>◀ Влево</button>
                <button onClick={() => onNudgeDot(1, 0)} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: 5, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>▶ Вправо</button>
              </div>
              <button onClick={onResetSelectedDot} style={{ background: "rgba(99, 102, 241, 0.25)", border: "1px solid #818cf8", color: "#c7d2fe", borderRadius: 6, padding: "4px 10px", fontSize: 11.5, cursor: "pointer", fontWeight: 500 }}>↩️ Сбросить точку</button>
              <button onClick={onResetAllHeadphones} style={{ background: "rgba(239, 68, 68, 0.2)", border: "1px solid #f87171", color: "#fca5a5", borderRadius: 6, padding: "4px 10px", fontSize: 11.5, cursor: "pointer", fontWeight: 500 }}>♻️ Сбросить все наушники</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
