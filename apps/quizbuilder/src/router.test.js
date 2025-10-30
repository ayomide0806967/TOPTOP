import { describe, it, expect } from 'vitest';
import { Router } from '../shared/router.js';

describe('Router.pathMatches', () => {
  it('matches exact paths', () => {
    const r = new Router();
    expect(r.pathMatches('/instructor/quizzes', '/instructor/quizzes')).toBe(true);
    expect(r.pathMatches('/instructor/quizzes', '/instructor/quizzes/new')).toBe(false);
  });

  it('matches dynamic params', () => {
    const r = new Router();
    expect(r.pathMatches('/instructor/quizzes/:id', '/instructor/quizzes/abc')).toBe(true);
    expect(r.pathMatches('/instructor/quizzes/:id', '/instructor/quizzes/abc/analytics')).toBe(false);
  });
});

