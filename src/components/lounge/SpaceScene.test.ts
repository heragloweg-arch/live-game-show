import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SpaceSceneFallback } from './SpaceScene';

const participant = {
  participantId: 'participant-1',
  displayName: '<img src=x onerror=alert(1)>',
  x: 120,
  y: -10,
  appearance: 'feminine' as const,
  action: 'DANCE' as const,
};

describe('SpaceScene fallback', () => {
  it('renders participant names as escaped text and clamps their location to the scene', () => {
    const markup = renderToStaticMarkup(createElement(SpaceSceneFallback, { participants: [participant] }));

    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(markup).not.toContain('<img src=x');
    expect(markup).toContain('left:88%;top:12%');
    expect(markup).toContain('space-action-dance');
    expect(markup).toContain('مشهد احتياطي');
  });

  it('shows a supplied empty state when no participant is active', () => {
    const markup = renderToStaticMarkup(createElement(SpaceSceneFallback, { participants: [], emptyLabel: 'بانتظار البوابة' }));

    expect(markup).toContain('بانتظار البوابة');
    expect(markup).not.toContain('space-fallback-character ');
  });
});
