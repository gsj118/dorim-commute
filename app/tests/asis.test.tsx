import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AsIsView } from '../src/components/AsIsView';
import { dataset, getTripStops } from '../src/data';

vi.mock('../src/components/MapView', () => ({ MapView: ({ coordinates, label }: { coordinates: { lat: number; lng: number } | null; label: string }) => <div data-testid="asis-map" data-coordinates={JSON.stringify(coordinates)}>{label} 지도</div> }));
afterEach(cleanup);
const renderView = (path: string, weekday: 'FRI' | 'MON' | null = null, onWeekday = vi.fn()) => render(<AsIsView path={path} weekday={weekday} onWeekday={onWeekday}/>);

describe('As-is controlled list comparison', () => {
  it('starts with direction choice and discloses reconstruction and PDF supplementation', () => {
    renderView('#/asis');
    expect(screen.getByRole('heading', { level: 1, name: '통학버스 노선정보' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /등교 노선 보기/ }).getAttribute('href')).toBe('#/asis/routes/toCampus');
    expect(screen.getByRole('link', { name: /하교 노선 보기/ }).getAttribute('href')).toBe('#/asis/routes/fromCampus');
    expect(screen.getByText(/실제 공식 서비스가 아닙니다/)).toBeTruthy();
    expect(screen.getByText(/PDF 광주권의 하교 19편으로 보완/)).toBeTruthy();
  });
  it.each(['toCampus', 'fromCampus'] as const)('offers exactly the shared %s dataset without dropping PDF-only trips', direction => {
    renderView(`#/asis/routes/${direction}`);
    const list = screen.getByRole('list', { name: `${direction === 'toCampus' ? '등교' : '하교'} 수록 운행편` });
    const links = within(list).getAllByRole('link');
    const expected = dataset.trips.filter(trip => trip.direction === direction);
    expect(links.map(link => link.getAttribute('href')).sort()).toEqual(expected.map(trip => `#/asis/trip/${trip.tripId}`).sort());
    expect(links.length).toBe(19);
  });
  it('retains every shared trip-stop relation and separates school departure from unknown alighting times', () => {
    const id = 'tp-s25-from-jinwol-03';
    renderView(`#/asis/trip/${id}`, 'FRI');
    const stopList = screen.getByRole('list');
    expect(within(stopList).getAllByRole('link').length).toBe(getTripStops(id).length);
    expect(screen.getByText(/학교 출발 시각: 15:30/)).toBeTruthy();
    expect(screen.getByText('MNU 스퀘어 앞', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText(/광주 하차시각은 제공되지 않습니다/)).toBeTruthy();
    expect(screen.getByText(/대체 시각이며 추가 편이 아닙니다/)).toBeTruthy();
    expect(within(stopList).getAllByText(/하차 · 시각 미제공/).length).toBe(10);
  });
  it('uses the exact selected directional marker and preserves the shared-location hypothesis', () => {
    const id = 'tp-s25-from-jinwol-01';
    const stop = getTripStops(id).find(item => item.occurrence.locationMapping)!;
    renderView(`#/asis/trip/${id}/${stop.occurrence.tripStopId}`, 'MON');
    expect(JSON.parse(screen.getByTestId('asis-map').getAttribute('data-coordinates')!)).toEqual({ lat: stop.location!.coordinates.value!.latitude, lng: stop.location!.coordinates.value!.longitude });
    expect(screen.getByText(/진월① 자체 지도 확인은 미수행/)).toBeTruthy();
    expect(screen.getByText(/실제 도로변 승하차 위치·현재성은 확인/)).toBeTruthy();
  });
  it('keeps the unlocated campus boarding point null and provides readable recovery', () => {
    const id = 'tp-s25-from-jinwol-03';
    const school = getTripStops(id).find(item => item.stop.campusId)!;
    const { rerender } = renderView(`#/asis/trip/${id}/${school.occurrence.tripStopId}`);
    expect(screen.getByTestId('asis-map').getAttribute('data-coordinates')).toBe('null');
    rerender(<AsIsView path="#/asis/trip/%invalid" weekday={null} onWeekday={vi.fn()}/>);
    expect(screen.getByRole('heading', { name: '수록되지 않은 운행편' })).toBeTruthy();
    expect(screen.getByText(/주소가 잘못되었거나 수록 범위 밖/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '등교' })).toBeTruthy();
  });
  it('passes weekday changes to the common comparison state', () => {
    const onWeekday = vi.fn();
    renderView('#/asis/routes/fromCampus', null, onWeekday);
    fireEvent.change(screen.getByLabelText('As-is 확인할 요일'), { target: { value: 'FRI' } });
    expect(onWeekday).toHaveBeenCalledWith('FRI');
  });
});
