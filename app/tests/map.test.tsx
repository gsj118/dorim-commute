import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapView } from '../src/components/MapView';
import { loadKakao, type KakaoSdk } from '../src/providers/kakao';
vi.mock('../src/providers/kakao', () => ({ isKakaoConfigured: () => true, loadKakao: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); window.location.hash = ''; });
describe('map presentation and recovery with synthetic SDK', () => {
  it('fits the searched place and the separate reference marker on a trip detail map', async () => {
    const extend = vi.fn(), setBounds = vi.fn(), listen = vi.fn();
    const sdk = { maps: {
      LatLng: class { constructor(public lat: number, public lng: number) {} },
      LatLngBounds: class { extend = extend; }, Map: class { relayout() {} setBounds = setBounds; },
      Size: class {}, MarkerImage: class {}, Marker: class { setMap() {} },
      event: { addListener: listen },
    } } as unknown as KakaoSdk;
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.mocked(loadKakao).mockResolvedValue(sdk);
    render(<MapView coordinates={{ lat: 35, lng: 126 }} label="검색한 단지" homeward
      stops={[{ id: 'reference', lat: 35.002, lng: 126.003, number: 2, label: '비교 기준점', isDistanceReference: true }]}/>);
    await waitFor(() => expect(setBounds).toHaveBeenCalledOnce());
    expect(extend.mock.calls.map(([position]) => [position.lat, position.lng])).toEqual([[35, 126], [35.002, 126.003]]);
    expect(listen).not.toHaveBeenCalled();
    expect(screen.getByText('파란 핀 · 목적지').parentElement?.textContent).toContain('검색한 단지');
    expect(screen.getByText('2번 · 거리 기준점').parentElement?.textContent).toContain('비교 기준점');
  });
  it('selects a stop in place for comparison and highlights the selected marker without navigating', async () => {
    const images: string[] = [], callbacks: (() => void)[] = [], stacking: (number | undefined)[] = [];
    const sdk = { maps: {
      LatLng: class {}, LatLngBounds: class { extend() {} },
      Map: class { relayout() {} setBounds() {} }, Size: class {},
      MarkerImage: class { constructor(url: string) { images.push(decodeURIComponent(url)); } },
      Marker: class { setMap() {} constructor(options: { zIndex?: number }) { stacking.push(options.zIndex); } },
      event: { addListener: (_target: object, _event: string, callback: () => void) => callbacks.push(callback), removeListener() {} },
    } } as unknown as KakaoSdk;
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.mocked(loadKakao).mockResolvedValue(sdk);
    const onSelect = vi.fn();
    const props = { coordinates: { lat: 35, lng: 126 }, label: '가상 지도 선택 시험', stops: [{ id: 'select-only', lat: 35.001, lng: 126.001, label: '가상 정류장', href: '#/trip/synthetic' }, { id: 'overlapping', lat: 35.001, lng: 126.001, label: '겹친 가상 정류장', href: '#/trip/synthetic-2' }], onSelect };
    const { rerender } = render(<MapView {...props}/>);
    await waitFor(() => expect(callbacks).toHaveLength(2));
    expect(stacking).toEqual([undefined, 1000, 999]);
    callbacks[0]();
    expect(onSelect).toHaveBeenCalledWith('select-only');
    expect(window.location.hash).toBe('');
    rerender(<MapView {...props} selectedId="select-only"/>);
    await waitFor(() => expect(images).toHaveLength(4));
    expect(images[2]).not.toEqual(images[0]);
    expect(images[3]).toEqual(images[1]);
    expect(stacking).toEqual([undefined, 1000, 999, undefined, 10000, 999]);
  });
  it('retains text alternatives on failure, retries, and distinguishes place and clickable stop markers', async () => {
    const markers: { title: string; image?: object; zIndex?: number }[] = [];
    const setBounds = vi.fn(), setMap = vi.fn(), remove = vi.fn();
    const callbacks: (() => void)[] = [];
    const sdk = { maps: {
      LatLng: class { constructor(public latitude: number, public longitude: number) {} },
      LatLngBounds: class { extend = vi.fn(); },
      Map: class { relayout = vi.fn(); setBounds = setBounds; },
      Size: class {}, MarkerImage: class {},
      Marker: class { setMap = setMap; constructor(options: { title: string; image?: object; zIndex?: number }) { markers.push(options); } },
      event: { addListener: (_target: object, _event: string, callback: () => void) => callbacks.push(callback), removeListener: remove },
    } } as unknown as KakaoSdk;
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.mocked(loadKakao).mockRejectedValueOnce(new Error('synthetic map failure')).mockResolvedValueOnce(sdk);
    const { unmount } = render(<MapView coordinates={{ lat: 35, lng: 126 }} label="가상 시험 장소" stops={[{ id: 'synthetic-stop', lat: 35.001, lng: 126.001, label: '가상 정류장', href: '#/trip/test-trip/test-stop' }]}/>);
    await waitFor(() => expect(screen.getByRole('button', { name: '지도 다시 연결' })).toBeTruthy());
    expect(screen.getByText(/위치 텍스트와 노선 목록은 계속 이용/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '지도 다시 연결' }));
    await waitFor(() => expect(markers).toHaveLength(2));
    expect(markers[0].title).toContain('선택 장소'); expect(markers[0].image).toBeUndefined();
    expect(markers[1].title).toContain('참고 정류장 1'); expect(markers[1].image).toBeTruthy();
    expect(setBounds).toHaveBeenCalledOnce();
    callbacks[0](); expect(window.location.hash).toBe('#/trip/test-trip/test-stop');
    unmount(); expect(setMap).toHaveBeenCalledTimes(2); expect(remove).toHaveBeenCalledOnce();
  });
});
