<!DOCTYPE html>
<html lang="zh-Hant">

<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#f5f7fa">
<title>安全過路 HK - LSK001 實時倒數</title>

<style>
* { box-sizing: border-box; }
body {
  margin: 0; padding: 20px 16px; background: #f5f7fa; color: #222;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.container { max-width: 520px; margin: 0 auto; }
h1 { margin: 0 0 6px; text-align: center; font-size: 26px; }
.sub-title { margin: 0 0 20px; text-align: center; color: #666; font-size: 13px; line-height: 1.4; }

.card {
  background: white; border-radius: 20px; padding: 22px 18px;
  margin-bottom: 16px; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08);
}
.state { font-size: 22px; font-weight: 700; margin-bottom: 8px; text-align: center; }
.seconds { font-size: 76px; line-height: 1; font-weight: 700; margin: 10px 0; text-align: center; }
.unit { font-size: 18px; color: #666; text-align: center; }
.status { min-height: 22px; margin-top: 14px; color: #666; font-size: 13px; text-align: center; }

.btn {
  width: 100%; margin-top: 12px; padding: 14px; border: 0;
  border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer;
}
.btn-dark { background: #222; color: white; }
.btn-green { background: #2e7d32; color: white; }
.btn-red { background: #c62828; color: white; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }

.section-title { font-weight: 700; margin-bottom: 10px; font-size: 15px; }
.info-row {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px;
}
.info-row:last-child { border-bottom: 0; }
.info-label { color: #666; }
.info-value { text-align: right; font-weight: 600; }
.error { color: #c62828; }
</style>
</head>

<body>

<main class="container">
  <h1>安全過路 HK</h1>
  <p class="sub-title">LSK001 實時倒數系統（已結合 GPS 定位與高精度延遲補償）</p>

  <!-- 倒數主卡片 -->
  <section class="card">
    <div class="state" id="state">正在取得資料…</div>
    <div class="seconds" id="seconds">--</div>
    <div class="unit">秒</div>
    <div class="status" id="status">正在連接 LSK001 Worker…</div>
    <button class="btn btn-dark" id="refreshButton" type="button">🔄 重新校正</button>
  </section>

  <!-- GPS 與現場按鈕卡片 -->
  <section class="card">
    <div class="section-title">📍 位置狀態 (LSK001 100米範圍限制)</div>
    <div class="info-row"><span class="info-label">距離 LSK001</span><span class="info-value" id="distanceValue">等待 GPS...</span></div>
    <div class="info-row"><span class="info-label">GPS 精度</span><span class="info-value" id="accuracyValue">等待 GPS...</span></div>

    <div style="margin-top: 16px;">
      <div class="section-title" style="text-align: center; margin-bottom: 8px;">選擇剛剛的燈號 (100米內解鎖)</div>
      <button class="btn btn-green" id="btnGreen" disabled>🟢 剛剛轉綠</button>
      <button class="btn btn-red" id="btnRed" disabled>🔴 剛剛轉紅</button>
      <div id="gpsStatusHint" style="font-size: 12px; color: #888; text-align: center; margin-top: 8px;">進入 LSK001 100 米範圍後，即可解鎖回報按鈕。</div>
    </div>
  </section>

  <!-- Worker 數據面板 -->
  <section class="card">
    <div class="section-title">Worker 倒數資料</div>
    <div class="info-row"><span class="info-label">GREEN</span><span class="info-value" id="greenAverage">--</span></div>
    <div class="info-row"><span class="info-label">RED</span><span class="info-value" id="redAverage">--</span></div>
    <div class="info-row"><span class="info-label">Cycle</span><span class="info-value" id="cycleAverage">--</span></div>
    <div class="info-row"><span class="info-label">模型</span><span class="info-value" id="modelSource">--</span></div>
    <div class="info-row"><span class="info-label">API 計算時間</span><span class="info-value" id="apiTime">--</span></div>
    <div class="info-row"><span class="info-label">最新 GREEN 距今</span><span class="info-value" id="greenAge">--</span></div>
  </section>
</main>

<script>
const WORKER_API = 'https://lsk001-api.ctakwah.workers.dev';
const LSK001_LAT = 22.3375; // 請換成你實際的 LSK001 緯度
const LSK001_LNG = 114.1480; // 請換成你實際的 LSK001 經度

const stateElement = document.getElementById('state');
const secondsElement = document.getElementById('seconds');
const statusElement = document.getElementById('status');
const refreshButton = document.getElementById('refreshButton');
const distanceValue = document.getElementById('distanceValue');
const accuracyValue = document.getElementById('accuracyValue');
const btnGreen = document.getElementById('btnGreen');
const btnRed = document.getElementById('btnRed');
const gpsStatusHint = document.getElementById('gpsStatusHint');

const greenAverageElement = document.getElementById('greenAverage');
const redAverageElement = document.getElementById('redAverage');
const cycleAverageElement = document.getElementById('cycleAverage');
const modelSourceElement = document.getElementById('modelSource');
const apiTimeElement = document.getElementById('apiTime');
const greenAgeElement = document.getElementById('greenAge');

let countdownTimer = null;
let countdownEndAtMs = null;
let currentState = null;
let modelData = null;

// =================================================
// 1. 取得 Worker 倒數資料（含網絡延遲補償）
// =================================================
async function loadCountdown() {
  refreshButton.disabled = true;
  statusElement.textContent = '正在向 Worker 取得最新資料…';
  statusElement.classList.remove('error');

  const fetchStartTime = Date.now();

  try {
    const cacheBuster = `_t=${fetchStartTime}`;
    const response = await fetch(
      `${WORKER_API}/api/signal-countdown?road_id=LSK001&${cacheBuster}`
    );

    const data = await response.json();
    console.log('LSK001 Countdown API：', data);

    if (!response.ok || !data.ok || !data.countdown_available || !data.available) {
      throw new Error('目前沒有可用的倒數資料');
    }

    const rawRemaining = Number(data.estimated_remaining_sec);
    if (!Number.isFinite(rawRemaining)) {
      throw new Error('Worker 沒有提供有效的剩餘時間');
    }

    // 網絡延遲補償計算
    const latencySec = (Date.now() - fetchStartTime) / 1000;
    const adjustedRemaining = Math.max(0, rawRemaining - latencySec);

    currentState = data.current_state;
    modelData = {
      green_average_sec: Number(data.model?.green_average_sec) || 31.9,
      red_average_sec: Number(data.model?.red_average_sec) || 91.9
    };

    countdownEndAtMs = Date.now() + adjustedRemaining * 1000;
    updateDisplay(adjustedRemaining, currentState);
    startLocalCountdown();

    greenAverageElement.textContent = `${Number(data.model.green_average_sec).toFixed(1)} 秒`;
    redAverageElement.textContent = `${Number(data.model.red_average_sec).toFixed(1)} 秒`;
    cycleAverageElement.textContent = `${Number(data.model.cycle_average_sec).toFixed(1)} 秒`;
    modelSourceElement.textContent = data.model_source || '--';
    apiTimeElement.textContent = data.current_hong_kong_time || '--';
    greenAgeElement.textContent = Number.isFinite(Number(data.latest_green_age_sec))
      ? `${Number(data.latest_green_age_sec).toFixed(1)} 秒`
      : '--';

    statusElement.textContent = '✅ 已與 Worker 同步';
  } catch (error) {
    console.error('取得 LSK001 倒數失敗：', error);
    if (!Number.isFinite(countdownEndAtMs)) {
      stopLocalCountdown();
      stateElement.textContent = '⚠️ 無法取得倒數';
      secondsElement.textContent = '--';
    }
    statusElement.textContent = `取得資料失敗：${error.message}`;
    statusElement.classList.add('error');
  } finally {
    refreshButton.disabled = false;
  }
}

// =================================================
// 2. 更新畫面 (Math.floor 確保 0 秒過渡)
// =================================================
function updateDisplay(remaining, state) {
  stateElement.textContent = state === 'GREEN' ? '🟢 綠燈' : '🔴 紅燈';
  secondsElement.textContent = Math.max(0, Math.floor(remaining));
}

// =================================================
// 3. 本地倒數計時器
// =================================================
function startLocalCountdown() {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  countdownTimer = setInterval(() => {
    if (!Number.isFinite(countdownEndAtMs)) return;

    const remaining = (countdownEndAtMs - Date.now()) / 1000;

    if (remaining <= 0) {
      const nextState = currentState === 'GREEN' ? 'RED' : 'GREEN';
      const nextDuration = nextState === 'GREEN'
        ? modelData.green_average_sec
        : modelData.red_average_sec;

      currentState = nextState;
      countdownEndAtMs = Date.now() + nextDuration * 1000;
      updateDisplay(nextDuration, currentState);
      return;
    }

    updateDisplay(remaining, currentState);
  }, 250);
}

function stopLocalCountdown() {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

// =================================================
// 4. GPS 定位與 Haversine 距離計算 (100米範圍檢查)
// =================================================
function initGPS() {
  if (!navigator.geolocation) {
    distanceValue.textContent = '不支援 GPS';
    return;
  }

  navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      accuracyValue.textContent = `${Math.round(accuracy)} 米`;

      // Haversine 公式計算距離
      const distance = getDistanceFromLatLonInMeters(lat, lng, LSK001_LAT, LSK001_LNG);
      distanceValue.textContent = `${Math.round(distance)} 米`;

      // 100 米範圍限制
      if (distance <= 100) {
        btnGreen.disabled = false;
        btnRed.disabled = false;
        gpsStatusHint.textContent = '✅ 已進入 LSK001 100 米範圍，按鈕已解鎖！';
        gpsStatusHint.style.color = '#2e7d32';
      } else {
        btnGreen.disabled = true;
        btnRed.disabled = true;
        gpsStatusHint.textContent = `📍 距離 LSK001 尚有 ${Math.round(distance)} 米（需在 100 米內才可回報）`;
        gpsStatusHint.style.color = '#888';
      }
    },
    (error) => {
      console.error('GPS 錯誤：', error);
      distanceValue.textContent = '無法取得定位';
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // 地球半徑 (米)
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// =================================================
// 5. 現場按鈕回報 (轉綠 / 轉紅)
// =================================================
async function reportSignalEvent(state) {
  btnGreen.disabled = true;
  btnRed.disabled = true;
  statusElement.textContent = `正在回報「${state === 'GREEN' ? '轉綠' : '轉紅'}」事件…`;

  try {
    const response = await fetch(`${WORKER_API}/api/signal-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        road_id: 'LSK001',
        event_type: state,
        timestamp: Date.now()
      })
    });

    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.message || '回報失敗');
    }

    statusElement.textContent = '✅ 回報成功，已重新校正倒數！';
    // 回報成功後立刻重新載入最新倒數資料
    loadCountdown();
  } catch (error) {
    console.error('回報燈號失敗：', error);
    statusElement.textContent = `回報失敗：${error.message}`;
    statusElement.classList.add('error');
    btnGreen.disabled = false;
    btnRed.disabled = false;
  }
}

btnGreen.addEventListener('click', () => reportSignalEvent('GREEN'));
btnRed.addEventListener('click', () => reportSignalEvent('RED'));

// =================================================
// 6. 事件監聽與初始化
// =================================================
refreshButton.addEventListener('click', () => loadCountdown());

function handleResume() {
  if (document.hidden) return;
  if (Number.isFinite(countdownEndAtMs)) {
    const immediateRemaining = (countdownEndAtMs - Date.now()) / 1000;
    updateDisplay(immediateRemaining, currentState);
  }
  startLocalCountdown();
  loadCountdown();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopLocalCountdown();
  } else {
    handleResume();
  }
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) handleResume();
});

window.addEventListener('focus', () => {
  handleResume();
});

// 初始化執行
initGPS();
loadCountdown();
</script>

</body>
</html>