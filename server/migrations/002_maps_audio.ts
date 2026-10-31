export default `
CREATE TABLE study_maps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id   uuid NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  image      text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX study_maps_study ON study_maps (study_id, sort_order);

ALTER TABLE observation_points ADD COLUMN map_id uuid REFERENCES study_maps(id) ON DELETE SET NULL;

-- every existing study gets a first map that carries its former single schematic image; its points are placed on it
INSERT INTO study_maps (study_id, name, image, sort_order) SELECT id, 'Map 1', schematic_image, 0 FROM studies;
UPDATE observation_points p SET map_id = m.id FROM study_maps m WHERE m.study_id = p.study_id;

ALTER TABLE studies ADD COLUMN audio_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE observations
  ADD COLUMN audio bytea,
  ADD COLUMN audio_mime text CHECK (audio_mime IS NULL OR audio_mime IN ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav')),
  ADD COLUMN audio_ms integer CHECK (audio_ms IS NULL OR audio_ms BETWEEN 0 AND 30000);
`;
