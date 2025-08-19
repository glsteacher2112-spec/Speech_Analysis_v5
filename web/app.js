(function(){
  // ----------------- Helpers -----------------
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

  // ---------- Minimal diff between you_said and correction ----------
  // Example: you="I goes to school", corr="I go to school" -> ["goes"]
  function extractChangedFragment(you, corr){
    you  = String(you  ?? '');
    corr = String(corr ?? '');
    if(!you)  return [];
    if(!corr) return [you];
    let i = 0, yL = you.length, cL = corr.length;
    while(i < yL && i < cL && you[i] === corr[i]) i++;
    let y = yL - 1, c = cL - 1;
    while(y >= i && c >= i && you[y] === corr[c]) { y--; c--; }
    const frag = you.slice(i, y + 1).trim();
    return frag ? [frag] : [you]; // fallback if identical
  }

  // ---------- Highlighter ----------
  // Whole-word for token-like matches; substring for phrases/non-word fragments.
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

  // ----------------- Gauges -----------------
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

    // CSS starts full; reset to empty then animate to target
    bar.style.transition = 'none';
    bar.style.strokeDasharray = String(C);
    bar.style.strokeDashoffset = String(C);
    requestAnimationFrame(()=>{
      bar.style.transition = `stroke-dashoffset ${duration}ms ease`;
      bar.style.strokeDashoffset = String(target);
    });
  }

  // ----------------- Renderer (Option A1) -----------------
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

    // 2) Transcript highlights
    const tEl = $('#user_transcript');
    if(tEl){
      let safe = sanitizeHTML(transcript || 'Your speaking challenge will appear here:');

      // Minimal fragment from each grammar error (diff you_said vs correction)
      const errFrags = grammarErrs
        .flatMap(e => extractChangedFragment(String(e?.you_said || ''), String(e?.correction || '')))
        .filter(Boolean);

      // Order: grammar errors → fillers → clue words
      safe = highlightFragments(safe, errFrags, 'hl-proficiency');
      safe = highlightFragments(safe, fillers, 'hl-delivery');
      safe = highlightFragments(safe, cluesUsed, 'hl-content');
      tEl.innerHTML = safe;
    }

    // 3) Feedback
    const fb = $('#textFeedback');
    if(fb){
      const missedHTML = cluesMissed.length
        ? `<div class="fb-row"><strong>Missed words:</strong> ${cluesMissed.map(sanitizeHTML).join(', ')}</div>`
        : `<div class="fb-row"><strong>Missed words:</strong> None 🎉</div>`;
      const fillerHTML = `<div class="fb-row"><strong>Filler words:</strong> ${fillerCount}</div>`;
      fb.innerHTML = missedHTML + fillerHTML;
    }

    // 4) Grammar fixes (labels bold)
    const gfBox = $('#grammar_fix');
    if(gfBox){
      if(grammarErrs.length){
        const items = grammarErrs.map(e=>{
          const t = sanitizeHTML(e?.type || 'Language');
          const y = sanitizeHTML(String(e?.you_said || ''));
          const c = sanitizeHTML(String(e?.correction || ''));
          const x = sanitizeHTML(e?.explanation || '');
          return `<li>
            <div><strong>You said</strong> "${y}". <strong>Correction</strong> → "${c}".</div>
            <div><em>${t} error. ${x}</em></div>
          </li>`;
        }).join('');
        gfBox.innerHTML = `<div class="fb-row"><strong>Errors:</strong></div><ul class="fix-list">${items}</ul>`;
      } else {
        gfBox.innerHTML = `<div class="fb-row"><strong>Errors:</strong> None 🎉</div>`;
      }
    }
  }

  // ----------------- Legacy shims (unchanged) -----------------
  function renderTranscript(args){
    const box = $('#user_transcript');
    if(box) box.textContent = args && (args.text || args.transcript || 'Your speaking challenge will appear here:') || 'Your speaking challenge will appear here:';
  }
  function renderFeedback(payload){
    try{ renderSpeechAnalysis(payload); }catch(e){ console.error('[challengeFeedback shim] render error:', e); }
  }

  // ----------------- Registration (unchanged) -----------------
  function attachListener(target){
    if(!target) return;
    if(target.getAttribute('data-modai-tools-installed') === '1') return;
    target.setAttribute('data-modai-tools-installed', '1');

    target.addEventListener('elevenlabs-convai:call', function(evt){
      const cfg = (evt && evt.detail && evt.detail.config) || (evt.detail.config = {});
      cfg.clientTools = cfg.clientTools || {};
      cfg.clientTools.speechAnalysis = function(payload){
        try { renderSpeechAnalysis(payload); }
        catch(e){ console.error('[speechAnalysis] render error:', e); }
      };
      // legacy
      cfg.clientTools.yourChallenge = function(args){ try { renderTranscript(args); } catch(e){} };
      cfg.clientTools.challengeFeedback = function(payload){ try { renderFeedback(payload); } catch(e){} };
    });
  }

  function attachDocumentFallback(){
    if(document._modaiDocListenerInstalled) return;
    document._modaiDocListenerInstalled = true;
    document.addEventListener('elevenlabs-convai:call', function(evt){
      const cfg = (evt && evt.detail && evt.detail.config) || (evt.detail.config = {});
      cfg.clientTools = cfg.clientTools || {};
      if(!cfg.clientTools.speechAnalysis){
        cfg.clientTools.speechAnalysis = function(payload){ try { renderSpeechAnalysis(payload); } catch(e){} };
      }
      if(!cfg.clientTools.yourChallenge){
        cfg.clientTools.yourChallenge = function(args){ try { renderTranscript(args); } catch(e){} };
      }
      if(!cfg.clientTools.challengeFeedback){
        cfg.clientTools.challengeFeedback = function(payload){ try { renderFeedback(payload); } catch(e){} };
      }
    }, true);
  }

  function boot(){
    attachDocumentFallback();
    const widget = document.querySelector('elevenlabs-convai');
    if(widget) attachListener(widget);
    const mo = new MutationObserver((muts)=>{
      muts.forEach(m=>{
        (m.addedNodes||[]).forEach(node=>{
          if(node && node.nodeType === 1){
            if(node.matches && node.matches('elevenlabs-convai')) attachListener(node);
            const found = node.querySelector && node.querySelector('elevenlabs-convai');
            if(found) attachListener(found);
          }
        });
      });
    });
    mo.observe(document.documentElement, {childList:true, subtree:true});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Manual test helper (kept)
  window.MODai_renderSpeechAnalysis = renderSpeechAnalysis;
})();
