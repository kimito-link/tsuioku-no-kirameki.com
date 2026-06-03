// @ts-nocheck — watch ページ / popup 双方の DOM 演出
/**
 * popup iframe から content script 経由で呼ぶ。
 */

import { pikaBurstCountForTier } from './celebrationPika.js';
import {
  celebrationDropImageSrc,
  delugeDropImageSrc,
  giftBahamutSquadImageSrcs
} from './celebrationCharaAssets.js';

export const NLS_PLAY_WATCH_CELEBRATION = 'NLS_PLAY_WATCH_CELEBRATION';

export const WATCH_CELEBRATION_STYLE_ID = 'nls-watch-celebration-style';

/** @typedef {'support'|'self_action'|'gift_bahamut'} WatchCelebrationVariant */

/**
 * @typedef {Object} WatchCelebrationRelayPayload
 * @property {WatchCelebrationVariant} variant
 * @property {Record<string, unknown>} spec
 * @property {import('./celebrationFlyText.js').CelebrationFlyTextLine[]} [flyTextLines]
 * @property {import('./celebrationPika.js').CelebrationPikaTier} [pikaTier]
 */

const WATCH_CELEBRATION_CSS = `
.nl-celebration-shower {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
  overflow: visible;
}
.nl-celebration-shower--watch-page .nl-celebration-shower__banner {
  top: 8%;
  max-width: min(92vw, 480px);
  font-size: clamp(14px, 2.2vw, 18px);
  padding: 10px 18px;
}
.nl-celebration-shower__banner {
  position: absolute;
  top: 10%;
  left: 50%;
  transform: translateX(-50%);
  max-width: min(94vw, 420px);
  padding: 10px 16px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(255, 248, 252, 0.96), rgba(255, 236, 246, 0.94));
  border: 1px solid rgba(244, 122, 178, 0.45);
  box-shadow: 0 8px 28px rgba(180, 60, 120, 0.18);
  color: #6b2a4a;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  line-height: 1.35;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: anywhere;
  animation: nlCelebrationBannerPop 0.55s cubic-bezier(.34, 1.56, .64, 1) 1;
  z-index: 6;
}
.nl-celebration-shower__drops {
  position: absolute;
  inset: 0;
  overflow: visible;
}
.nl-celebration-drop {
  position: absolute;
  top: -56px;
  object-fit: contain;
  opacity: 0.92;
  animation: nlCelebrationFall var(--nl-celebration-fall-dur, 2.2s) linear forwards;
  will-change: transform, opacity;
}
@keyframes nlCelebrationBannerPop {
  0% { transform: translateX(-50%) scale(0.82); opacity: 0; }
  100% { transform: translateX(-50%) scale(1); opacity: 1; }
}
@keyframes nlCelebrationFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 0.95; }
  85% { opacity: 0.75; }
  100% { transform: translateY(calc(100vh + 72px)) rotate(420deg); opacity: 0.15; }
}
.nl-celebration-shower--rinku-deluge .nl-celebration-drop {
  top: -48px;
  opacity: 0.88;
  animation-name: nlCelebrationFallDeluge;
  animation-timing-function: linear;
}
.nl-celebration-shower--rinku-deluge .nl-celebration-drop--deluge {
  filter: drop-shadow(0 3px 6px rgba(80, 30, 60, 0.28));
}
@keyframes nlCelebrationFallDeluge {
  0% { transform: translateY(0) translateX(0) rotate(0deg) scale(0.85); opacity: 0; }
  6% { opacity: 0.92; }
  25% { transform: translateY(25vh) translateX(calc(var(--nl-celebration-sway, 0px) * 0.35)) rotate(120deg) scale(1); }
  55% { transform: translateY(55vh) translateX(calc(var(--nl-celebration-sway, 0px) * 0.75)) rotate(260deg) scale(1); opacity: 0.82; }
  100% { transform: translateY(calc(100vh + 56px)) translateX(var(--nl-celebration-sway, 0px)) rotate(480deg) scale(0.95); opacity: 0.08; }
}
.nl-celebration-shower--rinku-deluge .nl-celebration-shower__banner {
  box-shadow: 0 8px 32px rgba(244, 122, 178, 0.28);
  animation: nlCelebrationBannerPop 0.5s cubic-bezier(.34, 1.56, .64, 1) 1, nlCelebrationBannerGlow 2.4s ease-in-out 0.5s 2;
}
@keyframes nlCelebrationBannerGlow {
  0%, 100% { box-shadow: 0 8px 28px rgba(180, 60, 120, 0.18); }
  50% { box-shadow: 0 8px 36px rgba(244, 122, 178, 0.42); }
}
.nl-celebration-flytext {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
  z-index: 4;
}
.nl-celebration-flytext__line {
  position: absolute;
  left: 0;
  white-space: nowrap;
  font-family: 'Hiragino Sans', 'Yu Gothic UI', 'Meiryo', sans-serif;
  font-weight: 900;
  letter-spacing: 0.02em;
  color: var(--nl-fly-color, #fff);
  font-size: var(--nl-fly-size, 22px);
  line-height: 1.1;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.85), -1px -1px 0 rgba(0, 0, 0, 0.75), 0 0 12px rgba(0, 0, 0, 0.35);
  opacity: 0;
  will-change: transform, opacity;
}
.nl-celebration-flytext__line--scroll {
  top: var(--nl-fly-lane, 20%);
  animation: nlFlyTextScroll var(--nl-fly-dur, 4.5s) linear var(--nl-fly-delay, 0s) forwards;
}
.nl-celebration-flytext__line--burst {
  top: var(--nl-fly-y0, 30%);
  left: 50%;
  animation: nlFlyTextBurst var(--nl-fly-dur, 2.8s) cubic-bezier(0.22, 0.85, 0.28, 1) var(--nl-fly-delay, 0s) forwards;
}
@keyframes nlFlyTextScroll {
  0% { transform: translateX(108vw); opacity: 0; }
  4% { opacity: 0.95; }
  92% { opacity: 0.88; }
  100% { transform: translateX(-115%); opacity: 0; }
}
@keyframes nlFlyTextBurst {
  0% { transform: translate(calc(-50% + var(--nl-fly-x0, 0vw)), 0) scale(0.35) rotate(calc(var(--nl-fly-rot, 0deg) - 8deg)); opacity: 0; }
  12% { transform: translate(calc(-50% + var(--nl-fly-x0, 0vw)), 0) scale(1.08) rotate(var(--nl-fly-rot, 0deg)); opacity: 1; }
  100% { transform: translate(calc(-50% + var(--nl-fly-x0, 0vw) + var(--nl-fly-x1, 0px)), var(--nl-fly-y1, -80px)) scale(0.92) rotate(calc(var(--nl-fly-rot, 0deg) + 10deg)); opacity: 0; }
}
.nl-celebration-pika {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 8;
  overflow: hidden;
}
.nl-celebration-pika__flash {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0;
  animation: nlCelebrationPikaFlash 0.22s ease-out forwards;
}
.nl-celebration-pika__radial {
  position: absolute;
  left: 50%;
  top: 42%;
  width: min(120vw, 680px);
  height: min(120vw, 680px);
  transform: translate(-50%, -50%) scale(0.2);
  border-radius: 50%;
  opacity: 0;
  background: radial-gradient(circle, rgba(255, 248, 180, 0.95) 0%, rgba(255, 200, 80, 0.55) 22%, rgba(255, 140, 200, 0.25) 45%, transparent 68%);
  animation: nlCelebrationPikaRadial 0.55s cubic-bezier(0.15, 0.85, 0.25, 1) forwards;
  mix-blend-mode: screen;
}
.nl-celebration-pika__stars {
  position: absolute;
  left: 50%;
  top: 42%;
  width: 0;
  height: 0;
  opacity: 0;
  animation: nlCelebrationPikaStarsIn 0.08s ease-out forwards;
}
.nl-celebration-pika__star {
  position: absolute;
  left: 0;
  top: 0;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  background: linear-gradient(135deg, #fff 30%, #ffd54f 70%);
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
  opacity: 0;
  animation: nlCelebrationPikaStarBurst 0.65s ease-out calc(var(--nl-pika-i, 0) * 0.03s) forwards;
}
@keyframes nlCelebrationPikaFlash {
  0% { opacity: 0; }
  18% { opacity: 0.88; }
  100% { opacity: 0; }
}
@keyframes nlCelebrationPikaRadial {
  0% { transform: translate(-50%, -50%) scale(0.15); opacity: 0; }
  20% { opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1.35); opacity: 0; }
}
@keyframes nlCelebrationPikaStarsIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes nlCelebrationPikaStarBurst {
  0% { transform: translate(0, 0) scale(0.2) rotate(0deg); opacity: 0; }
  25% { transform: translate(calc(var(--nl-pika-x, 0px) * 0.35), calc(var(--nl-pika-y, 0px) * 0.35)) scale(1.2) rotate(45deg); opacity: 1; }
  100% { transform: translate(var(--nl-pika-x, 0px), var(--nl-pika-y, 0px)) scale(0.3) rotate(120deg); opacity: 0; }
}
.nl-gift-bahamut {
  position: fixed;
  inset: 0;
  z-index: 2147483645;
  pointer-events: none;
  overflow: visible;
  perspective: 900px;
}
.nl-gift-bahamut__flash {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(ellipse 80% 55% at 50% 45%, rgba(255, 220, 120, 0.55), rgba(255, 180, 220, 0.15) 45%, transparent 70%);
  animation: nlGiftBahamutFlash 0.65s ease-out 1;
}
.nl-gift-bahamut--small .nl-gift-bahamut__flash { opacity: 0.35; animation: none; }
.nl-gift-bahamut__banner {
  position: absolute;
  top: 14%;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 999px;
  background: rgba(20, 12, 28, 0.78);
  border: 1px solid rgba(255, 215, 130, 0.55);
  color: #fff6dc;
  font-size: clamp(13px, 2vw, 16px);
  font-weight: 700;
  white-space: nowrap;
  max-width: min(92vw, 420px);
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 0 24px rgba(255, 196, 84, 0.35);
  animation: nlGiftBahamutBanner 0.45s cubic-bezier(.34, 1.4, .64, 1) 0.18s both;
  z-index: 3;
}
.nl-gift-bahamut__squad {
  position: absolute;
  left: 50%;
  bottom: 10%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
  transform-origin: center bottom;
  animation: nlGiftBahamutZoom var(--nl-bahamut-dur, 2.4s) cubic-bezier(0.12, 0.82, 0.18, 1) 1 forwards;
  filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.4));
  z-index: 2;
  will-change: transform, opacity;
}
.nl-gift-bahamut__char { display: flex; align-items: flex-end; animation: nlGiftBahamutCharPop var(--nl-bahamut-dur, 2.4s) ease-out 1; }
.nl-gift-bahamut__char--lead { animation-delay: 0.04s; }
.nl-gift-bahamut__char--center { animation-delay: 0.1s; }
.nl-gift-bahamut__char--tail { animation-delay: 0.16s; }
.nl-gift-bahamut__img { display: block; object-fit: contain; }
.nl-gift-bahamut__char--lead .nl-gift-bahamut__img { width: 52px; height: 52px; }
.nl-gift-bahamut__char--center .nl-gift-bahamut__img { width: 72px; height: 72px; }
.nl-gift-bahamut__char--tail .nl-gift-bahamut__img { width: 48px; height: 48px; }
.nl-gift-bahamut--large .nl-gift-bahamut__char--center .nl-gift-bahamut__img,
.nl-gift-bahamut--mega .nl-gift-bahamut__char--center .nl-gift-bahamut__img { width: 88px; height: 88px; }
.nl-gift-bahamut__trail { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
.nl-gift-bahamut__spark {
  position: absolute;
  left: 50%;
  top: 58%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff9c4, #ffb74d);
  opacity: 0;
  animation: nlGiftBahamutSparkBurst calc(var(--nl-bahamut-dur, 2.4s) * 0.55) ease-out 0.22s 1;
  animation-delay: calc(0.22s + var(--nl-spark-i, 0) * 0.04s);
}
@keyframes nlGiftBahamutZoom {
  0% { transform: translate(-50%, 55%) scale(0.07); opacity: 0.45; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.2)) blur(1px); }
  14% { opacity: 1; filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.35)) blur(0); }
  40% { transform: translate(-50%, -6%) scale(var(--nl-bahamut-peak, 1.75)); }
  52% { transform: translate(-50%, -10%) scale(calc(var(--nl-bahamut-peak, 1.75) * 1.05)); }
  62% { transform: translate(-50%, -7%) scale(var(--nl-bahamut-peak, 1.75)); }
  78% { transform: translate(-50%, -9%) scale(var(--nl-bahamut-peak, 1.75)); opacity: 1; }
  100% { transform: translate(-50%, -22%) scale(calc(var(--nl-bahamut-peak, 1.75) * 1.28)); opacity: 0; }
}
@keyframes nlGiftBahamutCharPop {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  38% { transform: translateY(-22px) rotate(-5deg); }
  52% { transform: translateY(-10px) rotate(3deg); }
  62% { transform: translateY(-14px) rotate(0deg); }
}
@keyframes nlGiftBahamutFlash {
  0% { opacity: 0; }
  20% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes nlGiftBahamutBanner {
  0% { transform: translateX(-50%) scale(0.7); opacity: 0; }
  100% { transform: translateX(-50%) scale(1); opacity: 1; }
}
@keyframes nlGiftBahamutSparkBurst {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.35); }
  22% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  100% { opacity: 0; transform: translate(calc(-50% + var(--nl-spark-x, 0px)), calc(-50% + var(--nl-spark-y, -72px))) scale(0.25); }
}
@media (prefers-reduced-motion: reduce) {
  .nl-celebration-shower__banner, .nl-celebration-drop, .nl-celebration-flytext__line,
  .nl-gift-bahamut__squad, .nl-gift-bahamut__char, .nl-gift-bahamut__flash, .nl-gift-bahamut__spark {
    animation: none !important;
  }
  .nl-celebration-pika__flash, .nl-celebration-pika__radial, .nl-celebration-pika__star {
    animation: none !important;
    display: none;
  }
}
`;

