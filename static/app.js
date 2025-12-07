const videoEl = document.getElementById('camera');
const canvasEl = document.getElementById('overlay');
const ctx = canvasEl.getContext('2d');
const playerChoiceEl = document.getElementById('player-choice');
const computerChoiceEl = document.getElementById('computer-choice');
const roundResultEl = document.getElementById('round-result');
const guideTextEl = document.getElementById('guide-text');
const playerScoreEl = document.getElementById('player-score');
const computerScoreEl = document.getElementById('computer-score');
const drawScoreEl = document.getElementById('draw-score');
const resetBtn = document.getElementById('reset-btn');
const robotHandEl = document.getElementById('robot-hand');
const robotHandLabelEl = document.getElementById('robot-hand-label');

const REQUIRED_STABLE_FRAMES = 8;
const GESTURE_LABELS = {
  rock: '✊ 바위',
  paper: '🖐 보',
  scissors: '✌ 가위',
  unknown: '인식 실패',
};

const CHOICES = ['rock', 'paper', 'scissors'];

const state = {
  lastGesture: null,
  stableCount: 0,
  roundLocked: false,
  scores: {
    player: 0,
    computer: 0,
    draw: 0,
  },
};

function syncCanvasSize() {
  if (!videoEl.videoWidth || !videoEl.videoHeight) {
    return;
  }
  canvasEl.width = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;
}

videoEl.addEventListener('loadeddata', syncCanvasSize);
window.addEventListener('resize', syncCanvasSize);

function setGuide(message) {
  guideTextEl.textContent = message;
}

function updateUI({ playerChoice = '대기', computerChoice = '-', result = '대기 중' } = {}) {
  playerChoiceEl.textContent = typeof playerChoice === 'string' ? playerChoice : GESTURE_LABELS[playerChoice];
  computerChoiceEl.textContent = typeof computerChoice === 'string' ? computerChoice : GESTURE_LABELS[computerChoice] ?? computerChoice;
  roundResultEl.textContent = result;
  playerScoreEl.textContent = state.scores.player;
  computerScoreEl.textContent = state.scores.computer;
  drawScoreEl.textContent = state.scores.draw;
}

function setRobotHandDisplay(gesture = 'idle') {
  if (!robotHandEl) {
    return;
  }
  const normalized = ['rock', 'paper', 'scissors'].includes(gesture) ? gesture : 'idle';
  robotHandEl.dataset.gesture = normalized;
  if (robotHandLabelEl) {
    robotHandLabelEl.textContent =
      normalized === 'idle' ? '대기 중' : `${GESTURE_LABELS[normalized]} 준비 완료`;
  }
}

function resetGestureTracking() {
  state.lastGesture = null;
  state.stableCount = 0;
  updateUI({ playerChoice: '대기', computerChoice: '-', result: '대기 중' });
  setRobotHandDisplay('idle');
}

function randomComputerChoice() {
  const idx = Math.floor(Math.random() * CHOICES.length);
  return CHOICES[idx];
}

function judgeRound(player, computer) {
  if (player === computer) {
    return 'draw';
  }
  if (
    (player === 'rock' && computer === 'scissors') ||
    (player === 'scissors' && computer === 'paper') ||
    (player === 'paper' && computer === 'rock')
  ) {
    return 'player';
  }
  return 'computer';
}

function handleStableGesture(gesture) {
  if (gesture !== state.lastGesture) {
    state.lastGesture = gesture;
    state.stableCount = 1;
    return;
  }

  state.stableCount += 1;
  if (state.stableCount < REQUIRED_STABLE_FRAMES || state.roundLocked) {
    return;
  }

  if (!['rock', 'paper', 'scissors'].includes(gesture)) {
    return;
  }

  state.roundLocked = true;
  const computer = randomComputerChoice();
  const winner = judgeRound(gesture, computer);
  state.scores[winner] = (state.scores[winner] ?? 0) + 1;
  setRobotHandDisplay(computer);

  updateUI({
    playerChoice: GESTURE_LABELS[gesture],
    computerChoice: GESTURE_LABELS[computer],
    result:
      winner === 'draw'
        ? '무승부!'
        : winner === 'player'
        ? '당신의 승리!'
        : '컴퓨터 승리!'
        ,
  });

  const guide =
    winner === 'draw'
      ? '다시 한 번 도전해 보세요.'
      : winner === 'player'
      ? '멋진 승리입니다!'
      : '컴퓨터가 이겼네요. 다시 도전!';
  setGuide(guide);

  setTimeout(() => {
    state.roundLocked = false;
    resetGestureTracking();
  }, 2000);
}

