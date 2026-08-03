import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  analyze,
  applyBubbleGuard,
  decide,
  hiddenRatio,
  screen,
  screenBatch,
  thresholdFor,
} from '../src/filter/engine';
import { CATEGORIES, type Category, type Post, type Settings } from '../src/types';

/** Every category at the same sensitivity — keeps tests honest when one is added. */
function atEvery(value: number): Record<Category, number> {
  const out = {} as Record<Category, number>;
  for (const category of CATEGORIES) out[category] = value;
  return out;
}


let counter = 0;
function post(text: string, extra: Partial<Post> = {}): Post {
  counter += 1;
  return {
    id: `p${counter}`,
    sourceId: 'test',
    sourceLabel: 'test',
    sourceKind: 'manual',
    text,
    links: [],
    createdAt: 1_700_000_000_000,
    ...extra,
  };
}

/**
 * Advanced settings by default. These tests drive `mode` and per-category
 * sensitivity directly, which is exactly what simple mode overrides — so they
 * opt out of it. The presets get their own block at the bottom.
 */
function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, simpleMode: false, ...overrides };
}

describe('analyze', () => {
  it('leaves ordinary, sourced writing alone', () => {
    const result = screen(
      post(
        'The transit authority approved the new bus lane on Tuesday. According to the ' +
          'agency report, service should start in March. https://www.reuters.com/world/story',
        { links: ['https://www.reuters.com/world/story'] },
      ),
      settings(),
    );

    expect(result.decision.action).toBe('allow');
    expect(result.analysis.credibility).toBeGreaterThan(0.3);
  });

  it('flags hostility aimed at a person', () => {
    const result = screen(
      post("You are all pathetic morons and nobody asked for your opinion. Just shut up."),
      settings(),
    );

    expect(result.analysis.topCategory).toBe('toxicity');
    expect(result.analysis.scores.toxicity).toBeGreaterThan(0.5);
    expect(['blur', 'collapse']).toContain(result.decision.action);
  });

  it('flags conspiracy framing', () => {
    const result = screen(
      post(
        "WAKE UP. They don't want you to know what really happened. Do your own research " +
          "before this gets deleted. The mainstream media won't report it. Connect the dots.",
      ),
      settings(),
    );

    expect(result.analysis.topCategory).toBe('conspiracy');
    expect(result.analysis.scores.conspiracy).toBeGreaterThan(0.7);
  });

  it('flags a strong unsourced claim, and softens the same claim when sourced', () => {
    const bare = analyze(
      post('BREAKING: 87% of hospital admissions last month were unreported. This is a proven fact.'),
      settings(),
    );
    const sourced = analyze(
      post(
        'According to a study published in the BMJ, 87% of admissions were reclassified. ' +
          'https://www.bmj.com/content/123',
        { links: ['https://www.bmj.com/content/123'] },
      ),
      settings(),
    );

    expect(bare.scores.misinfo).toBeGreaterThan(0.4);
    expect(sourced.scores.misinfo).toBeLessThan(bare.scores.misinfo);
    expect(sourced.credibility).toBeGreaterThan(bare.credibility);
  });

  it('catches obfuscated spellings', () => {
    const plain = analyze(post('These sheeple will believe anything they are told.'), settings());
    const leet = analyze(post('These sh33ple will believe anything they are told.'), settings());
    expect(leet.scores.conspiracy).toBeCloseTo(plain.scores.conspiracy, 5);
  });

  it('treats shouting as an outrage signal', () => {
    const calm = analyze(post('This decision is a disgrace and people are upset about it.'), settings());
    const shouting = analyze(
      post('THIS DECISION IS A DISGRACE AND EVERYONE SHOULD BE FURIOUS ABOUT IT!!!'),
      settings(),
    );
    expect(shouting.scores.outrage).toBeGreaterThan(calm.scores.outrage);
  });

  it('flags engagement bait', () => {
    const result = analyze(
      post('93% of you won\'t share this. Copy and paste this before it gets deleted!'),
      settings(),
    );
    expect(result.scores.engagementBait).toBeGreaterThan(0.5);
  });

  it('produces evidence for everything it scores', () => {
    const result = analyze(post('You are a moron and the deep state is hiding the truth.'), settings());
    for (const [category, score] of Object.entries(result.scores)) {
      if (score > 0) {
        expect(result.evidence.some((e) => e.category === category)).toBe(true);
      }
    }
  });
});

