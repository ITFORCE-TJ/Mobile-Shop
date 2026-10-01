import { describe, expect, it } from 'vitest';
import { describeConnection } from './connectionStatus';

describe('describeConnection', () => {
  it('is green only with network and an open realtime connection', () => {
    expect(describeConnection(true, 'online')).toMatchObject({ tone: 'success', syncLabel: 'Синхронизация онлайн' });
  });

  it('never claims to be online without network or while the socket is down', () => {
    expect(describeConnection(false, 'online')).toMatchObject({ tone: 'danger', label: 'Нет сети' });
    expect(describeConnection(true, 'offline')).toMatchObject({ tone: 'warning', label: 'Нет связи с сервером' });
    expect(describeConnection(true, 'connecting').tone).toBe('warning');
    expect(describeConnection(true, 'idle').tone).toBe('warning');
  });
});
