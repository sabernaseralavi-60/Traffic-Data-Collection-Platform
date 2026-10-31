import init from './001_init.ts';
import mapsAudio from './002_maps_audio.ts';

/** Ordered list. Never edit a migration that has been applied anywhere: add a new one. */
export const migrations: { version: string; sql: string }[] = [
  { version: '001_init', sql: init },
  { version: '002_maps_audio', sql: mapsAudio },
];
