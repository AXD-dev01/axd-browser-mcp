/**
 * humanize.js — Mathematical human-cadence input synthesizer.
 * Prevents anti-bot fingerprinting by simulating physical mouse & typing jitter.
 */

function bezierPoint(t, p0, p1, p2, p3) {
  const cX = 3 * (p1.x - p0.x);
  const bX = 3 * (p2.x - p1.x) - cX;
  const aX = p3.x - p0.x - cX - bX;

  const cY = 3 * (p1.y - p0.y);
  const bY = 3 * (p2.y - p1.y) - cY;
  const aY = p3.y - p0.y - cY - bY;

  const x = (aX * Math.pow(t, 3)) + (bX * Math.pow(t, 2)) + (cX * t) + p0.x;
  const y = (aY * Math.pow(t, 3)) + (bY * Math.pow(t, 2)) + (cY * t) + p0.y;

  return { x: Math.round(x), y: Math.round(y) };
}

function generateCurve(start, end, steps = 25) {
  const deviation = Math.hypot(end.x - start.x, end.y - start.y) * 0.15;
  const cp1 = {
    x: start.x + (end.x - start.x) * 0.25 + (Math.random() - 0.5) * deviation,
    y: start.y + (end.y - start.y) * 0.25 + (Math.random() - 0.5) * deviation
  };
  const cp2 = {
    x: start.x + (end.x - start.x) * 0.75 + (Math.random() - 0.5) * deviation,
    y: start.y + (end.y - start.y) * 0.75 + (Math.random() - 0.5) * deviation
  };

  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(bezierPoint(t, start, cp1, cp2, end));
  }
  return points;
}

function randomJitter(min = 40, max = 120) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = { generateCurve, randomJitter };
