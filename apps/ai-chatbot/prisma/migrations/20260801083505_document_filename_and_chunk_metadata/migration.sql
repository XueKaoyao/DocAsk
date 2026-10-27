-- AlterTable: 先加可空列，用 title 回填，再设为 NOT NULL
ALTER TABLE "Document" ADD COLUMN "filename" TEXT;

UPDATE "Document" SET "filename" = "title" WHERE "filename" IS NULL;

ALTER TABLE "Document" ALTER COLUMN "filename" SET NOT NULL;
