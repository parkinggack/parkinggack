/**
 * 화면 문구 (기획서 11장 · 디자인 메모 ps1~ps3).
 * - 토스처럼 한 화면 한 문장. 말투 ~할게요 / ~해주세요 / ~했어요. 느낌표·이모지 없음
 * - 운전자를 평가하지 않는다 — "실패/못함/서툴러요/위험 운전" 금지, 기록은 좋아진 것만 말함 (copy.test.ts가 검사)
 */
export const COPY = {
  appName: '주차각',

  // M-10 시작
  startLead: '주차 어려운 곳,\n미리 알려드릴게요',
  startButton: '시작하기',
  startDemo: '시연 데이터로 둘러보기',

  // M-11
  spotTitle: '어디에 댔는지\n폰에 남겨둘게요',
  spotSaved: '방금 저장했어요',
  next: '다음',

  // M-12
  shareTitle: '주차 기록을\n익명으로 보내주실래요?',
  shareCaption: '익명 기록 142개로 만든 점수',
  sharePrivacy: '이름과 차량 번호는 모으지 않아요',
  shareYes: '보낼게요',
  shareNo: '나만 볼게요',

  // M-13
  connectTitle: '차 화면의 QR을\n찍어주세요',
  connectHint: '네모를 누르면 카메라가 켜져요',
  connectWhere: '차 화면 › 설정 › 폰 연결',
  connectAim: 'QR을 네모 안에 맞춰주세요',
  connectCode: '코드로 연결할게요',
  connectLater: '나중에 연결할게요',
  cameraDenied: '카메라를 쓸 수 없어서 코드로 연결할게요',
  cameraUnavailable: '이 기기에서는 카메라를 열 수 없어요. 코드로 연결해주세요',
  wrongQr: '주차각 차 화면의 QR이 아니에요',

  // 코드 입력
  codeTitle: '차 화면의 숫자 6자리를\n입력해주세요',
  codeDesc: '차 화면 › 설정 › 폰 연결에 있어요',
  codeButton: '연결할게요',
  codeLabel: '연결 코드 6자리',

  // 연결 중 / 실패 (/pair/:code)
  pairingTitle: '내 차와 연결하고 있어요',
  pairFailTitle: '아직 연결되지 않았어요',
  pairRetry: '다시 해볼게요',
  // 이미 연결된 폰이 다른 차 QR을 열었을 때
  repairTitle: '이 차와 새로\n연결할까요?',
  repairDesc: '지금 연결된 차와는 연결이 끊어져요',
  repairYes: '새로 연결할게요',

  // M-14
  connectedTitle: '내 차와 연결됐어요',
  connectedDesc: '주차가 끝나면 알려드릴까요?',
  notifyYes: '알림 받을게요',
  notifyLater: '나중에',

  // M-20 홈
  nowParked: '지금 주차 중',
  favorites: '자주 가는 곳',
  nearby: '가까운 주차장',
  homeNoParkingTitle: '주차하면 여기에\n바로 보여드릴게요',
  homeUnpairedTitle: '내 차와 연결하면\n주차 위치가 여기에 떠요',
  homeUnpairedAction: '차와 연결할게요',
  lastLink: '최근에 연 주차 위치',

  // M-01
  back: '뒤로',
  wayButton: '돌아가는 길 보기',
  foundCar: '차 찾았어요',
  connectFromLink: '앱에서 내 차와 연결할게요',
  noCurrentTitle: '지금은 주차 중이 아니에요',
  noCurrentDesc: '차가 주차를 마치면 여기에 바로 떠요',
  goHome: '홈으로 갈게요',
  foundToast: '차를 찾았어요. 다음 주차도 기억해둘게요',

  // M-02 필수 문구
  disclaimer: '차가 지나온 길로 계산한 힌트예요. 실제와 조금 다를 수 있어요',
  noHints: '층과 구역 표지판을 따라가 보세요',
  figureLabel: '출발 지점에서 내 차까지 대략적인 길',

  // 링크 오류 (/p/…#, /s/…)
  emptyTitle: '주차 위치를 열려면\n링크가 필요해요',
  emptyBody: "차 화면의 '폰으로 보내기'에서 QR을 찍으면 층과 구역이 크게 보여요",
  invalidTitle: '링크 일부가\n빠진 것 같아요',
  invalidBody: "메신저로 옮기면서 링크 끝이 잘렸을 수 있어요. 차 화면에서 QR을 다시 찍어주세요",
  goneTitle: '시간이 지나\n링크가 닫혔어요',
  goneBody: '주차 위치 링크는 48시간 동안 열려요. 차 화면에서 다시 보내주세요',
  loadingSpot: '주차 위치를 불러오고 있어요',

  // M-30 주차장
  lotsTitle: '주차장',
  searchPlaceholder: '어디로 가세요?',
  searchLabel: '장소 검색',
  sortEasy: '쉬운 순',
  sortNear: '가까운 순',
  sortLabel: '정렬',
  searchNotFound: '이 이름은 아직 몰라요. 판교역처럼 가까운 장소를 넣어주세요',
  lotsEmpty: '이 근처에는 아직 기록된 주차장이 없어요',
  sparse: '아직 기록이 적어요',

  // M-31
  easierButton: '더 쉬운 곳 보기',
  statReverse: '평균 후진',
  statRamp: '램프',
  sparseBody: '아직 기록이 적어요. 첫 기록을 남겨 주세요',

  // 더 쉬운 곳
  easierNone: '근처에서 여기가\n가장 편한 곳이에요',

  // M-32 기록
  recordsTitle: '기록',
  thisMonth: '이번 달 평균 후진',
  recordsEmpty: '주차하면 기록이\n여기에 쌓여요',
  recordsUnpaired: '내 차와 연결하면\n주차 기록이 여기에 쌓여요',
  more: '더 볼게요',

  // M-33
  forward: '앞으로',
  reverse: '후진',
  replay: '다시 보기',
  redrawn: '동선을 그림으로 다시 그렸어요',
  approximate: '대략적인 동선이에요',
  noPath: '이번 주차는 동선 그림이 없어요',

  // 주차왕 (v1.2, M-50 ~ M-53)
  kingTitle: '주차왕',
  kingThisWeek: '이번 주',
  kingOrder: '이번 주 점수 순',
  kingResets: '월요일에 다시 시작해요',
  kingMe: '나',
  kingDemo: '순위는 시연용 예시예요',
  kingWaiting: '이번 주 첫 주차를\n기다리고 있어요',
  kingUnpaired: '내 차와 연결하면\n주차왕에\n참여할 수 있어요',
  kingUnavailable: '주차왕은 곧 열려요',
  kingLeagueTitle: '리그',
  kingLeagueDesc: '같은 경력, 같은 동네 사람들끼리 겨뤄요',
  kingLeagueScore: '점수는 후진·핸들 70, 가 본 주차장 15, 지난달보다 나아진 만큼 15로 매겨요',
  kingSeeResult: '지난주 결과 볼게요',
  kingClose: '닫기',
  // M-52
  kingJoinTitle: '주차왕에\n참여할까요?',
  kingJoinDesc: '같은 경력, 같은 동네 사람들끼리 겨뤄요',
  kingPreviewCaption: '순위판에 보이는 것',
  kingPreviewPrivacy: '장소 · 시간 · 차량 번호는 안 보여요',
  kingPreviewLabel: '순위판에는 닉네임과 점수만 보이는 예시',
  kingNickname: '닉네임',
  kingRedraw: '다시 뽑기',
  kingMyLeague: '내 리그',
  kingJoinYes: '참여할게요',
  kingJoinLater: '다음에 할게요',
  kingJoined: '주차왕에 참여했어요',
  // M-51
  kingScoreTitle: '이번 주 점수',
  kingPlaces: '이번 주에 댄 곳',
  kingNoPlaces: '이번 주에 댄 곳이 아직 없어요',
  kingBackToBoard: '순위로 돌아가기',
  kingNotJoined: '주차왕에 참여하면\n점수를 나눠 볼 수 있어요',
  kingGoJoin: '주차왕으로 갈게요',
  // M-53
  kingShare: '이미지로 공유하기',
  kingSaved: '이미지를 저장했어요',
  kingNoResult: '지난주 결과가\n아직 없어요',
  kingResultPreview: '공유 이미지 미리보기',

  // M-40 설정
  settingsTitle: '설정',
  myCar: '내 차',
  carConnected: '연결됨',
  carNotConnected: '연결하기',
  carDemo: '시연 중',
  toggleShare: '익명 기록 보내기',
  toggleNotify: '주차 끝나면 알림',
  toggleDark: '어두운 화면',
  experience: '운전 경력',
  notifyPolling: '앱을 열어 두면 알려드려요',
  unpairAsk: '연결을 끊으면 이 폰에서 주차 위치를 볼 수 없어요',
  unpairYes: '연결 끊을게요',
  unpairNo: '그대로 둘게요',
  demoAsk: '시연을 끝내고 처음 화면으로 갈게요',
  demoEnd: '시연 끝낼게요',
  unpaired: '연결을 끊었어요',
  kingLeave: '주차왕 그만두기',
  kingLeaveAsk: '그만두면 순위판에서 빠지고, 주차 기록은 그대로 남아요',
  kingLeaveYes: '그만둘게요',
  kingLeft: '주차왕을 그만뒀어요',

  // 운전 경력
  experienceTitle: '운전한 지\n얼마나 됐어요?',
  experienceDesc: '주차장 점수를 고르게 맞추는 데만 써요',

  // 알림
  parkedNotice: '에 주차했어요',
  offline: '인터넷에 연결되면 다시 불러올게요',
  retry: '다시 불러올게요',
  loading: '불러오고 있어요',

  notFoundTitle: '없는 화면이에요',
} as const

/** 운전자를 평가하는 말 (화면·힌트에 나오면 안 됨) */
export const FORBIDDEN = ['실패', '못함', '못 ', '서툴', '위험 운전', '위험운전']

/** "B2 · D-07에 주차했어요" */
export function parkedNoticeText(spot: string): string {
  return `${spot}${COPY.parkedNotice}`
}