/**
 * @param {Document} doc
 */
export function ensureWatchCelebrationStyles(doc) {
  if (!doc?.head) return;
  if (doc.getElementById(WATCH_CELEBRATION_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = WATCH_CELEBRATION_STYLE_ID;
  style.textContent = WATCH_CELEBRATION_CSS;
  doc.head.appendChild(style);
}

/** @returns {boolean} */
export function celebrationOverlayMotionEnabled() {
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      return false;
    }
  } catch {
    /* no-op */
  }
  return true;
}

/**
 * @param {string} rel
 * @param {(rel: string) => string} resolveImageUrl
 * @returns {string}
 */
function resolveCelebrationImage(rel, resolveImageUrl) {
  const path = String(rel || '').trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  try {
    return resolveImageUrl(path);
  } catch {
    return path;
  }
}

/**
 * @param {HTMLElement} host
 * @param {import('./celebrationFlyText.js').CelebrationFlyTextLine[]} lines
 * @param {number} durationMs
 */
function appendFlyTextLayer(host, lines, durationMs) {
  if (!celebrationOverlayMotionEnabled() || !lines?.length) return;
  const layer = document.createElement('div');
  layer.className = 'nl-celebration-flytext';
  lines.forEach((line, i) => {
    const el = document.createElement('span');
    el.className = `nl-celebration-flytext__line nl-celebration-flytext__line--${line.motion}`;
    el.textContent = line.text;
    const delayMs = Math.min(durationMs * 0.75, i * 140 + Math.random() * durationMs * 0.12);
    const durMs = line.motion === 'scroll' ? 3200 + Math.random() * 2800 : 2200 + Math.random() * 1600;
    el.style.setProperty('--nl-fly-delay', `${delayMs}ms`);
    el.style.setProperty('--nl-fly-dur', `${durMs}ms`);
    el.style.setProperty('--nl-fly-color', line.color || '#ffffff');
    el.style.setProperty('--nl-fly-size', `${line.sizePx || 22}px`);
    if (line.motion === 'scroll') {
      el.style.setProperty('--nl-fly-lane', `${line.lanePct ?? 8 + ((i * 17) % 78)}%`);
    } else {
      el.style.setProperty('--nl-fly-x0', `${-10 + Math.random() * 20}vw`);
      el.style.setProperty('--nl-fly-y0', `${12 + ((i * 13) % 68)}%`);
      el.style.setProperty('--nl-fly-x1', `${-50 + Math.random() * 100}px`);
      el.style.setProperty('--nl-fly-y1', `${-50 - Math.random() * 90}px`);
      el.style.setProperty('--nl-fly-rot', `${-12 + Math.random() * 24}deg`);
    }
    layer.appendChild(el);
  });
  host.appendChild(layer);
}

