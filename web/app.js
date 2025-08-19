(function(){
  // ---------- Helpers ----------
  function $(sel){ return document.querySelector(sel); }
  function sanitizeHTML(str){
    return String(str || "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }
  function toList(csv){
    if (Array.isArray(csv)) return csv.filter(Boolean).map(String);
    return String(csv || "")
      .split(",")
      .map(s => s.replace(/^[\["'\s]+|[\]"'\s]+$/g, "").trim())
      .filter(Boolean);
  }
  function ensureArray(v){ return Array.isArray(v) ? v : toList(v); }
  function escapeRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

  // Whole-word highlighter (if token-like); otherwise substring
  function highlightFragments(text, frags, className){
    const items = (frags || []).map(s => String(s || '')).filter(Boolean).sort((a,b)=>b.length-a.length);
    if(!items.length) return text;
    let html = text;
    for(const f of items){
      const isToken = /^\w+$/.test(f);
      const pattern = isToken ? `\\b${escapeRegExp(f)}\\b` : escapeRegExp(f);
      const rx = new RegExp(pattern, 'gi');
      html = html.replace(rx, m => `<span class="hl ${className}">${m}</span>`);
    }
    return html;
  }

  // Gauges
  function gaugeCircumference(gauge){
    const rEl = gauge && gauge.querySelector('circle.bar');
    const r   = Number(rEl && rEl.getAttribute('r')) || 50;
    return 2 * Math.PI * r; // ~314 when r=50
  }
  function setGauge(gauge, value, max=10, duration=900){
    if(!gauge) return;
    const bar   = gauge.querySelector('circle.bar');
    const label = gauge.querySelector('.label .score');
    const C     = gaugeCircumference(gauge);
    const val   = Math.max(0, Math.min(max, Number(value) || 0));
    const target= C * (1 - val / max);
    if(label) label.textContent = `${val}/10`;
    bar.style.transition = 'none';
    bar.style.strokeDasharray = String(C);
    bar.style.strokeDashoffset = String(C);
    requestAnimationFrame(()=>{
      bar.style.transition = `stroke-dashoffset ${duration}ms ease`;
      bar.style.strokeDashoffset = String(target);
    });
  }

  // ---------- Renderer (Option A1) ----------
  function renderSpeechAnalysis(payload){
    if(!payload || typeof payload !== 'object'){
      console.warn('[speechAnalysis] Invalid payload', payload);
      return;
    }

    const transcript  = String(payload.transcript || '');
    const content     = payload.content || {};
    const delivery    = payload.delivery || {};
    const proficiency = payload.proficiency || {};

    const cluesUsed   = ensureArray(content.clue_words_used);
    const cluesMissed = ensureArray(content.clue_words_missed);
    const usedCount   = Number(content.used_count || 0);
    const scoreC      = Number(content.score || 0);

    const fillers     = ensureArray(delivery.fillers);
    const fillerCount = Number(delivery.filler_count || fillers.length || 0);
    const scoreD      = Number(delivery.score || 0);

    const grammarErrs = Array.isArray(proficiency.grammar_errors) ? proficiency.grammar_errors : [];
    const scoreP      = Number(proficiency.score || 0);

    const totalScore  = Number(payload.total_score ?? (scoreC + scoreD + scoreP));

    // 1) Gauges
    setGauge($('#gaugeC'), scoreC);
    setGauge($('#gaugeD'), scoreD);
    setGauge($('#gaugeP'), scoreP);
    const totalLine = $('#total_score_line');
    if(totalLine) totalLine.textContent = `Total Score: ${totalScore}/30`;

    // 2) Transcript (use exact span given in you_said)
    const tEl = $('#user_transcript');
    if(tEl){
      let safe = sanitizeHTML(transcript || 'Your speaking challenge will appear here:');
      const errFrags = grammarErrs.map(e => String(e?.you_said || '')).filter(Boolean);
      safe = highlightFragments(safe, errFrags, 'hl-proficiency');
      safe = highlightFragments(safe, fillers, 'hl-delivery');
      safe = highlightFragments(safe, cluesUsed, 'hl-content');
      tEl.innerHTML = safe;
    }

    // 3) Feedback (Missing words, Filler count)
    const fb = $('#textFeedback');
    if(fb){
      const missedHTML = cluesMissed.length
        ? `<div class="fb-row"><strong>Missing words:</strong> ${cluesMissed.map(sanitizeHTML).join(', ')}</div>`
        : `<div class="fb-row"><strong>Missing words:</strong> None 🎉</div>`;
      const fillerHTML = `<div class="fb-row"><strong>Filler words:</strong> ${fillerCount}</div>`;
      fb.innerHTML = missedHTML + fillerHTML;
    }

    // Errors (bullets)
    const gfBox = $('#grammar_fix');
    if(gfBox){
      if(grammarErrs.length){
        const items = grammarErrs.map(e=>{
          const t = sanitizeHTML(e?.type || 'Language');
          const y = sanitizeHTML(String(e?.you_said || ''));
          const c = sanitizeHTML(String(e?.correction || ''));
          const x = sanitizeHTML(e?.explanation || '');
          return `<li><div>You said "${y}". Correction → "${c}".</div><div><em>${t} error. ${x}</em></div></li>`;
        }).join('');
        gfBox.innerHTML = `<div class="fb-row"><strong>Errors:</strong></div><ul class="fix-list">${items}</ul>`;
      } else {
        gfBox.innerHTML = `<div class="fb-row"><strong>Errors:</strong> None 🎉</div>`;
      }
    }
  }

  // Expose for the test harness
  window.MODai_renderSpeechAnalysis = renderSpeechAnalysis;
})();
