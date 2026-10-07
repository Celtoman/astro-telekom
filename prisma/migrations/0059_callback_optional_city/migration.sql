-- Callback consultations can precede city selection. Connection API keeps its gate.
ALTER TABLE "Lead" ALTER COLUMN "cityId" DROP NOT NULL;
