// =====================================================
// 🌕 中秋賞月｜Moon Watch HK
// V0.4
//
// 本版本：
// 1. 保留 V0.3 Open-Meteo 天氣
// 2. 保留 Open-Meteo 月相
// 3. 保留 Open-Meteo 月出 / 月落
// 4. 保留月出倒數
// 5. 新增「真實月亮方位＋高度」天文計算
// 6. 每 30 秒重新計算月亮位置
//
// 暫時未加入：
// - 手機指南針
// - 陀螺儀
// - 找月亮箭嘴
// - 賞月指數重新計算
// =====================================================


// -----------------------------------------------------
// 1. DOM
// -----------------------------------------------------

const countdown = document.getElementById("countdown");
const countdownText = document.getElementById("countdownText");

const locationBtn = document.getElementById("locationBtn");
const toast = document.getElementById("toast");

const weatherSummary = document.getElementById("weatherSummary");
const weatherTemp = document.getElementById("weatherTemp");
const hourlyWeather = document.getElementById("hourlyWeather");
const weatherUpdated = document.getElementById("weatherUpdated");


// -----------------------------------------------------
// 2. 預設香港位置
// -----------------------------------------------------

const DEFAULT_LOCATION = {
  lat: 22.3193,
  lon: 114.1694,
  name: "香港"
};

let currentLocation = {
  ...DEFAULT_LOCATION
};


// -----------------------------------------------------
// 3. Moonrise 狀態
// -----------------------------------------------------

let currentMoonrise = null;
let currentMoonset = null;


// -----------------------------------------------------
// 4. 香港時間
// -----------------------------------------------------

function getHongKongDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}


function getHongKongHour() {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Hong_Kong",
      hour: "2-digit",
      hour12: false
    }).format(new Date())
  );
}


// -----------------------------------------------------
// 5. 天氣文字
// -----------------------------------------------------

function weatherText(code) {

  const map = {
    0: ["晴朗", "☀️"],
    1: ["大致晴朗", "🌤️"],
    2: ["部分有雲", "⛅"],
    3: ["多雲", "☁️"],

    45: ["有霧", "🌫️"],
    48: ["有霧", "🌫️"],

    51: ["微雨", "🌦️"],
    53: ["微雨", "🌦️"],
    55: ["微雨", "🌦️"],

    56: ["凍雨", "🌧️"],
    57: ["凍雨", "🌧️"],

    61: ["有雨", "🌧️"],
    63: ["有雨", "🌧️"],
    65: ["大雨", "🌧️"],

    66: ["凍雨", "🌧️"],
    67: ["凍雨", "🌧️"],

    71: ["降雪", "🌨️"],
    73: ["降雪", "🌨️"],
    75: ["大雪", "❄️"],

    77: ["雪粒", "🌨️"],

    80: ["陣雨", "🌦️"],
    81: ["陣雨", "🌦️"],
    82: ["大陣雨", "⛈️"],

    85: ["陣雪", "🌨️"],
    86: ["陣雪", "🌨️"],

    95: ["雷雨", "⛈️"],
    96: ["雷雨", "⛈️"],
    99: ["雷雨", "⛈️"]
  };

  return map[code] || ["天氣資料", "🌙"];
}


// -----------------------------------------------------
// 6. 取得今晚 18:00 - 23:00
// -----------------------------------------------------

function getTonightRows(data) {

  const rows = [];

  if (!data || !data.hourly || !data.hourly.time) {
    return rows;
  }

  const today = getHongKongDateString();

  for (let i = 0; i < data.hourly.time.length; i++) {

    const timeString = data.hourly.time[i];

    // Open-Meteo 已設定 timezone=Asia/Hong_Kong，
    // 因此這裡直接讀取本地時間字串。
    const datePart = timeString.slice(0, 10);
    const hour = Number(timeString.slice(11, 13));

    if (
      datePart === today &&
      hour >= 18 &&
      hour <= 23
    ) {

      rows.push({
        time: timeString,
        hour,
        temperature: data.hourly.temperature_2m[i],
        precipitationProbability:
          data.hourly.precipitation_probability[i],
        cloudCover:
          data.hourly.cloud_cover[i],
        visibility:
          data.hourly.visibility[i],
        weatherCode:
          data.hourly.weather_code[i]
      });
    }
  }

  return rows;
}


