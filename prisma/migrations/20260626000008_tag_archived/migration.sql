-- Story 27.4: archive-not-delete for Tags.
-- Additive: BOOLEAN NOT NULL DEFAULT false — existing rows stay active automatically.
ALTER TABLE "Tag" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
