// ===================================================
// 🚦 LSK001 Signal API Worker
//
// 核心：
// 1. /api/roads
// 2. /api/signal-events
// 3. /api/signal-cycle
// 4. /api/signal-model
// 5. /api/signal-countdown
//
// 模型：
// 「最接近當刻的歷史正常 cycle + 時間距離加權」
//
// 即時校正：
// GREEN → RED 後，立即用實際 GREEN 持續時間
// 校正下一輪倒數。
//
// GREEN Freshness：2 小時
// ===================================================


const CORS_HEADERS = Object.freeze({
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
});


// ===================================================
// 基本設定
// ===================================================

const HK_TIME_ZONE = 'Asia/Hong_Kong';


// 正常 cycle 最長 300 秒
// 超過視為 OUTLIER
const MAX_CYCLE_SEC = 300;


// 最新 GREEN 最多保留 2 小時
const MAX_FRESHNESS_SEC = 7200;


// signal-events GET 最多讀取 500 筆
const MAX_EVENT_LIMIT = 500;


// ===================================================
// JSON Response
// ===================================================

function json(data, options = {}) {

  const headers = new Headers();

  headers.set(
    'content-type',
    'application/json; charset=utf-8'
  );

  Object.entries(
    CORS_HEADERS
  ).forEach(
    ([key, value]) => {
      headers.set(key, value);
    }
  );

  if (options.headers) {

    Object.entries(
      options.headers
    ).forEach(
      ([key, value]) => {
        headers.set(key, value);
      }
    );
  }

  return new Response(
    JSON.stringify(data),
    {
      status:
        options.status || 200,

      headers
    }
  );
}


// ===================================================
// HK 時間工具
// ===================================================

function getHKDateParts(date = new Date()) {

  const formatter =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone:
          HK_TIME_ZONE,

        year: 'numeric',
        month: '2-digit',
        day: '2-digit',

        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',

        hourCycle: 'h23'
      }
    );

  const parts =
    formatter.formatToParts(date);

  const result = {};

  for (const part of parts) {

    if (part.type !== 'literal') {
      result[part.type] =
        Number(part.value);
    }
  }

  return result;
}


function getHKMinuteOfDay(date) {

  const parts =
    getHKDateParts(date);

  return (
    parts.hour * 60 +
    parts.minute +
    parts.second / 60
  );
}


function getHKTimeString(date) {

  const parts =
    getHKDateParts(date);

  const pad =
    (value) =>
      String(value).padStart(2, '0');

  return (
    `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ` +
    `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`
  );
}


// ===================================================
// 時間段
//
// 保留作為資訊顯示。
// 現在模型不再使用固定時間段作主要選擇。
// ===================================================

function getTimeBucket(hour) {

  if (hour < 6) {
    return '00-06';
  }

  if (hour < 10) {
    return '06-10';
  }

  if (hour < 16) {
    return '10-16';
  }

  if (hour < 20) {
    return '16-20';
  }

  return '20-24';
}


// ===================================================
// 兩個時間點的「一天內最短距離」
//
// 例如：
// 23:50 → 00:10
//
// 不會計成 23 小時 40 分，
// 而是 20 分鐘。
// ===================================================

function circularMinuteDistance(
  minuteA,
  minuteB
) {

  const difference =
    Math.abs(
      minuteA - minuteB
    );

  return Math.min(
    difference,
    1440 - difference
  );
}


// ===================================================
// 時間距離權重
//
// 距離 0 小時：1
// 距離 1 小時：0.5
// 距離 2 小時：0.333...
//
// 越接近當刻，權重越高。
// ===================================================

function calculateTimeDistanceWeight(
  distanceHours
) {

  return (
    1 /
    (
      1 +
      distanceHours
    )
  );
}


// ===================================================
// 讀取 signal_events
// ===================================================

async function loadSignalEvents(
  env,
  roadId = 'LSK001',
  limit = MAX_EVENT_LIMIT
) {

  const result =
    await env.DB
      .prepare(`
        SELECT
          id,
          road_id,
          state,
          recorded_at,
          latitude,
          longitude,
          accuracy,
          distance_m,
          created_at
        FROM signal_events
        WHERE road_id = ?
        ORDER BY recorded_at ASC
        LIMIT ?
      `)
      .bind(
        roadId,
        limit
      )
      .all();

  return result.results || [];
}