// -----------------------------------------------------
// 7. 顯示今晚逐小時天氣
// -----------------------------------------------------

function renderHourlyWeather(rows) {

  if (!hourlyWeather) {
    return;
  }

  if (!rows.length) {

    hourlyWeather.innerHTML = `
      <div class="weather-empty">
        暫時未有今晚逐小時天氣資料
      </div>
    `;

    return;
  }

  hourlyWeather.innerHTML = rows.map(row => {

    const [text, icon] = weatherText(row.weatherCode);

    return `
      <div class="hourly-row">

        <div class="hourly-time">
          ${String(row.hour).padStart(2, "0")}:00
        </div>

        <div class="hourly-icon">
          ${icon}
        </div>

        <div class="hourly-weather">
          ${text}
        </div>

        <div class="hourly-temp">
          ${Math.round(row.temperature)}°
        </div>

        <div class="hourly-cloud">
          ☁ ${Math.round(row.cloudCover)}%
        </div>

        <div class="hourly-rain">
          💧 ${Math.round(row.precipitationProbability)}%
        </div>

        <div class="hourly-live">
          LIVE
        </div>

      </div>
    `;

  }).join("");
}


// -----------------------------------------------------
// 8. 找指定日期的 daily index
// -----------------------------------------------------

function findDailyIndex(data, dateString) {

  if (
    !data ||
    !data.daily ||
    !data.daily.time
  ) {
    return 0;
  }

  const index = data.daily.time.indexOf(dateString);

  return index >= 0 ? index : 0;
}


// -----------------------------------------------------
// 9. 月相
// -----------------------------------------------------

function getMoonPhaseInfo(phase) {

  const p = Number(phase);

  if (!Number.isFinite(p)) {

    return {
      name: "月相",
      illumination: 0,
      icon: "🌙"
    };

  }

  let name = "月相";
  let icon = "🌙";

  if (p < 0.03 || p > 0.97) {

    name = "新月";
    icon = "🌑";

  } else if (p < 0.23) {

    name = "眉月";
    icon = "🌒";

  } else if (p < 0.28) {

    name = "上弦月";
    icon = "🌓";

  } else if (p < 0.48) {

    name = "盈凸月";
    icon = "🌔";

  } else if (p < 0.53) {

    name = "滿月";
    icon = "🌕";

  } else if (p < 0.73) {

    name = "虧凸月";
    icon = "🌖";

  } else if (p < 0.78) {

    name = "下弦月";
    icon = "🌗";

  } else {

    name = "殘月";
    icon = "🌘";
  }

  const illumination =
    ((1 - Math.cos(2 * Math.PI * p)) / 2) * 100;

  return {
    name,
    illumination,
    icon
  };
}


// -----------------------------------------------------
// 10. 格式化月亮時間
// -----------------------------------------------------

function formatMoonTime(value) {

  if (!value) {
    return "--:--";
  }

  // Open-Meteo timezone=Asia/Hong_Kong
  // 例如：
  // 2026-09-18T12:30
  return value.slice(11, 16);
}


// -----------------------------------------------------
// 11. 顯示月相、月出、月落
// -----------------------------------------------------

