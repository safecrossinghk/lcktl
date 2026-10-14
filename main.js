const WORKER_API = 'https://lsk001-api.ctakwah.workers.dev';

const elements = {
  status: document.querySelector('[data-location-status]'),
  distance: document.querySelector('[data-distance]'),
  accuracy: document.querySelector('[data-accuracy]'),
  signalButton: document.querySelector('[data-signal-button]')
};

let roads = [];
let targetRoad = null;
let latestPosition = null;


// ===================================================
// LSK001 實驗倒數 UI
// ===================================================

const countdownElements = {
  panel: document.querySelector('[data-countdown-panel]'),
  state: document.querySelector('[data-countdown-state]'),
  seconds: document.querySelector('[data-countdown-seconds]'),
  info: document.querySelector('[data-countdown-info]'),
  reviseButton: document.querySelector('[data-countdown-revise]'),
  stopButton: document.querySelector('[data-countdown-stop]')
};

let countdownTimer = null;
let countdownEndAtMs = null;
let countdownState = null;
let countdownModel = null;
let countdownLatestGreenAgeSec = null;
let countdownStartedAtMs = null;


// ===================================================
// 1. 讀取 Worker /api/roads
// ===================================================

async function loadRoads() {
  const response = await fetch(`${WORKER_API}/api/roads`);

  if (!response.ok) {
    throw new Error(`道路資料 HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data.ok || !Array.isArray(data.roads)) {
    throw new Error('道路資料格式不正確');
  }

  roads = data.roads;

  if (roads.length === 0) {
    throw new Error('目前沒有可用道路資料');
  }

  targetRoad =
    roads.find(
      (road) => road.road_id === 'LSK001'
    ) || roads[0];

  console.log('LSK001 道路資料：', targetRoad);

  return targetRoad;
}


// ===================================================
// 2. 計算兩個 GPS 座標之間的距離 (含 NaN 防範)
// ===================================================

function distanceMeters(point1, point2) {
  const earthRadius = 6371000;

  const lat1 = point1.latitude * Math.PI / 180;
  const lat2 = point2.latitude * Math.PI / 180;

  const deltaLat = (point2.latitude - point1.latitude) * Math.PI / 180;
  const deltaLon = (point2.longitude - point1.longitude) * Math.PI / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(deltaLon / 2) ** 2;

  const aClamped = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(aClamped), Math.sqrt(1 - aClamped));

  return earthRadius * c;
}


// ===================================================
// 3. 顯示 GPS 位置 + 100 米範圍判斷（不自動彈出倒數）
// ===================================================

function handlePosition(position) {
  if (!targetRoad) {
    elements.status.textContent = '尚未取得 LSK001 道路資料。';
    return;
  }

  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  const accuracy = position.coords.accuracy;

  latestPosition = { latitude, longitude, accuracy };

  const userPosition = { latitude, longitude };
  const roadPosition = { latitude: targetRoad.latitude, longitude: targetRoad.longitude };

  const distance = distanceMeters(userPosition, roadPosition);
  const radius = Number(targetRoad.radius) || 100;

  if (distance <= radius) {
    elements.status.textContent = `已進入 LSK001 ${radius} 米範圍`;
    elements.signalButton.disabled = false;
  } else {
    elements.status.textContent = `尚未進入 LSK001 ${radius} 米範圍`;
    elements.signalButton.disabled = true;
  }

  elements.distance.textContent = `${distance.toFixed(1)} 米`;
  elements.accuracy.textContent = `±${Math.round(accuracy)} 米`;
}


// ===================================================
// 4. GPS 錯誤
// ===================================================

function handlePositionError(error) {
  console.error('GPS error：', error);

  if (error.code === 1) {
    elements.status.textContent = 'GPS 權限被拒絕，請允許網站使用位置。';
  } else if (error.code === 2) {
    elements.status.textContent = '暫時無法取得 GPS 位置。';
  } else if (error.code === 3) {
    elements.status.textContent = 'GPS 定位逾時，請稍後再試。';
  } else {
    elements.status.textContent = '無法取得 GPS 位置。';
  }

  elements.distance.textContent = '無法計算';
  elements.accuracy.textContent = '無法取得';
}


// ===================================================
// 5. 開始 GPS
// ===================================================

function startGPS() {
  if (!navigator.geolocation) {
    elements.status.textContent = '此裝置不支援 GPS 定位。';
    return;
  }

  elements.status.textContent = '正在取得 GPS 位置…';

  navigator.geolocation.watchPosition(
    handlePosition,
    handlePositionError,
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000
    }
  );
}


// ===================================================
// 6. 顯示 / 隱藏倒數畫面
// ===================================================

function showCountdownPanel() {
  if (!countdownElements.panel) return;
  countdownElements.panel.hidden = false;
}

function hideCountdownPanel() {
  if (!countdownElements.panel) return;
  countdownElements.panel.hidden = true;
}


// ===================================================
// 7. 停止本地倒數 timer
// ===================================================

function stopCountdownTimer() {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  countdownEndAtMs = null;
}


// ===================================================
// 8. 使用者主動停止本次倒數
// ===================================================

function stopCountdownForUser() {
  stopCountdownTimer();

  if (countdownElements.state) {
    countdownElements.state.textContent = '⏹️ 倒數已停止';
  }

  if (countdownElements.seconds) {
    countdownElements.seconds.textContent = '--';
  }

  if (countdownElements.info) {
    countdownElements.info.textContent =
      '本次 LSK001 倒數已停止。離開現場後可停止；需要重新開始時可按「重新校正」。';
  }
}


// ===================================================
// 9. 更新 PWA 倒數畫面
// ===================================================

function updateCountdownDisplay(remainingSec) {
  if (
    !countdownElements.state ||
    !countdownElements.seconds ||
    !countdownElements.info
  ) {
    return;
  }

  countdownElements.state.textContent =
    countdownState === 'GREEN' ? '🟢 綠燈' : '🔴 紅燈';

  countdownElements.seconds.textContent =
    Math.max(0, Math.round(remainingSec));

  const modelText =
    countdownModel?.source === 'TIME_DISTANCE_WEIGHTED'
      ? '最接近當刻＋時間距離加權'
      : '整體資料';

  let infoText = '實驗倒數｜資料模型：' + modelText;

  if (countdownModel?.fieldCorrectionApplied) {
    infoText += `｜GREEN 實測 ${countdownModel.greenCorrectionSec.toFixed(1)} 秒`;
  }

  countdownElements.info.textContent = infoText;
}


// ===================================================
// 10. 開始本地倒數 (含 2 小時無按掣自動停止保護)
// ===================================================

function startLocalCountdown() {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  if (
    !countdownState ||
    !countdownModel ||
    !Number.isFinite(countdownEndAtMs)
  ) {
    return;
  }

  countdownTimer = setInterval(() => {
    const nowMs = Date.now();

    // 2 小時無人按掣自動停止保護
    if (
      Number.isFinite(countdownLatestGreenAgeSec) &&
      Number.isFinite(countdownStartedAtMs)
    ) {
      const currentGreenAgeSec =
        countdownLatestGreenAgeSec + (nowMs - countdownStartedAtMs) / 1000;

      if (currentGreenAgeSec >= 7200) {
        stopCountdownTimer();
        if (countdownElements.state) countdownElements.state.textContent = '等待新的轉燈資料';
        if (countdownElements.seconds) countdownElements.seconds.textContent = '--';
        if (countdownElements.info) countdownElements.info.textContent = '最新 GREEN 已超過 2 小時，請重新記錄轉燈。';
        return;
      }
    }

    let remainingSec = (countdownEndAtMs - nowMs) / 1000;

    // ---------------------------------------------------
    // 本地倒數完成：重新向 Worker 同步
    // ---------------------------------------------------
    if (remainingSec <= 0) {
      console.log('LSK001 本地倒數完成，重新向 Worker 同步…');
      stopCountdownTimer();
      loadCountdown();
      return;
    }

    updateCountdownDisplay(remainingSec);
  }, 250);
}


// ===================================================
// 11. 呼叫 Worker /api/signal-countdown (採用舊版絕對基準對齊，確保校正準確)
// ===================================================

async function loadCountdown() {
  if (!countdownElements.panel) {
    console.warn('找不到 countdown-panel。');
    return;
  }

  try {
    console.log('正在取得 LSK001 signal countdown…');

    const response = await fetch(`${WORKER_API}/api/signal-countdown?road_id=LSK001`);
    const data = await response.json();

    console.log('LSK001 countdown API：', data);

    if (
      !response.ok ||
      !data.ok ||
      !data.countdown_available ||
      !data.available
    ) {
      stopCountdownTimer();
      hideCountdownPanel();
      return;
    }

    if (
      !data.model ||
      !Number.isFinite(Number(data.model.green_average_sec)) ||
      !Number.isFinite(Number(data.model.red_average_sec)) ||
      !Number.isFinite(Number(data.model.cycle_average_sec)) ||
      !Number.isFinite(Number(data.estimated_remaining_sec))
    ) {
      console.error('Countdown API 資料不足：', data);
      stopCountdownTimer();
      hideCountdownPanel();
      return;
    }

    countdownState = data.current_state;

    countdownModel = {
      source: data.model_source,
      green_average_sec: Number(data.model.green_average_sec),
      red_average_sec: Number(data.model.red_average_sec),
      cycle_average_sec: Number(data.model.cycle_average_sec),
      fieldCorrectionApplied: Boolean(data.field_correction?.applied),
      greenCorrectionSec: Number(data.field_correction?.green_actual_sec)
    };

    if (!Number.isFinite(countdownModel.greenCorrectionSec)) {
      countdownModel.greenCorrectionSec = Number(data.model.green_average_sec);
    }

    countdownLatestGreenAgeSec = Number(data.latest_green_age_sec);
    countdownStartedAtMs = Date.now();

    // 採用舊版絕對時間基準設定終點，確保按按鈕或校正時秒數精準對齊
    countdownEndAtMs =
      Date.now() +
      Number(data.estimated_remaining_sec) * 1000;

    showCountdownPanel();
    updateCountdownDisplay(Number(data.estimated_remaining_sec));
    startLocalCountdown();

    console.log('LSK001 實驗倒數已開始/校正完成：', {
      state: countdownState,
      remaining: data.estimated_remaining_sec
    });

  } catch (error) {
    console.error('取得 LSK001 countdown 失敗：', error);
    stopCountdownTimer();
    hideCountdownPanel();
  }
}


// ===================================================
// 12. Revise／重新校正倒數
// ===================================================

async function reviseCountdown() {
  if (!countdownElements.reviseButton) return;

  countdownElements.reviseButton.disabled = true;

  if (countdownElements.info) {
    countdownElements.info.textContent = '正在向 Worker 重新校正倒數…';
  }

  try {
    await loadCountdown();
  } finally {
    countdownElements.reviseButton.disabled = false;
  }
}


// ===================================================
// 13. 記錄 GREEN / RED 訊號事件
// ===================================================

const signalChoice = document.querySelector('[data-signal-choice]');
const signalResult = document.querySelector('[data-signal-result]');
const signalStateButtons = document.querySelectorAll('[data-signal-state]');

elements.signalButton.addEventListener('click', () => {
  if (!latestPosition || !targetRoad) {
    signalResult.textContent = '尚未取得 GPS 位置。';
    signalChoice.hidden = false;
    return;
  }

  const roadPosition = { latitude: targetRoad.latitude, longitude: targetRoad.longitude };
  const userPosition = { latitude: latestPosition.latitude, longitude: latestPosition.longitude };

  const distance = distanceMeters(userPosition, roadPosition);
  const radius = Number(targetRoad.radius) || 100;

  if (distance > radius) {
    signalResult.textContent = `目前距離 LSK001 ${distance.toFixed(1)} 米，超過 ${radius} 米範圍。`;
    signalChoice.hidden = false;
    return;
  }

  signalResult.textContent = '請選擇剛才的燈號。';
  signalChoice.hidden = false;
});

signalStateButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    if (!latestPosition || !targetRoad) {
      signalResult.textContent = '尚未取得 GPS 位置。';
      return;
    }

    const state = button.dataset.signalState;
    const roadPosition = { latitude: targetRoad.latitude, longitude: targetRoad.longitude };
    const userPosition = { latitude: latestPosition.latitude, longitude: latestPosition.longitude };

    const distance = distanceMeters(userPosition, roadPosition);
    const radius = Number(targetRoad.radius) || 100;

    if (distance > radius) {
      signalResult.textContent = `目前距離 ${distance.toFixed(1)} 米，已超出 ${radius} 米範圍。`;
      return;
    }

    signalStateButtons.forEach((item) => { item.disabled = true; });
    signalResult.textContent = `正在記錄 ${state === 'GREEN' ? '🟢 轉綠' : '🔴 轉紅'}…`;

    try {
      const response = await fetch(`${WORKER_API}/api/signal-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          road_id: targetRoad.road_id,
          state,
          latitude: latestPosition.latitude,
          longitude: latestPosition.longitude,
          accuracy: latestPosition.accuracy,
          distance_m: distance
        })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || data.error || `HTTP ${response.status}`);
      }

      signalResult.textContent = `✅ 已記錄 ${state === 'GREEN' ? '🟢 轉綠' : '🔴 轉紅'}（事件 ID：${data.event.id}）`;

      signalStateButtons.forEach((item) => { item.disabled = false; });
      await loadCountdown();
    } catch (error) {
      console.error('訊號事件記錄失敗：', error);
      signalResult.textContent = `❌ 記錄失敗：${error.message}`;
      signalStateButtons.forEach((item) => { item.disabled = false; });
    }
  });
});