/**
 * @param {HTMLElement} host
 * @param {import('./celebrationPika.js').CelebrationPikaTier} tier
 */
function appendPikaLayer(host, tier) {
  if (!celebrationOverlayMotionEnabled() || !tier || tier === 'none') return;
  const burstCount = pikaBurstCountForTier(tier);
  if (burstCount <= 0) return;
  const layer = document.createElement('div');
  layer.className = `nl-celebration-pika nl-celebration-pika--${tier}`;
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < burstCount; i++) {
    const flash = document.createElement('div');
    flash.className = 'nl-celebration-pika__flash';
    flash.style.animationDelay = `${i * 180}ms`;
    layer.appendChild(flash);
    const radial = document.createElement('div');
    radial.className = 'nl-celebration-pika__radial';
    radial.style.animationDelay = `${80 + i * 180}ms`;
    layer.appendChild(radial);
    const stars = document.createElement('div');
    stars.className = 'nl-celebration-pika__stars';
    stars.style.animationDelay = `${120 + i * 180}ms`;
    const starTotal = tier === 'jackpot' ? 12 : tier === 'hard' ? 8 : 5;
    for (let s = 0; s < starTotal; s++) {
      const star = document.createElement('span');
      star.className = 'nl-celebration-pika__star';
      const angle = (s / starTotal) * Math.PI * 2;
      const dist = tier === 'jackpot' ? 140 : tier === 'hard' ? 110 : 80;
      star.style.setProperty('--nl-pika-x', `${Math.cos(angle) * dist}px`);
      star.style.setProperty('--nl-pika-y', `${Math.sin(angle) * dist}px`);
      star.style.setProperty('--nl-pika-i', String(s));
      stars.appendChild(star);
    }
    layer.appendChild(stars);
  }
  host.insertBefore(layer, host.firstChild);
}