function renderMoonData(data) {

  if (!data || !data.daily) {
    return;
  }

  const today = getHongKongDateString();

  const index = findDailyIndex(data, today);

  const moonPhase =
    data.daily.moon_phase?.[index];

  const moonrise =
    data.daily.moonrise?.[index];

  let moonset =
    data.daily.moonset?.[index];

  const phaseInfo =
    getMoonPhaseInfo(moonPhase);


  // -----------------------------------------------
  // 月相
  // -----------------------------------------------

  const phaseElement =
    document.getElementById("moonPhase");

  if (phaseElement) {
    phaseElement.textContent =
      `${phaseInfo.icon} ${phaseInfo.name}`;
  }


  const phasePercent =
    document.getElementById("moonPhasePercent");

  if (phasePercent) {

    phasePercent.textContent =
      `約 ${Math.round(phaseInfo.illumination)}% 可見`;
  }


  // -----------------------------------------------
  // 月出
  // -----------------------------------------------

  const moonriseElement =
    document.getElementById("moonriseTime");

  if (moonriseElement) {
    moonriseElement.textContent =
      formatMoonTime(moonrise);
  }


  const moonriseLabel =
    document.getElementById("moonriseLabel");

  if (moonriseLabel) {
    moonriseLabel.textContent =
      "香港本地時間";
  }


  // -----------------------------------------------
  // 月落
  // -----------------------------------------------

  // 如果月落時間在月出之前，
  // 代表月落可能屬於翌日。
  if (
    moonrise &&
    moonset &&
    moonset < moonrise &&
    index + 1 < data.daily.time.length
  ) {

    moonset =
      data.daily.moonset[index + 1];
  }


  const moonsetElement =
    document.getElementById("moonsetTime");

  if (moonsetElement) {

    moonsetElement.textContent =
      formatMoonTime(moonset);
  }


  const moonsetLabel =
    document.getElementById("moonsetLabel");

  if (moonsetLabel) {

    moonsetLabel.textContent =
      "香港本地時間";
  }


  // 保存給倒數計時使用
  currentMoonrise = moonrise || null;
  currentMoonset = moonset || null;


  // 如果 HTML 有這些元素，也同步更新
  const moonriseArc =
    document.getElementById("moonriseArcTime");

  if (moonriseArc) {
    moonriseArc.textContent =
      formatMoonTime(moonrise);
  }


  const moonsetArc =
    document.getElementById("moonsetArcTime");

  if (moonsetArc) {
    moonsetArc.textContent =
      formatMoonTime(moonset);
  }


  startMoonriseCountdown();
}


// -----------------------------------------------------
// 12. 把香港本地時間字串轉成 Date
// -----------------------------------------------------

function hkLocalStringToDate(value) {

  if (!value) {
    return null;
  }

  const match =
    value.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
    );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  // 香港 UTC+8
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour - 8,
      minute
    )
  );
}


// -----------------------------------------------------
// 13. 月出倒數
// -----------------------------------------------------

function startMoonriseCountdown() {

  if (!countdown) {
    return;
  }

  const update = () => {

    if (!currentMoonrise) {

      countdown.textContent = "--:--:--";

      if (countdownText) {
        countdownText.textContent =
          "暫時未有月出資料";
      }

      return;
    }


    const target =
      hkLocalStringToDate(currentMoonrise);

    if (!target) {
      return;
    }


    const now = new Date();

    const diff =
      target.getTime() - now.getTime();


    if (diff <= 0) {

      countdown.textContent =
        "🌕";

      if (countdownText) {
        countdownText.textContent =
          "月亮已經升起";
      }

      return;
    }


    const totalSeconds =
      Math.floor(diff / 1000);

    const hours =
      Math.floor(totalSeconds / 3600);

    const minutes =
      Math.floor(
        (totalSeconds % 3600) / 60
      );

    const seconds =
      totalSeconds % 60;


    countdown.textContent =
      `${String(hours).padStart(2, "0")}:` +
      `${String(minutes).padStart(2, "0")}:` +
      `${String(seconds).padStart(2, "0")}`;


    if (countdownText) {

      countdownText.textContent =
        `距離月出 ${formatMoonTime(currentMoonrise)}`;
    }

  };


  update();

  if (window.moonriseTimer) {
    clearInterval(window.moonriseTimer);
  }

  window.moonriseTimer =
    setInterval(update, 1000);
}


// =====================================================
// 🌕 14. 真實月亮位置計算
// =====================================================
//
// 這一部分不向 Open-Meteo 要資料。
// 直接根據：
// - 日期時間
// - 緯度
// - 經度
//
// 計算月球的天文位置，最後轉成：
// - Azimuth 方位角
// - Altitude 高度角
//
// 這是 V0.4 的核心。
// =====================================================


// -----------------------------------------------------
// 15. 數學工具
// -----------------------------------------------------

const DEG = Math.PI / 180;

function sinD(x) {
  return Math.sin(x * DEG);
}

function cosD(x) {
  return Math.cos(x * DEG);
}

function tanD(x) {
  return Math.tan(x * DEG);
}

function radToDeg(x) {
  return x / DEG;
}

function normalizeDegrees(x) {

  x %= 360;

  if (x < 0) {
    x += 360;
  }

  return x;
}


// -----------------------------------------------------
// 16. Julian Day
// -----------------------------------------------------

