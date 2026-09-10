-- M-A12 WS-HARDEN: enforce "AT MOST ONE ACTIVE GraphVersion per case" at the
-- DATABASE level (application-level enforcement lives in createVersion's
-- same-transaction auto-activation, this adds a hard safety invariant).
--
-- A partial unique index over (caseId) WHERE status = 'ACTIVE' admits at most
-- one ACTIVE version per case and still allows any number of DRAFT /
-- SUPERSEDED / ARCHIVED versions. createVersion demotes the prior ACTIVE to
-- SUPERSEDED before promoting the new version in the same transaction, so a
-- P2002 here would indicate an invariant bug, never a normal race.
--
-- Postgres >= 9.5 partial unique indexes are supported by Prisma migrate.

CREATE UNIQUE INDEX "GraphVersion_unique_active_per_case"
  ON "GraphVersion" ("caseId")
  WHERE status = 'ACTIVE';