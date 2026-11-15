import './style.css';
import { PetController } from './pet/fsm.ts';
import {
  createTreatBody,
  stepPhysics,
  stepTreat,
} from './physics/engine.ts';
import { ThrowEstimator } from './physics/throwEstimator.ts';
import type {
  CollisionEvent,
  PhysicsBody,
  TreatBody,
} from './physics/types.ts';
import { ClockColliderManager } from './ui/clockColliders.ts';
import { ClockReactions } from './ui/clockReactions.ts';
import {
  loadPersistedState,
  savePersistedState,
} from './ui/persistence.ts';
import { PetRenderer } from './ui/petRenderer.ts';

const PET_WIDTH = 48;
const PET_HEIGHT = 48;
const TREAT_SIZE = 16;
const DRAG_THRESHOLD_PX = 6;
const STATS_SAVE_INTERVAL_MS = 2000;

const stageEl = document.querySelector<HTMLElement>('.stage')!;
const hoursEl = document.getElementById('hours')!;
const minutesEl = document.getElementById('minutes')!;
const secondsEl = document.getElementById('seconds')!;
const colonEl = document.getElementById('colon')!;
const ampmEl = document.getElementById('ampm')!;
const dateEl = document.getElementById('date')!;

const formatBtn = document.getElementById('toggle-format') as HTMLButtonElement;
const secondsBtn = document.getElementById('toggle-seconds') as HTMLButtonElement;
const themeBtn = document.getElementById('toggle-theme') as HTMLButtonElement;
const togglePetBtn = document.getElementById('toggle-pet') as HTMLButtonElement;
const feedPetBtn = document.getElementById('feed-pet') as HTMLButtonElement;
const toggleSleepBtn = document.getElementById('toggle-sleep') as HTMLButtonElement;

const initial = loadPersistedState();
let use24Hour = initial.use24Hour;
let showSeconds = initial.showSeconds;
let nightMode = initial.nightMode;
let petEnabled = initial.petEnabled;

const motionQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
let reducedMotion = motionQuery?.matches ?? false;
motionQuery?.addEventListener('change', (e) => {
  reducedMotion = e.matches;
  if (reducedMotion) {
    clockReactions.reset();
  }
});

const collidersManager = new ClockColliderManager(stageEl);
const clockReactions = new ClockReactions(stageEl);
const petRenderer = new PetRenderer(stageEl);
const throwEstimator = new ThrowEstimator();
const controller = new PetController({
  initialStats: initial.petStats,
});

const initialBounds = collidersManager.getBounds();
const petBody: PhysicsBody = {
  x: Math.max(0, (initialBounds.width - PET_WIDTH) * 0.5),
  y: Math.max(0, initialBounds.height * 0.12),
  vx: 0,
  vy: 0,
  width: PET_WIDTH,
  height: PET_HEIGHT,
  grounded: false,
  perchedOnId: null,
};

let treat: TreatBody | null = null;
let lastStatsSaveMs = performance.now();

function persist(): void {
  savePersistedState({
    use24Hour,
    showSeconds,
    nightMode,
    petEnabled,
    petStats: controller.getStats(),
  });
}