function getJulianDay(date) {

  return (
    date.getTime() / 86400000
  ) + 2440587.5;
}


// -----------------------------------------------------
// 17. 計算月亮赤經 / 赤緯
// -----------------------------------------------------
//
// 使用低精度月球軌道模型。
// 對於手機「找月亮」用途，之後再配合手機羅盤時，
// 會再進一步處理實際裝置方向及磁偏角。
// -----------------------------------------------------

function calculateMoonEquatorial(date) {

  const jd =
    getJulianDay(date);

  // 2000 Jan 0.0
  const d =
    jd - 2451543.5;


  // =================================================
  // 太陽基本位置
  // =================================================

  const sunW =
    282.9404 +
    0.0000470935 * d;

  const sunM =
    356.0470 +
    0.9856002585 * d;

  const sunE =
    0.016709 -
    0.000000001151 * d;


  const sunMr =
    sunM * DEG;

  const sunEccentric =
    sunMr +
    sunE *
    Math.sin(sunMr) *
    (1 + sunE * Math.cos(sunMr));


  const sunX =
    Math.cos(sunEccentric) -
    sunE;

  const sunY =
    Math.sqrt(1 - sunE * sunE) *
    Math.sin(sunEccentric);


  const sunV =
    Math.atan2(
      sunY,
      sunX
    );


  const sunR =
    Math.sqrt(
      sunX * sunX +
      sunY * sunY
    );


  const sunLon =
    sunV +
    sunW * DEG;


  const sunXh =
    sunR *
    Math.cos(sunLon);

  const sunYh =
    sunR *
    Math.sin(sunLon);


  // =================================================
  // 月球軌道元素
  // =================================================

  const N =
    125.1228 -
    0.0529538083 * d;

  const i =
    5.1454;

  const w =
    318.0634 +
    0.1643573223 * d;

  const a =
    60.2666;

  const e =
    0.054900;

  const M =
    115.3654 +
    13.0649929509 * d;


  const Mr =
    M * DEG;


  // eccentric anomaly
  let E =
    Mr +
    e *
    Math.sin(Mr) *
    (1 + e * Math.cos(Mr));


  // 再迭代數次提高穩定性
  for (let n = 0; n < 3; n++) {

    E =
      E -
      (
        E -
        e * Math.sin(E) -
        Mr
      ) /
      (
        1 -
        e * Math.cos(E)
      );
  }


  const xv =
    a *
    (
      Math.cos(E) -
      e
    );

  const yv =
    a *
    Math.sqrt(1 - e * e) *
    Math.sin(E);


  const v =
    Math.atan2(
      yv,
      xv
    );

  let r =
    Math.sqrt(
      xv * xv +
      yv * yv
    );


  // =================================================
  // 月球黃道座標
  // =================================================

  const vw =
    v +
    w * DEG;

  const Nr =
    N * DEG;

  const ir =
    i * DEG;


  let xh =
    r *
    (
      Math.cos(Nr) *
      Math.cos(vw) -
      Math.sin(Nr) *
      Math.sin(vw) *
      Math.cos(ir)
    );


  let yh =
    r *
    (
      Math.sin(Nr) *
      Math.cos(vw) +
      Math.cos(Nr) *
      Math.sin(vw) *
      Math.cos(ir)
    );


  let zh =
    r *
    (
      Math.sin(vw) *
      Math.sin(ir)
    );


  let lon =
    radToDeg(
      Math.atan2(yh, xh)
    );

  let lat =
    radToDeg(
      Math.atan2(
        zh,
        Math.sqrt(
          xh * xh +
          yh * yh
        )
      )
    );


  // =================================================
  // 月球攝動
  // =================================================

  const sunMeanLongitude =
    normalizeDegrees(
      sunW + sunM
    );

  const moonMeanLongitude =
    normalizeDegrees(
      N + w + M
    );

  const D =
    normalizeDegrees(
      moonMeanLongitude -
      sunMeanLongitude
    );

  const F =
    normalizeDegrees(
      moonMeanLongitude -
      N
    );


  lon +=

    -1.274 *
    sinD(M - 2 * D)

    + 0.658 *
    sinD(2 * D)

    - 0.186 *
    sinD(sunM)

    - 0.059 *
    sinD(2 * M - 2 * D)

    - 0.057 *
    sinD(M - 2 * D + sunM)

    + 0.053 *
    sinD(M + 2 * D)

    + 0.046 *
    sinD(2 * D - sunM)

    + 0.041 *
    sinD(M - sunM)

    - 0.035 *
    sinD(D)

    - 0.031 *
    sinD(M + sunM)

    - 0.015 *
    sinD(2 * F - 2 * D)

    + 0.011 *
    sinD(M - 4 * D);


  lat +=

    -0.173 *
    sinD(F - 2 * D)

    - 0.055 *
    sinD(M - F - 2 * D)

    - 0.046 *
    sinD(M + F - 2 * D)

    + 0.033 *
    sinD(F + 2 * D)

    + 0.017 *
    sinD(2 * M + F);


  r +=

    -0.58 *
    cosD(M - 2 * D)

    -0.46 *
    cosD(2 * D);


  // =================================================
  // 黃道座標 → 赤道座標
  // =================================================

  const epsilon =
    (
      23.4393 -
      0.0000003563 * d
    ) * DEG;


  const lonRad =
    lon * DEG;

  const latRad =
    lat * DEG;


  const x =
    r *
    Math.cos(latRad) *
    Math.cos(lonRad);

  const y =
    r *
    Math.cos(latRad) *
    Math.sin(lonRad);

  const z =
    r *
    Math.sin(latRad);


  const xe =
    x;

  const ye =
    y * Math.cos(epsilon) -
    z * Math.sin(epsilon);

  const ze =
    y * Math.sin(epsilon) +
    z * Math.cos(epsilon);


  let ra =
    Math.atan2(
      ye,
      xe
    );

  if (ra < 0) {
    ra += 2 * Math.PI;
  }


  const dec =
    Math.atan2(
      ze,
      Math.sqrt(
        xe * xe +
        ye * ye
      )
    );


  return {
    ra,
    dec,
    distanceEarthRadii: r
  };
}


