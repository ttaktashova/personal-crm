ALTER TABLE "contacts" ADD COLUMN "birth_day" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_month" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_year" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birthday_check" CHECK (("contacts"."birth_day" is null and "contacts"."birth_month" is null and "contacts"."birth_year" is null)
        or ("contacts"."birth_day" is not null and "contacts"."birth_month" is not null
          and "contacts"."birth_month" between 1 and 12
          and "contacts"."birth_day" between 1 and case "contacts"."birth_month"
            when 2 then 29 when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30
            else 31 end));