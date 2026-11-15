import type { ParticleTrigger, PetSnapshot, PetState } from '../pet/types.ts';
import type { PhysicsBody, TreatBody } from '../physics/types.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_PARTICLES = 24;

function createSvgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

function stateLabel(state: PetState, snapshot: PetSnapshot): string {
  const { energy, happiness, fullness } = snapshot.stats;
  return `Digital pet (${state}), energy ${Math.round(energy)}%, happiness ${Math.round(happiness)}%, fullness ${Math.round(fullness)}%. Press Enter or Space to pet, Arrow keys to move or jump.`;
}

export class PetRenderer {
  readonly layerEl: HTMLDivElement;
  readonly petEl: HTMLDivElement;
  private readonly visualEl: HTMLDivElement;
  private readonly treatEl: HTMLDivElement;

  private readonly eyesNormalGroup: SVGGElement;
  private readonly eyesDrowsyGroup: SVGGElement;
  private readonly eyesHappyGroup: SVGGElement;
  private readonly eyesSleepGroup: SVGGElement;
  private readonly eyesWideGroup: SVGGElement;

  private readonly mouthSmile: SVGPathElement;
  private readonly mouthHappy: SVGPathElement;
  private readonly mouthOpenO: SVGCircleElement;
  private readonly mouthSleep: SVGPathElement;

  private readonly cheeksGroup: SVGGElement;

  private lastAriaLabel = '';
  private lastState: PetState | null = null;
  private lastDrowsy: boolean | null = null;
  private visible = true;