function syncControlsUI(): void {
  document.body.classList.toggle('night', nightMode);
  formatBtn.textContent = use24Hour ? '12H' : '24H';
  secondsBtn.textContent = showSeconds ? 'Hide Seconds' : 'Show Seconds';
  themeBtn.textContent = nightMode ? 'Standard Mode' : 'Night Mode';
  togglePetBtn.textContent = petEnabled ? 'Hide Pet' : 'Show Pet';
  toggleSleepBtn.disabled = !petEnabled;
  petRenderer.setVisible(petEnabled);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

let clockInitialized = false;
let lastSecond = -1;
let lastMinute = -1;
let lastHour = -1;
let lastAmpm = '';
let lastDateText = '';

function renderClock(): void {
  const now = new Date();
  const rawHours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  let displayHours = rawHours;
  let ampm = '';
  if (!use24Hour) {
    ampm = rawHours >= 12 ? 'PM' : 'AM';
    displayHours = rawHours % 12 || 12;
  }

  hoursEl.textContent = pad(displayHours);
  minutesEl.textContent = pad(minutes);
  secondsEl.textContent = pad(seconds);
  secondsEl.classList.toggle('hidden', !showSeconds);
  ampmEl.textContent = ampm;
  colonEl.classList.toggle('dim', seconds % 2 === 1);

  const dateText = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  dateEl.textContent = dateText;

  if (ampm !== lastAmpm || dateText !== lastDateText) {
    lastAmpm = ampm;
    lastDateText = dateText;
    collidersManager.invalidate();
  }

  if (clockInitialized && petEnabled) {
    if (rawHours !== lastHour) {
      const evt = {
        type: 'hour' as const,
        hours: rawHours,
        minutes,
        seconds,
      };
      controller.onTimeEvent(evt, petBody, { reducedMotion });
      clockReactions.onTimeEvent(evt, reducedMotion);
    } else if (minutes !== lastMinute) {
      const evt = {
        type: 'minute' as const,
        hours: rawHours,
        minutes,
        seconds,
      };
      controller.onTimeEvent(evt, petBody, { reducedMotion });
      clockReactions.onTimeEvent(evt, reducedMotion);
    } else if (seconds !== lastSecond) {
      controller.onTimeEvent(
        {
          type: 'second',
          hours: rawHours,
          minutes,
          seconds,
        },
        petBody,
        { reducedMotion },
      );
    }
  }

  lastHour = rawHours;
  lastMinute = minutes;
  lastSecond = seconds;
  clockInitialized = true;
}

formatBtn.addEventListener('click', () => {
  use24Hour = !use24Hour;
  syncControlsUI();
  renderClock();
  collidersManager.invalidate();
  persist();
});

secondsBtn.addEventListener('click', () => {
  showSeconds = !showSeconds;
  syncControlsUI();
  renderClock();
  collidersManager.invalidate();
  persist();
});

themeBtn.addEventListener('click', () => {
  nightMode = !nightMode;
  syncControlsUI();
  persist();
});

const IDLE_TIMEOUT_MS = 3000;
let idleTimer: number | undefined;

function resetIdleTimer(): void {
  document.body.classList.remove('idle');
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    document.body.classList.add('idle');
  }, IDLE_TIMEOUT_MS);
}

for (const event of ['mousemove', 'mousedown', 'pointerdown', 'touchstart', 'keydown'] as const) {
  window.addEventListener(event, resetIdleTimer, { passive: true });
}


togglePetBtn.addEventListener('click', () => {
  petEnabled = !petEnabled;
  if (!petEnabled) {
    cancelActiveDrag();
    treat = null;
    clockReactions.reset();
  }
  syncControlsUI();
  collidersManager.invalidate();
  persist();
});

function spawnTreatAt(stageX: number, stageY: number): void {
  const bounds = collidersManager.getBounds();
  const maxX = Math.max(0, bounds.width - TREAT_SIZE);
  const maxY = Math.max(0, bounds.height - TREAT_SIZE);
  const clampedX = Math.max(0, Math.min(maxX, stageX));
  const clampedY = Math.max(0, Math.min(maxY, stageY));
  treat = createTreatBody(clampedX, clampedY, 0, 0, TREAT_SIZE);
  controller.dispatch({ type: 'feed' }, petBody);
  petRenderer.render(petBody, controller.getSnapshot(), treat, [], reducedMotion);
  persist();
}

feedPetBtn.addEventListener('click', () => {
  if (!petEnabled) {
    petEnabled = true;
    syncControlsUI();
    collidersManager.invalidate();
    persist();
  }
  const bounds = collidersManager.getBounds();
  spawnTreatAt(
    Math.max(0, bounds.width * 0.5 - TREAT_SIZE * 0.5),
    Math.max(16, bounds.height * 0.15),
  );
});

toggleSleepBtn.addEventListener('click', () => {
  if (!petEnabled) return;
  controller.dispatch({ type: 'toggleSleep' }, petBody);
  toggleSleepBtn.textContent = controller.getSnapshot().state === 'sleeping' ? 'Wake' : 'Sleep';
  persist();
});