// ===================================================
// 建立歷史 cycle
//
// 只接受立即：
//
// GREEN → RED → GREEN
//
// 不跨其他事件。
// ===================================================

function buildCycleAnalysis(
  events
) {

  const candidateCycles = [];
  const normalCycles = [];
  const outlierCycles = [];

  for (
    let i = 0;
    i < events.length - 2;
    i++
  ) {

    const firstGreen =
      events[i];

    const red =
      events[i + 1];

    const secondGreen =
      events[i + 2];


    if (
      firstGreen.state !== 'GREEN' ||
      red.state !== 'RED' ||
      secondGreen.state !== 'GREEN'
    ) {
      continue;
    }


    const firstGreenMs =
      new Date(
        firstGreen.recorded_at
      ).getTime();

    const redMs =
      new Date(
        red.recorded_at
      ).getTime();

    const secondGreenMs =
      new Date(
        secondGreen.recorded_at
      ).getTime();


    if (
      !Number.isFinite(firstGreenMs) ||
      !Number.isFinite(redMs) ||
      !Number.isFinite(secondGreenMs)
    ) {
      continue;
    }


    const greenSec =
      (
        redMs -
        firstGreenMs
      ) / 1000;


    const redSec =
      (
        secondGreenMs -
        redMs
      ) / 1000;


    const cycleSec =
      (
        secondGreenMs -
        firstGreenMs
      ) / 1000;


    if (
      greenSec <= 0 ||
      redSec <= 0 ||
      cycleSec <= 0
    ) {
      continue;
    }


    const cycleParts =
      getHKDateParts(
        new Date(firstGreenMs)
      );


    const greenStartMinute =
      cycleParts.hour * 60 +
      cycleParts.minute +
      cycleParts.second / 60;


    const cycle = {

      green_event_id:
        firstGreen.id,

      red_event_id:
        red.id,

      next_green_event_id:
        secondGreen.id,

      green_recorded_at:
        firstGreen.recorded_at,

      red_recorded_at:
        red.recorded_at,

      next_green_recorded_at:
        secondGreen.recorded_at,

      green_sec:
        greenSec,

      red_sec:
        redSec,

      cycle_sec:
        cycleSec,

      green_start_minute:
        greenStartMinute,

      green_start_hour:
        greenStartMinute / 60
    };


    candidateCycles.push(
      cycle
    );


    if (
      cycleSec >
      MAX_CYCLE_SEC
    ) {

      outlierCycles.push(
        cycle
      );

    } else {

      normalCycles.push(
        cycle
      );
    }
  }


  return {
    candidateCycles,
    normalCycles,
    outlierCycles
  };
}


// ===================================================
// 建立「最接近當刻 + 時間距離加權」模型
// ===================================================

function buildTimeDistanceWeightedModel(
  normalCycles,
  now = new Date()
) {

  if (
    !Array.isArray(normalCycles) ||
    normalCycles.length === 0
  ) {

    return null;
  }


  const currentMinute =
    getHKMinuteOfDay(now);


  const weightedCycles =
    normalCycles.map(
      (cycle) => {

        const distanceMinutes =
          circularMinuteDistance(
            currentMinute,
            cycle.green_start_minute
          );


        const distanceHours =
          distanceMinutes / 60;


        const weight =
          calculateTimeDistanceWeight(
            distanceHours
          );


        return {

          ...cycle,

          time_distance_minutes:
            distanceMinutes,

          time_distance_hours:
            distanceHours,

          weight
        };
      }
    );


  let totalWeight = 0;

  let weightedGreen = 0;
  let weightedRed = 0;
  let weightedCycle = 0;


  for (
    const cycle of weightedCycles
  ) {

    totalWeight +=
      cycle.weight;


    weightedGreen +=
      cycle.green_sec *
      cycle.weight;


    weightedRed +=
      cycle.red_sec *
      cycle.weight;


    weightedCycle +=
      cycle.cycle_sec *
      cycle.weight;
  }


  if (
    totalWeight <= 0
  ) {

    return null;
  }


  const greenAverageSec =
    weightedGreen /
    totalWeight;


  const redAverageSec =
    weightedRed /
    totalWeight;


  const cycleAverageSec =
    weightedCycle /
    totalWeight;


  // 找出最接近當刻的歷史正常 cycle
  const nearestCycle =
    [...weightedCycles]
      .sort(
        (a, b) => {

          if (
            a.time_distance_minutes !==
            b.time_distance_minutes
          ) {

            return (
              a.time_distance_minutes -
              b.time_distance_minutes
            );
          }

          return (
            new Date(
              b.green_recorded_at
            ).getTime() -
            new Date(
              a.green_recorded_at
            ).getTime()
          );
        }
      )[0];


  return {

    model_source:
      'TIME_DISTANCE_WEIGHTED',

    model_count:
      normalCycles.length,

    total_weight:
      totalWeight,

    green_average_sec:
      greenAverageSec,

    red_average_sec:
      redAverageSec,

    cycle_average_sec:
      cycleAverageSec,

    nearest_cycle:
      nearestCycle,

    weighted_cycles:
      weightedCycles
  };
}


