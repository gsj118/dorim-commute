import { Component, type ReactNode } from 'react';

/** A failed optional chunk must leave the core route/search interface recoverable. */
export class OptionalScreen extends Component<{ children: ReactNode; active?: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return this.props.active === false ? null : <section className="notice error" role="alert"><h1 tabIndex={-1}>화면을 불러오지 못했어요.</h1><p>연결 상태를 확인한 뒤 다시 불러오세요. 기본 장소 검색과 노선 목록은 계속 이용할 수 있습니다.</p><button type="button" onClick={() => window.location.reload()}>이 화면 다시 불러오기</button><a href="#/">기본 탐색으로 돌아가기</a></section>;
    return this.props.children;
  }
}
