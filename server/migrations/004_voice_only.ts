export default `
-- a passage may be recorded by voice alone; its digits are added later (typed by a supervisor or accepted from an offline suggestion)
ALTER TABLE observations ALTER COLUMN plate_suffix DROP NOT NULL;
ALTER TABLE observations ADD CONSTRAINT observations_suffix_or_audio CHECK (plate_suffix IS NOT NULL OR audio IS NOT NULL);
ALTER TABLE observations ADD COLUMN suffix_source text NOT NULL DEFAULT 'TYPED' CHECK (suffix_source IN ('TYPED','VOICE','SUPERVISOR','SUGGESTION'));
ALTER TABLE observations ADD COLUMN suggested_suffix char(3) CHECK (suggested_suffix IS NULL OR suggested_suffix ~ '^[0-9]{3}$');
ALTER TABLE observations ADD COLUMN suggested_source text;
ALTER TABLE observations ADD COLUMN suggested_conf real CHECK (suggested_conf IS NULL OR suggested_conf BETWEEN 0 AND 1);
ALTER TABLE observations ADD COLUMN suggested_at timestamptz;
`;
