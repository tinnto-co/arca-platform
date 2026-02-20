-- Add "opened" column to notification (default false so existing rows are unopened)
ALTER TABLE "notification" ADD COLUMN "opened" boolean DEFAULT false NOT NULL;
