const HEALTH_CHECK_URL = 'https://lsk001-api.ctakwah.workers.dev/api/health';

async function checkWorkerHealth() {
  const statusElement = document.querySelector('[data-worker-health-status]');
  const detailElement = document.querySelector('[data-worker-health-detail]');

  if (!statusElement || !detailElement) {
    return;
  }

  statusElement.textContent = 'Worker API：測試中…';
  detailElement.textContent = HEALTH_CHECK_URL;

  try {
    const response = await fetch(HEALTH_CHECK_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.ok === true) {
      statusElement.textContent = 'Worker API：正常';
      detailElement.textContent = `service=${data.service}, version=${data.version}`;
      return;
    }

    statusElement.textContent = 'Worker API：回應異常';
    detailElement.textContent = JSON.stringify(data);
  } catch (error) {
    statusElement.textContent = 'Worker API：連線失敗';
    detailElement.textContent = error instanceof Error ? error.message : '未知錯誤';
  }
}

checkWorkerHealth();