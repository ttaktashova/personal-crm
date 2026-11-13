DROP INDEX "groups_name_key";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "owner_id" integer;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "owner_id" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_owner_id_idx" ON "contacts" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_name_key" ON "groups" USING btree ("owner_id",replace(lower("name" collate "ru-RU-x-icu"), 'ё', 'е'));