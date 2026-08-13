-- Motivo de eliminación persistido en el préstamo.
-- Agrega loans.deleted_reason TEXT (para el borrado lógico) sincronizado con la auditoría.
-- Idempotente. Vía exec-delete-loan-reason.mjs

ALTER TABLE loans ADD COLUMN IF NOT EXISTS deleted_reason TEXT;