import { seedDemoAccounts } from './accounts.js';
import { configuredDatabasePath, migrateDatabase, openDatabase } from './database.js';

try {
  using database = openDatabase(configuredDatabasePath());
  migrateDatabase(database);
  await seedDemoAccounts(database, process.env);
  console.log('Demo accounts are ready.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
