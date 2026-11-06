-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_createdAt_idx" ON "audit_logs"("targetType", "targetId", "createdAt");

-- Expression indexes for the decision and undo lookups in src/lib/admin/undo.ts (decisionEntries,
-- undoEntries). The schema cannot declare them; those queries repeat these expressions exactly.
CREATE INDEX "audit_logs_decision_id_idx" ON "audit_logs" (("metadata" #>> '{details,decisionId}'))
  WHERE ("metadata" #>> '{details,decisionId}') IS NOT NULL;

CREATE INDEX "audit_logs_undo_of_idx" ON "audit_logs" (("metadata" #>> '{details,undoOf}'))
  WHERE ("metadata" #>> '{details,undoOf}') IS NOT NULL;
