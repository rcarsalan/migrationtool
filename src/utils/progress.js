const cliProgress = require('cli-progress');
const chalk = require('chalk');

function createProgressBar(label, total) {
  const bar = new cliProgress.SingleBar({
    format: `${chalk.cyan(label)} [{bar}] {percentage}% | {value}/{total} | ETA: {eta}s`,
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
  });
  bar.start(total, 0);
  return bar;
}

module.exports = { createProgressBar };
