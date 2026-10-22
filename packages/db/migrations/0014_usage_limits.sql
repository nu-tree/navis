CREATE TABLE "usage_limits" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"five_hour_utilization" real,
	"five_hour_resets_at" timestamp with time zone,
	"seven_day_utilization" real,
	"seven_day_resets_at" timestamp with time zone,
	"status" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL
);
