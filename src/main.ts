import './style.css';

const hoursEl = document.getElementById('hours')!;
const minutesEl = document.getElementById('minutes')!;
const secondsEl = document.getElementById('seconds')!;
const colonEl = document.getElementById('colon')!;
const ampmEl = document.getElementById('ampm')!;
const dateEl = document.getElementById('date')!;

const formatBtn = document.getElementById('toggle-format')!;
const secondsBtn = document.getElementById('toggle-seconds')!;
const themeBtn = document.getElementById('toggle-theme')!;

let use24Hour = false;
let showSeconds = true;
let nightMode = false;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function render(): void {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  let ampm = '';
  if (!use24Hour) {
    ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
  }

  hoursEl.textContent = pad(hours);
  minutesEl.textContent = pad(minutes);
  secondsEl.textContent = pad(seconds);
  secondsEl.classList.toggle('hidden', !showSeconds);
  ampmEl.textContent = ampm;
  colonEl.classList.toggle('dim', seconds % 2 === 1);

  dateEl.textContent = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

formatBtn.addEventListener('click', () => {
  use24Hour = !use24Hour;
  formatBtn.textContent = use24Hour ? '12H' : '24H';
  render();
});

secondsBtn.addEventListener('click', () => {
  showSeconds = !showSeconds;
  secondsBtn.textContent = showSeconds ? 'Hide Seconds' : 'Show Seconds';
  render();
});

themeBtn.addEventListener('click', () => {
  nightMode = !nightMode;
  document.body.classList.toggle('night', nightMode);
  themeBtn.textContent = nightMode ? 'Standard Mode' : 'Night Mode';
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

secondsBtn.textContent = 'Hide Seconds';
render();
resetIdleTimer();
setInterval(render, 250);
