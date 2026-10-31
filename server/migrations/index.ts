import init from './001_init.ts';
import mapsAudio from './002_maps_audio.ts';
import shortCredentials from './003_short_credentials.ts';

/** Ordered list. Never edit a migration that has been applied anywhere: add a new one. */
export const migrations: { version: string; sql: string }[] = [
  { version: '001_init', sql: init },
  { version: '002_maps_audio', sql: mapsAudio },
  { version: '003_short_credentials', sql: shortCredentials },
];
