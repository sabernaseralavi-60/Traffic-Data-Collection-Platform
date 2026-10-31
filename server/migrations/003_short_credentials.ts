export default `
ALTER TABLE users DROP CONSTRAINT users_username_check;
ALTER TABLE users ADD CONSTRAINT users_username_check CHECK (username ~ '^[a-z0-9._-]{2,32}$');
ALTER TABLE users ADD COLUMN lock_count integer NOT NULL DEFAULT 0;
`;
