import { spawnSync } from 'node:child_process';

const requestedArguments = process.argv.slice(2);
const unsupportedArguments = requestedArguments.filter((argument) => argument !== '--runInBand');
if (unsupportedArguments.length) {
  console.error(`Unsupported test arguments: ${unsupportedArguments.join(', ')}`);
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  [
    '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
    '--experimental-strip-types',
    '--test-concurrency=1',
    '--test',
    'src/features/finance/financeEngine.test.mts',
    'src/features/finance/phase2Engine.test.mts',
    'src/i18n/i18n.test.mts',
    'src/lib/serializedStorage.test.mts',
    'src/store/financeStore.test.mts',
    'src/lib/formatters.test.mts',
  ],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
} else {
  process.exit(result.status ?? 1);
}
