/**
 * Single source of truth for tunable thresholds.
 *
 * HANDOFF.md previously flagged the 1-minute late threshold as hardcoded in
 * three places (api/cron.ts, scheduler/index.ts, scripts/backfill-week.ts)
 * that could drift apart. Import from here instead of hardcoding literals.
 */

// A join is "late" if it's more than this many minutes after scheduled start.
export const LATE_THRESHOLD_MINUTES = Number(process.env.LATE_THRESHOLD_MINUTES ?? 1);

// A participant is flagged "camera off" if the fraction of the meeting they
// spent actively sending video (cameraOnRatio) falls below this threshold.
// e.g. 0.5 = camera on for less than half the meeting.
export const CAMERA_OFF_THRESHOLD_RATIO = Number(process.env.CAMERA_OFF_THRESHOLD_RATIO ?? 0.5);

/**
 * Computes camera-on-ness for a single participant from Reports API data.
 * Returns null values when there isn't enough data to compute a ratio
 * (e.g. never joined, or Meet didn't report any video stats).
 */
export function computeCameraStats(
  videoSendSeconds: number | null | undefined,
  durationSeconds: number | null | undefined
): { videoSendSeconds: number | null; cameraOnRatio: number | null; cameraOff: boolean } {
  if (videoSendSeconds == null || !durationSeconds || durationSeconds <= 0) {
    return { videoSendSeconds: videoSendSeconds ?? null, cameraOnRatio: null, cameraOff: false };
  }
  const ratio = Math.min(1, videoSendSeconds / durationSeconds);
  return {
    videoSendSeconds,
    cameraOnRatio: ratio,
    cameraOff: ratio < CAMERA_OFF_THRESHOLD_RATIO,
  };
}