// ===================================================
// 14. 倒數控制按鈕
// ===================================================

if (countdownElements.reviseButton) {
  countdownElements.reviseButton.addEventListener('click', () => { reviseCountdown(); });
}

if (countdownElements.stopButton) {
  countdownElements.stopButton.addEventListener('click', () => { stopCountdownForUser(); });
}


// ===================================================
// 15. PWA 前景／背景自動重新校正
// ===================================================

let countdownWasRunningBeforeHidden = false;

document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    countdownWasRunningBeforeHidden = countdownTimer !== null;

    if (countdownTimer !== null) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    console.log('LSK001 PWA 已進入背景，暫停本地倒數 Timer。');
    return;
  }

  if (countdownWasRunningBeforeHidden) {
    countdownWasRunningBeforeHidden = false;

    console.log('LSK001 PWA 返回前景，重新向 Worker 校正倒數…');

    try {
      await loadCountdown();
      console.log('LSK001 PWA 返回前景後重新校正完成。');
    } catch (error) {
      console.error('LSK001 返回前景重新校正失敗：', error);
    }
  }
});


// ===================================================
// 16. 初始化（維持進入 100m 不自動彈出，手動按掣才叫出）
// ===================================================

async function init() {
  try {
    await loadRoads();
    startGPS();
    hideCountdownPanel();
  } catch (error) {
    console.error('LSK001 初始化失敗：', error);
    elements.status.textContent = '無法取得 LSK001 道路資料。';
    elements.distance.textContent = '無法計算';
    elements.accuracy.textContent = '無法取得';
  }
}

init();