// -----------------------------------------------------
// 18. 計算月亮方位＋高度
// -----------------------------------------------------

function calculateMoonPosition(
  date,
  latitude,
  longitude
) {

  const equatorial =
    calculateMoonEquatorial(date);


  const jd =
    getJulianDay(date);

  const T =
    (jd - 2451545.0) /
    36525;


  // =================================================
  // Greenwich Mean Sidereal Time
  // =================================================

  const gmst =
    normalizeDegrees(
      280.46061837 +

      360.98564736629 *
      (jd - 2451545.0) +

      0.000387933 *
      T * T -

      (T * T * T) /
      38710000
    );


  // 當地恆星時
  const lst =
    normalizeDegrees(
      gmst +
      longitude
    );


  // =================================================
  // 月球水平視差
  // =================================================

  // 月球距離約 60 個地球半徑。
  // 水平視差大約 1° 左右，對「找月亮」不能忽略。
  const horizontalParallax =
    Math.asin(
      1 /
      equatorial.distanceEarthRadii
    );


  const phi =
    latitude * DEG;


  const u =
    Math.atan(
      0.99664719 *
      Math.tan(phi)
    );


  const rhoSinPhi =
    0.99664719 *
    Math.sin(u);


  const rhoCosPhi =
    Math.cos(u);


  const ra =
    equatorial.ra;

  const dec =
    equatorial.dec;


  // 地心 hour angle
  const Hdeg =
    normalizeDegrees(
      lst -
      radToDeg(ra)
    );

  const H =
    Hdeg * DEG;


  // =================================================
  // Topocentric correction
  // =================================================

  const deltaRA =
    Math.atan2(

      -rhoCosPhi *
      Math.sin(horizontalParallax) *
      Math.sin(H),

      Math.cos(dec) -

      rhoCosPhi *
      Math.sin(horizontalParallax) *
      Math.cos(H)
    );


  const topocentricRA =
    ra +
    deltaRA;


  const topocentricDec =
    Math.atan2(

      (
        Math.sin(dec) -

        rhoSinPhi *
        Math.sin(horizontalParallax)
      ) *
      Math.cos(deltaRA),

      Math.cos(dec) -

      rhoCosPhi *
      Math.sin(horizontalParallax) *
      Math.cos(H)
    );


  const topocentricH =
    (
      lst -
      radToDeg(topocentricRA)
    ) * DEG;


  // =================================================
  // Altitude
  // =================================================

  let altitude =
    Math.asin(

      Math.sin(phi) *
      Math.sin(topocentricDec)

      +

      Math.cos(phi) *
      Math.cos(topocentricDec) *
      Math.cos(topocentricH)
    );


  let altitudeDeg =
    radToDeg(altitude);


  // =================================================
  // Azimuth
  // =================================================

  const azimuth =
    Math.atan2(

      -Math.sin(topocentricH),

      Math.tan(topocentricDec) *
      Math.cos(phi)

      -

      Math.sin(phi) *
      Math.cos(topocentricH)
    );


  const azimuthDeg =
    normalizeDegrees(
      radToDeg(azimuth)
    );


  // =================================================
  // 標準大氣折射
  // =================================================

  let refraction = 0;


  if (
    altitudeDeg > -1 &&
    altitudeDeg < 90
  ) {

    const refr =
      1.02 /
      Math.tan(

        (
          altitudeDeg +

          10.3 /
          (
            altitudeDeg +
            5.11
          )
        ) * DEG

      ) / 60;

    refraction = refr;
  }


  const apparentAltitude =
    altitudeDeg +
    refraction;


  return {

    azimuth:
      azimuthDeg,

    altitude:
      altitudeDeg,

    apparentAltitude:
      apparentAltitude,

    direction:
      getCompassDirection(
        azimuthDeg
      )
  };
}