stageEl.addEventListener('dblclick', (e) => {
  if (!petEnabled) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest('.controls') || target?.closest('.pet')) return;
  const stageRect = stageEl.getBoundingClientRect();
  spawnTreatAt(
    e.clientX - stageRect.left - TREAT_SIZE * 0.5,
    e.clientY - stageRect.top - TREAT_SIZE * 0.5,
  );
});

// Pointer drag / tap-to-pet on .pet
let activePointerId: number | null = null;
let startClientX = 0;
let startClientY = 0;
let dragOffsetX = 0;
let dragOffsetY = 0;
let dragStarted = false;

petRenderer.petEl.addEventListener('pointerdown', (e) => {
  if (!petEnabled) return;
  if (e.button !== 0 && e.pointerType === 'mouse') return;

  if (activePointerId !== null) {
    cancelActiveDrag();
  }

  activePointerId = e.pointerId;
  startClientX = e.clientX;
  startClientY = e.clientY;
  dragStarted = false;

  const stageRect = stageEl.getBoundingClientRect();
  dragOffsetX = e.clientX - stageRect.left - petBody.x;
  dragOffsetY = e.clientY - stageRect.top - petBody.y;

  try {
    petRenderer.petEl.setPointerCapture(e.pointerId);
  } catch {
    // Ignore if pointer capture is unsupported
  }

  throwEstimator.reset();
  throwEstimator.addSample(petBody.x, petBody.y, performance.now());
});

window.addEventListener('pointermove', (e) => {
  if (e.pointerId !== activePointerId) return;

  const dist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY);
  if (!dragStarted && dist >= DRAG_THRESHOLD_PX) {
    dragStarted = true;
    controller.dispatch({ type: 'startDrag' }, petBody);
  }

  if (dragStarted) {
    const stageRect = stageEl.getBoundingClientRect();
    const bounds = collidersManager.getBounds();
    const maxX = Math.max(0, bounds.width - petBody.width);
    const maxY = Math.max(0, bounds.height - petBody.height);

    const prevX = petBody.x;
    petBody.x = Math.max(0, Math.min(maxX, e.clientX - stageRect.left - dragOffsetX));
    petBody.y = Math.max(0, Math.min(maxY, e.clientY - stageRect.top - dragOffsetY));
    const dx = petBody.x - prevX;
    if (Math.abs(dx) > 0.5) {
      controller.dispatch({ type: 'setFacing', facing: dx > 0 ? 'right' : 'left' }, petBody);
    }
    petBody.vx = 0;
    petBody.vy = 0;
    petBody.grounded = false;
    petBody.perchedOnId = null;

    throwEstimator.addSample(petBody.x, petBody.y, performance.now());
  }
});

function finishPointerInteraction(e: PointerEvent): void {
  if (e.pointerId !== activePointerId) return;
  activePointerId = null;

  try {
    if (petRenderer.petEl.hasPointerCapture(e.pointerId)) {
      petRenderer.petEl.releasePointerCapture(e.pointerId);
    }
  } catch {
    // Ignore
  }

  if (dragStarted) {
    const v = throwEstimator.release(performance.now());
    petBody.vx = v.x;
    petBody.vy = v.y;
    petBody.grounded = false;
    petBody.perchedOnId = null;
    if (Math.abs(v.x) > 10) {
      controller.dispatch({ type: 'setFacing', facing: v.x > 0 ? 'right' : 'left' }, petBody);
    }
    controller.dispatch(
      { type: 'endDrag', releaseSpeed: Math.hypot(v.x, v.y) },
      petBody,
    );
  } else {
    throwEstimator.reset();
    controller.dispatch({ type: 'pet' }, petBody);
  }
  dragStarted = false;
  persist();
}

