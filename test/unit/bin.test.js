import { main } from '../../bin/main.js';
import { htmlIsEqual } from '@markedjs/testutils';
import { resolve } from 'node:path';
import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { exec, execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

function createMocks() {
  const mocks = {
    stdout: '',
    stderr: '',
    code: null,
    stdin: {
      data: null,
      error: null,
      end: null,
    },
    process: {
      cwd: mock.fn(() => '/cwd'),
      env: [],
      argv: [],
      stdout: {
        write: mock.fn((str) => { mocks.stdout += str; }),
      },
      stderr: {
        write: mock.fn((str) => { mocks.stderr += str; }),
      },
      stdin: {
        setEncoding: mock.fn(),
        on: mock.fn((method, func) => {
          mocks.stdin[method] = func;
        }),
        resume: mock.fn(),
      },
      exit: mock.fn((code) => { mocks.code = code; }),
    },
  };

  return mocks;
}

function testInput({ args = [], stdin = '', stdinError = '', stdout = '', stderr = '', code = 0 } = {}) {
  return async() => {
    const mocks = createMocks();
    mocks.process.argv = ['node', 'marked', ...args];
    const mainPromise = main(mocks.process);
    if (typeof mocks.stdin.end === 'function') {
      if (stdin) {
        mocks.stdin.data(stdin);
      }
      if (stdinError) {
        mocks.stdin.error(stdinError);
      }
      mocks.stdin.end();
    }
    await mainPromise;

    assert.ok(await htmlIsEqual(mocks.stdout, stdout));
    assert.strictEqual(mocks.stderr, stderr);
    assert.strictEqual(mocks.code, code);
  };
}

function fixturePath(filePath) {
  return resolve(import.meta.dirname, './fixtures', filePath);
}

function execMarked({ args = '', stdin = '', stdout = '', stderr = '' }) {
  const execPath = resolve(import.meta.dirname, '../../bin/marked');
  return async() => {
    let command = '';

    if (stdin) {
      command += `node -e "process.stdout.write('${stdin}')" | `;
    }
    command += `node ${execPath}`;
    if (args) {
      command += ` ${args}`;
    }
    const res = await execAsync(command);

    assert.ok(await htmlIsEqual(res.stdout, stdout));
    assert.strictEqual(res.stderr, stderr);
  };
}

describe('bin/marked', () => {
  describe('options', () => {
    for (const option of ['--gfn', '--no-gfn']) {
      it(`warns and continues for ${option}`, testInput({
        args: [option, '-s', '# test'],
        stdout: '<h1>test</h1>',
        stderr: `marked: unknown option '${option}', ignored\n`,
      }));
    }

    it('warns for every unknown option and still reads positional files', testInput({
      args: ['--gfn', '--no-gfn', fixturePath('bin-input.md')],
      stdout: '<h1>file</h1>',
      stderr: "marked: unknown option '--gfn', ignored\nmarked: unknown option '--no-gfn', ignored\n",
    }));

    it('warns and still reads stdin', testInput({
      args: ['--gfn'],
      stdin: '# test',
      stdout: '<h1>test</h1>',
      stderr: "marked: unknown option '--gfn', ignored\n",
    }));

    it('--gfm is silent and enables GFM', testInput({
      args: ['--gfm', '-s', '~~test~~'],
      stdout: '<p><del>test</del></p>',
    }));

    it('--no-gfm is silent and disables GFM', testInput({
      args: ['--no-gfm', '-s', '~~test~~'],
      stdout: '<p>~~test~~</p>',
    }));
  });

  describe('string', () => {
    it('-s', testInput({
      args: ['-s', '# test'],
      stdout: '<h1>test</h1>',
    }));

    it('--string', testInput({
      args: ['--string', '# test'],
      stdout: '<h1>test</h1>',
    }));

    it('--string accepts empty input instead of reading stdin', testInput({
      args: ['--string', ''],
      stdin: '# ignored',
      stdout: '\n',
    }));
  });

  describe('config', () => {
    it('-c', testInput({
      args: ['-c', fixturePath('bin-config.js'), '-s', 'line1\nline2'],
      stdout: '<p>line1<br>line2</p>',
    }));

    it('--config', testInput({
      args: ['--config', fixturePath('bin-config.js'), '-s', 'line1\nline2'],
      stdout: '<p>line1<br>line2</p>',
    }));

    it('config path with hash', testInput({
      args: ['--config', fixturePath('bin-config#hash.js'), '-s', 'line1\nline2'],
      stdout: '<p>line1<br>line2</p>',
    }));

    it('config with top-level await', testInput({
      args: ['--config', fixturePath('bin-config-await.mjs'), '-s', 'line1\nline2'],
      stdout: '<p>line1<br>line2</p>',
    }));

    it('config not found', testInput({
      args: ['--config', fixturePath('does-not-exist.js'), '-s', 'line1\nline2'],
      stderr: `Cannot load config file '${fixturePath('does-not-exist.js')}'`,
      code: 1,
    }));
  });

  describe('input', () => {
    it('input file positional', testInput({
      args: [fixturePath('bin-input.md')],
      stdout: '<h1>file</h1>',
    }));

    it('input file not found', testInput({
      args: [fixturePath('does-not-exist.md')],
      stderr: `marked: ${fixturePath('does-not-exist.md')}: No such file or directory`,
      code: 1,
    }));

    it('input file not found --input', testInput({
      args: ['--input', fixturePath('does-not-exist.md')],
      stderr: `marked: ${fixturePath('does-not-exist.md')}: No such file or directory`,
      code: 1,
    }));

    it('reads from stdin when no files are provided', testInput({
      stdin: '# test\n',
      stdout: '<h1>test</h1>',
    }));
  });
});

describe('exec', () => {
  for (const option of ['-h', '--help', '-v', '--version']) {
    it(option, async() => {
      const { stdout, stderr } = await execFileAsync(process.execPath, [
        resolve(import.meta.dirname, '../../bin/marked.js'), option,
      ], {
        env: { ...process.env, PATH: '' },
        timeout: 10000,
      });
      const help = option === '-h' || option === '--help';
      const file = help ? 'man/marked.1.md' : 'package.json';
      const content = await readFile(resolve(import.meta.dirname, '../..', file), 'utf8');
      assert.strictEqual(stdout, (help ? content : JSON.parse(content).version) + '\n');
      assert.strictEqual(stderr, '');
    });
  }

  it('stdin', execMarked({
    stdin: '# test',
    stdout: '<h1>test</h1>',
  }));

  it('string', execMarked({
    args: '-s "# test"',
    stdout: '<h1>test</h1>',
  }));

  it('input', execMarked({
    args: `-i ${fixturePath('bin-input.md')}`,
    stdout: '<h1>file</h1>',
  }));

  it('input file positional', execMarked({
    args: fixturePath('bin-input.md'),
    stdout: '<h1>file</h1>',
  }));

  it('input last file positional', execMarked({
    args: `${fixturePath('does-not-exist.md')} ${fixturePath('bin-input.md')}`,
    stdout: '<h1>file</h1>',
  }));
});