// -----------------------------------------------------
// 19. 方位角 → 中文方向
// -----------------------------------------------------

function getCompassDirection(degrees) {

  const directions = [
    "北",
    "北北東",
    "東北",
    "東北東",
    "東",
    "東南東",
    "東南",
    "南南東",
    "南",
    "南南西",
    "西南",
    "西南西",
    "西",
    "西北西",
    "西北",
    "北北西"
  ];


  const index =
    Math.round(
      degrees / 22.5
    ) % 16;


  return directions[index];
}


// -----------------------------------------------------
// 20. 更新月亮位置 UI
// -----------------------------------------------------

function setElementTextByIds(
  ids,
  value
) {

  for (const id of ids) {

    const element =
      document.getElementById(id);

    if (element) {

      element.textContent =
        value;

      return true;
    }
  }

  return false;
}


// -----------------------------------------------------
// 21. 嘗試更新現有「方位 / 高度」欄位
// -----------------------------------------------------

function updateExistingDetailValue(
  label,
  value
) {

  const valueSelectors = [
    ".detail-value",
    ".value",
    ".stat-value",
    ".info-value",
    ".data-value",
    "strong"
  ];


  for (
    const selector
    of valueSelectors
  ) {

    const nodes =
      document.querySelectorAll(
        selector
      );


    for (
      const node
      of nodes
    ) {

      const parent =
        node.parentElement;

      if (!parent) {
        continue;
      }


      const text =
        parent.textContent || "";


      if (
        text.includes(label)
      ) {

        node.textContent =
          value;

        return true;
      }
    }
  }


  return false;
}


// -----------------------------------------------------
// 22. 顯示即時月亮位置
// -----------------------------------------------------

