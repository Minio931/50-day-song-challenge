import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '..', 'assets');
GlobalFonts.registerFromPath(path.join(assets, 'DejaVuSans-Bold.ttf'), 'ChallengeBold');
GlobalFonts.registerFromPath(path.join(assets, 'DejaVuSans.ttf'), 'Challenge');

export interface GraphicOptions {
  title: string;
  themes: string[];
  totalDays: number;
  currentDay?: number | null;
}

const C = {
  bg1: '#0b1410',
  bg2: '#12261b',
  green: '#1ed760', // zieleń Spotify jako akcent
  text: '#f2f5f3',
  muted: '#8fa89a',
  card: 'rgba(255,255,255,0.05)',
  cardDone: 'rgba(30,215,96,0.10)',
};

function fit(ctx: SKRSContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/** Temat w 1 linii (z lekkim zmniejszeniem czcionki) albo zawinięty do 2 linii. */
function drawTheme(
  ctx: SKRSContext2D, text: string, x: number, y: number, maxW: number, rowH: number, base: number, bold: boolean,
) {
  const font = (s: number) => `${bold ? '700' : '400'} ${s}px ${bold ? 'ChallengeBold' : 'Challenge'}`;
  for (let s = base; s >= base - 4; s--) {
    ctx.font = font(s);
    if (ctx.measureText(text).width <= maxW) return void ctx.fillText(text, x, y + rowH / 2 + s * 0.36);
  }
  const s = Math.min(base - 5, Math.floor((rowH - 14) / 2.3));
  ctx.font = font(s);
  const words = text.split(/\s+/);
  let first = '';
  while (words.length && ctx.measureText((first + ' ' + words[0]).trim()).width <= maxW) first = (first + ' ' + words.shift()).trim();
  if (first && !words.length) return void ctx.fillText(first, x, y + rowH / 2 + s * 0.36);
  const second = fit(ctx, words.join(' '), maxW);
  const lh = s * 1.15;
  const top = y + rowH / 2 - lh + s * 0.8;
  ctx.fillText(first || fit(ctx, text, maxW), x, top);
  if (first) ctx.fillText(second, x, top + lh);
}

/** Grafika 1080×1920 z listą wszystkich tematów (2 kolumny). Zwraca PNG. */
export function renderThemes(o: GraphicOptions): Buffer {
  const W = 1080;
  const H = 1920;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, C.bg2);
  g.addColorStop(1, C.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // nagłówek
  ctx.fillStyle = C.green;
  ctx.font = '700 30px ChallengeBold';
  ctx.textAlign = 'center';
  ctx.fillText('♪  CODZIENNIE NOWY TEMAT  ♪', W / 2, 100);
  ctx.fillStyle = C.text;
  let titleSize = 64;
  do ctx.font = `700 ${titleSize}px ChallengeBold`;
  while (ctx.measureText(o.title.toUpperCase()).width > W - 100 && --titleSize > 36);
  ctx.fillText(fit(ctx, o.title.toUpperCase(), W - 100), W / 2, 180);
  ctx.fillStyle = C.green;
  ctx.fillRect(W / 2 - 60, 210, 120, 6);

  // siatka
  const cols = 2;
  const rows = Math.ceil(o.totalDays / cols);
  const padX = 50;
  const gap = 20;
  const top = 260;
  const bottom = H - 90;
  const colW = (W - padX * 2 - gap) / cols;
  const rowH = (bottom - top) / rows;
  const fontSize = Math.min(26, Math.floor(rowH * 0.42));

  ctx.textAlign = 'left';
  for (let i = 0; i < o.totalDays; i++) {
    const day = i + 1;
    const col = Math.floor(i / rows); // kolumnami: 1–25 po lewej, 26–50 po prawej
    const row = i % rows;
    const x = padX + col * (colW + gap);
    const y = top + row * rowH;
    const isToday = o.currentDay === day;
    const isDone = !!o.currentDay && day < o.currentDay;

    ctx.fillStyle = isToday ? C.green : isDone ? C.cardDone : C.card;
    ctx.beginPath();
    ctx.roundRect(x, y + 3, colW, rowH - 6, 12);
    ctx.fill();

    const midY = y + rowH / 2 + fontSize * 0.36;
    ctx.font = `700 ${fontSize}px ChallengeBold`;
    ctx.fillStyle = isToday ? C.bg1 : C.green;
    const num = String(day).padStart(2, '0');
    ctx.fillText(num, x + 16, midY);

    ctx.fillStyle = isToday ? C.bg1 : C.text;
    drawTheme(ctx, o.themes[i]?.trim() || '—', x + 70, y, colW - 84, rowH, fontSize, isToday);
  }

  ctx.textAlign = 'center';
  ctx.font = `400 24px Challenge`;
  ctx.fillStyle = C.muted;
  ctx.fillText('Wrzucaj link ze Spotify komendą /add  •  zaległe dni: /bulk', W / 2, H - 40);

  return canvas.toBuffer('image/png');
}
