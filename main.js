const WORKER_API = 'https://lsk001-api.ctakwah.workers.dev';

const elements = {
  status: document.querySelector('[data-location-status]'),
  distance: document.querySelector('[data-distance]'),
  accuracy: document.querySelector('[data-accuracy]'),
  signalButton: document.querySelector('[data-signal-button]')
};

elements.signalButton.addEventListener('click', () => {
  console.log('LSK001「剛剛轉燈」按鈕已按下');

  elements.signalButton.textContent = '已按下「剛剛轉燈」';

  elements.signalButton.disabled = true;
});

let roads = [];
let targetRoad = null;


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
// 6. 初始化
// ===================================================

async function init() {
  try {
    await loadRoads();
    startGPS();
  } catch (error) {
    console.error('LSK001 初始化失敗：', error);

    elements.status.textContent =
      '無法取得 LSK001 道路資料。';

    elements.distance.textContent =
      '無法計算';

    elements.accuracy.textContent =
      '無法取得';
  }
}

init();