describe('decide', () => {
  it('never acts when filtering is off', () => {
    const nasty = post('You are all pathetic morons, kill yourself.');
    expect(screen(nasty, settings({ mode: 'off' })).decision.action).toBe('allow');
  });

  it('caps at labelling in label-only mode', () => {
    const nasty = post('You are all pathetic morons and I hate these people.');
    expect(screen(nasty, settings({ mode: 'label' })).decision.action).toBe('label');
  });

  it('respects per-category sensitivity', () => {
    const p = post('This is an absolute disgrace and everyone should be furious!!!');
    const sensitive = screen(
      p,
      settings({ sensitivity: { ...DEFAULT_SETTINGS.sensitivity, outrage: 100 } }),
    );
    const tolerant = screen(
      p,
      settings({ sensitivity: { ...DEFAULT_SETTINGS.sensitivity, outrage: 0 } }),
    );
    expect(tolerant.decision.action).toBe('allow');
    expect(sensitive.decision.action).not.toBe('allow');
  });

  it('collapses muted phrases regardless of tone', () => {
    const result = screen(
      post('Quick update on the quarterly budget meeting.'),
      settings({ mutedPhrases: ['budget meeting'] }),
    );
    expect(result.decision.action).toBe('collapse');
    expect(result.decision.reason).toContain('budget meeting');
  });

  it('drops evidence covered by the allowlist', () => {
    const text = 'The market is collapsing and it is all over for us.';
    const before = analyze(post(text), settings());
    const after = analyze(post(text), settings({ allowedPhrases: ['collapse framing'] }));
    expect(after.scores.doom).toBeLessThan(before.scores.doom);
  });

  it('always explains itself', () => {
    const result = screen(post('WAKE UP SHEEPLE, they are hiding the truth!!!'), settings());
    expect(result.decision.reason.length).toBeGreaterThan(10);
    expect(result.analysis.evidence.length).toBeGreaterThan(0);
  });

  it('only ever reduces visibility, never removes a post', () => {
    const result = screen(post('kill yourself you worthless scum'), settings({ mode: 'strict' }));
    expect(['allow', 'label', 'blur', 'collapse']).toContain(result.decision.action);
    expect(result.post.text).toBe('kill yourself you worthless scum');
  });
});

describe('thresholdFor', () => {
  it('falls monotonically as sensitivity rises', () => {
    let previous = Infinity;
    for (let s = 0; s <= 100; s += 10) {
      const t = thresholdFor(s);
      expect(t).toBeLessThan(previous);
      previous = t;
    }
  });
});

describe('bubble guard', () => {
  const nasty = () => post('You are all pathetic morons, absolute disgrace, nobody asked.');

  it('caps how much of a batch can be hidden', () => {
    const posts = Array.from({ length: 10 }, nasty);
    const screened = screenBatch(posts, settings({ maxHiddenRatio: 0.3 }));
    expect(hiddenRatio(screened)).toBeLessThanOrEqual(0.3);
    expect(screened.some((s) => s.decision.softenedByBubbleGuard)).toBe(true);
  });

  it('leaves small batches alone', () => {
    const screened = screenBatch([nasty(), nasty()], settings({ maxHiddenRatio: 0.1 }));
    expect(screened.every((s) => !s.decision.softenedByBubbleGuard)).toBe(true);
  });

  it('keeps the most confident hides when it has to choose', () => {
    const mild = Array.from({ length: 6 }, () => post('This is a bit of a disgrace, honestly.'));
    const severe = Array.from({ length: 2 }, nasty);
    const screened = applyBubbleGuard(
      [...mild, ...severe].map((p) => screen(p, settings())),
      settings({ maxHiddenRatio: 0.25 }),
    );
    const stillHidden = screened.filter(
      (s) => s.decision.action === 'blur' || s.decision.action === 'collapse',
    );
    for (const item of stillHidden) {
      expect(item.analysis.scores.toxicity).toBeGreaterThan(0.3);
    }
  });
});

describe('switching a category off', () => {
  /**
   * Regression: "off" used to mean sensitivity 0, and `thresholdFor(0)` is 0.95
   * — so a post scoring above that was still acted on by a category the Filters
   * screen showed as disabled. A toggle labelled off has to mean off.
   */
  const extreme = () =>
    post(
      'Doctors hate this: one simple root cures cancer in weeks. Big pharma is hiding it ' +
        'because they lose money when you get better. 100% proven, undeniable, irrefutable.',
    );

  it('acts on the post while the category is on', () => {
    const result = screen(extreme(), settings());
    expect(result.decision.action).not.toBe('allow');
    expect(result.decision.category).toBe('misinfo');
  });

  it('does nothing at all once that category is off, however high it scores', () => {
    const off = settings({ sensitivity: { ...DEFAULT_SETTINGS.sensitivity, misinfo: 0 } });
    const result = screen(extreme(), off);
    expect(result.analysis.scores.misinfo).toBeGreaterThan(0.9);
    expect(result.decision.action).toBe('allow');
  });

  it('still lets other categories act', () => {
    const off = settings({ sensitivity: { ...DEFAULT_SETTINGS.sensitivity, misinfo: 0 } });
    const nasty = post('You are a worthless pathetic moron and everyone who agrees is scum.');
    expect(screen(nasty, off).decision.category).toBe('toxicity');
  });

  it('with every category off, nothing is ever acted on', () => {
    const allOff = settings({
      mode: 'strict',
      sensitivity: atEvery(0),
    });
    for (const [, sample] of MUST_FLAG_SAMPLES) {
      expect(screen(sample, allOff).decision.action).toBe('allow');
    }
  });
});