/**
 * @typedef {Object} ShowerPlayOptions
 * @property {(rel: string) => string} resolveImageUrl
 * @property {import('./celebrationFlyText.js').CelebrationFlyTextLine[]} [flyTextLines]
 * @property {import('./celebrationPika.js').CelebrationPikaTier} [pikaTier]
 * @property {boolean} [watchPage]
 * @property {boolean} [selfActionDeluge]
 * @property {string} [hostId]
 */

/**
 * @param {Document} doc
 * @param {import('./supportCelebration.js').SupportCelebrationSpec} spec
 * @param {ShowerPlayOptions} opts
 */
export function playSupportCelebrationShower(doc, spec, opts) {
  ensureWatchCelebrationStyles(doc);
  const mountRoot = doc.documentElement;
  const hostId = opts.hostId || 'nlCelebrationShower';
  const isDeluge = spec.dropVariant === 'rinku_deluge';

  let host = mountRoot.querySelector(`#${hostId}`);
  if (!(host instanceof HTMLElement)) {
    host = doc.createElement('div');
    host.id = hostId;
    host.className = 'nl-celebration-shower';
    host.hidden = true;
    host.setAttribute('aria-live', 'polite');
    mountRoot.appendChild(host);
  } else if (host.parentElement !== mountRoot) {
    mountRoot.appendChild(host);
  }

  host.className = 'nl-celebration-shower';
  if (opts.watchPage) host.classList.add('nl-celebration-shower--watch-page');
  if (isDeluge) host.classList.add('nl-celebration-shower--rinku-deluge');

  host.innerHTML = '';
  host.hidden = false;
  host.removeAttribute('hidden');

  const banner = doc.createElement('div');
  banner.className = 'nl-celebration-shower__banner';
  banner.textContent = spec.message;
  host.appendChild(banner);

  if (opts.pikaTier) appendPikaLayer(host, opts.pikaTier);

  if (celebrationOverlayMotionEnabled()) {
    const drops = doc.createElement('div');
    drops.className = 'nl-celebration-shower__drops';
    const burstCount = isDeluge ? Math.ceil(spec.dropCount * 0.45) : 0;
    for (let i = 0; i < spec.dropCount; i++) {
      const img = doc.createElement('img');
      img.className = 'nl-celebration-drop';
      if (isDeluge) img.classList.add('nl-celebration-drop--deluge');
      const rel = isDeluge
        ? delugeDropImageSrc(i)
        : celebrationDropImageSrc(i, spec.characterSet || 'mixed');
      img.src = resolveCelebrationImage(rel, opts.resolveImageUrl);
      img.alt = '';
      img.decoding = 'async';
      const leftPct = isDeluge ? 1 + Math.random() * 98 : 4 + Math.random() * 92;
      const delayMs = isDeluge
        ? i < burstCount
          ? Math.random() * 220
          : 180 + Math.random() * spec.durationMs * 0.72
        : Math.random() * spec.durationMs * 0.45;
      const durMs = isDeluge ? 1200 + Math.random() * 1600 : 1800 + Math.random() * 1400;
      const sizePx = isDeluge
        ? 40 + Math.floor(Math.random() * 28) + (Math.random() < 0.1 ? 14 : 0)
        : 24 + Math.floor(Math.random() * 20);
      img.style.left = `${leftPct}%`;
      img.style.width = `${sizePx}px`;
      img.style.height = `${sizePx}px`;
      img.style.animationDelay = `${delayMs}ms`;
      img.style.setProperty('--nl-celebration-fall-dur', `${durMs}ms`);
      if (isDeluge) {
        img.style.setProperty('--nl-celebration-sway', `${-18 + Math.random() * 36}px`);
      }
      drops.appendChild(img);
    }
    host.appendChild(drops);
    if (opts.flyTextLines?.length) {
      appendFlyTextLayer(host, opts.flyTextLines, spec.durationMs);
    }
  }

  const win = doc.defaultView || window;
  win.setTimeout(() => {
    host.hidden = true;
    host.innerHTML = '';
  }, spec.durationMs + 400);
}

