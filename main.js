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
  info: document.querySelector('[data-countdown-info]')
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

  targetRoad = roads.find(
    (road) => road.road_id === 'LSK001'
  ) || roads[0];

  console.log('LSK001 道路資料：', targetRoad);

  return targetRoad;
}


// ===================================================
// 2. 計算兩個 GPS 座標之間的距離
//    使用 Haversine formula
// ===================================================

function distanceMeters(point1, point2) {
  const earthRadius = 6371000;

  const lat1 = point1.latitude * Math.PI / 180;
  const lat2 = point2.latitude * Math.PI / 180;

  const deltaLat =
    (point2.latitude - point1.latitude) * Math.PI / 180;

  const deltaLon =
    (point2.longitude - point1.longitude) * Math.PI / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(deltaLon / 2) ** 2;

  const c =
    2 * Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;
}


// ===================================================
// 3. 顯示 GPS 位置 + 100 米範圍判斷
// ===================================================

function handlePosition(position) {
  if (!targetRoad) {
    elements.status.textContent =
      '尚未取得 LSK001 道路資料。';

    return;
  }

  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  const accuracy = position.coords.accuracy;

  latestPosition = {
    latitude,
    longitude,
    accuracy
  };

  const userPosition = {
    latitude,
    longitude
  };

  const roadPosition = {
    latitude: targetRoad.latitude,
    longitude: targetRoad.longitude
  };

  const distance = distanceMeters(
    userPosition,
    roadPosition
  );

  // 使用 D1 roads 表內的 radius
  // 目前 LSK001 = 100 米
  const radius = Number(targetRoad.radius) || 100;


  // =================================================
  // 100 米範圍判斷
  // =================================================

  if (distance <= radius) {

    elements.status.textContent =
      `已進入 LSK001 ${radius} 米範圍`;

    // 進入 100 米範圍
    // 啟用「剛剛轉燈」
    elements.signalButton.disabled = false;

  } else {

    elements.status.textContent =
      `尚未進入 LSK001 ${radius} 米範圍`;

    // 超過 100 米
    // 禁止按「剛剛轉燈」
    elements.signalButton.disabled = true;
  }


  // 顯示距離，小數 1 位
  elements.distance.textContent =
    `${distance.toFixed(1)} 米`;

  // 顯示 GPS 精度
  elements.accuracy.textContent =
    `±${Math.round(accuracy)} 米`;


  console.log('GPS latitude：', latitude);
  console.log('GPS longitude：', longitude);
  console.log('GPS accuracy：', accuracy);
  console.log('距離 LSK001：', distance.toFixed(1), '米');
  console.log('LSK001 範圍：', radius, '米');

  console.log(
    '是否進入範圍：',
    distance <= radius ? 'YES' : 'NO'
  );
}


// ===================================================
// 4. GPS 錯誤處理
// ===================================================

function handlePositionError(error) {
  console.error('GPS error：', error);

  if (error.code === 1) {

    elements.status.textContent =
      'GPS 權限被拒絕，請允許網站使用位置。';

  } else if (error.code === 2) {

    elements.status.textContent =
      '暫時無法取得 GPS 位置。';

  } else if (error.code === 3) {

    elements.status.textContent =
      'GPS 定位逾時，請稍後再試。';

  } else {

    elements.status.textContent =
      '無法取得 GPS 位置。';
  }

  elements.distance.textContent =
    '無法計算';

  elements.accuracy.textContent =
    '無法取得';
}


// ===================================================
// 5. 開始 GPS
// ===================================================

function startGPS() {
  if (!navigator.geolocation) {

    elements.status.textContent =
      '此裝置不支援 GPS 定位。';

    return;
  }

  elements.status.textContent =
    '正在取得 GPS 位置…';

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
  if (!countdownElements.panel) {
    return;
  }

  countdownElements.panel.hidden = false;
}


function hideCountdownPanel() {
  if (!countdownElements.panel) {
    return;
  }

  countdownElements.panel.hidden = true;
}


// ===================================================
// 7. 停止本地倒數
// ===================================================

function stopCountdownTimer() {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  countdownEndAtMs = null;
}


// ===================================================
// 8. 更新 PWA 倒數畫面
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
    countdownState === 'GREEN'
      ? '🟢 綠燈'
      : '🔴 紅燈';

  countdownElements.seconds.textContent =
    Math.max(0, Math.round(remainingSec));

  countdownElements.info.textContent =
    '實驗倒數｜資料模型：' +
    (
      countdownModel?.source === 'TIME_BUCKET'
        ? '目前時段'
        : '整體資料'
    );
}


