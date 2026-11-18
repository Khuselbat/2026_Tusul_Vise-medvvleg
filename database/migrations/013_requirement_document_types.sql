-- Migration 013 — визийн шаардлагыг баримтын төрөлтэй холбох (нэг шаардлагад олон төрөл, D-61) ба
-- мэдүүлгийн хавсралт профайлын аль баримтаас ХУУЛАГДСАНЫГ тэмдэглэх (мэдээллийн чанартай; FK-гүй —
-- профайлын баримт устсан ч илгээсэн мэдүүлгийн хуулбар хэвээр, BR-07/NFR-05).
SET NAMES utf8mb4;

CREATE TABLE requirement_document_types (
  requirement_id BIGINT UNSIGNED NOT NULL,
  type_code      VARCHAR(40)     NOT NULL,
  PRIMARY KEY (requirement_id, type_code),
  KEY ix_req_doc_types_type (type_code),
  CONSTRAINT fk_req_doc_types_requirement FOREIGN KEY (requirement_id) REFERENCES visa_requirements (requirement_id) ON DELETE CASCADE,
  CONSTRAINT fk_req_doc_types_type        FOREIGN KEY (type_code)      REFERENCES document_types (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE application_documents
  ADD COLUMN source_profile_document_id BIGINT UNSIGNED NULL AFTER scan_status;