function renderMoonPosition(
  position
) {

  const azimuthText =
    `${Math.round(position.azimuth)}°`;

  const altitudeText =
    `${Math.round(position.apparentAltitude)}°`;


  // -------------------------------------------------
  // 如果原 HTML 有 ID，優先使用
  // -------------------------------------------------

  const azimuthUpdated =
    setElementTextByIds(

      [
        "moonAzimuth",
        "moonDirection",
        "directionValue",
        "moonDirectionValue"
      ],

      azimuthText
    );


  const altitudeUpdated =
    setElementTextByIds(

      [
        "moonAltitude",
        "moonHeight",
        "altitudeValue",
        "moonAltitudeValue"
      ],

      altitudeText
    );


  // -------------------------------------------------
  // 嘗試處理原本 detail card
  // -------------------------------------------------

  const azimuthDetailUpdated =
    azimuthUpdated ||
    updateExistingDetailValue(
      "方位",
      `${azimuthText} ${position.direction}`
    );


  const altitudeDetailUpdated =
    altitudeUpdated ||
    updateExistingDetailValue(
      "高度",
      altitudeText
    );


  // -------------------------------------------------
  // 如果舊 HTML 沒有相應 ID，
  // 就由 JS 自動建立一個即時位置卡片。
  // 因此仍然不需要修改 index.html。
  // -------------------------------------------------

  if (
    !azimuthDetailUpdated ||
    !altitudeDetailUpdated
  ) {

    let liveCard =
      document.getElementById(
        "liveMoonPosition"
      );


    if (!liveCard) {

      const target =
        document.querySelector(
          "#details, .details, section:last-of-type"
        );


      if (target) {

        liveCard =
          document.createElement(
            "div"
          );

        liveCard.id =
          "liveMoonPosition";


        liveCard.style.marginTop =
          "16px";

        liveCard.style.padding =
          "16px";

        liveCard.style.borderRadius =
          "18px";

        liveCard.style.background =
          "rgba(255,255,255,0.08)";

        liveCard.style.border =
          "1px solid rgba(255,255,255,0.15)";


        target.appendChild(
          liveCard
        );
      }
    }


    if (liveCard) {

      liveCard.innerHTML = `

        <div style="
          font-size:14px;
          opacity:.75;
          margin-bottom:8px;
        ">
          🌕 即時月亮位置
        </div>

        <div style="
          display:flex;
          gap:24px;
          align-items:center;
        ">

          <div>

            <div style="
              font-size:13px;
              opacity:.7;
            ">
              方位
            </div>

            <div style="
              font-size:24px;
              font-weight:700;
            ">
              ${azimuthText}
            </div>

            <div style="
              font-size:13px;
              opacity:.75;
            ">
              ${position.direction}
            </div>

          </div>


          <div>

            <div style="
              font-size:13px;
              opacity:.7;
            ">
              高度
            </div>

            <div style="
              font-size:24px;
              font-weight:700;
            ">
              ${altitudeText}
            </div>

            <div style="
              font-size:13px;
              opacity:.75;
            ">
              離地平線
            </div>

          </div>

        </div>

        <div style="
          margin-top:10px;
          font-size:12px;
          opacity:.6;
        ">
          天文計算 · ${new Date().toLocaleTimeString(
            "zh-HK",
            {
              hour: "2-digit",
              minute: "2-digit"
            }
          )}
        </div>

      `;
    }
  }
}


// -----------------------------------------------------
// 23. 每 30 秒更新月亮位置
// -----------------------------------------------------

function updateMoonPosition() {

  try {

    const position =
      calculateMoonPosition(

        new Date(),

        currentLocation.lat,

        currentLocation.lon

      );


    renderMoonPosition(
      position
    );


    // Debug 用
    console.log(
      "🌕 Moon position:",
      {
        latitude:
          currentLocation.lat,

        longitude:
          currentLocation.lon,

        azimuth:
          position.azimuth,

        direction:
          position.direction,

        altitude:
          position.altitude,

        apparentAltitude:
          position.apparentAltitude
      }
    );


  } catch (error) {

    console.error(
      "Moon position calculation error:",
      error
    );
  }
}


// =====================================================
// 24. Open-Meteo
// =====================================================