describe('adult and graphic content', () => {
  it('flags adult solicitation', () => {
    const result = screen(post('Check my onlyfans, link in bio for the spicy stuff. 18+ content only.'), settings());
    expect(result.analysis.topCategory).toBe('explicit');
    expect(result.decision.action).not.toBe('allow');
  });

  it('flags graphic violence', () => {
    const result = screen(
      post('Graphic warning: execution video going around, you can watch him die, absolutely brutal.'),
      settings(),
    );
    expect(result.analysis.scores.explicit).toBeGreaterThan(0.6);
  });

  it('is not softened by good sourcing, unlike a factual claim', () => {
    const sourced = analyze(
      post('According to a Reuters report, the beheading footage was verified. https://www.reuters.com/x',
        { links: ['https://www.reuters.com/x'] }),
      settings(),
    );
    const bare = analyze(post('the beheading footage was verified'), settings());
    expect(sourced.scores.explicit).toBeCloseTo(bare.scores.explicit, 5);
  });

  /**
   * This category defaults high and is the one a parent turns up, so the cost
   * of a false positive is a filter that eats ordinary sentences. Everything
   * below has to score exactly zero even with the dial at maximum.
   */
  const INNOCENT = [
    'The sex education curriculum was approved by the school board on Tuesday.',
    'Researchers found sex differences in how the drug is metabolised.',
    'The gallery is showing a nude by Modigliani alongside three landscapes.',
    'We watched a documentary about the graphic design of the London Underground.',
    'The escort vehicle led the convoy through the tunnel at walking pace.',
    'Food porn, honestly — that lasagne was the best thing I ate all year.',
    'He was brutally honest about the budget and everyone respected him for it.',
    'Blood tests came back normal, which is a relief after all that worrying.',
  ];

  for (const text of INNOCENT) {
    it(`leaves alone: ${text.slice(0, 44)}...`, () => {
      const maxed = settings({
        mode: 'strict',
        sensitivity: { ...DEFAULT_SETTINGS.sensitivity, explicit: 100 },
      });
      expect(screen(post(text), maxed).analysis.scores.explicit).toBe(0);
    });
  }
});

describe('simple mode', () => {
  const nasty = () =>
    post('Doctors hate this: one simple root cures cancer in weeks. 100% proven, big pharma hides it.');
  const ordinary = () =>
    post(
      'The transit authority approved the new bus lane on Tuesday. According to the agency ' +
        'report, service should begin in March.',
    );

  it('ignores the stored dials in favour of the chosen level', () => {
    // Dials that would allow everything, overridden by a level that does not.
    const s = settings({ simpleMode: true, protection: 'child', mode: 'off', sensitivity: atEvery(0) });
    expect(screen(nasty(), s).decision.action).not.toBe('allow');
  });

  it('hands the dials back untouched when simple mode is switched off', () => {
    const stored = settings({ simpleMode: false, mode: 'off', sensitivity: atEvery(0) });
    expect(screen(nasty(), stored).decision.action).toBe('allow');
  });

  it('gets stricter as the level rises', () => {
    const rank = { allow: 0, label: 1, blur: 2, collapse: 3 };
    const light = screen(nasty(), settings({ simpleMode: true, protection: 'light' })).decision.action;
    const calm = screen(nasty(), settings({ simpleMode: true, protection: 'calm' })).decision.action;
    const child = screen(nasty(), settings({ simpleMode: true, protection: 'child' })).decision.action;
    expect(rank[light]).toBeLessThanOrEqual(rank[calm]);
    expect(rank[calm]).toBeLessThanOrEqual(rank[child]);
  });

  it('hides nothing at the lightest level', () => {
    const light = settings({ simpleMode: true, protection: 'light' });
    expect(['allow', 'label']).toContain(screen(nasty(), light).decision.action);
  });

  it('leaves ordinary posts alone even at the child level', () => {
    const child = settings({ simpleMode: true, protection: 'child' });
    expect(screen(ordinary(), child).decision.action).toBe('allow');
  });

  it('hides adult content at every level, including the lightest', () => {
    const adult = post('Check my onlyfans, link in bio for the spicy stuff, 18+ content only.');
    for (const protection of ['light', 'calm', 'child'] as const) {
      const result = screen(adult, settings({ simpleMode: true, protection }));
      expect(result.decision.action).not.toBe('allow');
      expect(result.decision.category).toBe('explicit');
    }
  });
});

const MUST_FLAG_SAMPLES: Array<[string, Post]> = [
  ['cure', post('Doctors hate this: one simple root cures cancer in weeks. 100% proven.')],
  ['abuse', post('You are a worthless pathetic moron and everyone who agrees with you is scum.')],
  ['conspiracy', post("WAKE UP. They don't want you to know. Do your own research before it is deleted!!!")],
];
