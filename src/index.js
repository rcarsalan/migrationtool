require('dotenv').config();
const chalk = require('chalk');
const logger = require('./utils/logger');
const config = require('./config');
const { migrateCategories, migrateProducts } = require('./migrations/migrateProducts');
const { migrateCustomers } = require('./migrations/migrateCustomers');
const { migrateInventory } = require('./migrations/migrateInventory');
const { migrateSchema } = require('./migrations/migrateSchema');

const TASKS = {
  categories: migrateCategories,
  products: migrateProducts,
  customers: migrateCustomers,
  inventory: migrateInventory,
  schema: migrateSchema,
};

async function run() {
  const rawArgs = process.argv.slice(2);

  // Parse --key=xxx or --key xxx flag
  let filterKey = null;
  const keyArgIndex = rawArgs.findIndex((a) => a.startsWith('--key'));
  if (keyArgIndex !== -1) {
    const keyArg = rawArgs[keyArgIndex];
    filterKey = keyArg.includes('=') ? keyArg.split('=')[1] : rawArgs[keyArgIndex + 1];
  }
  // Support both: "node index.js products" and "node index.js --tasks=products"
  const tasksArg = rawArgs.find((a) => a.startsWith('--tasks='));
  const tasksList = tasksArg ? tasksArg.split('=')[1].split(',') : null;
  const args = rawArgs.filter((a) => !a.startsWith('--'));
  const selectedTasks = tasksList || (args.length > 0 ? args : Object.keys(TASKS));

  console.log(chalk.bold.blue('\n========================================'));
  console.log(chalk.bold.blue(`   SFCC Migration Tool - OCAPI ${config.sfcc.version}  `));
  console.log(chalk.bold.blue('========================================\n'));

  if (config.migration.dryRun) {
    console.log(chalk.yellow('  [DRY RUN MODE] No data will be written\n'));
  }
  if (filterKey) {
    console.log(chalk.cyan(`  [SINGLE RECORD] Filtering by key: ${filterKey}\n`));
  }

  const summary = {};
  const startTime = Date.now();

  for (const task of selectedTasks) {
    if (!TASKS[task]) {
      logger.warn(`Unknown task: ${task}. Available: ${Object.keys(TASKS).join(', ')}`);
      continue;
    }

    try {
      logger.info(`Starting task: ${task}`);
      summary[task] = await TASKS[task](filterKey);
    } catch (err) {
      logger.error(`Task "${task}" failed: ${err.message}`);
      summary[task] = { error: err.message };
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(chalk.bold.green('\n========================================'));
  console.log(chalk.bold.green('           Migration Summary            '));
  console.log(chalk.bold.green('========================================'));

  for (const [task, result] of Object.entries(summary)) {
    if (result.error) {
      console.log(chalk.red(`  ${task}: FAILED - ${result.error}`));
    } else {
      console.log(chalk.green(`  ${task}: ${result.success} success, ${result.failed} failed`));
    }
  }

  console.log(chalk.bold(`\n  Total time: ${elapsed}s\n`));
}

run().catch((err) => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