/**
 * @param {Document} doc
 * @param {import('./selfActionCelebration.js').SelfActionCelebrationSpec} spec
 * @param {ShowerPlayOptions} opts
 */
export function playSelfActionCelebrationShower(doc, spec, opts) {
  ensureWatchCelebrationStyles(doc);
  const mountRoot = doc.documentElement;
  const hostId = opts.hostId || 'nlSelfActionCelebration';

  let host = mountRoot.querySelector(`#${hostId}`);
  if (!(host instanceof HTMLElement)) {
    host = doc.createElement('div');
    host.id = hostId;
    host.className = 'nl-celebration-shower';
    host.hidden = true;
    host.setAttribute('aria-live', 'polite');
    mountRoot.appendChild(host);
  } else if (host.parentElement !== mountRoot) {
    mountRoot.appendChild(host);
  }

  host.className =
    'nl-celebration-shower nl-celebration-shower--rinku-deluge' +
    (opts.watchPage ? ' nl-celebration-shower--watch-page' : '');
  host.innerHTML = '';
  host.hidden = false;
  host.removeAttribute('hidden');

  const banner = doc.createElement('div');
  banner.className = 'nl-celebration-shower__banner';
  banner.textContent = spec.message;
  host.appendChild(banner);

  appendPikaLayer(host, opts.pikaTier || 'soft');

  if (celebrationOverlayMotionEnabled()) {
    const drops = doc.createElement('div');
    drops.className = 'nl-celebration-shower__drops';
    const dropCount = Math.max(8, Math.min(18, Math.floor(spec.dropCount)));
    const burstCount = Math.ceil(dropCount * 0.4);
    for (let i = 0; i < dropCount; i++) {
      const img = doc.createElement('img');
      img.className = 'nl-celebration-drop nl-celebration-drop--deluge';
      img.src = resolveCelebrationImage(delugeDropImageSrc(i), opts.resolveImageUrl);
      img.alt = '';
      img.decoding = 'async';
      img.style.left = `${1 + Math.random() * 98}%`;
      const sizePx = 32 + Math.floor(Math.random() * 22);
      img.style.width = `${sizePx}px`;
      img.style.height = `${sizePx}px`;
      const delayMs =
        i < burstCount ? Math.random() * 220 : 180 + Math.random() * spec.durationMs * 0.55;
      img.style.animationDelay = `${delayMs}ms`;
      img.style.setProperty('--nl-celebration-fall-dur', `${1200 + Math.random() * 1400}ms`);
      img.style.setProperty('--nl-celebration-sway', `${-18 + Math.random() * 36}px`);
      drops.appendChild(img);
    }
    host.appendChild(drops);
    if (opts.flyTextLines?.length) {
      appendFlyTextLayer(host, opts.flyTextLines, spec.durationMs);
    }
  }

  const win = doc.defaultView || window;
  win.setTimeout(() => {
    host.hidden = true;
    host.innerHTML = '';
  }, spec.durationMs + 350);
}

