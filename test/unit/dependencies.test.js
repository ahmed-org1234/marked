import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const releaseRequire = createRequire(import.meta.resolve('semantic-release'));
const micromatch = releaseRequire('micromatch');
const braces = createRequire(releaseRequire.resolve('micromatch'))('braces');

describe('release tooling glob dependencies', () => {
  it('preserves branch, commit rule, and file matching', () => {
    assert.deepEqual(micromatch(['main', '1.x', '2.x', 'next'], ['main', '+([0-9]).x']), ['main', '1.x', '2.x']);
    assert.equal(micromatch.isMatch('feat', '{feat,fix}'), true);
    assert.equal(micromatch.isMatch('docs', '{feat,fix}'), false);
    assert.deepEqual(micromatch(['src/a.js', 'src/a.test.js', '.config.js'], ['**/*.js', '!**/*.test.js'], { dot: true }), ['src/a.js', '.config.js']);
    assert.deepEqual(micromatch.braceExpand('release/{1..3}/{stable,next}'), [
      'release/1/stable', 'release/1/next',
      'release/2/stable', 'release/2/next',
      'release/3/stable', 'release/3/next',
    ]);
    assert.equal(braces.compile('a/{b,{c,d}}'), 'a/(b|(c|d))');
    assert.equal(braces.stringify(braces.parse('a/{b,c}')), 'a/{b,c}');
  });

  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    it(`rejects deeply nested ${open}${close} input before recursive processing`, () => {
      const pattern = open.repeat(3000) + 'a' + close.repeat(3000);
      for (const operation of [braces.parse, braces.compile, braces.expand, braces.stringify]) {
        assert.throws(() => operation(pattern), {
          name: 'SyntaxError',
          message: /exceeds max depth/,
        });
      }
    });
  }

  it('bounds recursive traversal of caller-supplied ASTs', () => {
    for (const operation of [braces.compile, braces.expand, braces.stringify]) {
      const ast = { type: 'root', nodes: [] };
      let parent = ast;
      for (let depth = 0; depth < 3000; depth++) {
        const child = { type: 'brace', nodes: [], parent };
        parent.nodes.push(child);
        parent = child;
      }
      assert.throws(() => operation(ast), {
        name: 'RangeError',
        message: /exceeds max depth/,
      });
    }
  });
});
