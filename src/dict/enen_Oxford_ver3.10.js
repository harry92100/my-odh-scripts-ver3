/* global api */
class encn_Oxford {
    constructor(options) {
        this.options = options;
        this.word = '';
    }

    async displayName() {
        return 'Oxford EN-EN Dictionary ver3.10';
    }

    setOptions(options) {
        this.options = options;
    }

    async findTerm(word) {
        this.word = word;
        let deflection = await api.deinflect(word) || [];
        let promises = [word, ...deflection].map(x => this.findOxford(x));
        let results = await Promise.all(promises);
        return [].concat(...results).filter(x => x);
    }

    async findOxford(word) {
        if (!word) return [];

        let cleanWord = word.trim().toLowerCase().replace(/\s+/g, '-');
        let dicturl = `https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(cleanWord)}`;

        try {
            let html = await api.fetch(dicturl);
            if (!html) return [];

            let parser = new DOMParser();
            let doc = parser.parseFromString(html, 'text/html');

            let entry = doc.querySelector('.webtop-g') || doc.querySelector('.top-g');
            if (!entry) return [];

            // 1. Từ vựng chính
            let expression = doc.querySelector('.headword')?.textContent || word;

            // 2. Phiên âm UK / US
            let phUk = doc.querySelector('.phons_br .phon')?.textContent || '';
            let phUs = doc.querySelector('.phons_n_am .phon')?.textContent || '';
            let reading = '';
            if (phUk || phUs) {
                reading = `UK ${phUk}  US ${phUs}`.trim();
            }

            // 3. File âm thanh Audio MP3
            let audios = [];
            let ukAudioEl = doc.querySelector('.phons_br .audio_play_button');
            let usAudioEl = doc.querySelector('.phons_n_am .audio_play_button');
            
            if (ukAudioEl && ukAudioEl.getAttribute('data-src-mp3')) {
                audios.push(ukAudioEl.getAttribute('data-src-mp3'));
            }
            if (usAudioEl && usAudioEl.getAttribute('data-src-mp3')) {
                audios.push(usAudioEl.getAttribute('data-src-mp3'));
            }

            // 4. Loại từ chính (POS)
            let mainPos = doc.querySelector('.pos')?.textContent || '';

            // Quét thuộc tính grammar / countability
            let topGrammarEl = doc.querySelector('.webtop-g .grammar') || 
                               doc.querySelector('.top-g .grammar') || 
                               doc.querySelector('.pos + .grammar');
            let topGrammarText = topGrammarEl ? topGrammarEl.textContent.trim() : '';

            // Chuẩn hóa nhãn grammar [C, U]
            let formatGrammar = (str) => {
                if (!str) return '';
                let clean = str.replace(/\[/g, '').replace(/\]/g, '').trim();
                
                if (/countable,\s*uncountable/i.test(clean) || /uncountable,\s*countable/i.test(clean)) {
                    return '[C, U]';
                }
                
                let formatted = clean
                    .replace(/\bcountable\b/gi, 'C')
                    .replace(/\buncountable\b/gi, 'U')
                    .replace(/\bsingular\b/gi, 'sing.')
                    .replace(/\bplural\b/gi, 'pl.');
                    
                return `[${formatted}]`;
            };

            // In đậm từ cần tra trong câu ví dụ
            let highlightWord = (text) => {
                let reg = new RegExp(`\\b${word}\\b`, 'gi');
                return text.replace(reg, `<b>$&</b>`);
            };

            // 5. Bóc tách từng Nét nghĩa (Sense)
            let senses = doc.querySelectorAll('.sense');
            let entries = [];

            senses.forEach((sense, index) => {
                let defText = sense.querySelector('.def')?.textContent;
                if (!defText) return;

                let senseGrammarEl = sense.querySelector('.grammar') || 
                                     sense.querySelector('.sensetop .grammar') ||
                                     sense.querySelector('.grammar-g');
                let grammarText = senseGrammarEl ? senseGrammarEl.textContent.trim() : topGrammarText;
                let formattedGrammar = formatGrammar(grammarText);

                let posInfo = mainPos;
                if (formattedGrammar) {
                    posInfo += ` ${formattedGrammar}`;
                }
                let posHtml = posInfo ? `<span class="pos">${posInfo.trim()}</span>` : '';

                // Bóc tách câu ví dụ cho trường ExtraInfo
                let allExamples = sense.querySelectorAll('.examples .x');
                let allExListHtml = '';

                allExamples.forEach((ex) => {
                    let exText = highlightWord(ex.textContent.trim());
                    allExListHtml += `<li class='sent'><span class='eng_sent'>${exText}</span></li>`;
                });

                // Definition (Gửi Anki clean 100%)
                let defBlock = `<div class="odh-def-box">${posHtml}<span class='tran'><span class='eng_tran'>${defText.trim()}</span></span></div>`;

                // ExtraInfo (Gửi Anki clean 100%)
                let extrainfo = allExListHtml 
                    ? `<div class="odh-extra"><ul class="sents">${allExListHtml}</ul></div>` 
                    : '';

                entries.push({
                    css: encn_Oxford.renderCSS(),
                    // Dùng Zero-Width Space \u200B cho nét nghĩa phụ để tránh ODH chèn lại tên từ
                    expression: index === 0 ? expression : '\u200B',
                    reading: index === 0 ? reading : '',
                    definitions: [defBlock],
                    audios: index === 0 ? audios : [],
                    extrainfo
                });
            });

            return entries;

        } catch (err) {
            return [];
        }
    }

