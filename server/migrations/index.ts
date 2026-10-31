import init from './001_init.ts';

/** Ordered list. Never edit a migration that has been applied anywhere: add a new one. */
export const migrations: { version: string; sql: string }[] = [{ version: '001_init', sql: init }];