function cancelActiveDrag(): void {
  if (activePointerId === null && !dragStarted && controller.getSnapshot().state !== 'dragged') {
    return;
  }
  const pointerId = activePointerId;
  activePointerId = null;

  if (pointerId !== null) {
    try {
      if (petRenderer.petEl.hasPointerCapture(pointerId)) {
        petRenderer.petEl.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore
    }
  }

  if (dragStarted || controller.getSnapshot().state === 'dragged') {
    throwEstimator.reset();
    petBody.vx = 0;
    petBody.vy = 0;
    petBody.grounded = false;
    petBody.perchedOnId = null;
    controller.dispatch({ type: 'endDrag', releaseSpeed: 0 }, petBody);
  } else {
    throwEstimator.reset();
  }
  dragStarted = false;
}

window.addEventListener('pointerup', finishPointerInteraction);
window.addEventListener('pointercancel', finishPointerInteraction);
window.addEventListener('blur', cancelActiveDrag);

// Keyboard accessibility on .pet
petRenderer.petEl.addEventListener('keydown', (e) => {
  if (!petEnabled) return;
  switch (e.key) {
    case ' ':
    case 'Enter':
      e.preventDefault();
      controller.dispatch({ type: 'pet' }, petBody);
      persist();
      break;
    case 'ArrowUp':
      e.preventDefault();
      controller.dispatch({ type: 'jump', direction: 0 }, petBody);
      persist();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      controller.dispatch({ type: 'move', direction: -1 }, petBody);
      persist();
      break;
    case 'ArrowRight':
      e.preventDefault();
      controller.dispatch({ type: 'move', direction: 1 }, petBody);
      persist();
      break;
  }
});

let lastFrameTime: number | null = performance.now();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelActiveDrag();
    lastFrameTime = null;
    persist();
  } else {
    lastFrameTime = performance.now();
  }
});

window.addEventListener('beforeunload', () => {
  persist();
});

function frame(now: number): void {
  if (document.hidden) {
    lastFrameTime = null;
    requestAnimationFrame(frame);
    return;
  }

  if (lastFrameTime === null) {
    lastFrameTime = now;
    requestAnimationFrame(frame);
    return;
  }

  const rawDt = Math.max(0, (now - lastFrameTime) / 1000);
  const dt = Math.min(rawDt, 0.05);
  lastFrameTime = now;

  if (petEnabled && dt > 0) {
    const currentBounds = collidersManager.getBounds();
    if (
      stageEl.clientWidth !== currentBounds.width ||
      stageEl.clientHeight !== currentBounds.height
    ) {
      collidersManager.invalidate();
    }
    const bounds = collidersManager.getBounds();
    const colliders = collidersManager.getColliders();
    const isDragged = controller.getSnapshot().state === 'dragged';

    let events: CollisionEvent[] = [];
    if (!isDragged) {
      events = stepPhysics(petBody, dt, bounds, colliders);
    }

    if (treat && treat.active) {
      stepTreat(treat, dt, bounds, colliders);
    }

    const treatCenter =
      treat && treat.active
        ? {
            x: treat.x + treat.width * 0.5,
            y: treat.y + treat.height * 0.5,
          }
        : null;

    const action = controller.step(
      petBody,
      dt,
      colliders,
      events,
      treatCenter,
      {
        nightMode,
        reducedMotion,
        stageWidth: bounds.width,
        stageHeight: bounds.height,
        rawDt,
      },
    );

    if (action.impulse) {
      petBody.vx += action.impulse.x;
      petBody.vy += action.impulse.y;
      if (action.impulse.y < 0) {
        petBody.grounded = false;
        petBody.perchedOnId = null;
      }
    }

    if (action.targetVx !== null) {
      petBody.vx = action.targetVx;
    }

    if (action.consumedTreat && treat) {
      treat.active = false;
      treat = null;
    }

    clockReactions.onCollisions(events, reducedMotion);
    clockReactions.step(dt, reducedMotion);
    petRenderer.render(
      petBody,
      action.snapshot,
      treat,
      action.particles,
      reducedMotion,
    );

    const sleepLabel = action.snapshot.state === 'sleeping' ? 'Wake' : 'Sleep';
    if (toggleSleepBtn.textContent !== sleepLabel) {
      toggleSleepBtn.textContent = sleepLabel;
    }

    if (now - lastStatsSaveMs >= STATS_SAVE_INTERVAL_MS) {
      lastStatsSaveMs = now;
      persist();
    }
  }

  requestAnimationFrame(frame);
}

syncControlsUI();
renderClock();
resetIdleTimer();
collidersManager.invalidate();
petRenderer.render(petBody, controller.getSnapshot(), treat, [], reducedMotion);
setInterval(renderClock, 250);
requestAnimationFrame(frame);