    static renderCSS() {
        return `
            <style>
                /* Nhắm chính xác khung chứa từng Nét nghĩa để áp dụng Flexbox xếp cột */
                div:has(> .odh-def-box),
                div:has(> .odh-extra),
                .entry, .item, .odh-entry, .odh-item {
                    display: flex !important;
                    flex-direction: column !important;
                }

                /* Order 1: Tiêu đề từ vựng + Phiên âm luôn nằm TRÊN CÙNG */
                .expression, .odh-expression, .head, .reading, .odh-reading {
                    order: 1 !important;
                }

                /* Order 2: Ô Định nghĩa bắt buộc nằm ở GIỮA */
                .definitions, .odh-definitions, .odh-def-box {
                    order: 2 !important;
                    margin-top: 4px !important;
                }

                /* Order 3: Khung Ví dụ bắt buộc đẩy xuống DƯỚI CÙNG */
                .extrainfo, .odh-extrainfo, .odh-extra {
                    order: 3 !important;
                    margin-top: 6px !important;
                    margin-bottom: 10px !important;
                }

                /* Giới hạn hiển thị tối đa 2 câu ví dụ trên Pop-up */
                .odh-extra ul.sents li.sent:nth-child(n+3),
                .extrainfo ul.sents li.sent:nth-child(n+3) {
                    display: none !important;
                }

                /* Định dạng nhãn POS & [C, U] */
                span.pos {
                    font-size: 0.85em !important;
                    margin-right: 6px !important;
                    padding: 2px 6px !important;
                    color: #ffffff !important;
                    background-color: #0d47a1 !important;
                    border-radius: 3px !important;
                    font-weight: bold !important;
                    display: inline-block !important;
                    text-transform: none !important; /* Giữ chữ in hoa [C, U] */
                }

                span.eng_tran {
                    color: #222222 !important;
                    font-weight: 500 !important;
                }

                /* Khung danh sách ví dụ */
                ul.sents {
                    font-size: 0.9em !important;
                    list-style: square inside !important;
                    margin: 4px 0 !important;
                    padding: 6px 10px !important;
                    background: #f0f4f9 !important;
                    border-radius: 4px !important;
                    border-left: 3px solid #0d47a1 !important;
                }

                li.sent {
                    margin: 3px 0 !important;
                    padding: 0 !important;
                    color: #333333 !important;
                }

                span.eng_sent {
                    margin-right: 5px !important;
                }

                li.sent b {
                    color: #0d47a1 !important;
                    font-weight: bold !important;
                }
            </style>`;
    }
}
