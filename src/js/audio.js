/* ================= 提示音引擎（WebAudio 合成，无需外部音频文件） ================= */
'use strict';

window.Sound = (function () {
  let ctx = null;
  let cfg = { enabled: true, volume: 0.7, style: 'chime' };

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function master() {
    return Math.max(0, Math.min(1, cfg.volume));
  }

  /** 单个音符 */
  function tone(opts) {
    if (!cfg.enabled) return;
    const c = ac();
    const {
      freq = 440, delay = 0, dur = 0.3, type = 'sine',
      vol = 0.5, attack = 0.008, endFreq = null, detune = 0
    } = opts;

    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
    if (detune) osc.detune.setValueAtTime(detune, t0);

    const peak = Math.max(0.0001, vol * master());
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** 带泛音的钟声 */
  function bell(freq, delay, dur, vol) {
    tone({ freq, delay, dur, vol: vol * 0.6, type: 'sine' });
    tone({ freq: freq * 2, delay, dur: dur * 0.7, vol: vol * 0.22, type: 'sine' });
    tone({ freq: freq * 2.76, delay, dur: dur * 0.45, vol: vol * 0.12, type: 'sine' });
    tone({ freq: freq * 5.4, delay, dur: dur * 0.25, vol: vol * 0.06, type: 'sine' });
  }

  /** 轻微白噪（用于“沙沙”反馈） */
  function noise(delay, dur, vol) {
    if (!cfg.enabled) return;
    const c = ac();
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1200;
    g.gain.value = vol * master();
    src.buffer = buf;
    src.connect(f).connect(g).connect(c.destination);
    src.start(c.currentTime + delay);
  }

  const API = {
    config(next) { cfg = Object.assign(cfg, next || {}); },
    get settings() { return Object.assign({}, cfg); },

    /** 勾选步骤：轻快一声 */
    step() {
      tone({ freq: 880, dur: 0.09, vol: 0.28, type: 'triangle' });
      tone({ freq: 1320, delay: 0.045, dur: 0.1, vol: 0.2, type: 'sine' });
    },

    /** 完成任务：上行三音（默认提示音） */
    complete() {
      const style = cfg.style;
      if (style === 'bell') {
        bell(880, 0, 1.1, 0.5);
        bell(1174.7, 0.13, 1.2, 0.4);
        return;
      }
      if (style === 'ding') {
        tone({ freq: 1046.5, dur: 0.5, vol: 0.42, type: 'sine' });
        tone({ freq: 1568, delay: 0.08, dur: 0.45, vol: 0.24, type: 'sine' });
        return;
      }
      if (style === 'pop') {
        tone({ freq: 420, endFreq: 900, dur: 0.13, vol: 0.4, type: 'triangle' });
        noise(0.02, 0.09, 0.06);
        return;
      }
      // chime 默认：C5 - E5 - G5
      tone({ freq: 523.25, dur: 0.26, vol: 0.34, type: 'sine' });
      tone({ freq: 659.25, delay: 0.09, dur: 0.28, vol: 0.32, type: 'sine' });
      tone({ freq: 783.99, delay: 0.18, dur: 0.5, vol: 0.34, type: 'sine' });
      tone({ freq: 1046.5, delay: 0.18, dur: 0.5, vol: 0.12, type: 'sine' });
    },

    /** 取消完成 */
    uncomplete() {
      tone({ freq: 520, endFreq: 300, dur: 0.16, vol: 0.2, type: 'sine' });
    },

    /** 整表清空：欢庆音效 */
    celebrate() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((f, i) => tone({ freq: f, delay: i * 0.085, dur: 0.42, vol: 0.3, type: 'sine' }));
      bell(1046.5, 0.44, 1.5, 0.4);
    },

    /** 番茄钟结束：三声钟 */
    pomodoroEnd() {
      bell(783.99, 0, 1.3, 0.55);
      bell(783.99, 0.55, 1.3, 0.5);
      bell(1046.5, 1.1, 1.8, 0.55);
    },

    /** 休息结束：温和两声 */
    breakEnd() {
      tone({ freq: 659.25, dur: 0.35, vol: 0.32, type: 'sine' });
      tone({ freq: 880, delay: 0.22, dur: 0.6, vol: 0.32, type: 'sine' });
    },

    /** 定时提醒：叮咚 */
    reminder() {
      bell(987.77, 0, 0.9, 0.5);
      bell(739.99, 0.32, 1.4, 0.5);
    },

    /** 最后 3 秒滴答 */
    tick() {
      tone({ freq: 1200, dur: 0.05, vol: 0.16, type: 'square' });
    },

    error() {
      tone({ freq: 220, dur: 0.18, vol: 0.25, type: 'sawtooth' });
    },

    /** 试听 */
    preview(kind) {
      const map = {
        complete: () => API.complete(),
        pomodoro: () => API.pomodoroEnd(),
        reminder: () => API.reminder(),
        celebrate: () => API.celebrate(),
        step: () => API.step()
      };
      (map[kind] || map.complete)();
    }
  };

  return API;
})();
