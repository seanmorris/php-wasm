export const drupalPgsqlDatabase = 'idb://host=drupal-11-pg18 dbname=postgres port=5432';

export const drupalPgsqlReadyQuery = `
SELECT to_regclass('public.users_field_data') IS NOT NULL AS ready
`;

export const isDrupalPgsqlReady = result => result?.rows?.[0]?.ready === true;