// ===================================================
// /api/health
// ===================================================

async function handleHealth() {

  return json({
    ok: true,
    service: 'lsk001-api',
    version: '1.0.0'
  });
}


// ===================================================
// /api/roads
// ===================================================

async function handleRoads(
  env
) {

  try {

    const result =
      await env.DB
        .prepare(`
          SELECT
            id,
            road_id,
            name,
            latitude,
            longitude,
            radius,
            enabled,
            created_at,
            updated_at
          FROM roads
          WHERE enabled = 1
          ORDER BY id ASC
        `)
        .all();


    return json({
      ok: true,
      roads:
        result.results || []
    });

  } catch (error) {

    console.error(
      'D1 roads query error:',
      error
    );


    return json({
      ok: false,
      error:
        'D1 roads query failed',

      message:
        error.message

    }, {
      status: 500
    });
  }
}


// ===================================================
// POST /api/signal-events
// ===================================================

async function handleSignalEventPost(
  request,
  env
) {

  try {

    const body =
      await request.json();


    const roadId =
      String(
        body.road_id || ''
      ).trim();


    const state =
      String(
        body.state || ''
      ).trim().toUpperCase();


    const latitude =
      Number(
        body.latitude
      );


    const longitude =
      Number(
        body.longitude
      );


    const accuracy =
      Number(
        body.accuracy
      );


    const distanceM =
      Number(
        body.distance_m
      );


    if (!roadId) {

      return json({
        ok: false,
        error:
          'road_id is required'
      }, {
        status: 400
      });
    }


    if (
      state !== 'GREEN' &&
      state !== 'RED'
    ) {

      return json({
        ok: false,
        error:
          'state must be GREEN or RED'
      }, {
        status: 400
      });
    }


    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(accuracy) ||
      !Number.isFinite(distanceM)
    ) {

      return json({
        ok: false,
        error:
          'latitude, longitude, accuracy and distance_m must be finite numbers'
      }, {
        status: 400
      });
    }


    const recordedAt =
      new Date().toISOString();


    const result =
      await env.DB
        .prepare(`
          INSERT INTO signal_events (
            road_id,
            state,
            recorded_at,
            latitude,
            longitude,
            accuracy,
            distance_m
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          roadId,
          state,
          recordedAt,
          latitude,
          longitude,
          accuracy,
          distanceM
        )
        .run();


    const eventId =
      result.meta?.last_row_id;


    return json({
      ok: true,

      event: {
        id:
          eventId,

        road_id:
          roadId,

        state,

        recorded_at:
          recordedAt,

        latitude,

        longitude,

        accuracy,

        distance_m:
          distanceM
      },

      result
    });


  } catch (error) {

    console.error(
      'D1 signal event insert error:',
      error
    );


    return json({
      ok: false,

      error:
        'D1 signal event insert failed',

      message:
        error.message

    }, {
      status: 500
    });
  }
}


// ===================================================
// GET /api/signal-events
// ===================================================

async function handleSignalEventsGet(
  request,
  env
) {

  try {

    const url =
      new URL(request.url);


    const roadId =
      String(
        url.searchParams.get(
          'road_id'
        ) || 'LSK001'
      ).trim();


    const limitRaw =
      Number(
        url.searchParams.get(
          'limit'
        ) || 100
      );


    const limit =
      Math.min(
        Math.max(
          Number.isFinite(
            limitRaw
          )
            ? Math.floor(
                limitRaw
              )
            : 100,
          1
        ),
        MAX_EVENT_LIMIT
      );


    const events =
      await loadSignalEvents(
        env,
        roadId,
        limit
      );


    return json({
      ok: true,

      road_id:
        roadId,

      count:
        events.length,

      events
    });


  } catch (error) {

    console.error(
      'D1 signal event query error:',
      error
    );


    return json({
      ok: false,

      error:
        'D1 signal event query failed',

      message:
        error.message

    }, {
      status: 500
    });
  }
}


// ===================================================
// GET /api/signal-cycle
// ===================================================

async function handleSignalCycle(
  request,
  env
) {

  try {

    const url =
      new URL(request.url);


    const roadId =
      String(
        url.searchParams.get(
          'road_id'
        ) || 'LSK001'
      ).trim();


    const events =
      await loadSignalEvents(
        env,
        roadId,
        MAX_EVENT_LIMIT
      );


    const analysis =
      buildCycleAnalysis(
        events
      );


    const normalCycles =
      analysis.normalCycles;


    let overallGreen = null;
    let overallRed = null;
    let overallCycle = null;


    if (
      normalCycles.length > 0
    ) {

      overallGreen =
        normalCycles.reduce(
          (sum, cycle) =>
            sum + cycle.green_sec,
          0
        ) /
        normalCycles.length;


      overallRed =
        normalCycles.reduce(
          (sum, cycle) =>
            sum + cycle.red_sec,
          0
        ) /
        normalCycles.length;


      overallCycle =
        normalCycles.reduce(
          (sum, cycle) =>
            sum + cycle.cycle_sec,
          0
        ) /
        normalCycles.length;
    }


    return json({

      ok: true,

      road_id:
        roadId,

      max_cycle_sec:
        MAX_CYCLE_SEC,

      candidate_count:
        analysis.candidateCycles.length,

      normal_count:
        analysis.normalCycles.length,

      outlier_count:
        analysis.outlierCycles.length,

      overall: {

        green_average_sec:
          overallGreen,

        red_average_sec:
          overallRed,

        cycle_average_sec:
          overallCycle
      },

      normal_cycles:
        analysis.normalCycles,

      outlier_cycles:
        analysis.outlierCycles
    });


  } catch (error) {

    console.error(
      'signal-cycle error:',
      error
    );


    return json({
      ok: false,

      error:
        'signal-cycle failed',

      message:
        error.message

    }, {
      status: 500
    });
  }
}


// ===================================================
// GET /api/signal-model
//
// 新模型：
//
// 最接近當刻的歷史正常 cycle
// +
// 時間距離加權
// ===================================================

async function handleSignalModel(
  request,
  env
) {

  try {

    const url =
      new URL(request.url);


    const roadId =
      String(
        url.searchParams.get(
          'road_id'
        ) || 'LSK001'
      ).trim();


    const now =
      new Date();


    const hkParts =
      getHKDateParts(
        now
      );


    const currentHongKongTime =
      getHKTimeString(
        now
      );


    const currentTimeBucket =
      getTimeBucket(
        hkParts.hour
      );


    const events =
      await loadSignalEvents(
        env,
        roadId,
        MAX_EVENT_LIMIT
      );


    const analysis =
      buildCycleAnalysis(
        events
      );


    const model =
      buildTimeDistanceWeightedModel(
        analysis.normalCycles,
        now
      );


    if (!model) {

      return json({

        ok: true,

        road_id:
          roadId,

        timezone:
          HK_TIME_ZONE,

        experimental:
          true,

        current_hong_kong_time:
          currentHongKongTime,

        current_hong_kong_hour:
          hkParts.hour,

        current_time_bucket:
          currentTimeBucket,

        model_available:
          false,

        model_source:
          null,

        model_count:
          0,

        model:
          null,

        historical_data_note:
          '目前沒有足夠的正常 GREEN→RED→GREEN cycle。'
      });
    }


    return json({

      ok: true,

      road_id:
        roadId,

      timezone:
        HK_TIME_ZONE,

      experimental:
        true,

      current_hong_kong_time:
        currentHongKongTime,

      current_hong_kong_hour:
        hkParts.hour,

      current_time_bucket:
        currentTimeBucket,

      model_available:
        true,

      model_source:
        model.model_source,

      model_count:
        model.model_count,

      model: {

        green_average_sec:
          model.green_average_sec,

        red_average_sec:
          model.red_average_sec,

        cycle_average_sec:
          model.cycle_average_sec
      },

      weighting: {

        method:
          '1 / (1 + time_distance_hours)',

        description:
          '歷史正常 cycle 距離當刻越近，權重越高。',

        total_weight:
          model.total_weight
      },

      nearest_cycle:
        model.nearest_cycle,

      historical_data_note:
        '歷史資料保留；模型使用正常 GREEN→RED→GREEN cycle，並按時間距離加權。'
    });


  } catch (error) {

    console.error(
      'signal-model error:',
      error
    );


    return json({

      ok: false,

      error:
        'signal-model failed',

      message:
        error.message

    }, {
      status: 500
    });
  }
}


// ===================================================
// GET /api/signal-countdown
//
// 主要流程：
//
// 1. 找最新 GREEN
// 2. Freshness ≤ 2 小時
// 3. 建立時間距離加權模型
// 4. 如果最新 RED 在最新 GREEN 後面
//    → 計算實際 GREEN
// 5. 即時校正 GREEN
// 6. 開始 countdown
// ===================================================

async function handleSignalCountdown(
  request,
  env
) {

  try {

    const url =
      new URL(request.url);


    const roadId =
      String(
        url.searchParams.get(
          'road_id'
        ) || 'LSK001'
      ).trim();


    const now =
      new Date();


    const hkParts =
      getHKDateParts(
        now
      );


    const currentHongKongTime =
      getHKTimeString(
        now
      );


    const currentTimeBucket =
      getTimeBucket(
        hkParts.hour
      );


    const events =
      await loadSignalEvents(
        env,
        roadId,
        MAX_EVENT_LIMIT
      );


    if (
      events.length === 0
    ) {

      return json({

        ok: true,

        road_id:
          roadId,

        timezone:
          HK_TIME_ZONE,

        experimental:
          true,

        current_hong_kong_time:
          currentHongKongTime,

        current_hong_kong_hour:
          hkParts.hour,

        current_time_bucket:
          currentTimeBucket,

        countdown_available:
          false,

        available:
          false,

        reason:
          '目前沒有任何 signal event。'
      });
    }


    // =================================================
    // 最新 GREEN
    // =================================================

    const latestGreen =
      [...events]
        .reverse()
        .find(
          (event) =>
            event.state === 'GREEN'
        );


    if (!latestGreen) {

      return json({

        ok: true,

        road_id:
          roadId,

        timezone:
          HK_TIME_ZONE,

        experimental:
          true,

        current_hong_kong_time:
          currentHongKongTime,

        current_hong_kong_hour:
          hkParts.hour,

        current_time_bucket:
          currentTimeBucket,

        countdown_available:
          false,

        available:
          false,

        reason:
          '目前沒有 GREEN 事件。'
      });
    }


    const latestGreenMs =
      new Date(
        latestGreen.recorded_at
      ).getTime();


    if (
      !Number.isFinite(
        latestGreenMs
      )
    ) {

      return json({

        ok: true,

        road_id:
          roadId,

        countdown_available:
          false,

        available:
          false,

        reason:
          '最新 GREEN timestamp 無效。'
      });
    }


    const latestGreenAgeSec =
      (
        Date.now() -
        latestGreenMs
      ) / 1000;


    // =================================================
    // GREEN Freshness
    //
    // 現在 = 2 小時
    // =================================================

    if (
      latestGreenAgeSec < 0 ||
      latestGreenAgeSec >
        MAX_FRESHNESS_SEC
    ) {

      return json({

        ok: true,

        road_id:
          roadId,

        timezone:
          HK_TIME_ZONE,

        experimental:
          true,

        current_hong_kong_time:
          currentHongKongTime,

        current_hong_kong_hour:
          hkParts.hour,

        current_time_bucket:
          currentTimeBucket,

        countdown_available:
          false,

        available:
          false,

        reason:
          '最新 GREEN 事件已經太舊，請在現場重新記錄轉燈。',

        latest_green_event:
          latestGreen,

        latest_green_age_sec:
          latestGreenAgeSec,

        max_freshness_sec:
          MAX_FRESHNESS_SEC,

        historical_data_note:
          '歷史事件仍然保留，並繼續用於模型計算。'
      });
    }


    // =================================================
    // 最新 RED
    // =================================================

    const latestRed =
      [...events]
        .reverse()
        .find(
          (event) =>
            event.state === 'RED'
        );


    // =================================================
    // 即時現場 GREEN 校正
    //
    // 如果最新 RED 在最新 GREEN 後面：
    //
    // RED - GREEN = 實際 GREEN 時間
    // =================================================

    let fieldCorrectionGreenSec =
      null;

    let fieldCorrectionEventId =
      null;


    if (latestRed) {

      const latestRedMs =
        new Date(
          latestRed.recorded_at
        ).getTime();


      if (
        Number.isFinite(
          latestRedMs
        ) &&
        latestRedMs >
          latestGreenMs
      ) {

        const actualGreenSec =
          (
            latestRedMs -
            latestGreenMs
          ) / 1000;


        if (
          actualGreenSec > 0 &&
          actualGreenSec <=
            MAX_CYCLE_SEC
        ) {

          fieldCorrectionGreenSec =
            actualGreenSec;

          fieldCorrectionEventId =
            latestRed.id;
        }
      }
    }


    const fieldCorrectionApplied =
      Number.isFinite(
        fieldCorrectionGreenSec
      );


    // =================================================
    // 建立新的
    //
    // 「最接近當刻 + 時間距離加權」
    //
    // 模型
    // =================================================

    const analysis =
      buildCycleAnalysis(
        events
      );


    const model =
      buildTimeDistanceWeightedModel(
        analysis.normalCycles,
        now
      );


    if (!model) {

      return json({

        ok: true,

        road_id:
          roadId,

        timezone:
          HK_TIME_ZONE,

        experimental:
          true,

        current_hong_kong_time:
          currentHongKongTime,

        current_hong_kong_hour:
          hkParts.hour,

        current_time_bucket:
          currentTimeBucket,

        countdown_available:
          false,

        available:
          false,

        reason:
          '目前沒有足夠的歷史正常 cycle。',

        latest_green_event:
          latestGreen,

        latest_green_age_sec:
          latestGreenAgeSec,

        max_freshness_sec:
          MAX_FRESHNESS_SEC,

        field_correction: {

          applied:
            fieldCorrectionApplied,

          green_actual_sec:
            fieldCorrectionApplied
              ? Number(
                  fieldCorrectionGreenSec.toFixed(3)
                )
              : null,

          red_event_id:
            fieldCorrectionApplied
              ? fieldCorrectionEventId
              : null
        }
      });
    }


    // =================================================
    // 原始時間距離加權模型
    // =================================================

    let greenAverageSec =
      model.green_average_sec;

    const redAverageSec =
      model.red_average_sec;

    let cycleAverageSec =
      model.cycle_average_sec;


    // =================================================
    // 套用即時現場校正
    //
    // GREEN：
    // 歷史加權模型 → 實際現場時間
    //
    // RED：
    // 暫時仍使用歷史加權模型
    // =================================================

    if (
      fieldCorrectionApplied
    ) {

      greenAverageSec =
        fieldCorrectionGreenSec;

      cycleAverageSec =
        greenAverageSec +
        redAverageSec;
    }


    // =================================================
    // 最新 GREEN 到現在經過多久
    // =================================================

    const elapsedSec =
      latestGreenAgeSec;


    // =================================================
    // 計算目前位於 cycle 哪個位置
    // =================================================

    const phaseElapsedSec =
      elapsedSec %
      cycleAverageSec;


    let currentState;
    let estimatedRemainingSec;


    if (
      phaseElapsedSec <
      greenAverageSec
    ) {

      currentState =
        'GREEN';


      estimatedRemainingSec =
        greenAverageSec -
        phaseElapsedSec;

    } else {

      currentState =
        'RED';


      estimatedRemainingSec =
        cycleAverageSec -
        phaseElapsedSec;
    }


    return json({

      ok: true,

      road_id:
        roadId,

      timezone:
        HK_TIME_ZONE,

      experimental:
        true,

      current_hong_kong_time:
        currentHongKongTime,

      current_hong_kong_hour:
        hkParts.hour,

      current_time_bucket:
        currentTimeBucket,


      countdown_available:
        true,

      available:
        true,


      model_source:
        model.model_source,


      model_count:
        model.model_count,


      model: {

        green_average_sec:
          greenAverageSec,

        red_average_sec:
          redAverageSec,

        cycle_average_sec:
          cycleAverageSec
      },


      weighting: {

        method:
          '1 / (1 + time_distance_hours)',

        total_weight:
          model.total_weight,

        nearest_cycle:
          model.nearest_cycle
      },


      field_correction: {

        applied:
          fieldCorrectionApplied,

        green_actual_sec:
          fieldCorrectionApplied
            ? Number(
                fieldCorrectionGreenSec.toFixed(3)
              )
            : null,

        red_event_id:
          fieldCorrectionApplied
            ? fieldCorrectionEventId
            : null
      },


      latest_green_event:
        latestGreen,


      latest_green_age_sec:
        latestGreenAgeSec,


      max_freshness_sec:
        MAX_FRESHNESS_SEC,


      elapsed_since_green_sec:
        elapsedSec,


      phase_elapsed_sec:
        phaseElapsedSec,


      current_state:
        currentState,


      estimated_remaining_sec:
        estimatedRemainingSec,


      historical_data_note:
        '歷史事件保留；模型使用正常 cycle 並按時間距離加權。'
    });


  } catch (error) {

    console.error(
      'signal-countdown error:',
      error
    );


    return json({

      ok: false,

      error:
        'signal-countdown failed',

      message:
        error.message

    }, {
      status: 500
    });
  }
}


// ===================================================
// Worker 主入口
// ===================================================

export default {

  async fetch(
    request,
    env,
    ctx
  ) {

    const url =
      new URL(request.url);


    // =================================================
    // CORS OPTIONS
    // =================================================

    if (
      request.method === 'OPTIONS'
    ) {

      return new Response(
        null,
        {
          status: 204,
          headers:
            CORS_HEADERS
        }
      );
    }


    // =================================================
    // HEALTH
    // =================================================

    if (
      request.method === 'GET' &&
      url.pathname === '/api/health'
    ) {

      return handleHealth();
    }


    // =================================================
    // ROADS
    // =================================================

    if (
      request.method === 'GET' &&
      url.pathname === '/api/roads'
    ) {

      return handleRoads(env);
    }


    // =================================================
    // SIGNAL EVENTS POST
    // =================================================

    if (
      request.method === 'POST' &&
      url.pathname === '/api/signal-events'
    ) {

      return handleSignalEventPost(
        request,
        env
      );
    }


    // =================================================
    // SIGNAL EVENTS GET
    // =================================================

    if (
      request.method === 'GET' &&
      url.pathname === '/api/signal-events'
    ) {

      return handleSignalEventsGet(
        request,
        env
      );
    }


    // =================================================
    // SIGNAL CYCLE
    // =================================================

    if (
      request.method === 'GET' &&
      url.pathname === '/api/signal-cycle'
    ) {

      return handleSignalCycle(
        request,
        env
      );
    }


    // =================================================
    // SIGNAL MODEL
    // =================================================

    if (
      request.method === 'GET' &&
      url.pathname === '/api/signal-model'
    ) {

      return handleSignalModel(
        request,
        env
      );
    }


    // =================================================
    // SIGNAL COUNTDOWN
    // =================================================

    if (
      request.method === 'GET' &&
      url.pathname === '/api/signal-countdown'
    ) {

      return handleSignalCountdown(
        request,
        env
      );
    }


    // =================================================
    // 404
    // =================================================

    return json({

      ok: false,

      error:
        'Not Found',

      path:
        url.pathname

    }, {
      status: 404
    });
  }
};