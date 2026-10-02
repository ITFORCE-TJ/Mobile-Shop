import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  isSafeToUpdate,
  getUpdateSafetyAssessment,
  registerBusyOperation,
  hasBusyOperations,
} from './pwaUpdateSafety';

describe('PWA update safety guard', () => {
  let activeElement: any = null;
  let querySelectorResult: any = null;
  let formsResult: any[] = [];

  beforeEach(() => {
    activeElement = null;
    querySelectorResult = null;
    formsResult = [];

    vi.stubGlobal('document', {
      get activeElement() {
        return activeElement;
      },
      querySelector: (selector: string) => querySelectorResult,
      querySelectorAll: (selector: string) => {
        if (selector.startsWith('form')) {
          return formsResult;
        }
        return [];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports safe in idle state with no forms or busy operations', () => {
    const assessment = getUpdateSafetyAssessment();
    expect(assessment.safe).toBe(true);
    expect(isSafeToUpdate()).toBe(true);
  });

  it('prevents update when a busy operation is explicitly registered', () => {
    const unregister = registerBusyOperation('checkout_sale_in_progress');
    expect(hasBusyOperations()).toBe(true);

    const assessment = getUpdateSafetyAssessment();
    expect(assessment.safe).toBe(false);
    expect(assessment.reason).toContain('checkout_sale_in_progress');
    expect(isSafeToUpdate()).toBe(false);

    unregister();
    expect(hasBusyOperations()).toBe(false);
    expect(isSafeToUpdate()).toBe(true);
  });

  it('two screens with the same unfinished work: finishing one keeps the update blocked', () => {
    const cart = registerBusyOperation('Незавершённая продажа');
    const other = registerBusyOperation('Незавершённая продажа');
    cart();
    expect(getUpdateSafetyAssessment().safe).toBe(false);
    other();
    expect(getUpdateSafetyAssessment().safe).toBe(true);
  });

  it('names the unfinished work without internal ids', () => {
    const done = registerBusyOperation('Незавершённая продажа');
    expect(getUpdateSafetyAssessment().reason).toBe('Выполняется операция: Незавершённая продажа');
    done();
  });

  it('prevents update when an input is actively focused with content', () => {
    activeElement = {
      tagName: 'INPUT',
      value: 'iPhone 15 Pro',
      isContentEditable: false,
    };

    const assessment = getUpdateSafetyAssessment();
    expect(assessment.safe).toBe(false);
    expect(assessment.reason).toContain('вводит данные');
    expect(isSafeToUpdate()).toBe(false);

    activeElement = null;
    expect(isSafeToUpdate()).toBe(true);
  });

  it('prevents update when a modal or dialog is open in the DOM', () => {
    querySelectorResult = { role: 'dialog' };

    const assessment = getUpdateSafetyAssessment();
    expect(assessment.safe).toBe(false);
    expect(assessment.reason).toContain('Открыто модальное окно');
    expect(isSafeToUpdate()).toBe(false);

    querySelectorResult = null;
    expect(isSafeToUpdate()).toBe(true);
  });

  it('prevents update when an unsaved dirty form input exists', () => {
    formsResult = [
      {
        querySelectorAll: () => [
          {
            tagName: 'INPUT',
            defaultValue: 'initial',
            value: 'modified_unsaved_content',
          },
        ],
      },
    ];

    const assessment = getUpdateSafetyAssessment();
    expect(assessment.safe).toBe(false);
    expect(assessment.reason).toContain('несохранённый');
    expect(isSafeToUpdate()).toBe(false);

    formsResult = [];
    expect(isSafeToUpdate()).toBe(true);
  });
});
