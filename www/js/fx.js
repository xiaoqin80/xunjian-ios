/* 寻见 · 解锁音效与特效（WebAudio 合成，不依赖音频文件）
 * 用法：XJfx.chime('unlock' | 'chapter' | 'level');  XJfx.burst(el[, kind])
 */
window.XJfx = (function () {
  let ctx = null, master = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }

  /* 单音：freq 频率，at 起始延迟（秒），dur 时长，vol 音量 */
  function tone(freq, at, dur, vol, type) {
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  /* 解锁音：两个音，短促、清亮（C6 → E6） */
  function chime(kind) {
    if (kind === 'level') {
      // 层级：五声上行 + 低音垫
      [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => tone(f, i * 0.11, 0.9, 0.16, 'sine'));
      tone(130.81, 0, 1.4, 0.10, 'triangle');
      tone(196.00, 0.05, 1.2, 0.06, 'sine');
      return;
    }
    if (kind === 'chapter') {
      // 章卡闭环：三音上行（E5 → A5 → D6）
      [659.25, 880.00, 1174.66].forEach((f, i) => tone(f, i * 0.095, 0.7, 0.15, 'sine'));
      tone(164.81, 0, 0.9, 0.07, 'triangle');
      return;
    }
    // 普通解锁：双音轻响
    tone(1046.50, 0, 0.42, 0.14, 'sine');
    tone(1318.51, 0.075, 0.52, 0.12, 'sine');
  }

  /* 光晕：在元素上画扩散环（rAF 驱动，避免 CSS 关键帧被节流冻结） */
  function burst(el, kind) {
    if (!el) return;
    const host = el;
    const cs = getComputedStyle(host);
    if (cs.position === 'static') host.style.position = 'relative';
    if (!host.style.overflow) host.style.overflow = 'visible';

    const color = kind === 'level' ? 'rgba(226,192,137,' : 'rgba(181,146,79,';
    const rings = kind === 'chapter' ? 3 : 2;
    for (let i = 0; i < rings; i++) {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;inset:0;border-radius:inherit;pointer-events:none;'
        + 'border:2px solid ' + color + '0.95);box-shadow:0 0 12px ' + color + '0.55);'
        + 'transform:scale(.72);opacity:0;will-change:transform,opacity;z-index:9';
      host.appendChild(d);
      const t0 = performance.now() + i * 130;
      const dur = 620 + i * 90;
      (function loop() {
        const p = (performance.now() - t0) / dur;
        if (p < 0) { requestAnimationFrame(loop); return; }
        if (p >= 1) { d.remove(); return; }
        d.style.transform = 'scale(' + (0.72 + p * 0.95).toFixed(3) + ')';
        d.style.opacity = String(Math.max(0, 1 - Math.pow(p, 0.85)) * 0.95);
        requestAnimationFrame(loop);
      })();
    }
    /* 卡片本体轻微一亮 */
    const old = host.style.filter;
    host.style.transition = 'filter .35s ease';
    host.style.filter = (old ? old + ' ' : '') + 'brightness(1.06) saturate(1.05)';
    setTimeout(() => { host.style.filter = old; }, 380);
  }


  /* 上浮文字：解锁 / +2 机会 */
  function floatText(el, text, color) {
    if (!el) return;
    const cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = 'position:absolute;left:50%;top:38%;transform:translate(-50%,0);pointer-events:none;'
      + 'font:600 13px/1 "Microsoft YaHei",sans-serif;letter-spacing:3px;color:' + (color || '#B5924F')
      + ';text-shadow:0 0 10px rgba(181,146,79,.55);opacity:0;z-index:20;white-space:nowrap';
    el.appendChild(d);
    const t0 = performance.now(), dur = 900;
    (function loop() {
      const p = (performance.now() - t0) / dur;
      if (p >= 1) { d.remove(); return; }
      d.style.opacity = String(p < 0.18 ? p / 0.18 : Math.max(0, 1 - (p - 0.18) / 0.82));
      d.style.transform = 'translate(-50%,' + (-16 - p * 26).toFixed(1) + 'px)';
      requestAnimationFrame(loop);
    })();
  }

  return { chime, burst, ensure, floatText };
})();
