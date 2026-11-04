-- Búsqueda semántica: modelo de embedding por fragmento y pgvector opcional.
ALTER TABLE knowledge_chunks ADD COLUMN embedding_model text;
CREATE INDEX chunks_embedding_model_idx ON knowledge_chunks (company_id, embedding_model);

-- pgvector es opcional: si el rol de la base no puede crear la extensión, la app calcula la similitud en Node.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector no disponible (%): se usará similitud en la aplicación', SQLERRM;
END $$;