async function loadWeather(
  latitude,
  longitude
) {

  if (weatherSummary) {

    weatherSummary.textContent =
      "正在取得 Open-Meteo 天氣資料…";
  }


  const url =
    "https://api.open-meteo.com/v1/forecast" +

    `?latitude=${latitude}` +

    `&longitude=${longitude}` +

    "&hourly=" +

    "temperature_2m," +
    "precipitation_probability," +
    "cloud_cover," +
    "visibility," +
    "weather_code" +

    "&daily=" +

    "moonrise," +
    "moonset," +
    "moon_phase" +

    "&forecast_days=2" +

    "&timezone=Asia%2FHong_Kong";


  try {

    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        `Open-Meteo HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    // ---------------------------------------------
    // 目前天氣
    // ---------------------------------------------

    const now =
      new Date();


    const hkDate =
      getHongKongDateString();

    const hkHour =
      getHongKongHour();


    let currentIndex = 0;


    for (
      let i = 0;
      i < data.hourly.time.length;
      i++
    ) {

      const t =
        data.hourly.time[i];


      const date =
        t.slice(0, 10);

      const hour =
        Number(
          t.slice(11, 13)
        );


      if (
        date === hkDate &&
        hour === hkHour
      ) {

        currentIndex =
          i;

        break;
      }
    }


    const temperature =
      data.hourly.temperature_2m[
        currentIndex
      ];


    const cloud =
      data.hourly.cloud_cover[
        currentIndex
      ];


    const weatherCode =
      data.hourly.weather_code[
        currentIndex
      ];


    const [
      currentWeatherText,
      currentWeatherIcon
    ] =
      weatherText(
        weatherCode
      );


    if (weatherSummary) {

      weatherSummary.textContent =
        `${currentWeatherIcon} ${currentWeatherText}`;
    }


    if (weatherTemp) {

      weatherTemp.textContent =
        `${Math.round(temperature)}°C`;
    }


    // ---------------------------------------------
    // 今晚逐小時
    // ---------------------------------------------

    const tonightRows =
      getTonightRows(data);


    renderHourlyWeather(
      tonightRows
    );


    // ---------------------------------------------
    // 更新時間
    // ---------------------------------------------

    if (weatherUpdated) {

      weatherUpdated.textContent =
        `資料更新：${new Date().toLocaleTimeString(
          "zh-HK",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        )}`;
    }


    // ---------------------------------------------
    // 月相 + 月出 + 月落
    // ---------------------------------------------

    renderMoonData(
      data
    );


    // ---------------------------------------------
    // ⭐ V0.4：
    // 更新真實月亮方位＋高度
    // ---------------------------------------------

    updateMoonPosition();


  } catch (error) {

    console.error(
      "Open-Meteo error:",
      error
    );


    if (weatherSummary) {

      weatherSummary.textContent =
        "暫時未能取得天氣資料";
    }


    if (weatherUpdated) {

      weatherUpdated.textContent =
        "請稍後再試";
    }
  }
}


// =====================================================
// 25. 地理位置
// =====================================================

function setLocation(
  latitude,
  longitude,
  name
) {

  currentLocation = {

    lat:
      Number(latitude),

    lon:
      Number(longitude),

    name:
      name || "目前位置"
  };


  const locationElements =
    document.querySelectorAll(
      ".location"
    );


  locationElements.forEach(
    element => {

      element.textContent =
        currentLocation.name;
    }
  );


  // 天氣重新取得
  loadWeather(
    currentLocation.lat,
    currentLocation.lon
  );


  // 月亮位置立即重新計算
  updateMoonPosition();
}


// -----------------------------------------------------
// 位置按鈕
// -----------------------------------------------------

if (locationBtn) {

  locationBtn.addEventListener(
    "click",
    () => {

      if (
        !navigator.geolocation
      ) {

        showToast(
          "你的瀏覽器不支援定位功能"
        );

        return;
      }


      showToast(
        "正在取得你的位置…"
      );


      navigator.geolocation.getCurrentPosition(

        position => {

          const lat =
            position.coords.latitude;

          const lon =
            position.coords.longitude;


          setLocation(
            lat,
            lon,
            "目前位置"
          );


          showToast(
            "已使用目前位置"
          );
        },


        error => {

          console.error(
            "Geolocation error:",
            error
          );


          showToast(
            "未能取得位置，暫時使用香港位置"
          );
        },


        {
          enableHighAccuracy:
            true,

          timeout:
            10000,

          maximumAge:
            300000
        }
      );
    }
  );
}


// =====================================================
// 26. Toast
// =====================================================

function showToast(message) {

  if (!toast) {
    return;
  }


  toast.textContent =
    message;


  toast.classList.add(
    "show"
  );


  setTimeout(
    () => {

      toast.classList.remove(
        "show"
      );

    },
    2500
  );
}


// =====================================================
// 27. Menu
// =====================================================

const menuButton =
  document.querySelector(
    "#menuButton, .menu-button"
  );


if (menuButton) {

  menuButton.addEventListener(
    "click",
    () => {

      showToast(
        "Moon Watch HK"
      );

    }
  );
}


// =====================================================
// 28. 啟動
// =====================================================

// 首次使用：香港
setLocation(
  DEFAULT_LOCATION.lat,
  DEFAULT_LOCATION.lon,
  DEFAULT_LOCATION.name
);


// 每 30 秒重新計算一次月亮位置
setInterval(
  updateMoonPosition,
  30000
);


// =====================================================
// END
// =====================================================