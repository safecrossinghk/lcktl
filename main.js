import { getRoadStats, postSignalEvent } from './api.js';
import { DEFAULT_AVERAGE_CYCLE_SECONDS, LOCATION_OPTIONS, ROAD } from './config.js';
import { createCountdown } from './countdown.js';
import { distanceMeters, watchPosition } from './geo.js';
import { registerServiceWorker } from './pwa.js';

registerServiceWorker();

const elements = {
  distance: document.querySelector('[data-distance]'),
  accuracy: document.querySelector('[data-accuracy]'),
  status: document.querySelector('[data-location-status]'),
  signalButton: document.querySelector('[data-signal-button]'),
  countdown: document.querySelector('[data-countdown]'),
  averageCycle: document.querySelector('[data-average-cycle]'),
  roadName: document.querySelector('[data-road-name]'),
  roadId: document.querySelector('[data-road-id]')
};

let latestPosition = null;
let averageCycleSeconds = DEFAULT_AVERAGE_CYCLE_SECONDS;
const countdown = createCountdown((remainingSeconds) => {
  elements.countdown.textContent = `${remainingSeconds} 秒`;
});

function setStatus(message, inRange = false) {
  elements.status.textContent = message;
  elements.status.dataset.state = inRange ? 'ready' : 'waiting';
  elements.signalButton.disabled = !inRange;
}

function renderPosition(position) {
  latestPosition = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy
  };

  const distance = distanceMeters(latestPosition, ROAD);
  const inRange = distance <= ROAD.radiusMeters;

  elements.distance.textContent = `${Math.round(distance)} 米`;
  elements.accuracy.textContent = `±${Math.round(latestPosition.accuracy)} 米`;
  setStatus(inRange ? '已進入 30 米測試範圍' : '未進入 30 米測試範圍', inRange);
}

function renderLocationError(error) {
  setStatus(error.message || '無法取得 GPS 位置，請開啟定位權限。');
}

async function refreshStats() {
  try {
    const stats = await getRoadStats(ROAD.id);
    averageCycleSeconds = Math.round(stats.average_cycle_seconds || DEFAULT_AVERAGE_CYCLE_SECONDS);
  } catch {
    averageCycleSeconds = DEFAULT_AVERAGE_CYCLE_SECONDS;
  }

  elements.averageCycle.textContent = `${averageCycleSeconds} 秒`;
}

async function recordSignalChange() {
  if (!latestPosition) {
    setStatus('請先等待 GPS 定位完成。');
    return;
  }

  elements.signalButton.disabled = true;
  elements.signalButton.textContent = '提交中…';

  try {
    await postSignalEvent({
      road_id: ROAD.id,
      timestamp: new Date().toISOString(),
      latitude: latestPosition.latitude,
      longitude: latestPosition.longitude,
      accuracy: latestPosition.accuracy
    });
    await refreshStats();
    countdown.start(averageCycleSeconds);
    setStatus('已記錄剛剛轉燈，開始倒數。', true);
  } catch {
    setStatus('提交失敗，請稍後再試。', true);
  } finally {
    elements.signalButton.textContent = '剛剛轉燈';
    elements.signalButton.disabled = false;
  }
}

function init() {
  elements.roadName.textContent = ROAD.name;
  elements.roadId.textContent = ROAD.id;
  elements.averageCycle.textContent = `${averageCycleSeconds} 秒`;
  elements.countdown.textContent = '等待資料';
  elements.signalButton.addEventListener('click', recordSignalChange);
  refreshStats();
  watchPosition(renderPosition, renderLocationError, LOCATION_OPTIONS);
}

init();