// ===================================================
// 9. 開始本地每秒倒數
// ===================================================

function startLocalCountdown() {

  // 如果之前已有倒數 timer，只停止舊 timer
  // 但不要清除 countdownEndAtMs
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

    // 最新 GREEN 超過 10 分鐘
    // 就停止顯示實驗倒數
    if (
      Number.isFinite(countdownLatestGreenAgeSec) &&
      Number.isFinite(countdownStartedAtMs)
    ) {

      const currentGreenAgeSec =
        countdownLatestGreenAgeSec +
        (
          nowMs - countdownStartedAtMs
        ) / 1000;

      if (currentGreenAgeSec >= 600) {

        stopCountdownTimer();

        if (countdownElements.state) {
          countdownElements.state.textContent =
            '等待新的轉燈資料';
        }

        if (countdownElements.seconds) {
          countdownElements.seconds.textContent =
            '--';
        }

        if (countdownElements.info) {
          countdownElements.info.textContent =
            '最新 GREEN 已超過 10 分鐘，請重新記錄轉燈。';
        }

        return;
      }
    }


    let remainingSec =
      (
        countdownEndAtMs - nowMs
      ) / 1000;


    // =================================================
    // 一個階段完結
    // =================================================

    if (remainingSec <= 0) {

      if (countdownState === 'GREEN') {

        // GREEN 完結 → 進入 RED
        countdownState = 'RED';

        countdownEndAtMs =
          nowMs +
          countdownModel.red_average_sec * 1000;

      } else {

        // RED 完結 → 進入 GREEN
        countdownState = 'GREEN';

        countdownEndAtMs =
          nowMs +
          countdownModel.green_average_sec * 1000;
      }

      remainingSec =
        (
          countdownEndAtMs - nowMs
        ) / 1000;
    }


    updateCountdownDisplay(remainingSec);

  }, 250);
}


// ===================================================
// 10. 呼叫 Worker /api/signal-countdown
// ===================================================

async function loadCountdown() {

  if (!countdownElements.panel) {
    console.warn(
      '找不到 countdown-panel，請確認 index.html 已加入倒數區域。'
    );

    return;
  }

  try {

    console.log(
      '正在取得 LSK001 signal countdown…'
    );

    const response = await fetch(
      `${WORKER_API}/api/signal-countdown?road_id=LSK001`
    );

    const data = await response.json();

    console.log(
      'LSK001 countdown API：',
      data
    );


    // =================================================
    // Worker 表示目前不能倒數
    // =================================================

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


    // =================================================
    // 檢查模型資料
    // =================================================

    if (
      !data.model ||
      !Number.isFinite(
        Number(data.model.green_average_sec)
      ) ||
      !Number.isFinite(
        Number(data.model.red_average_sec)
      ) ||
      !Number.isFinite(
        Number(data.estimated_remaining_sec)
      )
    ) {

      console.error(
        'Countdown API 資料不足：',
        data
      );

      stopCountdownTimer();
      hideCountdownPanel();

      return;
    }


    // =================================================
    // 保存倒數資料
    // =================================================

    countdownState =
      data.current_state;

    countdownModel = {
      source:
        data.model_source,

      green_average_sec:
        Number(
          data.model.green_average_sec
        ),

      red_average_sec:
        Number(
          data.model.red_average_sec
        ),

      cycle_average_sec:
        Number(
          data.model.cycle_average_sec
        )
    };

    countdownLatestGreenAgeSec =
      Number(
        data.latest_green_age_sec
      );

    countdownStartedAtMs =
      Date.now();


    // =================================================
    // 設定第一次倒數終點
    // =================================================

    countdownEndAtMs =
      Date.now() +
      Number(
        data.estimated_remaining_sec
      ) * 1000;


    // =================================================
    // 顯示 PWA 倒數
    // =================================================

    showCountdownPanel();

    updateCountdownDisplay(
      Number(
        data.estimated_remaining_sec
      )
    );

    startLocalCountdown();


    console.log(
      'LSK001 實驗倒數已開始：',
      {
        state: countdownState,
        remaining:
          data.estimated_remaining_sec,
        model_source:
          data.model_source,
        latest_green_age_sec:
          data.latest_green_age_sec
      }
    );

  } catch (error) {

    console.error(
      '取得 LSK001 countdown 失敗：',
      error
    );

    stopCountdownTimer();
    hideCountdownPanel();
  }
}


