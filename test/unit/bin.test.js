import { main } from '../../bin/main.js';
import { htmlIsEqual } from '@markedjs/testutils';
import { resolve } from 'node:path';
import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

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

function execMarked({ args = '', stdin = '', stdout = '', stderr = '', code = 0 }) {
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
    const res = await execAsync(command, { timeout: 10000 }).catch(err => err);

    assert.ok(await htmlIsEqual(res.stdout, stdout));
    assert.strictEqual(res.stderr, stderr);
    assert.strictEqual(res.code ?? 0, code);
  };
}

describe('bin/marked', () => {
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

    it('joins positional files with a blank line and parses them together in order', testInput({
      args: [fixturePath('bin-input-first.md'), fixturePath('bin-input-second.md')],
      stdout: '<p>First <a href="/shared">link</a>.</p>\n<p>Second paragraph.</p>',
    }));

    it('preserves reversed positional file order', testInput({
      args: [fixturePath('bin-input-second.md'), fixturePath('bin-input-first.md')],
      stdout: '<p>Second paragraph.</p>\n<p>First <a href="/shared">link</a>.</p>',
    }));

    for (const option of ['-i', '--input']) {
      it(`${option} takes priority over positional files`, testInput({
        args: [fixturePath('does-not-exist.md'), option, fixturePath('bin-input.md')],
        stdout: '<h1>file</h1>',
      }));
    }

    for (const option of ['-s', '--string']) {
      it(`${option} takes priority over input and positional files`, testInput({
        args: ['--input', fixturePath('does-not-exist.md'), option, '# string', fixturePath('does-not-exist.md')],
        stdout: '<h1>string</h1>',
      }));
    }

    it('empty string takes priority over positional files', testInput({
      args: ['--string', '', fixturePath('does-not-exist.md')],
      stdout: '\n',
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

    it('missing second positional file reports its path', testInput({
      args: [fixturePath('bin-input-first.md'), fixturePath('does-not-exist.md')],
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

  it('input files positional in order', execMarked({
    args: `${fixturePath('bin-input-first.md')} ${fixturePath('bin-input-second.md')}`,
    stdout: '<p>First <a href="/shared">link</a>.</p>\n<p>Second paragraph.</p>',
  }));

  it('missing second positional file', execMarked({
    args: `${fixturePath('bin-input-first.md')} ${fixturePath('does-not-exist.md')}`,
    stderr: `marked: ${fixturePath('does-not-exist.md')}: No such file or directory`,
    code: 1,
  }));
});
