import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  test('lists every delivery of an event with its own status', async () => {
    mockEvents([
      {
        id: 'evt_1',
        eventType: 'order.created',
        createdAt: '2026-11-18T10:00:00.000Z',
        deliveries: [
          { id: 'dlv_1', status: 'pending', endpoint: { url: 'https://a.example.com/hook' } },
          { id: 'dlv_2', status: 'delivered', endpoint: { url: 'https://b.example.com/hook' } },
        ],
      },
    ]);
    renderList();

    const row = (await screen.findByText('order.created')).closest('tr');
    const items = within(row).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('https://a.example.com/hook');
    expect(items[0]).toHaveTextContent('pending');
    expect(items[1]).toHaveTextContent('https://b.example.com/hook');
    expect(items[1]).toHaveTextContent('delivered');
  });

  test('shows a dash when an event has no deliveries', async () => {
    mockEvents([
      { id: 'evt_2', eventType: 'user.deleted', createdAt: '2026-11-18T10:00:00.000Z', deliveries: [] },
    ]);
    renderList();

    const row = (await screen.findByText('user.deleted')).closest('tr');
    expect(within(row).queryAllByRole('listitem')).toHaveLength(0);
    expect(row).toHaveTextContent('—');
  });
});
