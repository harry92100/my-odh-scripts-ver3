/* global api */
class encn_Oxford {
    constructor(options) {
        this.options = options;
        this.word = '';
    }

    async displayName() {
        return 'Oxford EN-EN Dictionary ver3.16';
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

            // 1. Từ vựng chính & Phiên âm UK / US
            let expression = doc.querySelector('.headword')?.textContent || word;

            let phUk = doc.querySelector('.phons_br .phon')?.textContent || '';
            let phUs = doc.querySelector('.phons_n_am .phon')?.textContent || '';
            let reading = '';
            if (phUk || phUs) {
                reading = `UK ${phUk}  US ${phUs}`.trim();
            }

            // 2. Audio MP3
            let audios = [];
            let ukAudioEl = doc.querySelector('.phons_br .audio_play_button');
            let usAudioEl = doc.querySelector('.phons_n_am .audio_play_button');
            if (ukAudioEl && ukAudioEl.getAttribute('data-src-mp3')) {
                audios.push(ukAudioEl.getAttribute('data-src-mp3'));
            }
            if (usAudioEl && usAudioEl.getAttribute('data-src-mp3')) {
                audios.push(usAudioEl.getAttribute('data-src-mp3'));
            }

            // 3. Loại từ chính (POS) & Ngữ pháp chung
            let mainPos = doc.querySelector('.pos')?.textContent || '';
            let topGrammarEl = doc.querySelector('.webtop-g .grammar') || 
                               doc.querySelector('.top-g .grammar') || 
                               doc.querySelector('.pos + .grammar');
            let topGrammarText = topGrammarEl ? topGrammarEl.textContent.trim() : '';

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

            let highlightWord = (text) => {
                let reg = new RegExp(`\\b${word}\\b`, 'gi');
                return text.replace(reg, `<b>$&</b>`);
            };

            let entries = [];
            let globalIndex = 0;

            // --- A. BÓC TÁCH NÉT NGHĨA THƯỜNG (SENSES) ---
            let allSenses = Array.from(doc.querySelectorAll('.sense'));
            // Lọc loại bỏ các sense thuộc khối Idiom (.idm-g)
            let regularSenses = allSenses.filter(s => !s.closest('.idm-g'));

            regularSenses.forEach((sense) => {
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

                // Lấy TẤT CẢ ví dụ (không cắt JS để Anki lưu trọn vẹn)
                let examples = Array.from(sense.querySelectorAll('.examples .x'));
                let exListHtml = '';
                examples.forEach((ex) => {
                    let exText = highlightWord(ex.textContent.trim());
                    exListHtml += `<li class='sent'><span class='eng_sent'>${exText}</span></li>`;
                });

                // FIELD 1: Definitions (Độc lập 100% - CHỈ ĐỊNH NGHĨA)
                let defBlock = `<div class="odh-def-box">${posHtml}<span class='tran'><span class='eng_tran'>${defText.trim()}</span></span></div>`;

                // FIELD 2: ExtraInfo (Độc lập 100% - CHỈ VÍ DỤ)
                let extrainfoBlock = exListHtml 
                    ? `<div class="odh-extra"><ul class="sents">${exListHtml}</ul></div>` 
                    : '';

                entries.push({
                    css: encn_Oxford.renderCSS(),
                    expression: globalIndex === 0 ? expression : '\u200B',
                    reading: globalIndex === 0 ? reading : '',
                    definitions: [defBlock],     // Gửi duy nhất Định nghĩa sang Anki
                    extrainfo: extrainfoBlock,   // Gửi duy nhất Ví dụ sang Anki
                    audios: globalIndex === 0 ? audios : []
                });
                globalIndex++;
            });

            // --- B. BÓC TÁCH KHỐI THÀNH NGỮ (IDIOMS) ---
            let idiomGroups = doc.querySelectorAll('.idm-g');
            idiomGroups.forEach((idmGroup) => {
                let idmTitle = idmGroup.querySelector('.idm')?.textContent?.trim();
                let idmSenses = idmGroup.querySelectorAll('.sense');

                idmSenses.forEach((sense) => {
                    let defText = sense.querySelector('.def')?.textContent;
                    if (!defText) return;

                    // Nhãn Idiom chuẩn xác
                    let posHtml = `<span class="pos idiom-tag">idiom</span>`;
                    if (idmTitle) {
                        posHtml += `<strong class="idm-title">${idmTitle}</strong>`;
                    }

                    // Lấy TẤT CẢ ví dụ của Idiom
                    let examples = Array.from(sense.querySelectorAll('.examples .x'));
                    let exListHtml = '';
                    examples.forEach((ex) => {
                        let exText = highlightWord(ex.textContent.trim());
                        exListHtml += `<li class='sent'><span class='eng_sent'>${exText}</span></li>`;
                    });

                    // FIELD 1: Definitions (Độc lập 100% - CHỈ ĐỊNH NGHĨA IDIOM)
                    let defBlock = `<div class="odh-def-box">${posHtml} <span class='tran'><span class='eng_tran'>${defText.trim()}</span></span></div>`;

                    // FIELD 2: ExtraInfo (Độc lập 100% - CHỈ VÍ DỤ IDIOM)
                    let extrainfoBlock = exListHtml 
                        ? `<div class="odh-extra"><ul class="sents">${exListHtml}</ul></div>` 
                        : '';

                    entries.push({
                        css: encn_Oxford.renderCSS(),
                        expression: globalIndex === 0 ? expression : '\u200B',
                        reading: globalIndex === 0 ? reading : '',
                        definitions: [defBlock],
                        extrainfo: extrainfoBlock,
                        audios: globalIndex === 0 ? audios : []
                    });
                    globalIndex++;
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
                /* 1. ÉP KHUNG NỘI BỘ THÀNH FLEXBOX ĐỂ SẮP XẾP THỨ TỰ */
                .entry, .item, .odh-entry, .odh-item, [class*="entry"], [class*="item"] {
                    display: flex !important;
                    flex-direction: column !important;
                }

                /* Header (Phiên âm, từ vựng) xếp trên cùng (Order 0) */
                .expression, .reading, .phonetic, .audios, .header, [class*="header"] {
                    order: 0 !important;
                }

                /* KHỐI ĐỊNH NGHĨA BẮT BUỘC XẾP TRÊN (Order 1) */
                .definitions, .odh-definitions, [class*="definition"] {
                    order: 1 !important;
                    margin-bottom: 2px !important;
                }

                /* KHỐI VÍ DỤ BẮT BUỘC XẾP DƯỚI (Order 2) */
                .extrainfo, .odh-extrainfo, [class*="extrainfo"], [class*="extra"] {
                    order: 2 !important;
                    margin-top: 2px !important;
                    margin-bottom: 8px !important;
                }

                /* GIỚI HẠN HIỂN THỊ TỐI ĐA 2 VÍ DỤ TRÊN POP-UP (Anki vẫn nhận đủ 100%) */
                ul.sents li.sent:nth-child(n+3) {
                    display: none !important;
                }

                /* Style nhãn POS thường */
                span.pos {
                    font-size: 0.85em !important;
                    margin-right: 6px !important;
                    padding: 2px 6px !important;
                    color: #ffffff !important;
                    background-color: #0d47a1 !important;
                    border-radius: 3px !important;
                    font-weight: bold !important;
                    display: inline-block !important;
                    text-transform: none !important;
                }

                /* Style nhãn Idiom riêng biệt màu cam */
                span.pos.idiom-tag {
                    background-color: #e65100 !important;
                }

                strong.idm-title {
                    color: #b71c1c !important;
                    font-weight: bold !important;
                    margin-right: 6px !important;
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
