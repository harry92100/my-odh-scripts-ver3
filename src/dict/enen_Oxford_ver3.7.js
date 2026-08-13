/* global api */
class encn_Oxford {
    constructor(options) {
        this.options = options;
        this.word = '';
    }

    async displayName() {
        return 'Oxford EN-EN Dictionary ver3.7';
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

            // 1. Từ vựng
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

            // Quét thuộc tính đếm được ở cấp tiêu đề toàn bài
            let topGrammarEl = doc.querySelector('.webtop-g .grammar') || 
                               doc.querySelector('.top-g .grammar') || 
                               doc.querySelector('.pos + .grammar');
            let topGrammarText = topGrammarEl ? topGrammarEl.textContent.trim() : '';

            // Hàm chuẩn hóa & viết tắt thuộc tính grammar/countability (In hoa C, U)
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

            // Hàm in đậm từ cần tra trong câu ví dụ
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

                // Bóc tách TOÀN BỘ câu ví dụ dành riêng cho trường ExtraInfo (Gửi Anki)
                let allExamples = sense.querySelectorAll('.examples .x');
                let allExListHtml = '';

                allExamples.forEach((ex) => {
                    let exText = highlightWord(ex.textContent.trim());
                    allExListHtml += `<li class='sent'><span class='eng_sent'>${exText}</span></li>`;
                });

                // Definitions CHỈ CHỨA Loại từ + Định nghĩa (Cho Anki clean 100%)
                let defBlock = `<div class="odh-def-box">${posHtml}<span class='tran'><span class='eng_tran'>${defText.trim()}</span></span></div>`;

                // ExtraInfo CHỈ CHỨA Ví dụ (Cho Anki clean 100%)
                let extrainfo = allExListHtml 
                    ? `<div class="odh-extra"><ul class="sents">${allExListHtml}</ul></div>` 
                    : '';

                entries.push({
                    css: encn_Oxford.renderCSS(),
                    expression: index === 0 ? expression : ' ',
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
                /* Sắp xếp vị trí Pop-up bằng CSS Flexbox Order */
                .entry, .item, div:has(> .odh-def-box) {
                    display: flex !important;
                    flex-direction: column !important;
                }

                /* 1. Header (Từ + Loa) nằm trên cùng */
                .odh-expression, .expression, .head {
                    order: 1 !important;
                }

                /* 2. Ô Định nghĩa nằm ở giữa */
                .odh-def-box, div:has(> .odh-def-box) {
                    order: 2 !important;
                    margin-top: 4px !important;
                }

                /* 3. Khung Ví dụ nằm bên dưới Định nghĩa */
                .odh-extra, div:has(> .odh-extra) {
                    order: 3 !important;
                    margin-top: 4px !important;
                    margin-bottom: 8px !important;
                }

                /* Xem trước tối đa 2 ví dụ trên Pop-up */
                .odh-extra .sents li.sent:nth-child(n+3) {
                    display: none !important;
                }

                /* Đã loại bỏ text-transform: lowercase để giữ nguyên chữ in hoa [C, U] */
                span.pos {
                    font-size:0.85em; 
                    margin-right:5px; 
                    padding:2px 6px; 
                    color:white; 
                    background-color:#0d47a1; 
                    border-radius:3px; 
                    font-weight:bold; 
                    display:inline-block;
                }
                
                span.tran {margin:0; padding:0; line-height:1.4;}
                span.eng_tran {margin-right:3px; color:#222; font-weight:500;}
                
                ul.sents {font-size:0.9em; list-style:square inside; margin:4px 0; padding:6px 10px; background:rgba(13,71,161,0.06); border-radius:4px;}
                li.sent {margin:3px 0; padding:0; color:#444;}
                span.eng_sent {margin-right:5px;}
                li.sent b {color: #0d47a1;}
            </style>`;
    }
}
