/**
 * Calibration against realistic posts.
 *
 * The unit tests prove each detector fires. These prove the *whole* engine
 * behaves acceptably on writing that resembles a real feed — and, more
 * importantly, that it leaves alone the things it must never touch.
 *
 * The false-positive cases below are the ones that matter. A filter that hides
 * someone asking for help, or that treats sourced criticism of the powerful as
 * a conspiracy, is worse than no filter at all.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, screen } from '../src/filter/engine';
import type { Post } from '../src/types';

let n = 0;
function post(text: string, links: string[] = []): Post {
  n += 1;
  return {
    id: `c${n}`,
    sourceId: 'calibration',
    sourceLabel: 'calibration',
    sourceKind: 'manual',
    text,
    links,
    createdAt: 1_700_000_000_000,
  };
}

const settings = DEFAULT_SETTINGS;

/** Posts that must pass through untouched. */
const MUST_ALLOW: Array<[string, Post]> = [
  [
    'routine sourced news',
    post(
      'The Fed held rates steady at its March meeting. According to the statement, officials ' +
        'expect two cuts later this year. https://www.reuters.com/markets/fed-march',
      ['https://www.reuters.com/markets/fed-march'],
    ),
  ],
  [
    'someone in distress asking for help',
    post(
      "I've been really struggling the last few weeks. Everything feels like too much and I " +
        "don't know what to do. If anyone has been through this I'd appreciate hearing from you.",
    ),
  ],
  [
    'sourced criticism of a powerful institution',
    post(
      'A new investigation found the company knew about the defect for three years before the ' +
        'recall. The internal memos are published in full here. https://www.propublica.org/article/x',
      ['https://www.propublica.org/article/x'],
    ),
  ],
  [
    'ordinary partisan opinion',
    post(
      'I think this policy is a mistake and I disagree with the people who voted for it. The ' +
        'trade-offs were laid out clearly and they chose badly.',
    ),
  ],
  [
    'a protest announcement',
    post(
      'There is a march on Saturday at 11am starting from the square. Bring water. Organisers ' +
        'have posted the route and the legal-support number on their site.',
    ),
  ],
  [
    'sad personal news, plainly told',
    post(
      'My grandmother died on Tuesday. She was 94 and she taught me how to cook. The funeral is ' +
        'next week and I am not really okay yet.',
    ),
  ],
  [
    'a hedged scientific finding',
    post(
      'Preliminary results suggest a modest effect, but the sample size was small (n = 48) and ' +
        'the authors say it needs replication.',
    ),
  ],
  [
    'ordinary frustration',
    post('Third delayed train this week. Genuinely frustrating and I am going to be late again.'),
  ],
];

/** Posts the engine is expected to act on at default settings. */
const MUST_FLAG: Array<[string, Post]> = [
  [
    'classic conspiracy chain post',
    post(
      "WAKE UP! They don't want you to know what is really in it. Do your own research and share " +
        'this before it gets deleted. The mainstream media will never report this. Connect the dots!!!',
    ),
  ],
  [
    'targeted abuse',
    post('You are a worthless pathetic moron and everyone who agrees with you is subhuman scum.'),
  ],
  [
    'miracle cure claim',
    post(
      'Doctors hate this: one simple root cures cancer in weeks. Big pharma is hiding it because ' +
        'they lose money if you get better. 100% proven.',
    ),
  ],
  [
    'guilt-share chain letter',
    post(
      "97% of you won't share this. Copy and paste this to your wall before it gets taken down. " +
        'Only real friends will repost.',
    ),
  ],
  [
    'financial pump',
    post(
      'GUARANTEED 50x returns, you literally cannot lose. Get in now before this explodes. The ' +
        'banks are about to collapse anyway!!!',
    ),
  ],
];

describe('calibration — must not act', () => {
  for (const [name, sample] of MUST_ALLOW) {
    it(`leaves alone: ${name}`, () => {
      const result = screen(sample, settings);
      expect(
        result.decision.action,
        `expected allow but got ${result.decision.action}: ${result.decision.reason}`,
      ).toBe('allow');
    });
  }

  it('never hides a post about personal distress, even at maximum sensitivity', () => {
    const maxed = {
      ...settings,
      mode: 'strict' as const,
      sensitivity: {
        toxicity: 100,
        outrage: 100,
        doom: 100,
        conspiracy: 100,
        misinfo: 100,
        engagementBait: 100,
      },
    };
    const distress = post(
      "I can't stop crying and I feel like everything is falling apart. I don't know who else " +
        'to tell.',
    );
    const result = screen(distress, maxed);
    expect(['allow', 'label']).toContain(result.decision.action);
  });
});

describe('calibration — must act', () => {
  for (const [name, sample] of MUST_FLAG) {
    it(`flags: ${name}`, () => {
      const result = screen(sample, settings);
      expect(
        result.decision.action,
        `expected an action but got allow for "${name}"`,
      ).not.toBe('allow');
      expect(result.analysis.evidence.length).toBeGreaterThan(0);
    });
  }

  it('explains every action it takes in a full sentence', () => {
    for (const [, sample] of MUST_FLAG) {
      const result = screen(sample, settings);
      expect(result.decision.reason).toMatch(/^This post .+\.$/);
    }
  });
});
