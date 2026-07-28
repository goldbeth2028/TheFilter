import { describe, expect, it } from 'vitest';
import {
  capsRatio,
  domainOf,
  excerptAround,
  extractLinks,
  normalize,
  saturate,
  stripHtml,
} from '../src/filter/text';

describe('normalize', () => {
  it('undoes in-word letter substitutions', () => {
    expect(normalize('sh33ple')).toBe('sheeple');
    expect(normalize('b@d f0lks')).toBe('bad folks');
  });

  it('leaves numbers that are actually numbers alone', () => {
    // Regression: mapping every digit turned "93%" into "9e%" and blinded the
    // unsourced-statistic detector.
    expect(normalize('93% of you')).toBe('93% of you');
    expect(normalize('10x your money')).toBe('10x your money');
    expect(normalize('$500 guaranteed')).toContain('500');
    expect(normalize('covid19 data')).toBe('covid19 data');
  });

  it('folds look-alike letters from other scripts', () => {
    expect(normalize('сheck')).toBe('check'); // leading Cyrillic с
  });

  it('collapses stretched characters', () => {
    expect(normalize('sooooo aaangry')).toBe('soo aangry');
  });

  it('strips urls before matching', () => {
    expect(normalize('read https://example.com/a-disgrace now')).toBe('read now');
  });
});

describe('stripHtml', () => {
  it('unwraps markup and entities', () => {
    expect(stripHtml('<p>Hello &amp; <b>welcome</b></p>')).toBe('Hello & welcome');
  });
});

describe('extractLinks / domainOf', () => {
  it('pulls links and trims trailing punctuation', () => {
    expect(extractLinks('see https://apnews.com/article/x.')).toEqual([
      'https://apnews.com/article/x',
    ]);
  });

  it('normalizes hosts', () => {
    expect(domainOf('https://www.Reuters.com/path')).toBe('reuters.com');
    expect(domainOf('not a url')).toBeUndefined();
  });
});

describe('capsRatio', () => {
  it('ignores short acronyms but catches shouting', () => {
    expect(capsRatio('The FBI released a statement today about the case')).toBe(0);
    expect(capsRatio('THIS IS COMPLETELY UNACCEPTABLE BEHAVIOUR')).toBeGreaterThan(0.8);
  });
});

describe('saturate', () => {
  it('has diminishing returns and stays in range', () => {
    expect(saturate(0, 0.4)).toBe(0);
    expect(saturate(1, 0.4)).toBeCloseTo(0.4, 5);
    expect(saturate(2, 0.4)).toBeGreaterThan(saturate(1, 0.4));
    expect(saturate(50, 0.4)).toBeLessThanOrEqual(1);
    expect(saturate(3, 0.4) - saturate(2, 0.4)).toBeLessThan(saturate(2, 0.4) - saturate(1, 0.4));
  });
});

describe('excerptAround', () => {
  it('returns a readable window with ellipses', () => {
    const text = 'a'.repeat(80) + ' NEEDLE ' + 'b'.repeat(80);
    const out = excerptAround(text, 'needle');
    expect(out).toContain('NEEDLE');
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
  });
});