  constructor(stageEl: HTMLElement) {
    this.layerEl = document.createElement('div');
    this.layerEl.className = 'pet-layer';
    this.layerEl.setAttribute('aria-hidden', 'false');

    this.petEl = document.createElement('div');
    this.petEl.className = 'pet';
    this.petEl.tabIndex = 0;
    this.petEl.setAttribute('role', 'button');
    this.petEl.setAttribute('aria-label', 'Digital pet');

    this.visualEl = document.createElement('div');
    this.visualEl.className = 'pet-visual';

    const svg = createSvgEl('svg', {
      class: 'pet-svg',
      viewBox: '0 0 48 48',
      width: '48',
      height: '48',
      'aria-hidden': 'true',
    });

    // Ears & antenna
    const earsGroup = createSvgEl('g', { class: 'pet-ears' });
    earsGroup.append(
      createSvgEl('path', {
        d: 'M12 18 L9 7 L20 13 Z',
        fill: 'var(--card-bg)',
        stroke: 'var(--text-primary)',
        'stroke-width': '2',
        'stroke-linejoin': 'round',
      }),
      createSvgEl('path', {
        d: 'M36 18 L39 7 L28 13 Z',
        fill: 'var(--card-bg)',
        stroke: 'var(--text-primary)',
        'stroke-width': '2',
        'stroke-linejoin': 'round',
      }),
      createSvgEl('line', {
        class: 'pet-antenna-stem',
        x1: '24',
        y1: '12',
        x2: '24',
        y2: '5',
        stroke: 'var(--text-primary)',
        'stroke-width': '2',
        'stroke-linecap': 'round',
      }),
      createSvgEl('circle', {
        class: 'pet-antenna-tip',
        cx: '24',
        cy: '4',
        r: '2.5',
        fill: 'var(--accent)',
      }),
    );

    // Body
    const bodyRect = createSvgEl('rect', {
      class: 'pet-body',
      x: '8',
      y: '12',
      width: '32',
      height: '29',
      rx: '14',
      fill: 'var(--card-bg)',
      stroke: 'var(--text-primary)',
      'stroke-width': '2.2',
    });

    // Subtle belly highlight
    const belly = createSvgEl('ellipse', {
      cx: '24',
      cy: '33',
      rx: '9',
      ry: '5',
      fill: 'var(--pill-bg)',
    });

    // Cheeks
    this.cheeksGroup = createSvgEl('g', { class: 'pet-cheeks' });
    this.cheeksGroup.append(
      createSvgEl('circle', { cx: '14', cy: '27', r: '2.6', fill: 'var(--accent)' }),
      createSvgEl('circle', { cx: '34', cy: '27', r: '2.6', fill: 'var(--accent)' }),
    );

    // Eyes: normal
    this.eyesNormalGroup = createSvgEl('g', { class: 'pet-eyes-normal' });
    this.eyesNormalGroup.append(
      createSvgEl('circle', { cx: '17.5', cy: '23', r: '2.4', fill: 'var(--text-primary)' }),
      createSvgEl('circle', { cx: '30.5', cy: '23', r: '2.4', fill: 'var(--text-primary)' }),
      createSvgEl('circle', { cx: '18.3', cy: '22.2', r: '0.8', fill: 'var(--bg)' }),
      createSvgEl('circle', { cx: '31.3', cy: '22.2', r: '0.8', fill: 'var(--bg)' }),
    );

    // Eyes: drowsy (half-lidded)
    this.eyesDrowsyGroup = createSvgEl('g', { class: 'pet-eyes-drowsy', style: 'display:none' });
    this.eyesDrowsyGroup.append(
      createSvgEl('path', {
        d: 'M14.5 23 L20.5 23 A2.5 2.5 0 0 1 14.5 23 Z',
        fill: 'var(--text-primary)',
      }),
      createSvgEl('path', {
        d: 'M27.5 23 L33.5 23 A2.5 2.5 0 0 1 27.5 23 Z',
        fill: 'var(--text-primary)',
      }),
    );

    // Eyes: happy / eating (^ ^)
    this.eyesHappyGroup = createSvgEl('g', { class: 'pet-eyes-happy', style: 'display:none' });
    this.eyesHappyGroup.append(
      createSvgEl('path', {
        d: 'M14.5 24 Q17.5 19.5 20.5 24',
        fill: 'none',
        stroke: 'var(--text-primary)',
        'stroke-width': '2.2',
        'stroke-linecap': 'round',
      }),
      createSvgEl('path', {
        d: 'M27.5 24 Q30.5 19.5 33.5 24',
        fill: 'none',
        stroke: 'var(--text-primary)',
        'stroke-width': '2.2',
        'stroke-linecap': 'round',
      }),
    );

    // Eyes: sleeping (closed peaceful)
    this.eyesSleepGroup = createSvgEl('g', { class: 'pet-eyes-sleep', style: 'display:none' });
    this.eyesSleepGroup.append(
      createSvgEl('path', {
        d: 'M14.5 23.5 Q17.5 26 20.5 23.5',
        fill: 'none',
        stroke: 'var(--text-primary)',
        'stroke-width': '2',
        'stroke-linecap': 'round',
      }),
      createSvgEl('path', {
        d: 'M27.5 23.5 Q30.5 26 33.5 23.5',
        fill: 'none',
        stroke: 'var(--text-primary)',
        'stroke-width': '2',
        'stroke-linecap': 'round',
      }),
    );

    // Eyes: startled / dragged (wide)
    this.eyesWideGroup = createSvgEl('g', { class: 'pet-eyes-wide', style: 'display:none' });
    this.eyesWideGroup.append(
      createSvgEl('circle', {
        cx: '17.5',
        cy: '22.5',
        r: '3.4',
        fill: 'var(--bg)',
        stroke: 'var(--text-primary)',
        'stroke-width': '1.8',
      }),
      createSvgEl('circle', { cx: '17.5', cy: '22.5', r: '1.3', fill: 'var(--text-primary)' }),
      createSvgEl('circle', {
        cx: '30.5',
        cy: '22.5',
        r: '3.4',
        fill: 'var(--bg)',
        stroke: 'var(--text-primary)',
        'stroke-width': '1.8',
      }),
      createSvgEl('circle', { cx: '30.5', cy: '22.5', r: '1.3', fill: 'var(--text-primary)' }),
    );

    // Mouths
    this.mouthSmile = createSvgEl('path', {
      d: 'M20.5 28.5 Q22.2 31 24 28.8 Q25.8 31 27.5 28.5',
      fill: 'none',
      stroke: 'var(--text-primary)',
      'stroke-width': '1.8',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });

    this.mouthHappy = createSvgEl('path', {
      d: 'M19.5 28 Q24 33.5 28.5 28 Z',
      fill: 'var(--accent)',
      stroke: 'var(--text-primary)',
      'stroke-width': '1.6',
      'stroke-linejoin': 'round',
      style: 'display:none',
    });

    this.mouthOpenO = createSvgEl('circle', {
      cx: '24',
      cy: '29.5',
      r: '2.3',
      fill: 'var(--accent)',
      stroke: 'var(--text-primary)',
      'stroke-width': '1.6',
      style: 'display:none',
    });

    this.mouthSleep = createSvgEl('path', {
      d: 'M22 29.5 Q24 30.5 26 29.5',
      fill: 'none',
      stroke: 'var(--text-secondary)',
      'stroke-width': '1.6',
      'stroke-linecap': 'round',
      style: 'display:none',
    });

    // Feet / paws
    const feetGroup = createSvgEl('g', { class: 'pet-feet' });
    feetGroup.append(
      createSvgEl('ellipse', {
        class: 'pet-foot pet-foot-left',
        cx: '16',
        cy: '42.5',
        rx: '4',
        ry: '2.5',
        fill: 'var(--card-bg)',
        stroke: 'var(--text-primary)',
        'stroke-width': '2',
      }),
      createSvgEl('ellipse', {
        class: 'pet-foot pet-foot-right',
        cx: '32',
        cy: '42.5',
        rx: '4',
        ry: '2.5',
        fill: 'var(--card-bg)',
        stroke: 'var(--text-primary)',
        'stroke-width': '2',
      }),
    );

    svg.append(
      earsGroup,
      bodyRect,
      belly,
      this.cheeksGroup,
      this.eyesNormalGroup,
      this.eyesDrowsyGroup,
      this.eyesHappyGroup,
      this.eyesSleepGroup,
      this.eyesWideGroup,
      this.mouthSmile,
      this.mouthHappy,
      this.mouthOpenO,
      this.mouthSleep,
      feetGroup,
    );

    this.visualEl.appendChild(svg);
    this.petEl.appendChild(this.visualEl);

    // Treat element
    this.treatEl = document.createElement('div');
    this.treatEl.className = 'pet-treat treat';
    this.treatEl.dataset.testid = 'treat';
    this.treatEl.style.display = 'none';
    const treatSvg = createSvgEl('svg', {
      viewBox: '0 0 24 24',
      width: '100%',
      height: '100%',
      'aria-hidden': 'true',
    });
    treatSvg.append(
      createSvgEl('path', {
        d: 'M12 2 L14.9 8.2 L21.8 9.1 L16.7 13.9 L18 20.8 L12 17.5 L6 20.8 L7.3 13.9 L2.2 9.1 L9.1 8.2 Z',
        fill: 'var(--accent)',
        stroke: 'var(--text-primary)',
        'stroke-width': '1.6',
        'stroke-linejoin': 'round',
      }),
    );
    this.treatEl.appendChild(treatSvg);

    this.layerEl.append(this.petEl);
    stageEl.appendChild(this.layerEl);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.layerEl.style.display = visible ? '' : 'none';
    this.layerEl.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  render(
    body: PhysicsBody,
    snapshot: PetSnapshot,
    treat: TreatBody | null,
    particles: readonly ParticleTrigger[],
    reducedMotion: boolean,
  ): void {
    if (!this.visible) return;

    this.petEl.style.width = `${body.width}px`;
    this.petEl.style.height = `${body.height}px`;
    this.petEl.style.transform = `translate3d(${body.x.toFixed(2)}px, ${body.y.toFixed(2)}px, 0)`;

    const facingScale = snapshot.facing === 'left' ? -1 : 1;
    const sx = reducedMotion ? 1 : snapshot.squashX;
    const sy = reducedMotion ? 1 : snapshot.squashY;
    this.visualEl.style.transform = `scaleX(${(facingScale * sx).toFixed(3)}) scaleY(${sy.toFixed(3)})`;

    if (this.lastState !== snapshot.state || this.lastDrowsy !== snapshot.isDrowsy) {
      this.petEl.dataset.state = snapshot.state;
      this.petEl.dataset.drowsy = String(snapshot.isDrowsy);
      this.updateExpression(snapshot.state, snapshot.isDrowsy);
      this.lastState = snapshot.state;
      this.lastDrowsy = snapshot.isDrowsy;
    }

    this.petEl.dataset.facing = snapshot.facing;
    this.petEl.dataset.pulse = String(snapshot.secondPulse);

    const nextAria = stateLabel(snapshot.state, snapshot);
    if (nextAria !== this.lastAriaLabel) {
      this.petEl.setAttribute('aria-label', nextAria);
      this.lastAriaLabel = nextAria;
    }

    if (treat && treat.active) {
      if (!this.treatEl.isConnected) {
        this.layerEl.appendChild(this.treatEl);
      }
      this.treatEl.style.display = '';
      this.treatEl.style.width = `${treat.width}px`;
      this.treatEl.style.height = `${treat.height}px`;
      this.treatEl.style.transform = `translate3d(${treat.x.toFixed(2)}px, ${treat.y.toFixed(2)}px, 0)`;
    } else if (this.treatEl.isConnected) {
      this.treatEl.remove();
    }

    for (const trigger of particles) {
      this.spawnParticles(trigger, reducedMotion);
    }
  }

  private updateExpression(state: PetState, isDrowsy: boolean): void {
    this.eyesNormalGroup.style.display = 'none';
    this.eyesDrowsyGroup.style.display = 'none';
    this.eyesHappyGroup.style.display = 'none';
    this.eyesSleepGroup.style.display = 'none';
    this.eyesWideGroup.style.display = 'none';

    this.mouthSmile.style.display = 'none';
    this.mouthHappy.style.display = 'none';
    this.mouthOpenO.style.display = 'none';
    this.mouthSleep.style.display = 'none';

    this.cheeksGroup.style.opacity = state === 'happy' || state === 'eating' ? '0.85' : '0.45';

    switch (state) {
      case 'sleeping':
        this.eyesSleepGroup.style.display = '';
        this.mouthSleep.style.display = '';
        break;
      case 'happy':
      case 'eating':
        this.eyesHappyGroup.style.display = '';
        this.mouthHappy.style.display = '';
        break;
      case 'startled':
      case 'dragged':
        this.eyesWideGroup.style.display = '';
        this.mouthOpenO.style.display = '';
        break;
      default:
        if (isDrowsy) {
          this.eyesDrowsyGroup.style.display = '';
        } else {
          this.eyesNormalGroup.style.display = '';
        }
        this.mouthSmile.style.display = '';
        break;
    }
  }

  private spawnParticles(trigger: ParticleTrigger, reducedMotion: boolean): void {
    const count = reducedMotion ? Math.min(1, trigger.count) : trigger.count;
    for (let i = 0; i < count; i++) {
      // Cap total particle nodes
      const existing = this.layerEl.querySelectorAll('.pet-particle');
      if (existing.length >= MAX_PARTICLES) {
        existing[0]?.remove();
      }

      const el = document.createElement('span');
      el.className = `pet-particle particle particle--${trigger.kind} ${trigger.kind}`;
      el.dataset.kind = trigger.kind;
      el.dataset.particle = trigger.kind;
      el.setAttribute('aria-hidden', 'true');

      const spread = count > 1 ? (i - (count - 1) / 2) * 14 : 0;
      const jitterX = (Math.random() - 0.5) * 8;
      const x = trigger.x + spread + jitterX;
      const y = trigger.y - i * 4;

      el.style.left = `${x.toFixed(1)}px`;
      el.style.top = `${y.toFixed(1)}px`;

      switch (trigger.kind) {
        case 'heart':
          el.textContent = '♥';
          break;
        case 'zzz':
          el.textContent = 'z';
          break;
        case 'sparkle':
          el.textContent = '✦';
          break;
        case 'crumb':
          el.textContent = '•';
          break;
      }

      const cleanup = (): void => {
        el.remove();
      };
      el.addEventListener('animationend', cleanup, { once: true });
      window.setTimeout(cleanup, reducedMotion ? 600 : 1200);

      this.layerEl.appendChild(el);
    }
  }
}
