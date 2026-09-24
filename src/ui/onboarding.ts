/**
 * onboarding.ts — first-run gesture guide overlay (dismissable, shown once).
 */

const KEY = "hawa.onboarded.v1";

export class Onboarding {
  private readonly root: HTMLElement;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "onboard hidden";
    this.root.innerHTML = `
      <div class="onboard-card">
        <h2 class="onboard-title">How to play</h2>
        <div class="onboard-guides">
          <div class="onboard-guide"><span class="onboard-emoji">🤏</span><b>Pinch</b><small>right hand — play a note</small></div>
          <div class="onboard-guide"><span class="onboard-emoji">🖐️</span><b>Show fingers</b><small>left hand — 1–5 picks a chord</small></div>
          <div class="onboard-guide"><span class="onboard-emoji">✊</span><b>Fist</b><small>stop the chord / drone</small></div>
        </div>
        <p class="onboard-hint">Move up/down for pitch, left/right for brightness.<br/>M = mode · P = settings · R = record</p>
        <button class="onboard-btn">Got it</button>
      </div>`;
    this.root.querySelector(".onboard-btn")!.addEventListener("click", () => this.hide());
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.hide();
    });
    document.getElementById("app")!.append(this.root);
  }

  /** Show only if the user hasn't dismissed it before. */
  maybeShow(): void {
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === "1";
    } catch {
      /* ignore */
    }
    if (!seen) this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  }
}