/**
 * @param {Document} doc
 * @param {import('./giftBahamutCelebration.js').GiftBahamutSpec} spec
 * @param {ShowerPlayOptions} opts
 */
export function playGiftBahamutCelebration(doc, spec, opts) {
  ensureWatchCelebrationStyles(doc);
  const root = doc.documentElement;
  const hostId = opts.hostId || 'nlGiftBahamut';

  let host = root.querySelector(`#${hostId}`);
  if (!(host instanceof HTMLElement)) {
    host = doc.createElement('div');
    host.id = hostId;
    host.className = 'nl-gift-bahamut';
    host.hidden = true;
    host.setAttribute('aria-live', 'polite');
    root.appendChild(host);
  }

  host.className = `nl-gift-bahamut nl-gift-bahamut--${spec.tier}`;
  host.innerHTML = '';
  host.hidden = false;
  host.removeAttribute('hidden');
  host.style.setProperty('--nl-bahamut-peak', String(spec.scale));
  host.style.setProperty('--nl-bahamut-dur', `${spec.durationMs}ms`);

  if (opts.pikaTier) appendPikaLayer(host, opts.pikaTier);

  const flash = doc.createElement('div');
  flash.className = 'nl-gift-bahamut__flash';
  host.appendChild(flash);

  const banner = doc.createElement('div');
  banner.className = 'nl-gift-bahamut__banner';
  banner.textContent = spec.message;
  host.appendChild(banner);

  if (celebrationOverlayMotionEnabled()) {
    if (opts.flyTextLines?.length) {
      appendFlyTextLayer(host, opts.flyTextLines, spec.durationMs);
    }
    const squad = doc.createElement('div');
    squad.className = 'nl-gift-bahamut__squad';
    const labels = ['こん太', 'りんく', 'たぬ姉'];
    const srcs = giftBahamutSquadImageSrcs(spec.tier);
    srcs.forEach((src, i) => {
      const wrap = doc.createElement('div');
      wrap.className = `nl-gift-bahamut__char nl-gift-bahamut__char--${i === 1 ? 'center' : i === 0 ? 'lead' : 'tail'}`;
      const img = doc.createElement('img');
      img.className = 'nl-gift-bahamut__img';
      img.src = resolveCelebrationImage(src, opts.resolveImageUrl);
      img.alt = labels[i] || '';
      img.decoding = 'async';
      wrap.appendChild(img);
      squad.appendChild(wrap);
    });
    host.appendChild(squad);

    const trail = doc.createElement('div');
    trail.className = 'nl-gift-bahamut__trail';
    const sparkCount =
      spec.tier === 'mega' ? 14 : spec.tier === 'large' ? 10 : spec.tier === 'medium' ? 8 : 6;
    const sparkDist =
      spec.tier === 'mega' ? 150 : spec.tier === 'large' ? 120 : spec.tier === 'medium' ? 95 : 72;
    for (let i = 0; i < sparkCount; i++) {
      const angle = (i / sparkCount) * Math.PI * 2 - Math.PI / 2;
      const spark = doc.createElement('span');
      spark.className = 'nl-gift-bahamut__spark';
      spark.style.setProperty('--nl-spark-i', String(i));
      spark.style.setProperty('--nl-spark-x', `${Math.cos(angle) * sparkDist}px`);
      spark.style.setProperty('--nl-spark-y', `${Math.sin(angle) * sparkDist}px`);
      trail.appendChild(spark);
    }
    host.appendChild(trail);
  }

  const win = doc.defaultView || window;
  win.setTimeout(() => {
    host.hidden = true;
    host.innerHTML = '';
  }, spec.durationMs + 500);
}

/**
 * @param {Document} doc
 * @param {WatchCelebrationRelayPayload} payload
 * @param {(rel: string) => string} resolveImageUrl
 */
export function playWatchCelebrationRelay(doc, payload, resolveImageUrl) {
  if (!payload?.variant || !payload.spec) return;
  const spec = payload.spec;
  const opts = {
    resolveImageUrl,
    flyTextLines: payload.flyTextLines || [],
    pikaTier: payload.pikaTier || 'none',
    watchPage: true
  };
  if (payload.variant === 'support') {
    playSupportCelebrationShower(
      doc,
      /** @type {import('./supportCelebration.js').SupportCelebrationSpec} */ (spec),
      opts
    );
    return;
  }
  if (payload.variant === 'self_action') {
    playSelfActionCelebrationShower(
      doc,
      /** @type {import('./selfActionCelebration.js').SelfActionCelebrationSpec} */ (spec),
      opts
    );
    return;
  }
  if (payload.variant === 'gift_bahamut') {
    playGiftBahamutCelebration(
      doc,
      /** @type {import('./giftBahamutCelebration.js').GiftBahamutSpec} */ (spec),
      opts
    );
  }
}
