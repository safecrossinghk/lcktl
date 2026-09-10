const WORKER_API = 'https://lsk001-api.ctakwah.workers.dev';

async function loadRoads() {
  try {
    const response = await fetch(`${WORKER_API}/api/roads`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    console.log('LSK001 roads API:', data);

    if (!data.ok || !Array.isArray(data.roads)) {
      throw new Error('道路資料格式不正確');
    }

    if (data.roads.length === 0) {
      console.warn('Roads API 暫時沒有道路資料');
      return;
    }

    const road = data.roads[0];

    console.log('目前道路：', road.name);
    console.log('ROAD_ID：', road.road_id);
    console.log('Latitude：', road.latitude);
    console.log('Longitude：', road.longitude);
    console.log('Radius：', road.radius);

  } catch (error) {
    console.error('讀取道路資料失敗：', error);
  }
}

loadRoads();