function classifyGesture(landmarks, handedness = 'Right') {
  if (!landmarks || landmarks.length === 0) {
    return 'unknown';
  }

  const tipIds = [8, 12, 16, 20];
  const pipIds = [6, 10, 14, 18];
  const fingersOpen = tipIds.map((tip, index) => {
    return landmarks[tip].y < landmarks[pipIds[index]].y - 0.02;
  });

  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  let thumbOpen;
  if (handedness === 'Right') {
    thumbOpen = thumbTip.x < thumbIp.x - 0.02;
  } else {
    thumbOpen = thumbTip.x > thumbIp.x + 0.02;
  }

  const openCount = fingersOpen.filter(Boolean).length + (thumbOpen ? 1 : 0);

  if (openCount === 0) {
    return 'rock';
  }
  if (openCount === 5) {
    return 'paper';
  }
  const isScissors = fingersOpen[0] && fingersOpen[1] && !fingersOpen[2] && !fingersOpen[3];
  if (isScissors && !thumbOpen) {
    return 'scissors';
  }
  return 'unknown';
}

function onResults(results) {
  if (results.image?.width && results.image?.height) {
    const { width, height } = results.image;
    if (canvasEl.width !== width || canvasEl.height !== height) {
      canvasEl.width = width;
      canvasEl.height = height;
    }
  }

  ctx.save();
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.restore();

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    setGuide('손을 카메라 안으로 넣어 주세요.');
    resetGestureTracking();
    return;
  }

  const [landmarks] = results.multiHandLandmarks;
  const handedness = results.multiHandedness?.[0]?.label ?? 'Right';

  drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
    color: '#34d399',
    lineWidth: 5,
  });
  drawLandmarks(ctx, landmarks, {
    color: '#38bdf8',
    lineWidth: 2,
    radius: 4,
  });

  const gesture = classifyGesture(landmarks, handedness);
  setGuide(`${GESTURE_LABELS[gesture] ?? '인식 중'} 감지`);
  playerChoiceEl.textContent = GESTURE_LABELS[gesture] ?? '인식 중';
  handleStableGesture(gesture);
}

async function initHands() {
  return new Promise((resolve, reject) => {
    try {
      const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });
      hands.onResults(onResults);
      resolve(hands);
    } catch (error) {
      reject(error);
    }
  });
}

async function initCamera(hands) {
  return new Promise((resolve, reject) => {
    const camera = new Camera(videoEl, {
      onFrame: async () => {
        await hands.send({ image: videoEl });
      },
      width: 640,
      height: 480,
    });
    camera
      .start()
      .then(resolve)
      .catch(reject);
  });
}

async function bootstrap() {
  try {
    setGuide('카메라 권한을 요청 중입니다...');
    const hands = await initHands();
    await initCamera(hands);
    setGuide('손을 화면 중앙에 맞춰 주세요.');
  } catch (error) {
    console.error(error);
    setGuide('카메라 초기화에 실패했습니다. 브라우저 권한을 확인하세요.');
    roundResultEl.textContent = '카메라 필요';
  }
}

resetBtn.addEventListener('click', () => {
  state.scores = { player: 0, computer: 0, draw: 0 };
  state.roundLocked = false;
  resetGestureTracking();
  setGuide('스코어가 초기화되었습니다. 다시 시작하세요.');
});

setRobotHandDisplay('idle');
bootstrap();
