# UI Contract — v1.0

Renderer reads these keys from the payload:

- transcript (String)
- content: { clue_words_used[], clue_words_missed[], used_count, score }
- delivery: { fillers[], filler_count, score }
- proficiency: { grammar_errors[], score }
- total_score (optional)

Rendering order in the container:
1) Gauges: Content / Delivery / Proficiency (each 0–10) + a total line (0–30)
2) Transcript: with highlights
   - Content highlights: words in `clue_words_used`
   - Delivery highlights: fillers
   - Proficiency highlights: **exact span** from `grammar_errors[].you_said`
3) Feedback:
   - **Missing words:** list from `clue_words_missed`
   - **Filler words:** number only (filler_count)
   - **Errors:** bullet list
     - Each bullet:
       - `You said "…" . Correction → "…".`
       - Italic line: `<type> error. <explanation>`
