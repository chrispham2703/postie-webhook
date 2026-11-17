import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import api from './api';
import EventList from './EventList';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

function mockEvents(events) {
  api.get.mockResolvedValue({ data: { data: events, meta: { nextCursor: null, hasMore: false } } });
}

function renderList() {
  return render(<EventList onLogout={vi.fn()} onSelectEvent={vi.fn()} onOpenSetup={vi.fn()} />);
}

describe('EventList', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('counts deliveries per status, delivered first, so a delivered event never looks pending', async () => {
    mockEvents([
      {
        id: 'evt_1',
        eventType: 'order.created',
        createdAt: '2026-11-18T10:00:00.000Z',
        deliveries: [
          { id: 'dlv_1', status: 'failed_permanent', endpoint: { url: 'https://a.example.com/hook' } },
          { id: 'dlv_2', status: 'delivered', endpoint: { url: 'https://b.example.com/hook' } },
          { id: 'dlv_3', status: 'failed_permanent', endpoint: { url: 'https://c.example.com/hook' } },
        ],
      },
    ]);
    renderList();

    const row = (await screen.findByText('order.created')).closest('tr');
    expect(row).toHaveTextContent(/1 delivered.*2 failed.*3 endpoints/);
    expect(row).not.toHaveTextContent('https://a.example.com/hook');
  });

  test('shows a dash when an event has no deliveries', async () => {
    mockEvents([
      { id: 'evt_2', eventType: 'user.deleted', createdAt: '2026-11-18T10:00:00.000Z', deliveries: [] },
    ]);
    renderList();

    const row = (await screen.findByText('user.deleted')).closest('tr');
    expect(row).toHaveTextContent('—');
    expect(row).not.toHaveTextContent('endpoint');
  });
});