// ===================================================
// 11. 記錄 GREEN / RED 訊號事件
// ===================================================

const signalChoice = document.querySelector(
  '[data-signal-choice]'
);

const signalResult = document.querySelector(
  '[data-signal-result]'
);

const signalStateButtons = document.querySelectorAll(
  '[data-signal-state]'
);


// ===================================================
// 「剛剛轉燈」按鈕
// ===================================================

elements.signalButton.addEventListener(
  'click',
  () => {

    if (!latestPosition || !targetRoad) {

      signalResult.textContent =
        '尚未取得 GPS 位置。';

      signalChoice.hidden = false;

      return;
    }


    const roadPosition = {
      latitude: targetRoad.latitude,
      longitude: targetRoad.longitude
    };

    const userPosition = {
      latitude: latestPosition.latitude,
      longitude: latestPosition.longitude
    };

    const distance = distanceMeters(
      userPosition,
      roadPosition
    );

    const radius =
      Number(targetRoad.radius) || 100;


    if (distance > radius) {

      signalResult.textContent =
        `目前距離 LSK001 ${distance.toFixed(1)} 米，超過 ${radius} 米範圍。`;

      signalChoice.hidden = false;

      return;
    }


    signalResult.textContent =
      '請選擇剛才的燈號。';

    signalChoice.hidden = false;
  }
);


// ===================================================
// GREEN / RED 選擇
// ===================================================

signalStateButtons.forEach(
  (button) => {

    button.addEventListener(
      'click',
      async () => {

        if (!latestPosition || !targetRoad) {

          signalResult.textContent =
            '尚未取得 GPS 位置。';

          return;
        }


        const state =
          button.dataset.signalState;


        const roadPosition = {
          latitude: targetRoad.latitude,
          longitude: targetRoad.longitude
        };

        const userPosition = {
          latitude: latestPosition.latitude,
          longitude: latestPosition.longitude
        };


        const distance =
          distanceMeters(
            userPosition,
            roadPosition
          );


        const radius =
          Number(targetRoad.radius) || 100;


        if (distance > radius) {

          signalResult.textContent =
            `目前距離 ${distance.toFixed(1)} 米，已超出 ${radius} 米範圍。`;

          return;
        }


        signalStateButtons.forEach(
          (item) => {
            item.disabled = true;
          }
        );


        signalResult.textContent =
          `正在記錄 ${state === 'GREEN' ? '🟢 轉綠' : '🔴 轉紅'}…`;


        try {

          const response = await fetch(
            `${WORKER_API}/api/signal-events`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json'
              },

              body: JSON.stringify({
                road_id:
                  targetRoad.road_id,

                state,

                latitude:
                  latestPosition.latitude,

                longitude:
                  latestPosition.longitude,

                accuracy:
                  latestPosition.accuracy,

                distance_m:
                  distance
              })
            }
          );


          const data =
            await response.json();


          if (!response.ok || !data.ok) {

            throw new Error(
              data.message ||
              data.error ||
              `HTTP ${response.status}`
            );
          }


          signalResult.textContent =
            `✅ 已記錄 ${state === 'GREEN' ? '🟢 轉綠' : '🔴 轉紅'}（事件 ID：${data.event.id}）`;


          console.log(
            '訊號事件已記錄：',
            data.event
          );


          signalStateButtons.forEach(
            (item) => {
              item.disabled = false;
            }
          );


          // =================================================
          // 如果剛剛記錄的是 GREEN
          // 立即重新取得實驗倒數
          // =================================================

          if (state === 'GREEN') {

            await loadCountdown();

          }


        } catch (error) {

          console.error(
            '訊號事件記錄失敗：',
            error
          );


          signalResult.textContent =
            `❌ 記錄失敗：${error.message}`;


          signalStateButtons.forEach(
            (item) => {
              item.disabled = false;
            }
          );
        }
      }
    );
  }
);


// ===================================================
// 12. 初始化
// ===================================================

async function init() {

  try {

    await loadRoads();

    startGPS();

    // 如果目前有最近 10 分鐘內的 GREEN，
    // PWA 開啟時可以直接顯示實驗倒數。
    await loadCountdown();

  } catch (error) {

    console.error(
      'LSK001 初始化失敗：',
      error
    );


    elements.status.textContent =
      '無法取得 LSK001 道路資料。';

    elements.distance.textContent =
      '無法計算';

    elements.accuracy.textContent =
      '無法取得';
  }
}


init();