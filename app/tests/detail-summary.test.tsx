import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../src/App';

vi.mock('../src/providers/kakao', () => ({ isKakaoConfigured: () => false, placeProvider: { search: vi.fn() } }));
afterEach(() => { cleanup(); window.location.hash = ''; });

it('keeps the selected boarding time and stop name together, including deselection and campus selection', () => {
  window.location.hash = '#/trip/tp-s25-to-songjeong-06/occ-tp-s25-to-songjeong-06-04';
  const { container } = render(<App/>);
  const summary = () => container.querySelector('.detail-facts > div')!.textContent;
  expect(summary()).toContain('이 정류장에서 타는 시각');
  expect(summary()).toContain('07:15');
  expect(summary()).toContain('수완W여성병원');
  expect(summary()).not.toContain('07:10');
  fireEvent.click(screen.getByRole('button', { name: /^5\s*어등산약국/ }));
  expect(summary()).toContain('07:17');
  expect(summary()).toContain('어등산약국');
  fireEvent.click(screen.getByRole('button', { name: /^5\s*어등산약국/ }));
  expect(summary()).toContain('첫 승차 지점 시각');
  expect(summary()).toContain('첨단응암공원승강장');
  expect(summary()).toContain('07:10');
  fireEvent.click(screen.getByRole('button', { name: /^7\s*도림캠퍼스/ }));
  expect(summary()).toContain('첫 승차 지점 시각');
  expect(summary()).toContain('07:10');
});

it('keeps campus departure time for a homeward alighting selection and applies Friday replacement', () => {
  window.location.hash = '#/trip/tp-s25-from-jinwol-03';
  const { container } = render(<App/>);
  const summary = () => container.querySelector('.detail-facts > div')!.textContent;
  fireEvent.click(screen.getByRole('button', { name: /동신고.*하차 지점/ }));
  expect(summary()).toContain('학교 출발 시각');
  expect(summary()).toContain('17:30');
  fireEvent.change(screen.getByLabelText('확인할 요일'), { target: { value: 'FRI' } });
  expect(summary()).toContain('15:30');
  expect(summary()).toContain('금요일 · 17:30에서 변경');
});

it('announces the As-is direction instead of the preserved To-be direction', async () => {
  window.location.hash = '#/asis/trip/tp-s25-from-jinwol-03';
  const { container } = render(<App/>);
  await act(async () => { await vi.dynamicImportSettled(); });
  await screen.findByRole('heading', { name: '진월③', level: 1 });
  expect(container.querySelector('.sr-only[aria-live]')?.textContent).toContain('하교 방향');
});

it('updates the reference point and its source when choosing a different homeward stop', () => {
  window.location.hash = '#/trip/tp-s25-from-songjeong-04/occ-tp-s25-from-songjeong-04-05';
  const { container } = render(<App/>);
  const location = () => container.querySelector('.location-panel')!;
  expect(location().querySelector('h2')?.textContent).toBe('추선회관');
  expect(location().textContent).toMatch(/등교 송정④ 지도에 표시된 ‘추선회관’/);
  fireEvent.click(screen.getByRole('button', { name: /광진빌딩.*양동초입구/ }));
  expect(location().querySelector('h2')?.textContent).toBe('광진빌딩(양동초입구)');
  expect(location().textContent).toContain('‘광주양동초등학교’ 시설 위치');
  expect(location().textContent).toContain('정확한 하차 위치는 확인되지 않았어요.');
  expect(location().textContent).not.toContain('추선회관');
  expect(location().querySelector('a[href*="data.go.kr"]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /MNU 스퀘어 앞/ }));
  expect(location().textContent).toBe('학교 승차 위치MNU 스퀘어 앞');
  expect(location().querySelector('.map-canvas')).toBeNull();
  expect(location().textContent).not.toContain('광주양동초등학교');
});
