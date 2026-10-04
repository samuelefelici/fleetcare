CREATE SCHEMA "fleetcare";
--> statement-breakpoint
CREATE TYPE "fleetcare"."accident_fault" AS ENUM('ours', 'counterpart', 'shared', 'unknown');--> statement-breakpoint
CREATE TYPE "fleetcare"."accident_status" AS ENUM('open', 'assessment', 'closed');--> statement-breakpoint
CREATE TYPE "fleetcare"."attachment_entity" AS ENUM('vehicle', 'equipment', 'deadline_completion', 'maintenance_job', 'fault_report', 'accident', 'fuel_invoice', 'checklist');--> statement-breakpoint
CREATE TYPE "fleetcare"."check_outcome" AS ENUM('ok', 'anomaly', 'not_applicable');--> statement-breakpoint
CREATE TYPE "fleetcare"."checklist_item_kind" AS ENUM('check', 'number', 'text');--> statement-breakpoint
CREATE TYPE "fleetcare"."completion_outcome" AS ENUM('passed', 'conditional', 'failed');--> statement-breakpoint
CREATE TYPE "fleetcare"."deadline_subject" AS ENUM('vehicle', 'equipment');--> statement-breakpoint
CREATE TYPE "fleetcare"."downtime_cause" AS ENUM('breakdown', 'maintenance', 'deadline', 'accident', 'sanitization', 'other');--> statement-breakpoint
CREATE TYPE "fleetcare"."en1789_type" AS ENUM('A1', 'A2', 'B', 'C');--> statement-breakpoint
CREATE TYPE "fleetcare"."equipment_group" AS ENUM('electromedical', 'oxygen', 'transport_device', 'immobilization', 'safety', 'vehicle_device', 'other');--> statement-breakpoint
CREATE TYPE "fleetcare"."equipment_status" AS ENUM('in_use', 'in_stock', 'in_repair', 'out_of_service', 'disposed');--> statement-breakpoint
CREATE TYPE "fleetcare"."fault_area" AS ENUM('mechanical', 'electrical', 'bodywork', 'tyres', 'lights_siren', 'sanitary_compartment', 'equipment', 'lift', 'radio_it', 'other');--> statement-breakpoint
CREATE TYPE "fleetcare"."fault_severity" AS ENUM('green', 'yellow', 'red');--> statement-breakpoint
CREATE TYPE "fleetcare"."fault_status" AS ENUM('open', 'acknowledged', 'in_progress', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "fleetcare"."fuel_invoice_status" AS ENUM('received', 'reconciled', 'disputed', 'approved', 'paid');--> statement-breakpoint
CREATE TYPE "fleetcare"."fuel_match_status" AS ENUM('unmatched', 'matched', 'mismatch', 'manual', 'ignored');--> statement-breakpoint
CREATE TYPE "fleetcare"."fuel_product" AS ENUM('diesel', 'petrol', 'adblue', 'lpg', 'cng', 'other');--> statement-breakpoint
CREATE TYPE "fleetcare"."fuel_type" AS ENUM('diesel', 'petrol', 'hybrid', 'electric', 'lpg', 'cng');--> statement-breakpoint
CREATE TYPE "fleetcare"."maintenance_kind" AS ENUM('service', 'repair', 'tyres', 'bodywork', 'inspection', 'outfitting', 'equipment_service', 'other');--> statement-breakpoint
CREATE TYPE "fleetcare"."maintenance_status" AS ENUM('planned', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "fleetcare"."notification_kind" AS ENUM('deadline_expiring', 'deadline_expired', 'fault_red', 'vehicle_grounded', 'vehicle_restored', 'fuel_mismatch', 'generic');--> statement-breakpoint
CREATE TYPE "fleetcare"."odometer_source" AS ENUM('manual', 'checklist', 'fuel', 'maintenance');--> statement-breakpoint
CREATE TYPE "fleetcare"."ownership_kind" AS ENUM('owned', 'loan', 'leased', 'rented');--> statement-breakpoint
CREATE TYPE "fleetcare"."profile_role" AS ENUM('crew', 'fleet_manager', 'equipment_manager', 'admin_finance', 'admin');--> statement-breakpoint
CREATE TYPE "fleetcare"."sanitization_kind" AS ENUM('routine', 'periodic', 'post_infectious');--> statement-breakpoint
CREATE TYPE "fleetcare"."supplier_kind" AS ENUM('workshop', 'body_shop', 'tyre_shop', 'auto_electrician', 'outfitter', 'medical_service', 'fuel_station', 'insurer', 'inspection_center', 'fire_safety', 'medical_gas', 'other');--> statement-breakpoint
CREATE TYPE "fleetcare"."vehicle_category" AS ENUM('emergency_ambulance', 'transport_ambulance', 'medical_car', 'disabled_transport', 'service_car', 'civil_protection');--> statement-breakpoint
CREATE TYPE "fleetcare"."vehicle_status" AS ENUM('operational', 'reserve', 'maintenance', 'grounded', 'decommissioned');--> statement-breakpoint
CREATE TABLE "fleetcare"."attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" "fleetcare"."attachment_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_path" text NOT NULL,
	"uploaded_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_size_ck" CHECK ("fleetcare"."attachments"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"table_name" text NOT NULL,
	"row_id" uuid,
	"action" text NOT NULL,
	"actor_id" uuid,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."document_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"year" integer NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"kind" "fleetcare"."notification_kind" DEFAULT 'generic' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."profile_accounts" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"role" "fleetcare"."profile_role" NOT NULL,
	"badge_number" text,
	"is_driver" boolean DEFAULT false NOT NULL,
	"site_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"is_headquarters" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kinds" "fleetcare"."supplier_kind"[] DEFAULT '{}' NOT NULL,
	"vat_number" text,
	"tax_code" text,
	"sdi_code" text,
	"pec" text,
	"email" text,
	"phone" text,
	"address" text,
	"city" text,
	"contact_name" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"legal_name" text,
	"tax_code" text,
	"vat_number" text,
	"runts_number" text,
	"network" text,
	"address" text,
	"city" text,
	"province" text,
	"pec" text,
	"email" text,
	"phone" text,
	"catalog_seeded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."odometer_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"km" integer NOT NULL,
	"source" "fleetcare"."odometer_source" DEFAULT 'manual' NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_id" uuid NOT NULL,
	CONSTRAINT "odometer_km_ck" CHECK ("fleetcare"."odometer_readings"."km" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid,
	"internal_code" text NOT NULL,
	"call_sign" text,
	"plate" text NOT NULL,
	"vin" text,
	"category" "fleetcare"."vehicle_category" NOT NULL,
	"status" "fleetcare"."vehicle_status" DEFAULT 'operational' NOT NULL,
	"status_reason" text,
	"status_changed_at" timestamp with time zone,
	"make" text,
	"model" text,
	"version" text,
	"fuel_type" "fleetcare"."fuel_type" DEFAULT 'diesel' NOT NULL,
	"euro_class" text,
	"power_kw" integer,
	"gross_weight_kg" integer,
	"seats" integer,
	"stretcher_positions" integer,
	"wheelchair_positions" integer,
	"tank_liters" integer,
	"tyre_size" text,
	"outfitter" text,
	"outfitting_date" date,
	"outfitting_approval" text,
	"en1789_type" "fleetcare"."en1789_type",
	"has_lift" boolean DEFAULT false NOT NULL,
	"has_priority_lights" boolean DEFAULT false NOT NULL,
	"registration_date" date,
	"registration_doc_number" text,
	"ownership" "fleetcare"."ownership_kind" DEFAULT 'owned' NOT NULL,
	"owner_name" text,
	"purchase_date" date,
	"purchase_value_eur" numeric(12, 2),
	"funding_source" text,
	"donor_name" text,
	"useful_life_years" integer,
	"bollo_exempt" boolean DEFAULT false NOT NULL,
	"initial_odometer_km" integer DEFAULT 0 NOT NULL,
	"initial_odometer_on" date,
	"odometer_km" integer DEFAULT 0 NOT NULL,
	"odometer_updated_at" timestamp with time zone,
	"fuel_vehicle_code" text,
	"decommissioned_on" date,
	"decommission_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "vehicles_odometer_ck" CHECK ("fleetcare"."vehicles"."odometer_km" >= 0 and "fleetcare"."vehicles"."initial_odometer_km" >= 0),
	CONSTRAINT "vehicles_codes_ck" CHECK (regexp_replace(upper("fleetcare"."vehicles"."internal_code"), '[^A-Z0-9]', '', 'g') <> ''
          and regexp_replace(upper("fleetcare"."vehicles"."plate"), '[^A-Z0-9]', '', 'g') <> ''
          and ("fleetcare"."vehicles"."fuel_vehicle_code" is null
               or regexp_replace(upper("fleetcare"."vehicles"."fuel_vehicle_code"), '[^A-Z0-9]', '', 'g') <> ''))
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"equipment_type_id" uuid NOT NULL,
	"inventory_code" text,
	"manufacturer" text,
	"model" text,
	"serial_number" text,
	"status" "fleetcare"."equipment_status" DEFAULT 'in_use' NOT NULL,
	"vehicle_id" uuid,
	"site_id" uuid,
	"position_note" text,
	"ownership" "fleetcare"."ownership_kind" DEFAULT 'owned' NOT NULL,
	"owner_name" text,
	"manufactured_on" date,
	"purchase_date" date,
	"purchase_value_eur" numeric(12, 2),
	"warranty_until" date,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "equipment_one_place_ck" CHECK (not ("fleetcare"."equipment"."vehicle_id" is not null and "fleetcare"."equipment"."site_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."equipment_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"moved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_vehicle_id" uuid,
	"to_vehicle_id" uuid,
	"from_site_id" uuid,
	"to_site_id" uuid,
	"reason" text,
	"moved_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."equipment_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"group" "fleetcare"."equipment_group" NOT NULL,
	"electromedical" boolean DEFAULT false NOT NULL,
	"mission_critical" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_types_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."accidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"location" text,
	"description" text NOT NULL,
	"driver_id" uuid,
	"during_emergency" boolean DEFAULT false NOT NULL,
	"fault" "fleetcare"."accident_fault" DEFAULT 'unknown' NOT NULL,
	"counterpart_plate" text,
	"counterpart_insurer" text,
	"cid_signed" boolean DEFAULT false NOT NULL,
	"police_report" boolean DEFAULT false NOT NULL,
	"injuries" boolean DEFAULT false NOT NULL,
	"insurer_id" uuid,
	"claim_number" text,
	"estimated_damage_eur" numeric(12, 2),
	"settled_amount_eur" numeric(12, 2),
	"deductible_eur" numeric(12, 2),
	"status" "fleetcare"."accident_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accidents_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."maintenance_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"vehicle_id" uuid,
	"equipment_id" uuid,
	"supplier_id" uuid,
	"kind" "fleetcare"."maintenance_kind" NOT NULL,
	"status" "fleetcare"."maintenance_status" DEFAULT 'planned' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"work_done" text,
	"planned_on" date,
	"dropped_off_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"odometer_km" integer,
	"estimate_eur" numeric(12, 2),
	"net_amount_eur" numeric(12, 2),
	"vat_amount_eur" numeric(12, 2),
	"total_amount_eur" numeric(12, 2),
	"invoice_number" text,
	"invoice_date" date,
	"warranty" boolean DEFAULT false NOT NULL,
	"accident_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_jobs_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "maintenance_jobs_subject_ck" CHECK ("fleetcare"."maintenance_jobs"."vehicle_id" is not null or "fleetcare"."maintenance_jobs"."equipment_id" is not null),
	CONSTRAINT "maintenance_jobs_dates_ck" CHECK ("fleetcare"."maintenance_jobs"."returned_at" is null or "fleetcare"."maintenance_jobs"."dropped_off_at" is null or "fleetcare"."maintenance_jobs"."returned_at" >= "fleetcare"."maintenance_jobs"."dropped_off_at")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."vehicle_downtimes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"cause" "fleetcare"."downtime_cause" NOT NULL,
	"maintenance_job_id" uuid,
	"replacement_vehicle_id" uuid,
	"note" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "downtimes_dates_ck" CHECK ("fleetcare"."vehicle_downtimes"."ended_at" is null or "fleetcare"."vehicle_downtimes"."ended_at" >= "fleetcare"."vehicle_downtimes"."started_at"),
	CONSTRAINT "downtimes_replacement_ck" CHECK ("fleetcare"."vehicle_downtimes"."replacement_vehicle_id" is null or "fleetcare"."vehicle_downtimes"."replacement_vehicle_id" <> "fleetcare"."vehicle_downtimes"."vehicle_id")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."deadline_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"deadline_id" uuid NOT NULL,
	"done_on" date NOT NULL,
	"done_km" integer,
	"outcome" "fleetcare"."completion_outcome" DEFAULT 'passed' NOT NULL,
	"next_due_on" date,
	"next_due_km" integer,
	"supplier_id" uuid,
	"document_number" text,
	"cost_eur" numeric(12, 2),
	"maintenance_job_id" uuid,
	"sanitization_id" uuid,
	"notes" text,
	"recorded_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deadline_completions_dates_ck" CHECK ("fleetcare"."deadline_completions"."done_on" between '1900-01-01' and '2999-12-31' and "fleetcare"."deadline_completions"."next_due_on" between '1900-01-01' and '2999-12-31')
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."deadline_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"deadline_type_id" uuid NOT NULL,
	"vehicle_category" "fleetcare"."vehicle_category",
	"equipment_type_id" uuid,
	"interval_months" integer,
	"interval_days" integer,
	"interval_km" integer,
	"alert_days" integer,
	"alert_km" integer,
	"blocking" boolean,
	"ownership_kinds" "fleetcare"."ownership_kind"[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deadline_rules_target_ck" CHECK (("fleetcare"."deadline_rules"."vehicle_category" is not null) <> ("fleetcare"."deadline_rules"."equipment_type_id" is not null)),
	CONSTRAINT "deadline_rules_interval_ck" CHECK (not ("fleetcare"."deadline_rules"."interval_months" is not null and "fleetcare"."deadline_rules"."interval_days" is not null)),
	CONSTRAINT "deadline_rules_values_ck" CHECK ("fleetcare"."deadline_rules"."interval_months" > 0 and "fleetcare"."deadline_rules"."interval_days" > 0 and "fleetcare"."deadline_rules"."interval_km" > 0
          and "fleetcare"."deadline_rules"."alert_days" >= 0 and "fleetcare"."deadline_rules"."alert_km" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."deadline_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"subject" "fleetcare"."deadline_subject" NOT NULL,
	"description" text,
	"reference" text,
	"interval_months" integer,
	"interval_days" integer,
	"interval_km" integer,
	"month_end" boolean DEFAULT false NOT NULL,
	"renew_from_due" boolean DEFAULT false NOT NULL,
	"renew_grace_days" integer,
	"alert_days" integer DEFAULT 30 NOT NULL,
	"alert_km" integer,
	"blocking" boolean DEFAULT false NOT NULL,
	"document_required" boolean DEFAULT false NOT NULL,
	"is_vehicle_tax" boolean DEFAULT false NOT NULL,
	"completed_by_crew" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deadline_types_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "deadline_types_interval_ck" CHECK (not ("fleetcare"."deadline_types"."interval_months" is not null and "fleetcare"."deadline_types"."interval_days" is not null)),
	CONSTRAINT "deadline_types_values_ck" CHECK ("fleetcare"."deadline_types"."interval_months" > 0 and "fleetcare"."deadline_types"."interval_days" > 0 and "fleetcare"."deadline_types"."interval_km" > 0
          and "fleetcare"."deadline_types"."alert_days" >= 0 and "fleetcare"."deadline_types"."alert_km" >= 0 and "fleetcare"."deadline_types"."renew_grace_days" >= 0),
	CONSTRAINT "deadline_types_crew_renew_ck" CHECK (not ("fleetcare"."deadline_types"."completed_by_crew" and "fleetcare"."deadline_types"."renew_from_due"))
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"deadline_type_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"equipment_id" uuid,
	"label" text DEFAULT '' NOT NULL,
	"interval_months" integer,
	"interval_days" integer,
	"interval_km" integer,
	"alert_days" integer,
	"alert_km" integer,
	"blocking" boolean,
	"due_on" date,
	"due_km" integer,
	"base_due_on" date,
	"base_due_km" integer,
	"last_done_on" date,
	"last_done_km" integer,
	"archived_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deadlines_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "deadlines_subject_ck" CHECK (("fleetcare"."deadlines"."vehicle_id" is not null) <> ("fleetcare"."deadlines"."equipment_id" is not null)),
	CONSTRAINT "deadlines_interval_ck" CHECK (not ("fleetcare"."deadlines"."interval_months" is not null and "fleetcare"."deadlines"."interval_days" is not null)),
	CONSTRAINT "deadlines_values_ck" CHECK ("fleetcare"."deadlines"."interval_months" > 0 and "fleetcare"."deadlines"."interval_days" > 0 and "fleetcare"."deadlines"."interval_km" > 0
          and "fleetcare"."deadlines"."alert_days" >= 0 and "fleetcare"."deadlines"."alert_km" >= 0),
	CONSTRAINT "deadlines_dates_ck" CHECK ("fleetcare"."deadlines"."due_on" between '1900-01-01' and '2999-12-31' and "fleetcare"."deadlines"."base_due_on" between '1900-01-01' and '2999-12-31' and "fleetcare"."deadlines"."last_done_on" between '1900-01-01' and '2999-12-31')
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."kit_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_category" "fleetcare"."vehicle_category" NOT NULL,
	"equipment_type_id" uuid,
	"supply_item_id" uuid,
	"min_quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kit_requirements_target_ck" CHECK (("fleetcare"."kit_requirements"."equipment_type_id" is not null) <> ("fleetcare"."kit_requirements"."supply_item_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."supply_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'pz' NOT NULL,
	"category" text,
	"tracks_expiry" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supply_items_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."supply_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"supply_item_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"site_id" uuid,
	"lot_number" text,
	"expires_on" date,
	"quantity" numeric(10, 2) NOT NULL,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supply_lots_place_ck" CHECK (("fleetcare"."supply_lots"."vehicle_id" is not null) <> ("fleetcare"."supply_lots"."site_id" is not null)),
	CONSTRAINT "supply_lots_qty_ck" CHECK ("fleetcare"."supply_lots"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."fault_report_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"fault_report_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."fault_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"equipment_id" uuid,
	"area" "fleetcare"."fault_area" DEFAULT 'other' NOT NULL,
	"description" text NOT NULL,
	"severity" "fleetcare"."fault_severity" NOT NULL,
	"status" "fleetcare"."fault_status" DEFAULT 'open' NOT NULL,
	"unsafe" boolean DEFAULT false NOT NULL,
	"reported_by_id" uuid NOT NULL,
	"odometer_km" integer,
	"maintenance_job_id" uuid,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"rejected_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fault_reports_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."checklist_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"checklist_id" uuid NOT NULL,
	"template_item_id" uuid NOT NULL,
	"outcome" "fleetcare"."check_outcome" NOT NULL,
	"value_numeric" numeric(10, 2),
	"value_text" text,
	"note" text,
	"fault_report_id" uuid
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."checklist_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"section" text NOT NULL,
	"label" text NOT NULL,
	"kind" "fleetcare"."checklist_item_kind" DEFAULT 'check' NOT NULL,
	"unit" text,
	"min_value" numeric(10, 2),
	"max_value" numeric(10, 2),
	"safety_critical" boolean DEFAULT false NOT NULL,
	"equipment_type_id" uuid,
	"supply_item_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "checklist_template_items_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vehicle_categories" "fleetcare"."vehicle_category"[] DEFAULT '{}' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_templates_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"template_version" integer NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shift_label" text,
	"performed_by_id" uuid NOT NULL,
	"odometer_km" integer,
	"fuel_level_pct" integer,
	"has_anomalies" boolean DEFAULT false NOT NULL,
	"has_safety_anomalies" boolean DEFAULT false NOT NULL,
	"signed_name" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklists_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "checklists_fuel_level_ck" CHECK ("fleetcare"."checklists"."fuel_level_pct" is null or "fleetcare"."checklists"."fuel_level_pct" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."sanitizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"kind" "fleetcare"."sanitization_kind" NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"performed_by_id" uuid NOT NULL,
	"product" text,
	"product_lot" text,
	"method" text,
	"duration_minutes" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sanitizations_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."fuel_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"refueled_on" date NOT NULL,
	"refueled_time" time,
	"vehicle_ref_raw" text,
	"vehicle_id" uuid,
	"product" "fleetcare"."fuel_product" DEFAULT 'diesel' NOT NULL,
	"liters" numeric(8, 2),
	"unit_price_eur" numeric(8, 4),
	"amount_eur" numeric(10, 2) NOT NULL,
	"receipt_number" text,
	"fuel_log_id" uuid,
	"match_status" "fleetcare"."fuel_match_status" DEFAULT 'unmatched' NOT NULL,
	"match_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fuel_invoice_lines_dates_ck" CHECK ("fleetcare"."fuel_invoice_lines"."refueled_on" between '1900-01-01' and '2999-12-31')
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."fuel_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"number" text NOT NULL,
	"issued_on" date NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"net_amount_eur" numeric(12, 2),
	"vat_amount_eur" numeric(12, 2),
	"total_amount_eur" numeric(12, 2) NOT NULL,
	"lines_include_vat" boolean DEFAULT true NOT NULL,
	"vat_rate_pct" numeric(5, 2) DEFAULT '22' NOT NULL,
	"due_on" date,
	"paid_on" date,
	"status" "fleetcare"."fuel_invoice_status" DEFAULT 'received' NOT NULL,
	"sdi_id" text,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fuel_invoices_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "fuel_invoices_period_ck" CHECK ("fleetcare"."fuel_invoices"."period_to" >= "fleetcare"."fuel_invoices"."period_from")
);
--> statement-breakpoint
CREATE TABLE "fleetcare"."fuel_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"supplier_id" uuid,
	"refueled_at" timestamp with time zone NOT NULL,
	"product" "fleetcare"."fuel_product" DEFAULT 'diesel' NOT NULL,
	"liters" numeric(8, 2) NOT NULL,
	"amount_eur" numeric(10, 2),
	"unit_price_eur" numeric(12, 4) GENERATED ALWAYS AS (case when liters > 0 and amount_eur is not null then round(amount_eur / liters, 4) end) STORED,
	"full_tank" boolean DEFAULT true NOT NULL,
	"odometer_km" integer,
	"receipt_number" text,
	"recorded_by_id" uuid NOT NULL,
	"source" text DEFAULT 'app' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fuel_logs_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "fuel_logs_liters_ck" CHECK ("fleetcare"."fuel_logs"."liters" > 0 and "fleetcare"."fuel_logs"."liters" <= 1000),
	CONSTRAINT "fuel_logs_amount_ck" CHECK ("fleetcare"."fuel_logs"."amount_eur" is null or ("fleetcare"."fuel_logs"."amount_eur" >= 0 and "fleetcare"."fuel_logs"."amount_eur" <= 10000))
);
--> statement-breakpoint
ALTER TABLE "fleetcare"."attachments" ADD CONSTRAINT "attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."attachments" ADD CONSTRAINT "attachments_uploaded_by_id_fk" FOREIGN KEY ("tenant_id","uploaded_by_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."document_counters" ADD CONSTRAINT "document_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."notifications" ADD CONSTRAINT "notifications_recipient_id_fk" FOREIGN KEY ("tenant_id","recipient_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."profile_accounts" ADD CONSTRAINT "profile_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."profile_accounts" ADD CONSTRAINT "profile_accounts_profile_id_fk" FOREIGN KEY ("tenant_id","profile_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."profiles" ADD CONSTRAINT "profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."profiles" ADD CONSTRAINT "profiles_site_id_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "fleetcare"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_profile_id_fk" FOREIGN KEY ("tenant_id","profile_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."sites" ADD CONSTRAINT "sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."odometer_readings" ADD CONSTRAINT "odometer_readings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."odometer_readings" ADD CONSTRAINT "odometer_readings_vehicle_id_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."odometer_readings" ADD CONSTRAINT "odometer_readings_recorded_by_id_fk" FOREIGN KEY ("tenant_id","recorded_by_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."vehicles" ADD CONSTRAINT "vehicles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."vehicles" ADD CONSTRAINT "vehicles_site_id_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "fleetcare"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."equipment" ADD CONSTRAINT "equipment_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."equipment" ADD CONSTRAINT "equipment_equipment_type_id_fk" FOREIGN KEY ("tenant_id","equipment_type_id") REFERENCES "fleetcare"."equipment_types"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."equipment" ADD CONSTRAINT "equipment_vehicle_id_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."equipment" ADD CONSTRAINT "equipment_site_id_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "fleetcare"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."equipment_movements" ADD CONSTRAINT "equipment_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."equipment_movements" ADD CONSTRAINT "equipment_movements_equipment_id_fk" FOREIGN KEY ("tenant_id","equipment_id") REFERENCES "fleetcare"."equipment"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."equipment_movements" ADD CONSTRAINT "equipment_movements_from_vehicle_id_fk" FOREIGN KEY ("tenant_id","from_vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."equipment_movements" ADD CONSTRAINT "equipment_movements_to_vehicle_id_fk" FOREIGN KEY ("tenant_id","to_vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."equipment_movements" ADD CONSTRAINT "equipment_movements_from_site_id_fk" FOREIGN KEY ("tenant_id","from_site_id") REFERENCES "fleetcare"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."equipment_movements" ADD CONSTRAINT "equipment_movements_to_site_id_fk" FOREIGN KEY ("tenant_id","to_site_id") REFERENCES "fleetcare"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."equipment_movements" ADD CONSTRAINT "equipment_movements_moved_by_id_fk" FOREIGN KEY ("tenant_id","moved_by_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."equipment_types" ADD CONSTRAINT "equipment_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."accidents" ADD CONSTRAINT "accidents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."accidents" ADD CONSTRAINT "accidents_vehicle_id_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."accidents" ADD CONSTRAINT "accidents_driver_id_fk" FOREIGN KEY ("tenant_id","driver_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."accidents" ADD CONSTRAINT "accidents_insurer_id_fk" FOREIGN KEY ("tenant_id","insurer_id") REFERENCES "fleetcare"."suppliers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."accidents" ADD CONSTRAINT "accidents_created_by_id_fk" FOREIGN KEY ("tenant_id","created_by_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_vehicle_id_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_equipment_id_fk" FOREIGN KEY ("tenant_id","equipment_id") REFERENCES "fleetcare"."equipment"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_supplier_id_fk" FOREIGN KEY ("tenant_id","supplier_id") REFERENCES "fleetcare"."suppliers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_accident_id_fk" FOREIGN KEY ("tenant_id","accident_id") REFERENCES "fleetcare"."accidents"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_created_by_id_fk" FOREIGN KEY ("tenant_id","created_by_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."vehicle_downtimes" ADD CONSTRAINT "vehicle_downtimes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."vehicle_downtimes" ADD CONSTRAINT "vehicle_downtimes_vehicle_id_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."vehicle_downtimes" ADD CONSTRAINT "vehicle_downtimes_maintenance_job_id_fk" FOREIGN KEY ("tenant_id","maintenance_job_id") REFERENCES "fleetcare"."maintenance_jobs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."vehicle_downtimes" ADD CONSTRAINT "vehicle_downtimes_replacement_vehicle_id_fk" FOREIGN KEY ("tenant_id","replacement_vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."vehicle_downtimes" ADD CONSTRAINT "vehicle_downtimes_created_by_id_fk" FOREIGN KEY ("tenant_id","created_by_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadline_completions" ADD CONSTRAINT "deadline_completions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadline_completions" ADD CONSTRAINT "deadline_completions_deadline_id_fk" FOREIGN KEY ("tenant_id","deadline_id") REFERENCES "fleetcare"."deadlines"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadline_completions" ADD CONSTRAINT "deadline_completions_supplier_id_fk" FOREIGN KEY ("tenant_id","supplier_id") REFERENCES "fleetcare"."suppliers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadline_completions" ADD CONSTRAINT "deadline_completions_maintenance_job_id_fk" FOREIGN KEY ("tenant_id","maintenance_job_id") REFERENCES "fleetcare"."maintenance_jobs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadline_completions" ADD CONSTRAINT "deadline_completions_recorded_by_id_fk" FOREIGN KEY ("tenant_id","recorded_by_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadline_completions" ADD CONSTRAINT "deadline_completions_sanitization_id_fk" FOREIGN KEY ("tenant_id","sanitization_id") REFERENCES "fleetcare"."sanitizations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadline_rules" ADD CONSTRAINT "deadline_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadline_rules" ADD CONSTRAINT "deadline_rules_deadline_type_id_fk" FOREIGN KEY ("tenant_id","deadline_type_id") REFERENCES "fleetcare"."deadline_types"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadline_rules" ADD CONSTRAINT "deadline_rules_equipment_type_id_fk" FOREIGN KEY ("tenant_id","equipment_type_id") REFERENCES "fleetcare"."equipment_types"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadline_types" ADD CONSTRAINT "deadline_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadlines" ADD CONSTRAINT "deadlines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadlines" ADD CONSTRAINT "deadlines_deadline_type_id_fk" FOREIGN KEY ("tenant_id","deadline_type_id") REFERENCES "fleetcare"."deadline_types"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadlines" ADD CONSTRAINT "deadlines_vehicle_id_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."deadlines" ADD CONSTRAINT "deadlines_equipment_id_fk" FOREIGN KEY ("tenant_id","equipment_id") REFERENCES "fleetcare"."equipment"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."kit_requirements" ADD CONSTRAINT "kit_requirements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."kit_requirements" ADD CONSTRAINT "kit_requirements_equipment_type_id_fk" FOREIGN KEY ("tenant_id","equipment_type_id") REFERENCES "fleetcare"."equipment_types"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."kit_requirements" ADD CONSTRAINT "kit_requirements_supply_item_id_fk" FOREIGN KEY ("tenant_id","supply_item_id") REFERENCES "fleetcare"."supply_items"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."supply_items" ADD CONSTRAINT "supply_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."supply_lots" ADD CONSTRAINT "supply_lots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."supply_lots" ADD CONSTRAINT "supply_lots_supply_item_id_fk" FOREIGN KEY ("tenant_id","supply_item_id") REFERENCES "fleetcare"."supply_items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."supply_lots" ADD CONSTRAINT "supply_lots_vehicle_id_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."supply_lots" ADD CONSTRAINT "supply_lots_site_id_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "fleetcare"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fault_report_comments" ADD CONSTRAINT "fault_report_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fault_report_comments" ADD CONSTRAINT "fault_report_comments_fault_report_id_fk" FOREIGN KEY ("tenant_id","fault_report_id") REFERENCES "fleetcare"."fault_reports"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fault_report_comments" ADD CONSTRAINT "fault_report_comments_author_id_fk" FOREIGN KEY ("tenant_id","author_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fault_reports" ADD CONSTRAINT "fault_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fault_reports" ADD CONSTRAINT "fault_reports_vehicle_id_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fault_reports" ADD CONSTRAINT "fault_reports_equipment_id_fk" FOREIGN KEY ("tenant_id","equipment_id") REFERENCES "fleetcare"."equipment"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fault_reports" ADD CONSTRAINT "fault_reports_reported_by_id_fk" FOREIGN KEY ("tenant_id","reported_by_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fault_reports" ADD CONSTRAINT "fault_reports_maintenance_job_id_fk" FOREIGN KEY ("tenant_id","maintenance_job_id") REFERENCES "fleetcare"."maintenance_jobs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."checklist_answers" ADD CONSTRAINT "checklist_answers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."checklist_answers" ADD CONSTRAINT "checklist_answers_template_item_fk" FOREIGN KEY ("tenant_id","template_item_id") REFERENCES "fleetcare"."checklist_template_items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."checklist_answers" ADD CONSTRAINT "checklist_answers_checklist_id_fk" FOREIGN KEY ("tenant_id","checklist_id") REFERENCES "fleetcare"."checklists"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."checklist_answers" ADD CONSTRAINT "checklist_answers_fault_report_id_fk" FOREIGN KEY ("tenant_id","fault_report_id") REFERENCES "fleetcare"."fault_reports"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."checklist_template_items" ADD CONSTRAINT "checklist_template_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."checklist_template_items" ADD CONSTRAINT "checklist_items_equipment_type_fk" FOREIGN KEY ("tenant_id","equipment_type_id") REFERENCES "fleetcare"."equipment_types"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."checklist_template_items" ADD CONSTRAINT "checklist_template_items_template_id_fk" FOREIGN KEY ("tenant_id","template_id") REFERENCES "fleetcare"."checklist_templates"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."checklist_template_items" ADD CONSTRAINT "checklist_template_items_supply_item_id_fk" FOREIGN KEY ("tenant_id","supply_item_id") REFERENCES "fleetcare"."supply_items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."checklist_templates" ADD CONSTRAINT "checklist_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."checklists" ADD CONSTRAINT "checklists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."checklists" ADD CONSTRAINT "checklists_vehicle_id_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."checklists" ADD CONSTRAINT "checklists_template_id_fk" FOREIGN KEY ("tenant_id","template_id") REFERENCES "fleetcare"."checklist_templates"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."checklists" ADD CONSTRAINT "checklists_performed_by_id_fk" FOREIGN KEY ("tenant_id","performed_by_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."sanitizations" ADD CONSTRAINT "sanitizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."sanitizations" ADD CONSTRAINT "sanitizations_vehicle_id_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."sanitizations" ADD CONSTRAINT "sanitizations_performed_by_id_fk" FOREIGN KEY ("tenant_id","performed_by_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fuel_invoice_lines" ADD CONSTRAINT "fuel_invoice_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fuel_invoice_lines" ADD CONSTRAINT "fuel_invoice_lines_invoice_id_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "fleetcare"."fuel_invoices"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fuel_invoice_lines" ADD CONSTRAINT "fuel_invoice_lines_vehicle_id_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fuel_invoice_lines" ADD CONSTRAINT "fuel_invoice_lines_fuel_log_id_fk" FOREIGN KEY ("tenant_id","fuel_log_id") REFERENCES "fleetcare"."fuel_logs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fuel_invoices" ADD CONSTRAINT "fuel_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fuel_invoices" ADD CONSTRAINT "fuel_invoices_supplier_id_fk" FOREIGN KEY ("tenant_id","supplier_id") REFERENCES "fleetcare"."suppliers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fuel_invoices" ADD CONSTRAINT "fuel_invoices_created_by_id_fk" FOREIGN KEY ("tenant_id","created_by_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fuel_logs" ADD CONSTRAINT "fuel_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "fleetcare"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fuel_logs" ADD CONSTRAINT "fuel_logs_vehicle_id_fk" FOREIGN KEY ("tenant_id","vehicle_id") REFERENCES "fleetcare"."vehicles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fuel_logs" ADD CONSTRAINT "fuel_logs_supplier_id_fk" FOREIGN KEY ("tenant_id","supplier_id") REFERENCES "fleetcare"."suppliers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleetcare"."fuel_logs" ADD CONSTRAINT "fuel_logs_recorded_by_id_fk" FOREIGN KEY ("tenant_id","recorded_by_id") REFERENCES "fleetcare"."profiles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_entity_idx" ON "fleetcare"."attachments" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_table_idx" ON "fleetcare"."audit_logs" USING btree ("tenant_id","table_name","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_counters_uq" ON "fleetcare"."document_counters" USING btree ("tenant_id","kind","year");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "fleetcare"."notifications" USING btree ("tenant_id","recipient_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_accounts_tenant_email_uq" ON "fleetcare"."profile_accounts" USING btree ("tenant_id",lower("email"));--> statement-breakpoint
CREATE INDEX "profiles_tenant_name_idx" ON "fleetcare"."profiles" USING btree ("tenant_id","full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_tenant_badge_uq" ON "fleetcare"."profiles" USING btree ("tenant_id","badge_number") WHERE "fleetcare"."profiles"."badge_number" is not null;--> statement-breakpoint
CREATE INDEX "push_subscriptions_profile_idx" ON "fleetcare"."push_subscriptions" USING btree ("tenant_id","profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_profile_endpoint_uq" ON "fleetcare"."push_subscriptions" USING btree ("profile_id","endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_tenant_name_uq" ON "fleetcare"."sites" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "suppliers_tenant_name_idx" ON "fleetcare"."suppliers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_tenant_vat_uq" ON "fleetcare"."suppliers" USING btree ("tenant_id","vat_number") WHERE "fleetcare"."suppliers"."vat_number" is not null;--> statement-breakpoint
CREATE INDEX "odometer_vehicle_idx" ON "fleetcare"."odometer_readings" USING btree ("tenant_id","vehicle_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_tenant_internal_code_uq" ON "fleetcare"."vehicles" USING btree ("tenant_id",regexp_replace(regexp_replace(upper("internal_code"), '[^A-Z0-9]', '', 'g'), '^0+([0-9]+)$', '\1'));--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_tenant_plate_uq" ON "fleetcare"."vehicles" USING btree ("tenant_id",regexp_replace(upper("plate"), '[^A-Z0-9]', '', 'g'));--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_tenant_fuel_code_uq" ON "fleetcare"."vehicles" USING btree ("tenant_id",regexp_replace(regexp_replace(upper("fuel_vehicle_code"), '[^A-Z0-9]', '', 'g'), '^0+([0-9]+)$', '\1')) WHERE "fleetcare"."vehicles"."fuel_vehicle_code" is not null;--> statement-breakpoint
CREATE INDEX "vehicles_tenant_status_idx" ON "fleetcare"."vehicles" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "equipment_tenant_status_idx" ON "fleetcare"."equipment" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "equipment_vehicle_idx" ON "fleetcare"."equipment" USING btree ("tenant_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "equipment_type_idx" ON "fleetcare"."equipment" USING btree ("tenant_id","equipment_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_tenant_inventory_uq" ON "fleetcare"."equipment" USING btree ("tenant_id","inventory_code") WHERE "fleetcare"."equipment"."inventory_code" is not null;--> statement-breakpoint
CREATE INDEX "equipment_movements_eq_idx" ON "fleetcare"."equipment_movements" USING btree ("tenant_id","equipment_id","moved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_types_tenant_code_uq" ON "fleetcare"."equipment_types" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "accidents_tenant_number_uq" ON "fleetcare"."accidents" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "accidents_tenant_status_idx" ON "fleetcare"."accidents" USING btree ("tenant_id","status","occurred_at");--> statement-breakpoint
CREATE INDEX "accidents_vehicle_idx" ON "fleetcare"."accidents" USING btree ("tenant_id","vehicle_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_jobs_tenant_number_uq" ON "fleetcare"."maintenance_jobs" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "maintenance_jobs_tenant_status_idx" ON "fleetcare"."maintenance_jobs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "maintenance_jobs_vehicle_idx" ON "fleetcare"."maintenance_jobs" USING btree ("tenant_id","vehicle_id","planned_on");--> statement-breakpoint
CREATE INDEX "maintenance_jobs_supplier_idx" ON "fleetcare"."maintenance_jobs" USING btree ("tenant_id","supplier_id");--> statement-breakpoint
CREATE INDEX "downtimes_vehicle_idx" ON "fleetcare"."vehicle_downtimes" USING btree ("tenant_id","vehicle_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "downtimes_one_open_uq" ON "fleetcare"."vehicle_downtimes" USING btree ("tenant_id","vehicle_id") WHERE "fleetcare"."vehicle_downtimes"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "deadline_completions_deadline_idx" ON "fleetcare"."deadline_completions" USING btree ("tenant_id","deadline_id","done_on");--> statement-breakpoint
CREATE UNIQUE INDEX "deadline_completions_sanitization_uq" ON "fleetcare"."deadline_completions" USING btree ("deadline_id","sanitization_id") WHERE "fleetcare"."deadline_completions"."sanitization_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "deadline_rules_vehicle_uq" ON "fleetcare"."deadline_rules" USING btree ("tenant_id","deadline_type_id","vehicle_category") WHERE "fleetcare"."deadline_rules"."vehicle_category" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "deadline_rules_equipment_uq" ON "fleetcare"."deadline_rules" USING btree ("tenant_id","deadline_type_id","equipment_type_id") WHERE "fleetcare"."deadline_rules"."equipment_type_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "deadline_types_tenant_code_uq" ON "fleetcare"."deadline_types" USING btree ("tenant_id","code") WHERE "fleetcare"."deadline_types"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "deadlines_tenant_due_idx" ON "fleetcare"."deadlines" USING btree ("tenant_id","due_on");--> statement-breakpoint
CREATE INDEX "deadlines_vehicle_idx" ON "fleetcare"."deadlines" USING btree ("tenant_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "deadlines_equipment_idx" ON "fleetcare"."deadlines" USING btree ("tenant_id","equipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deadlines_vehicle_uq" ON "fleetcare"."deadlines" USING btree ("tenant_id","deadline_type_id","vehicle_id","label") WHERE "fleetcare"."deadlines"."vehicle_id" is not null and "fleetcare"."deadlines"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "deadlines_equipment_uq" ON "fleetcare"."deadlines" USING btree ("tenant_id","deadline_type_id","equipment_id","label") WHERE "fleetcare"."deadlines"."equipment_id" is not null and "fleetcare"."deadlines"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "kit_requirements_equipment_uq" ON "fleetcare"."kit_requirements" USING btree ("tenant_id","vehicle_category","equipment_type_id") WHERE "fleetcare"."kit_requirements"."equipment_type_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "kit_requirements_supply_uq" ON "fleetcare"."kit_requirements" USING btree ("tenant_id","vehicle_category","supply_item_id") WHERE "fleetcare"."kit_requirements"."supply_item_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "supply_items_tenant_code_uq" ON "fleetcare"."supply_items" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "supply_lots_expiry_idx" ON "fleetcare"."supply_lots" USING btree ("tenant_id","expires_on");--> statement-breakpoint
CREATE INDEX "supply_lots_vehicle_idx" ON "fleetcare"."supply_lots" USING btree ("tenant_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "fault_report_comments_report_idx" ON "fleetcare"."fault_report_comments" USING btree ("tenant_id","fault_report_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fault_reports_tenant_number_uq" ON "fleetcare"."fault_reports" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "fault_reports_tenant_status_idx" ON "fleetcare"."fault_reports" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "fault_reports_vehicle_idx" ON "fleetcare"."fault_reports" USING btree ("tenant_id","vehicle_id","status");--> statement-breakpoint
CREATE INDEX "fault_reports_created_idx" ON "fleetcare"."fault_reports" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_answers_item_uq" ON "fleetcare"."checklist_answers" USING btree ("checklist_id","template_item_id");--> statement-breakpoint
CREATE INDEX "checklist_answers_checklist_idx" ON "fleetcare"."checklist_answers" USING btree ("tenant_id","checklist_id");--> statement-breakpoint
CREATE INDEX "checklist_items_template_idx" ON "fleetcare"."checklist_template_items" USING btree ("tenant_id","template_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_templates_tenant_name_uq" ON "fleetcare"."checklist_templates" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "checklists_vehicle_idx" ON "fleetcare"."checklists" USING btree ("tenant_id","vehicle_id","performed_at");--> statement-breakpoint
CREATE INDEX "sanitizations_vehicle_idx" ON "fleetcare"."sanitizations" USING btree ("tenant_id","vehicle_id","performed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fuel_invoice_lines_no_uq" ON "fleetcare"."fuel_invoice_lines" USING btree ("invoice_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "fuel_invoice_lines_log_uq" ON "fleetcare"."fuel_invoice_lines" USING btree ("fuel_log_id") WHERE "fleetcare"."fuel_invoice_lines"."fuel_log_id" is not null;--> statement-breakpoint
CREATE INDEX "fuel_invoice_lines_vehicle_idx" ON "fleetcare"."fuel_invoice_lines" USING btree ("tenant_id","vehicle_id","refueled_on");--> statement-breakpoint
CREATE UNIQUE INDEX "fuel_invoices_supplier_number_uq" ON "fleetcare"."fuel_invoices" USING btree ("tenant_id","supplier_id","number",date_part('year', "issued_on"));--> statement-breakpoint
CREATE INDEX "fuel_invoices_tenant_status_idx" ON "fleetcare"."fuel_invoices" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "fuel_logs_vehicle_idx" ON "fleetcare"."fuel_logs" USING btree ("tenant_id","vehicle_id","refueled_at");--> statement-breakpoint
CREATE INDEX "fuel_logs_date_idx" ON "fleetcare"."fuel_logs" USING btree ("tenant_id","refueled_at");