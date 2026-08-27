-- Camera-on tracking: derived from the Meet Reports API's video_send_seconds
-- field on the call_ended event (how long a participant's client sent video).
ALTER TABLE "meeting_attendance" ADD COLUMN "videoSendSeconds" INTEGER;
ALTER TABLE "meeting_attendance" ADD COLUMN "cameraOnRatio" DOUBLE PRECISION;
ALTER TABLE "meeting_attendance" ADD COLUMN "cameraOff" BOOLEAN NOT NULL DEFAULT false;
